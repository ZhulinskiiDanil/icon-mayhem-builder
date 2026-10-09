// The webhook, the queue and the pages, with a fake build instead of the real one
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

const data = fs.mkdtempSync(path.join(os.tmpdir(), 'builder-dry-'));
process.env.DATA_DIR = data;
process.env.WEBHOOK_SECRET = 'dry-secret';
process.env.BUILD_KEY = 'dry-key';
process.env.GITHUB_TOKEN = '';
process.env.REPO = 'ZhulinskiiDanil/icon-mayhem';
process.env.BUILD_SCRIPT = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'fake-build.sh');

const { createApp } = await import('../src/app.js');
const { load } = await import('../src/builds.js');
load();
const server = createApp().listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

let failures = 0;
function check(what: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${what}${ok ? '' : ` -> ${JSON.stringify(detail)}`}`);
  if (!ok) failures++;
}

function push(after: string, ref = 'refs/heads/main', repo = 'ZhulinskiiDanil/icon-mayhem') {
  return JSON.stringify({ ref, after, deleted: false, repository: { full_name: repo }, head_commit: { message: `commit ${after.slice(0, 7)}\nbody` } });
}

async function hook(body: string, secret = 'dry-secret', event = 'push') {
  const signature = `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
  const response = await fetch(`${base}/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': signature, 'x-github-event': event },
    body,
  });
  return { status: response.status, json: (await response.json()) as any };
}

async function build(sha: string) {
  const response = await fetch(`${base}/builds/${sha}`, { headers: { accept: 'application/json' } });
  return response.ok ? ((await response.json()) as any) : null;
}

async function waitFor(sha: string, status: string) {
  for (let i = 0; i < 60; i++) {
    const current = await build(sha);
    if (current?.status === status) return current;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return build(sha);
}

const a = 'a'.repeat(40);
const b = 'b'.repeat(40);
const c = 'c'.repeat(40);

try {
  check('a wrong signature is refused', (await hook(push(a), 'wrong')).status === 401);
  check('ping answers', (await hook('{}', 'dry-secret', 'ping')).json.pong === true);
  check('another repo is ignored', (await hook(push(a, 'refs/heads/main', 'someone/else'))).json.ignored !== undefined);

  const first = await hook(push(a));
  check('a push is queued', first.status === 202 && first.json.sha === a, first);
  // b waits behind a, then c replaces b: same branch
  await hook(push(b));
  await hook(push(c));
  check('a newer push replaces the waiting one', (await build(b))?.status === 'cancelled', await build(b));

  const done = await waitFor(a, 'success');
  check('the build succeeds with its files', done?.status === 'success' && done.files.includes('zhulis.icon-mayhem.geode'), done);
  const last = await waitFor(c, 'success');
  check('the newest one is built next', last?.status === 'success', last);

  const file = await fetch(`${base}/builds/${a}/zhulis.icon-mayhem.geode`);
  check('the mod downloads', file.status === 200 && (await file.text()).trim() === 'geode');
  check('only built files download', (await fetch(`${base}/builds/${a}/..%2Fbuilds.json`)).status === 404);
  const log = await fetch(`${base}/builds/${a}/log`);
  check('the log is there', (await log.text()).includes('fake build'));
  const short = await build(a.slice(0, 7));
  check('a short sha finds the build', short?.sha === a, short);

  const list = await fetch(`${base}/`);
  check('the list page', (await list.text()).includes(c.slice(0, 7)));
  const noKey = await fetch(`${base}/build`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"ref":"main"}' });
  check('building on demand needs the key', noKey.status === 401);
} finally {
  server.close();
  fs.rmSync(data, { recursive: true, force: true });
}

console.log(failures ? `${failures} failed` : 'All passed');
process.exit(failures ? 1 : 0);
