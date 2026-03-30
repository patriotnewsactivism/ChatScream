import { afterEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';

const startServer = async () => {
  const { default: app } = await import('../app.js');
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to bind test server');
  }

  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
};

afterEach(() => {
  vi.resetModules();
  delete process.env.CORS_ORIGINS;
  delete process.env.APP_BASE_URL;
});

describe('CORS origin allowlist', () => {
  it('allows the www variant of APP_BASE_URL', async () => {
    process.env.APP_BASE_URL = 'https://chatscream.live';

    const { server, baseUrl } = await startServer();

    try {
      const response = await fetch(`${baseUrl}/api/health`, {
        headers: {
          Origin: 'https://www.chatscream.live',
        },
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('access-control-allow-origin')).toBe('https://www.chatscream.live');
    } finally {
      server.close();
    }
  });

  it('allows configured origins', async () => {
    process.env.CORS_ORIGINS = 'https://studio.example.com';

    const { server, baseUrl } = await startServer();

    try {
      const response = await fetch(`${baseUrl}/api/health`, {
        headers: {
          Origin: 'https://studio.example.com',
        },
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('access-control-allow-origin')).toBe('https://studio.example.com');
    } finally {
      server.close();
    }
  });

  it('blocks non-allowlisted origins', async () => {
    process.env.CORS_ORIGINS = 'https://studio.example.com';

    const { server, baseUrl } = await startServer();

    try {
      const response = await fetch(`${baseUrl}/api/health`, {
        headers: {
          Origin: 'https://evil.example.com',
        },
      });

      expect(response.status).toBe(500);
    } finally {
      server.close();
    }
  });
});
