import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { type Request, type Response } from 'express';
import { all, dirOf, enqueue, find, type Build } from './builds.js';
import { config } from './config.js';
import { resolveRef } from './github.js';

function escape(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function same(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

// GitHub signs the body with the webhook secret
export function signatureOk(body: Buffer, header: string | undefined): boolean {
  if (!config.webhookSecret || !header) return false;
  const expected = `sha256=${crypto.createHmac('sha256', config.webhookSecret).update(body).digest('hex')}`;
  return same(expected, header);
}

function page(title: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(title)}</title><style>
body{font:15px/1.5 system-ui,sans-serif;margin:0 auto;max-width:900px;padding:16px;background:#111;color:#eee}
a{color:#8cf}table{width:100%;border-collapse:collapse}td,th{padding:6px 8px;border-bottom:1px solid #333;text-align:left}
pre{background:#000;padding:12px;overflow-x:auto;font-size:12px;white-space:pre-wrap;word-break:break-all}
.success{color:#7d7}.failure{color:#f77}.running{color:#fd6}.queued,.cancelled{color:#aaa}</style></head>
<body>${body}</body></html>`;
}

function row(build: Build): string {
  const time = build.seconds !== undefined ? `${build.seconds}s` : '';
  return `<tr><td><a href="/builds/${build.sha}">${build.sha.slice(0, 7)}</a></td><td>${escape(build.ref)}</td>
<td>${escape(build.message)}</td><td class="${build.status}">${build.status}</td><td>${time}</td></tr>`;
}

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  // GitHub: a push builds its last commit
  app.post('/webhook', express.raw({ type: '*/*', limit: '5mb' }), (req: Request, res: Response) => {
    const body = req.body as Buffer;
    if (!signatureOk(body, req.get('x-hub-signature-256'))) {
      res.status(401).json({ error: 'Bad signature' });
      return;
    }
    const event = req.get('x-github-event');
    if (event === 'ping') {
      res.json({ ok: true, pong: true });
      return;
    }
    if (event !== 'push') {
      res.json({ ok: true, ignored: event });
      return;
    }
    const push = JSON.parse(body.toString('utf8')) as {
      ref?: string;
      after?: string;
      deleted?: boolean;
      repository?: { full_name?: string };
      head_commit?: { message?: string } | null;
    };
    if (push.repository?.full_name?.toLowerCase() !== config.repo.toLowerCase() || push.deleted || !push.after || /^0+$/.test(push.after)) {
      res.json({ ok: true, ignored: 'not a build' });
      return;
    }
    const ref = (push.ref ?? '').replace(/^refs\/(heads|tags)\//, '');
    const build = enqueue(push.after, ref, (push.head_commit?.message ?? '').split('\n')[0] ?? '');
    res.status(202).json({ sha: build.sha, status: build.status });
  });

  // Any branch, tag or commit, on demand
  app.post('/build', express.json(), async (req: Request, res: Response) => {
    if (!config.buildKey || !same(req.get('x-build-key') ?? '', config.buildKey)) {
      res.status(401).json({ error: 'Bad key' });
      return;
    }
    const ref = String((req.body as { ref?: string } | undefined)?.ref ?? 'main');
    const sha = await resolveRef(ref);
    if (!sha) {
      res.status(404).json({ error: `No commit for ${ref}` });
      return;
    }
    const build = enqueue(sha, ref, `on demand: ${ref}`);
    res.status(202).json({ sha: build.sha, status: build.status, url: `${config.publicUrl}/builds/${build.sha}` });
  });

  app.get('/', (_req, res) => {
    res.send(
      page(
        'Icon Mayhem builds',
        `<h1>Icon Mayhem builds</h1><p>Windows and Android, on every push to <a href="https://github.com/${config.repo}">${config.repo}</a>.</p>
<table><tr><th>Commit</th><th>Branch</th><th>Message</th><th>Status</th><th>Time</th></tr>${all().map(row).join('')}</table>`,
      ),
    );
  });

  app.get('/builds/:sha', (req: Request, res: Response) => {
    const build = find(String(req.params.sha));
    if (!build) {
      res.status(404).send(page('Not found', '<p>No such build. <a href="/">All builds</a></p>'));
      return;
    }
    if (req.accepts(['html', 'json']) === 'json') {
      res.json(build);
      return;
    }
    let tail = '';
    try {
      const log = fs.readFileSync(path.join(dirOf(build.sha), 'log.txt'), 'utf8');
      tail = log.split('\n').slice(-80).join('\n');
    } catch {
      tail = build.status === 'queued' ? 'Waiting for the builder...' : '';
    }
    const files = build.files.map((file) => `<li><a href="/builds/${build.sha}/${file}">${file}</a></li>`).join('');
    res.send(
      page(
        `${build.sha.slice(0, 7)} ${build.status}`,
        `<p><a href="/">All builds</a></p><h1 class="${build.status}">${build.status}</h1>
<p><a href="https://github.com/${config.repo}/commit/${build.sha}">${build.sha.slice(0, 7)}</a> on ${escape(build.ref)}: ${escape(build.message)}
${build.seconds !== undefined ? ` (${build.seconds}s)` : ''}</p>${files ? `<ul>${files}</ul>` : ''}
<p><a href="/builds/${build.sha}/log">Whole log</a></p><pre>${escape(tail)}</pre>
${build.status === 'running' || build.status === 'queued' ? '<script>setTimeout(()=>location.reload(),5000)</script>' : ''}`,
      ),
    );
  });

  app.get('/builds/:sha/log', (req: Request, res: Response) => {
    const build = find(String(req.params.sha));
    const file = build ? path.join(dirOf(build.sha), 'log.txt') : '';
    if (!build || !fs.existsSync(file)) {
      res.status(404).type('text').send('No log');
      return;
    }
    res.type('text').sendFile(file);
  });

  // The files: the merged mod, and each platform (the release job merges them with macOS and iOS)
  app.get('/builds/:sha/:file', (req: Request, res: Response) => {
    const build = find(String(req.params.sha));
    const name = String(req.params.file);
    if (!build || build.status !== 'success' || !build.files.includes(name)) {
      res.status(404).json({ error: 'No such file' });
      return;
    }
    res.download(path.join(dirOf(build.sha), name), name);
  });

  return app;
}
