import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('YouTube destination OAuth redirect', () => {
  it('uses the canonical backend Google callback in production', () => {
    // The literal lives in services/oauthProviderConfig.ts — the one module
    // allowed to spell out a provider-facing constant. oauthService must reach
    // it by import, so a second copy can never drift out of sync.
    const config = read('services/oauthProviderConfig.ts');
    expect(config).toContain(
      "'https://api.chatscream.live/api/auth/oauth/google/callback'",
    );

    const source = read('services/oauthService.ts');
    expect(source).toContain('YOUTUBE_PRODUCTION_REDIRECT_URI');
    expect(source).toContain("from './oauthProviderConfig'");
    expect(source).toContain('returnOrigin');
    expect(source).toContain("case 'youtube'");
    expect(source).toContain('redirectUri: getYouTubeRedirectUri()');
  });

  it('forwards destination state through the API entrypoint without consuming the code', () => {
    const all = read('api/all.js');
    const forwarder = read('api/youtubeDestinationOAuthCallback.js');
    expect(all).toContain("targetPath === '/api/auth/oauth/google/callback'");
    expect(all).toContain('isYouTubeDestinationOAuthCallback(req)');
    expect(forwarder).toContain("payload.platform !== 'youtube'");
    expect(forwarder).toContain("target.searchParams.set('platform', 'youtube')");
    expect(forwarder).toContain("['code', 'state', 'error'");
  });
});
