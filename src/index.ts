import { createApp } from './app.js';
import { load } from './builds.js';
import { config } from './config.js';

if (!config.webhookSecret) console.warn('WEBHOOK_SECRET is not set: GitHub pushes are refused');
if (!config.githubToken) console.warn('GITHUB_TOKEN is not set: builds show no status on GitHub');

load();
createApp().listen(config.port, () => {
  console.log(`Icon Mayhem builder on port ${config.port}, building ${config.repo}`);
});
