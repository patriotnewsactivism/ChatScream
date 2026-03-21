import { describe, expect, it } from 'vitest';
import { loadClientEnv } from '../env';

describe('loadClientEnv', () => {
  it('returns trimmed values for optional client configuration', () => {
    const env = loadClientEnv({
      VITE_SENTRY_DSN: ' https://example.com/1 ',
      VITE_API_BASE_URL: ' https://api.example.com ',
      VITE_FUNCTIONS_BASE_URL: 'https://api.example.com/ai ',
    });

    expect(env.VITE_SENTRY_DSN).toBe('https://example.com/1');
    expect(env.VITE_API_BASE_URL).toBe('https://api.example.com');
    expect(env.VITE_FUNCTIONS_BASE_URL).toBe('https://api.example.com/ai');
  });

  it('allows missing optional keys without throwing', () => {
    const env = loadClientEnv({
      VITE_SENTRY_DSN: '   ',
      VITE_API_BASE_URL: undefined,
      VITE_FUNCTIONS_BASE_URL: undefined,
    });

    expect(env.VITE_SENTRY_DSN).toBeUndefined();
    expect(env.VITE_API_BASE_URL).toBeUndefined();
    expect(env.VITE_FUNCTIONS_BASE_URL).toBeUndefined();
  });
});
