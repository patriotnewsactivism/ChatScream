import { afterEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

afterEach(async () => {
  vi.resetModules();
  process.env = { ...ORIGINAL_ENV };
});

describe('identity storage bootstrap', () => {
  it('fails fast in managed mode when required env vars are missing', async () => {
    delete process.env.POSTGRES_URL;
    delete process.env.DATABASE_URL;
    delete process.env.REDIS_URL;
    process.env.IDENTITY_STORAGE_MODE = 'managed';

    const store = await import('../store.js');

    await expect(store.initIdentityStorage()).rejects.toThrow(
      /Missing managed identity storage configuration/i,
    );
  });

  it('allows explicit local mode without managed env vars', async () => {
    delete process.env.POSTGRES_URL;
    delete process.env.DATABASE_URL;
    delete process.env.REDIS_URL;
    process.env.IDENTITY_STORAGE_MODE = 'local';

    const store = await import('../store.js');

    await expect(store.initIdentityStorage()).resolves.toBe('local');
  });
});
