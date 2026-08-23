import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildYouTubeDestinationRedirectTarget } from '../youtubeDestinationOAuthCallback.js';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

const encodeState = (payload: Record<string, unknown>) =>
  Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');

const destinationState = (overrides: Record<string, unknown> = {}) =>
  encodeState({
    platform: 'youtube',
    userId: 'u1',
    timestamp: Date.now(),
    nonce: 'nonce-1',
    returnOrigin: 'https://www.chatscream.live',
    ...overrides,
  });

describe('Google callback destination routing', () => {
  it('routes destination state from an Express-style query object', () => {
    const state = destinationState();
    const target = buildYouTubeDestinationRedirectTarget({ code: 'test-code', state });
    expect(target).not.toBeNull();

    const url = new URL(String(target));
    expect(url.origin).toBe('https://www.chatscream.live');
    expect(url.pathname).toBe('/oauth/callback');
    expect(url.searchParams.get('platform')).toBe('youtube');
    expect(url.searchParams.get('flow')).toBe('destination');
    expect(url.searchParams.get('code')).toBe('test-code');
    expect(url.searchParams.get('state')).toBe(state);
  });

  it('honours the originating ChatScream host and rejects foreign origins', () => {
    const apex = new URL(
      String(
        buildYouTubeDestinationRedirectTarget({
          state: destinationState({ returnOrigin: 'https://chatscream.live' }),
        }),
      ),
    );
    expect(apex.origin).toBe('https://chatscream.live');

    const spoofed = new URL(
      String(
        buildYouTubeDestinationRedirectTarget({
          state: destinationState({ returnOrigin: 'https://evil.example.com' }),
        }),
      ),
    );
    expect(spoofed.origin).toBe('https://www.chatscream.live');
  });

  it('leaves signed account-login state to the account sign-in handler', () => {
    expect(
      buildYouTubeDestinationRedirectTarget({ code: 'x', state: 'payload.signature' }),
    ).toBeNull();
  });

  it('ignores destination state older than the ten minute window', () => {
    expect(
      buildYouTubeDestinationRedirectTarget({
        state: destinationState({ timestamp: Date.now() - 11 * 60 * 1000 }),
      }),
    ).toBeNull();
  });

  it('branches inside the Google callback route so no entrypoint patch is required', () => {
    // Regression: the interceptor lived only in server/entrypoint.js while the
    // deployed container started server/index.js, so destination connects were
    // rejected in production as "Invalid or expired sign-in state".
    const app = read('server/app.js');
    expect(app).toContain('buildYouTubeDestinationRedirectTarget');
    expect(app.indexOf('buildYouTubeDestinationRedirectTarget(req.query)')).toBeGreaterThan(
      app.indexOf("'/api/auth/oauth/google/callback'"),
    );
  });

  it('starts the backend container through the entrypoint that installs the interceptor', () => {
    expect(read('Dockerfile.backend')).toContain('server/entrypoint.js');
    expect(JSON.parse(read('package.json')).scripts.start).toContain('server/entrypoint.js');
  });
});
