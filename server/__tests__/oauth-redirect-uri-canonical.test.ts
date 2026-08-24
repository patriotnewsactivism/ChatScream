import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(path.join(process.cwd(), 'server/app.js'), 'utf8');

describe('OAuth redirect URI is canonical, not host-derived', () => {
  it('never builds a provider redirect_uri from the request host', () => {
    // Regression: reaching the service through its *.run.app URL produced
    // https://chatscream-backend-....run.app/api/auth/oauth/google/callback,
    // which Google has not registered, so sign-in died with
    // redirect_uri_mismatch. The Host header is caller-controlled, so a
    // registered value can never be derived from it.
    const hostDerived = source.match(
      /\$\{getServerBaseUrl\(req\)\}\/api\/auth\/oauth\/\w+\/callback/g,
    );
    expect(hostDerived).toBeNull();
  });

  it('routes every provider redirect through the canonical resolver', () => {
    // Assert the invariant rather than a fixed count: every construction of a
    // provider callback URL must go through the resolver, however many there
    // are. A new call site that forgets it fails this.
    const all = source.match(/\$\{\w+\(req\)\}\/api\/auth\/oauth\/\w+\/callback/g) || [];
    const canonical = all.filter((match) => match.includes('getOAuthRedirectBaseUrl'));
    expect(all.length).toBeGreaterThanOrEqual(4);
    expect(canonical).toEqual(all);
  });

  it('pins the canonical API origin that is registered with the providers', () => {
    expect(source).toContain("const CANONICAL_API_BASE_URL = 'https://api.chatscream.live'");
  });

  it('prefers an explicit SERVER_BASE_URL / API_BASE_URL override', () => {
    const resolver = source.slice(
      source.indexOf('const getOAuthRedirectBaseUrl'),
      source.indexOf('const getFrontendOAuthCallbackUrl'),
    );
    expect(resolver).toContain('process.env.SERVER_BASE_URL');
    expect(resolver).toContain('process.env.API_BASE_URL');
    // and still uses the real origin on localhost so loopback dev works
    expect(resolver).toContain('isLocalHostBaseUrl');
  });

  it('treats only loopback hosts as local', () => {
    const helper = source.slice(
      source.indexOf('const isLocalHostBaseUrl'),
      source.indexOf('const getOAuthRedirectBaseUrl'),
    );
    expect(helper).toContain("hostname === 'localhost'");
    expect(helper).toContain("hostname === '127.0.0.1'");
    // A hostname merely containing "localhost" must not qualify.
    expect(helper).not.toMatch(/includes\(\s*'localhost'/);
  });
});
