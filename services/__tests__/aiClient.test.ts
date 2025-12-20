import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const loadModule = async () => import('../aiClient');

describe('aiClient', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds the default functions URL from project id', async () => {
    vi.doMock('../env', () => ({
      clientEnv: {
        VITE_FIREBASE_PROJECT_ID: 'demo-project',
        VITE_FUNCTIONS_BASE_URL: undefined,
      },
    }));

    const { getFunctionsBaseUrl } = await loadModule();
    expect(getFunctionsBaseUrl()).toBe('https://us-central1-demo-project.cloudfunctions.net');
  });

  it('uses override base URL when provided', async () => {
    vi.doMock('../env', () => ({
      clientEnv: {
        VITE_FIREBASE_PROJECT_ID: 'demo-project',
        VITE_FUNCTIONS_BASE_URL: 'https://override.net',
      },
    }));

    const { getFunctionsBaseUrl } = await loadModule();
    expect(getFunctionsBaseUrl()).toBe('https://override.net');
  });

  it('posts with auth header', async () => {
    vi.doMock('../env', () => ({
      clientEnv: {
        VITE_FIREBASE_PROJECT_ID: 'demo-project',
        VITE_FUNCTIONS_BASE_URL: undefined,
      },
    }));

    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ titles: [], descriptions: [], hashtags: [], tags: [] }),
    });

    const { requestViralPackage } = await loadModule();
    await requestViralPackage('token-123', 'topic', ['youtube']);

    expect(fetch).toHaveBeenCalledWith(
      'https://us-central1-demo-project.cloudfunctions.net/generateViralContent',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer token-123' }),
      }),
    );
  });

  it('surfaces HTTP errors with status codes', async () => {
    vi.doMock('../env', () => ({
      clientEnv: {
        VITE_FIREBASE_PROJECT_ID: 'demo-project',
        VITE_FUNCTIONS_BASE_URL: undefined,
      },
    }));

    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => 'nope',
    });

    const { requestViralPackage } = await loadModule();
    await expect(requestViralPackage('bad-token', 'topic', ['youtube'])).rejects.toThrow(
      /AI endpoint error \(401\): nope/,
    );
  });
});
