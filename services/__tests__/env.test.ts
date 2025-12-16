import { describe, expect, it } from 'vitest';
import { loadClientEnv } from '../env';

describe('loadClientEnv', () => {
  it('returns trimmed values for optional API keys', () => {
    const env = loadClientEnv({
      VITE_CLAUDE_API_KEY: '  claude-key  ',
      VITE_GEMINI_API_KEY: 'gem-key',
      VITE_SENTRY_DSN: ' https://example.com/1 ',
    });

    expect(env.VITE_CLAUDE_API_KEY).toBe('claude-key');
    expect(env.VITE_GEMINI_API_KEY).toBe('gem-key');
    expect(env.VITE_SENTRY_DSN).toBe('https://example.com/1');
  });

  it('allows missing optional keys without throwing', () => {
    const env = loadClientEnv({
      VITE_CLAUDE_API_KEY: undefined,
      VITE_GEMINI_API_KEY: '',
      VITE_SENTRY_DSN: '   ',
    });

    expect(env.VITE_CLAUDE_API_KEY).toBeUndefined();
    expect(env.VITE_GEMINI_API_KEY).toBeUndefined();
    expect(env.VITE_SENTRY_DSN).toBeUndefined();
  });
});
