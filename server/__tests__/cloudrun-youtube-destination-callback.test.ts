import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { maybeForwardYouTubeDestinationOAuth } from '../youtubeDestinationOAuthCallback.js';

const encodeState = (payload: Record<string, unknown>) =>
  Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');

describe('Cloud Run YouTube destination callback interceptor', () => {
  it('forwards valid destination state back to the exact originating ChatScream host', () => {
    const state = encodeState({
      platform: 'youtube',
      userId: 'u1',
      timestamp: Date.now(),
      nonce: 'nonce-1',
      returnOrigin: 'https://chatscream.live',
    });
    const req = {
      url: `/api/auth/oauth/google/callback?code=test-code&state=${encodeURIComponent(state)}`,
    } as any;
    const headers = new Map<string, string>();
    const res = {
      statusCode: 200,
      setHeader: (name: string, value: string) => headers.set(name, value),
      end: vi.fn(),
    } as any;

    expect(maybeForwardYouTubeDestinationOAuth(req, res)).toBe(true);
    expect(res.statusCode).toBe(302);
    const location = new URL(headers.get('Location') || '');
    expect(location.origin).toBe('https://chatscream.live');
    expect(location.pathname).toBe('/oauth/callback');
    expect(location.searchParams.get('platform')).toBe('youtube');
    expect(location.searchParams.get('code')).toBe('test-code');
    expect(location.searchParams.get('state')).toBe(state);
  });

  it('does not intercept signed ChatScream account-login state', () => {
    const req = {
      url: '/api/auth/oauth/google/callback?code=x&state=payload.signature',
    } as any;
    const res = {} as any;
    expect(maybeForwardYouTubeDestinationOAuth(req, res)).toBe(false);
  });

  it('installs the interceptor before server/index creates the API server', () => {
    const entrypoint = fs.readFileSync(path.join(process.cwd(), 'server/entrypoint.js'), 'utf8');
    expect(entrypoint).toContain('maybeForwardYouTubeDestinationOAuth');
    expect(entrypoint.indexOf("import('./index.js')")).toBeGreaterThan(
      entrypoint.indexOf('app.handle ='),
    );
  });
});
