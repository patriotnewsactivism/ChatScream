import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from '../apiClient';

const originalWindow = globalThis.window;
const fetchMock = vi.fn();

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
    statusText: status >= 400 ? 'Error' : 'OK',
  });

describe('apiRequest', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    if (originalWindow) {
      Object.defineProperty(globalThis, 'window', {
        value: originalWindow,
        writable: true,
      });
    }
  });

  it('falls back to api subdomain when same-origin API is unavailable', async () => {
    Object.defineProperty(globalThis, 'window', {
      value: {
        location: {
          protocol: 'https:',
          hostname: 'chatscream.live',
        },
      },
      writable: true,
    });

    fetchMock.mockResolvedValueOnce(jsonResponse(404, { message: 'API route not found.' }));
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    const result = await apiRequest<{ ok: boolean }>('/api/health');

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/health',
      expect.objectContaining({ credentials: 'include' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://api.chatscream.live/api/health',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('does not use fallback when VITE_API_BASE_URL is configured', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    vi.stubEnv('VITE_API_BASE_URL', 'https://backend.chatscream.live/');
    const result = await apiRequest<{ ok: boolean }>('/api/health');

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://backend.chatscream.live/api/health',
      expect.objectContaining({ credentials: 'include' }),
    );
  });
});
