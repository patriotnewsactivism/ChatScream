import { describe, expect, it } from 'vitest';
import { resolveFrontendOAuthCallbackUrl } from '../frontendOAuthRedirect.js';

const SERVER_BASE_URL = 'https://api.chatscream.live';

describe('frontend OAuth callback redirect target', () => {
  it('appends the callback path to APP_BASE_URL instead of stranding users on the home page', () => {
    // Regression: production set APP_BASE_URL=https://www.chatscream.live and the
    // backend redirected there verbatim, so every OAuth round trip ended on the
    // landing page with the code in the query string and nothing to consume it.
    expect(
      resolveFrontendOAuthCallbackUrl({
        appBaseUrl: 'https://www.chatscream.live',
        serverBaseUrl: SERVER_BASE_URL,
      }),
    ).toBe('https://www.chatscream.live/oauth/callback');
  });

  it('tolerates a trailing slash on the configured base URL', () => {
    expect(
      resolveFrontendOAuthCallbackUrl({
        appBaseUrl: 'https://www.chatscream.live/',
        serverBaseUrl: SERVER_BASE_URL,
      }),
    ).toBe('https://www.chatscream.live/oauth/callback');
  });

  it('keeps an explicit redirect URL that already names a callback path', () => {
    expect(
      resolveFrontendOAuthCallbackUrl({
        explicitRedirectUrl: 'https://chatscream.live/custom/oauth-return',
        appBaseUrl: 'https://www.chatscream.live',
        serverBaseUrl: SERVER_BASE_URL,
      }),
    ).toBe('https://chatscream.live/custom/oauth-return');
  });

  it('completes an explicit redirect URL that is only an origin', () => {
    expect(
      resolveFrontendOAuthCallbackUrl({
        explicitRedirectUrl: 'https://www.chatscream.live',
        serverBaseUrl: SERVER_BASE_URL,
      }),
    ).toBe('https://www.chatscream.live/oauth/callback');
  });

  it('resolves a relative redirect against the server base URL', () => {
    expect(
      resolveFrontendOAuthCallbackUrl({
        explicitRedirectUrl: '/oauth/callback',
        serverBaseUrl: SERVER_BASE_URL,
      }),
    ).toBe('https://api.chatscream.live/oauth/callback');
  });

  it('falls back to the server base URL when nothing is configured', () => {
    expect(resolveFrontendOAuthCallbackUrl({ serverBaseUrl: SERVER_BASE_URL })).toBe(
      'https://api.chatscream.live/oauth/callback',
    );
  });
});
