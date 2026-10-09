import { config } from './config.js';

// The build shows on the commit on GitHub: a dot while it runs, a check or a cross after

export type State = 'pending' | 'success' | 'failure' | 'error';

export async function setStatus(sha: string, state: State, description: string): Promise<void> {
  if (!config.githubToken) return;
  try {
    const response = await fetch(`https://api.github.com/repos/${config.repo}/statuses/${sha}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.githubToken}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'content-type': 'application/json',
        'user-agent': 'icon-mayhem-builder',
      },
      body: JSON.stringify({
        state,
        context: config.statusContext,
        description: description.slice(0, 140),
        target_url: config.publicUrl ? `${config.publicUrl}/builds/${sha}` : undefined,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) console.warn(`GitHub status for ${sha.slice(0, 7)}: ${response.status} ${await response.text()}`);
  } catch (error) {
    console.warn(`GitHub status for ${sha.slice(0, 7)} failed:`, error);
  }
}

// Which commit a branch, a tag or a short sha is
export async function resolveRef(ref: string): Promise<string | null> {
  const response = await fetch(`https://api.github.com/repos/${config.repo}/commits/${encodeURIComponent(ref)}`, {
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': 'icon-mayhem-builder',
      ...(config.githubToken ? { authorization: `Bearer ${config.githubToken}` } : {}),
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) return null;
  const json = (await response.json()) as { sha?: string };
  return json.sha ?? null;
}
