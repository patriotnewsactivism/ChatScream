import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const loadModule = async () => import('../aiClient');

describe('aiClient', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds the default AI URL from API base URL', async () => {
    vi.doMock('../env', () => ({
      clientEnv: {
        VITE_API_BASE_URL: 'https://api.demo.test',
        VITE_FUNCTIONS_BASE_URL: undefined,
      },
    }));

    const { getFunctionsBaseUrl } = await loadModule();
    expect(getFunctionsBaseUrl()).toBe('https://api.demo.test');
  });

  it('uses functions override base URL when provided', async () => {
    vi.doMock('../env', () => ({
      clientEnv: {
        VITE_API_BASE_URL: 'https://api.demo.test',
        VITE_FUNCTIONS_BASE_URL: 'https://override.net',
      },
    }));

    const { getFunctionsBaseUrl } = await loadModule();
    expect(getFunctionsBaseUrl()).toBe('https://override.net');
  });

  it('posts with auth header to the secure backend AI route', async () => {
    vi.doMock('../env', () => ({
      clientEnv: {
        VITE_API_BASE_URL: 'https://api.demo.test',
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
      'https://api.demo.test/api/ai/viral-package',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer token-123' }),
      }),
    );
  });

  it('supports stream analysis requests', async () => {
    vi.doMock('../env', () => ({
      clientEnv: {
        VITE_API_BASE_URL: 'https://api.demo.test',
        VITE_FUNCTIONS_BASE_URL: undefined,
      },
    }));

    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        sentiment: 'neutral',
        topics: ['timeline'],
        engagementSuggestions: ['Answer the top question'],
        warnings: [],
        audienceMood: 'Curious',
      }),
    });

    const { requestContentAnalysis } = await loadModule();
    const result = await requestContentAnalysis('token-123', ['What happened?'], 'Case update');

    expect(result.topics).toEqual(['timeline']);
    expect(fetch).toHaveBeenCalledWith(
      'https://api.demo.test/api/ai/analyze-content',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('surfaces HTTP errors with status codes', async () => {
    vi.doMock('../env', () => ({
      clientEnv: {
        VITE_API_BASE_URL: 'https://api.demo.test',
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
