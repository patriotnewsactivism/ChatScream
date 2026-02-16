import { describe, expect, it } from 'vitest';
import { loadClientEnv } from '../env';

describe('loadClientEnv', () => {
  it('returns trimmed values for optional API keys', () => {
    const env = loadClientEnv({
      VITE_GEMINI_API_KEY: 'gem-key',
      VITE_SENTRY_DSN: ' https://example.com/1 ',
      VITE_API_BASE_URL: ' https://api.example.com ',
      VITE_FUNCTIONS_BASE_URL: 'https://example.cloudfunctions.net ',
    });

    expect(env.VITE_GEMINI_API_KEY).toBe('gem-key');
    expect(env.VITE_SENTRY_DSN).toBe('https://example.com/1');
    expect(env.VITE_API_BASE_URL).toBe('https://api.example.com');
    expect(env.VITE_FUNCTIONS_BASE_URL).toBe('https://example.cloudfunctions.net');
  });

  it('allows missing optional keys without throwing', () => {
    const env = loadClientEnv({
      VITE_GEMINI_API_KEY: '',
      VITE_SENTRY_DSN: '   ',
      VITE_API_BASE_URL: undefined,
      VITE_FUNCTIONS_BASE_URL: undefined,
    });

    expect(env.VITE_GEMINI_API_KEY).toBeUndefined();
    expect(env.VITE_SENTRY_DSN).toBeUndefined();
    expect(env.VITE_API_BASE_URL).toBeUndefined();
    expect(env.VITE_FUNCTIONS_BASE_URL).toBeUndefined();
  });
});
