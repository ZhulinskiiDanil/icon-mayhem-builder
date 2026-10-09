import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { setStatus } from './github.js';

// ! --- Builds --- !
// One build at a time. A newer push to the same branch replaces its build still waiting.
// The list is kept in builds.json on the volume, each build has a folder with its log and files.

export interface Build {
  sha: string;
  ref: string;
  message: string;
  status: 'queued' | 'running' | 'success' | 'failure' | 'cancelled';
  queuedAt: string;
  startedAt?: string;
  finishedAt?: string;
  seconds?: number;
  files: string[];
}

const buildsDir = () => path.join(config.dataDir, 'builds');
const listFile = () => path.join(config.dataDir, 'builds.json');

let builds: Build[] = [];
let running: Build | null = null;

export function dirOf(sha: string): string {
  return path.join(buildsDir(), sha);
}

function save(): void {
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.writeFileSync(listFile(), JSON.stringify(builds, null, 2));
}

export function load(): void {
  try {
    builds = JSON.parse(fs.readFileSync(listFile(), 'utf8')) as Build[];
  } catch {
    builds = [];
  }
  // A restart in the middle: those never finished
  for (const build of builds) {
    if (build.status === 'running' || build.status === 'queued') {
      build.status = 'cancelled';
      void setStatus(build.sha, 'error', 'The builder restarted, push again');
    }
  }
  save();
}

export function all(): Build[] {
  return builds;
}

export function find(sha: string): Build | undefined {
  return builds.find((build) => build.sha === sha || (sha.length >= 7 && build.sha.startsWith(sha)));
}

// Old builds go, with their files
function prune(): void {
  const finished = builds.filter((build) => build.status !== 'queued' && build.status !== 'running');
  for (const old of finished.slice(config.keepBuilds)) {
    fs.rmSync(dirOf(old.sha), { recursive: true, force: true });
    builds = builds.filter((build) => build !== old);
  }
}

export function enqueue(sha: string, ref: string, message: string): Build {
  const existing = find(sha);
  if (existing && (existing.status === 'queued' || existing.status === 'running' || existing.status === 'success')) return existing;

  // A newer push to the same branch: the waiting one is not worth building anymore
  for (const build of builds) {
    if (build.status === 'queued' && build.ref === ref) {
      build.status = 'cancelled';
      void setStatus(build.sha, 'error', 'A newer push is built instead');
    }
  }
  const build: Build = { sha, ref, message, status: 'queued', queuedAt: new Date().toISOString(), files: [] };
  builds = [build, ...builds.filter((other) => other.sha !== sha)];
  save();
  void setStatus(sha, 'pending', 'Waiting for the builder');
  void next();
  return build;
}

async function next(): Promise<void> {
  if (running) return;
  const build = [...builds].reverse().find((candidate) => candidate.status === 'queued');
  if (!build) return;

  running = build;
  build.status = 'running';
  build.startedAt = new Date().toISOString();
  save();
  void setStatus(build.sha, 'pending', 'Building Windows and Android');

  const dir = dirOf(build.sha);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const log = fs.createWriteStream(path.join(dir, 'log.txt'));
  const started = Date.now();

  const code = await new Promise<number>((resolve) => {
    const child = spawn('bash', [config.buildScript, `https://github.com/${config.repo}.git`, build.sha, dir], {
      env: { ...process.env, DATA_DIR: config.dataDir },
    });
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
    child.on('error', (error) => {
      log.write(`\n${String(error)}\n`);
      resolve(1);
    });
    child.on('close', (exit) => resolve(exit ?? 1));
  });
  log.end();

  build.seconds = Math.round((Date.now() - started) / 1000);
  build.finishedAt = new Date().toISOString();
  build.files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((file) => file.endsWith('.geode')) : [];
  build.status = code === 0 && build.files.length > 0 ? 'success' : 'failure';
  await setStatus(
    build.sha,
    build.status === 'success' ? 'success' : 'failure',
    build.status === 'success' ? `Windows and Android built in ${build.seconds}s` : `Failed after ${build.seconds}s, see the log`,
  );
  console.log(`Build ${build.sha.slice(0, 7)} (${build.ref}): ${build.status} in ${build.seconds}s`);

  running = null;
  prune();
  save();
  void next();
}
