import type { NodeExecutionContext } from '@jam-nodes/core';
import { fetchWithRetry } from '../../utils/http.js';

const REDDIT_OAUTH_BASE_URL = 'https://oauth.reddit.com';
const REDDIT_USER_AGENT = 'jam-nodes/1.0';

export function getRedditAccessToken(context: NodeExecutionContext): string | null {
  const creds = (context.credentials?.reddit || {}) as Record<string, string | undefined>;
  return creds['accessToken'] || null;
}

export async function redditRequest<T>(
  context: NodeExecutionContext,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const accessToken = getRedditAccessToken(context);
  if (!accessToken) {
    throw new Error(
      'Reddit access token not configured. Please provide context.credentials.reddit.accessToken.'
    );
  }

  const fullUrl = `${REDDIT_OAUTH_BASE_URL}${path}`;

  const response = await fetchWithRetry(
    fullUrl,
    {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': REDDIT_USER_AGENT,
        ...(init.headers || {}),
      },
    },
    { maxRetries: 3, backoffMs: 1000, timeoutMs: 30000 }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Reddit API error: ${response.status} - ${errorText}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export function formatRedditErrors(errors: unknown): string {
  if (!Array.isArray(errors) || errors.length === 0) {
    return 'Unknown Reddit API error';
  }
  return errors
    .map((err) => {
      if (Array.isArray(err)) {
        return err.filter((part) => typeof part === 'string').join(': ');
      }
      if (typeof err === 'string') return err;
      return JSON.stringify(err);
    })
    .join('; ');
}
