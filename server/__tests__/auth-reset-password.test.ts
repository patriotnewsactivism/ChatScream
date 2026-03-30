import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

const ORIGINAL_ENV = { ...process.env };

const createTestServer = async () => {
  const appModule = await import('../app.js');
  const passwordResetModule = await import('../auth/passwordReset.js');
  passwordResetModule.resetPasswordResetInternalsForTests();
  const server = http.createServer(appModule.default);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to get server address.');
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
  };
};

const postJson = async (baseUrl: string, route: string, body: Record<string, unknown>) => {
  const response = await fetch(`${baseUrl}${route}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  return { response, payload };
};

describe('auth password reset pipeline', () => {
  let tempDir = '';

  beforeEach(() => {
    vi.resetModules();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatscream-reset-'));
    process.env = {
      ...ORIGINAL_ENV,
      NODE_ENV: 'test',
      IDENTITY_STORAGE_MODE: 'local',
      CHATSCREAM_DATA_DIR: tempDir,
      AUTH_RESET_TOKEN_TTL_SECONDS: '60',
      AUTH_RESET_RATE_LIMIT_MAX: '100',
      AUTH_RESET_CONFIRM_RATE_LIMIT_MAX: '100',
      PASSWORD_RESET_EMAIL_PROVIDER: 'log',
    };
  });

  afterEach(async () => {
    process.env = { ...ORIGINAL_ENV };
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('rejects expired tokens', async () => {
    process.env.AUTH_RESET_TOKEN_TTL_SECONDS = '1';
    const { baseUrl, close } = await createTestServer();
    try {
      await postJson(baseUrl, '/api/auth/signup', {
        email: 'expiry@example.com',
        password: 'initial-password',
      });
      const issued = await postJson(baseUrl, '/api/auth/reset-password', { email: 'expiry@example.com' });
      const token = String(issued.payload.resetToken || '');
      expect(token).toBeTruthy();
      await new Promise((resolve) => setTimeout(resolve, 1200));

      const confirmed = await postJson(baseUrl, '/api/auth/reset-password/confirm', {
        token,
        password: 'new-password',
      });
      expect(confirmed.response.status).toBe(400);
      expect(confirmed.payload.message).toMatch(/invalid or expired token/i);
    } finally {
      await close();
    }
  });

  it('rejects replayed tokens after first use', async () => {
    const { baseUrl, close } = await createTestServer();
    try {
      await postJson(baseUrl, '/api/auth/signup', {
        email: 'replay@example.com',
        password: 'initial-password',
      });
      const issued = await postJson(baseUrl, '/api/auth/reset-password', { email: 'replay@example.com' });
      const token = String(issued.payload.resetToken || '');
      expect(token).toBeTruthy();

      const first = await postJson(baseUrl, '/api/auth/reset-password/confirm', {
        token,
        password: 'new-password',
      });
      expect(first.response.status).toBe(200);
      expect(first.payload.success).toBe(true);

      const second = await postJson(baseUrl, '/api/auth/reset-password/confirm', {
        token,
        password: 'new-password-again',
      });
      expect(second.response.status).toBe(400);
      expect(second.payload.message).toMatch(/invalid or expired token/i);
    } finally {
      await close();
    }
  });

  it('rejects invalid tokens', async () => {
    const { baseUrl, close } = await createTestServer();
    try {
      const confirmed = await postJson(baseUrl, '/api/auth/reset-password/confirm', {
        token: 'invalid-token',
        password: 'new-password',
      });
      expect(confirmed.response.status).toBe(400);
      expect(confirmed.payload.message).toMatch(/invalid or expired token/i);
    } finally {
      await close();
    }
  });

  it('updates password successfully with a valid token', async () => {
    const { baseUrl, close } = await createTestServer();
    try {
      await postJson(baseUrl, '/api/auth/signup', {
        email: 'success@example.com',
        password: 'old-password',
      });

      const issued = await postJson(baseUrl, '/api/auth/reset-password', { email: 'success@example.com' });
      const token = String(issued.payload.resetToken || '');
      expect(token).toBeTruthy();

      const confirmed = await postJson(baseUrl, '/api/auth/reset-password/confirm', {
        token,
        password: 'new-password',
      });
      expect(confirmed.response.status).toBe(200);

      const oldLogin = await postJson(baseUrl, '/api/auth/login', {
        email: 'success@example.com',
        password: 'old-password',
      });
      expect(oldLogin.response.status).toBe(401);

      const newLogin = await postJson(baseUrl, '/api/auth/login', {
        email: 'success@example.com',
        password: 'new-password',
      });
      expect(newLogin.response.status).toBe(200);
      expect(newLogin.payload.session?.token).toBeTruthy();
    } finally {
      await close();
    }
  });
});
