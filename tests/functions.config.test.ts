import { describe, expect, it, vi, beforeEach } from 'vitest';

const originalEnv = { ...process.env };

const setRequiredSecrets = () => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_secret';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_123';
};

beforeEach(() => {
  vi.resetModules();
  process.env = { ...originalEnv };
});

describe('loadFunctionsEnv', () => {
  it('parses required and optional secrets with trimming', async () => {
    setRequiredSecrets();
    process.env.YOUTUBE_CLIENT_ID = ' youtube-id ';
    process.env.YOUTUBE_CLIENT_SECRET = ' youtube-secret ';
    process.env.FACEBOOK_APP_ID = ' fb-id ';
    process.env.FACEBOOK_APP_SECRET = ' fb-secret ';
    process.env.TWITCH_CLIENT_ID = ' twitch-id ';
    process.env.TWITCH_CLIENT_SECRET = ' twitch-secret ';
    process.env.CLAUDE_API_KEY = ' claude-key ';

    const { loadFunctionsEnv } = await import('../functions/config');
    const env = loadFunctionsEnv(process.env as NodeJS.ProcessEnv);

    expect(env.STRIPE_SECRET_KEY).toBe('sk_test_secret');
    expect(env.STRIPE_WEBHOOK_SECRET).toBe('whsec_123');
    expect(env.YOUTUBE_CLIENT_ID).toBe('youtube-id');
    expect(env.CLAUDE_API_KEY).toBe('claude-key');
  });

  it('throws when Stripe secrets are missing', async () => {
    setRequiredSecrets();
    const { loadFunctionsEnv } = await import('../functions/config');
    expect(() => loadFunctionsEnv({} as NodeJS.ProcessEnv)).toThrow('STRIPE_SECRET_KEY');
  });
});
