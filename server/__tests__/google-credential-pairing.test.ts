import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(path.join(process.cwd(), 'server/app.js'), 'utf8');

const googleResolver = source.slice(
  source.indexOf('const getGoogleAuthCredentials'),
  source.indexOf('const getBackendCapabilities'),
);

describe('Google OAuth credential pairing', () => {
  it('never mixes a client ID and secret from different clients', () => {
    // Regression: the ID fell back to YOUTUBE_CLIENT_ID while the secret fell
    // back to YOUTUBE_CLIENT_SECRET independently. ChatScream runs two distinct
    // Google clients (account sign-in and the YouTube destination), so dropping
    // either GOOGLE_* var paired an ID from one client with a secret from the
    // other — Google rejects that as invalid_client at token exchange, after
    // the user has already approved consent.
    const idFallbackChain = googleResolver.match(
      /clientId:\s*String\([\s\S]*?\)\.trim\(\)/,
    )?.[0];
    expect(idFallbackChain).toBeUndefined();
    expect(googleResolver).not.toMatch(
      /process\.env\.GOOGLE_CLIENT_ID\s*\|\|[\s\S]{0,120}process\.env\.YOUTUBE_CLIENT_ID/,
    );
  });

  it('returns the GOOGLE_* pair only when both halves are present', () => {
    expect(googleResolver).toMatch(
      /if\s*\(googleClientId\s*&&\s*googleClientSecret\)\s*\{[\s\S]{0,120}return\s*\{\s*clientId:\s*googleClientId,\s*clientSecret:\s*googleClientSecret/,
    );
  });

  it('adopts the YouTube pair whole when GOOGLE_* is incomplete', () => {
    expect(googleResolver).toMatch(
      /const youtube = getYouTubeOAuthCredentials\(\)[\s\S]{0,200}if\s*\(youtube\.clientId\s*&&\s*youtube\.clientSecret\)/,
    );
  });

  it('keeps the YouTube resolver reading only YOUTUBE_* values', () => {
    const youtubeResolver = source.slice(
      source.indexOf('const getYouTubeOAuthCredentials'),
      source.indexOf('const getExpiryFromSeconds'),
    );
    expect(youtubeResolver).toContain('process.env.YOUTUBE_CLIENT_ID');
    expect(youtubeResolver).toContain('process.env.YOUTUBE_CLIENT_SECRET');
    // The destination flow must never silently borrow the sign-in client.
    expect(youtubeResolver).not.toContain('GOOGLE_CLIENT_ID');
    expect(youtubeResolver).not.toContain('GOOGLE_CLIENT_SECRET');
  });
});
