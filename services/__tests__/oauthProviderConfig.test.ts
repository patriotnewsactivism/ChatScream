import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import {
  CANONICAL_FRONTEND_CALLBACK,
  FACEBOOK_AUTHORIZATION_ENDPOINT,
  FACEBOOK_GRAPH_API_VERSION,
  FACEBOOK_TOKEN_ENDPOINT,
  YOUTUBE_PRODUCTION_REDIRECT_URI,
} from '../oauthProviderConfig';

const readSource = (relative: string): string =>
  fs.readFileSync(path.join(process.cwd(), relative), 'utf8');

const oauthServiceSource = readSource('services/oauthService.ts');
const providerConfigSource = readSource('services/oauthProviderConfig.ts');

describe('provider callback URLs are exact', () => {
  it('sends YouTube destination authorization to the API callback', () => {
    // Regression: production sent the *web app* callback here, so Google
    // answered "Error 400: redirect_uri_mismatch" — the API callback is the
    // one registered on the YouTube OAuth client.
    expect(YOUTUBE_PRODUCTION_REDIRECT_URI).toBe(
      'https://api.chatscream.live/api/auth/oauth/google/callback',
    );
  });

  it('sends Facebook authorization to the web app callback', () => {
    expect(CANONICAL_FRONTEND_CALLBACK).toBe('https://www.chatscream.live/oauth/callback');
  });

  it('never swaps the two provider callback strategies', () => {
    // YouTube must not land on the web app, and Facebook must not land on the
    // API: each provider has only its own value registered.
    expect(YOUTUBE_PRODUCTION_REDIRECT_URI).not.toBe(CANONICAL_FRONTEND_CALLBACK);
    expect(new URL(YOUTUBE_PRODUCTION_REDIRECT_URI).host).toBe('api.chatscream.live');
    expect(new URL(CANONICAL_FRONTEND_CALLBACK).host).toBe('www.chatscream.live');
  });

  it('pins https, the exact host, and no trailing slash', () => {
    // Providers compare the redirect character-for-character, so an apex host,
    // a stray trailing slash or http:// all read as a different URI.
    for (const uri of [YOUTUBE_PRODUCTION_REDIRECT_URI, CANONICAL_FRONTEND_CALLBACK]) {
      const parsed = new URL(uri);
      expect(parsed.protocol).toBe('https:');
      expect(uri.endsWith('/')).toBe(false);
      expect(parsed.search).toBe('');
    }
  });

  it('never uses the apex host, which vercel.json redirects to www', () => {
    // A 308 mid-OAuth drops the query string, losing the code and state.
    expect(CANONICAL_FRONTEND_CALLBACK).not.toMatch(/^https:\/\/chatscream\.live/);
    for (const source of [oauthServiceSource, providerConfigSource]) {
      expect(source).not.toMatch(/https:\/\/chatscream\.live\/oauth\/callback/);
    }
  });
});

describe('Facebook Graph API version has one source', () => {
  it('builds both Facebook endpoints from the same version constant', () => {
    expect(FACEBOOK_AUTHORIZATION_ENDPOINT).toBe(
      `https://www.facebook.com/${FACEBOOK_GRAPH_API_VERSION}/dialog/oauth`,
    );
    expect(FACEBOOK_TOKEN_ENDPOINT).toBe(
      `https://graph.facebook.com/${FACEBOOK_GRAPH_API_VERSION}/oauth/access_token`,
    );
  });

  it('declares the version exactly once, as a literal', () => {
    const declarations =
      providerConfigSource.match(/FACEBOOK_GRAPH_API_VERSION = '(v[0-9]+\.[0-9]+)'/g) || [];
    expect(declarations).toHaveLength(1);
  });

  it('hardcodes no Graph version anywhere outside the config module', () => {
    // Regression: production opened a v18.0 dialog while the source said
    // v26.0, because the version was written out at more than one call site.
    expect(oauthServiceSource).not.toMatch(/facebook\.com\/v[0-9]+\.[0-9]+/);
  });

  it('is not pinned to a version Meta has already retired', () => {
    const major = Number(FACEBOOK_GRAPH_API_VERSION.replace(/^v/, '').split('.')[0]);
    // v18.0 (Sep 2023) is long past Meta's 2-year version lifetime.
    expect(major).toBeGreaterThanOrEqual(21);
  });
});

describe('account sign-in and YouTube destination clients cannot swap', () => {
  const youtubeCase = oauthServiceSource.slice(
    oauthServiceSource.indexOf("case 'youtube':"),
    oauthServiceSource.indexOf("case 'facebook':"),
  );

  it('never lets the YouTube client fall back to the sign-in client', () => {
    // The sign-in client carries no YouTube scopes, so substituting it fails
    // at Google's consent screen rather than at configuration time.
    expect(youtubeCase).not.toMatch(/VITE_GOOGLE_CLIENT_ID/);
    expect(youtubeCase).not.toMatch(/googleClientId/);
    expect(youtubeCase).toMatch(/publicConfig\.youtubeClientId/);
  });

  it('only reads a build-time client ID on a loopback host', () => {
    // In production the client ID must come from the backend, so a stale
    // bundle cannot pin an ID that has since been rotated.
    expect(youtubeCase).toMatch(/isLocalBrowser\(\)\s*\?\s*import\.meta\.env\.VITE_YOUTUBE_CLIENT_ID/);
  });
});

describe('the production build cannot fall back to old provider constants', () => {
  it('re-declares no provider constant outside the config module', () => {
    expect(oauthServiceSource).not.toMatch(/const\s+YOUTUBE_PRODUCTION_REDIRECT_URI\s*=/);
    expect(oauthServiceSource).not.toMatch(/const\s+CANONICAL_FRONTEND_CALLBACK\s*=/);
    expect(oauthServiceSource).toMatch(/from '\.\/oauthProviderConfig'/);
  });

  it('treats only loopback hostnames as local', () => {
    // A host merely containing "localhost" must not qualify, or a lookalike
    // domain could steer the callback at build time.
    expect(providerConfigSource).toMatch(/LOCAL_DEV_HOSTNAMES = \['localhost', '127\.0\.0\.1'\]/);
    expect(providerConfigSource).not.toMatch(/includes\(\s*'localhost'/);
  });
});

describe('authorization requests carry an unguessable, single-use state', () => {
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('rejects a replayed state', async () => {
    const { createOAuthState, verifyOAuthState } = await import('../oauthService');
    const state = createOAuthState('youtube', 'user-1');

    expect(verifyOAuthState(state)).not.toBeNull();
    // The first verification consumes it; a replay must not succeed.
    expect(verifyOAuthState(state)).toBeNull();
  });

  it('rejects a state belonging to a different user', async () => {
    const { createOAuthState, verifyOAuthState } = await import('../oauthService');
    createOAuthState('youtube', 'user-1');

    const forged = btoa(
      JSON.stringify({
        platform: 'youtube',
        userId: 'attacker',
        timestamp: Date.now(),
        nonce: 'whatever',
      }),
    );
    expect(verifyOAuthState(forged)).toBeNull();
  });

  it('rejects a state older than its ten-minute window', async () => {
    const { createOAuthState, verifyOAuthState } = await import('../oauthService');
    const state = createOAuthState('youtube', 'user-1');
    const decoded = JSON.parse(atob(state));

    const stale = btoa(
      JSON.stringify({ ...decoded, timestamp: Date.now() - 11 * 60 * 1000 }),
    );
    expect(verifyOAuthState(stale)).toBeNull();
  });
});

describe('exactly one OAuth authorization path exists', () => {
  // Regression: components/OAuthSetup.tsx was a second, orphaned OAuth
  // implementation that built the YouTube authorization URL from
  // `${window.location.origin}/oauth/callback` and opened the Facebook dialog
  // on Graph v18.0 — precisely the two values production was observed sending
  // (redirect_uri_mismatch from Google, "domain isn't included in the app's
  // domains" from Meta). A stale bundle carrying it reproduced both errors from
  // one browser session. It has been deleted; nothing may reintroduce it.
  const sourceFiles = (() => {
    const roots = ['services', 'components', 'pages', 'hooks', 'contexts'];
    const files: string[] = [];
    const walk = (dir: string) => {
      const full = path.join(process.cwd(), dir);
      if (!fs.existsSync(full)) return;
      for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
        const rel = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== 'node_modules' && entry.name !== '__tests__') walk(rel);
        } else if (/\.tsx?$/.test(entry.name)) {
          files.push(rel);
        }
      }
    };
    roots.forEach(walk);
    return files.map((file) => [file, readSource(file)] as const);
  })();

  it('builds a provider authorization URL in oauthService and nowhere else', () => {
    const offenders = sourceFiles
      .filter(([file]) => file !== path.join('services', 'oauthService.ts'))
      .filter(([, source]) =>
        /accounts\.google\.com\/o\/oauth2|facebook\.com\/v[0-9.]+\/dialog\/oauth|id\.twitch\.tv\/oauth2\/authorize|tiktok\.com\/v2\/auth\/authorize/.test(
          source,
        ),
      )
      .map(([file]) => file);

    expect(offenders).toEqual([]);
  });

  it('never binds a provider redirect_uri to the current browser origin', () => {
    // window.location.origin is whatever host the user happened to load, so a
    // redirect built from it can be one the provider never had registered —
    // which is how the apex host and preview URLs reached Google. Only a
    // binding counts here; AdminPage renders the same string as help text,
    // and describing a URL in UI copy never reaches a provider.
    const bindsRedirect =
      /redirect_?[uU]ri["']?\s*[:=]\s*[`'"]?\$\{?\s*window\.location\.origin/;
    const offenders = sourceFiles
      .filter(([file]) => file !== path.join('services', 'oauthService.ts'))
      .filter(([, source]) => bindsRedirect.test(source))
      .map(([file]) => file);

    expect(offenders).toEqual([]);
  });

  it('keeps the deleted parallel implementation deleted', () => {
    expect(fs.existsSync(path.join(process.cwd(), 'components/OAuthSetup.tsx'))).toBe(false);
  });
});
