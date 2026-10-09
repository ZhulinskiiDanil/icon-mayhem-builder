import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Everything comes from the environment (Railway variables)

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDomain = process.env.RAILWAY_PUBLIC_DOMAIN ?? '';

export const config = {
  port: Number.parseInt(process.env.PORT ?? '3000', 10),
  // "owner/name" of the mod's repo: only its pushes are built
  repo: process.env.REPO ?? 'ZhulinskiiDanil/icon-mayhem',
  // Commit statuses on GitHub (Contents: read, Commit statuses: read and write). Empty: no statuses
  githubToken: (process.env.GITHUB_TOKEN ?? '').trim(),
  // Pasted values often bring a space or a line break along
  webhookSecret: (process.env.WEBHOOK_SECRET ?? '').trim(),
  // POST /build with this key builds any branch, tag or commit
  buildKey: (process.env.BUILD_KEY ?? '').trim(),
  dataDir: process.env.DATA_DIR ?? '/data',
  // Where the build pages are, for the links on GitHub
  publicUrl: (process.env.PUBLIC_URL ?? (publicDomain ? `https://${publicDomain}` : '')).replace(/\/$/, ''),
  // The build itself; tests point it to a fake one
  buildScript: process.env.BUILD_SCRIPT ?? path.join(root, 'scripts', 'build.sh'),
  keepBuilds: Number.parseInt(process.env.KEEP_BUILDS ?? '20', 10),
  statusContext: 'railway/build',
};
