import { afterEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { createHash } from 'node:crypto';

const setupAuthTestEnv = () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatscream-auth-'));
  process.env.IDENTITY_STORAGE_MODE = 'local';
  process.env.CHATSCREAM_DATA_DIR = dataDir;
  return { dataDir };
};

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
  delete process.env.IDENTITY_STORAGE_MODE;
  delete process.env.CHATSCREAM_DATA_DIR;
});

describe('auth password hashing and migration', () => {
  it('stores bcrypt hash and algorithm metadata on signup', async () => {
    const { dataDir } = setupAuthTestEnv();
    const { server, baseUrl } = await startServer();

    try {
      const response = await fetch(`${baseUrl}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'new-user@example.com',
          password: 'StrongPassword123!',
          displayName: 'New User',
        }),
      });

      expect(response.status).toBe(201);

      const store = await import('../store.js');
      const savedUser = await store.getUserByEmail('new-user@example.com');

      expect(savedUser).toBeTruthy();
      expect(savedUser?.passwordAlgorithm).toBe('bcrypt');
      expect(savedUser?.passwordHash).toMatch(/^\$2[aby]\$/);
      expect(savedUser?.passwordHash).not.toBe(
        createHash('sha256').update('StrongPassword123!').digest('hex'),
      );
    } finally {
      server.close();
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('upgrades legacy sha256 password hash on successful login', async () => {
    const { dataDir } = setupAuthTestEnv();
    const { server, baseUrl } = await startServer();

    try {
      const store = await import('../store.js');
      await store.putUser({
        uid: 'legacy-user',
        email: 'legacy@example.com',
        passwordHash: createHash('sha256').update('LegacyPass123!').digest('hex'),
        profile: store.createUserProfile({
          uid: 'legacy-user',
          email: 'legacy@example.com',
          displayName: 'Legacy User',
        }),
      });

      const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'legacy@example.com',
          password: 'LegacyPass123!',
        }),
      });

      expect(loginResponse.status).toBe(200);

      const upgradedUser = await store.getUserByEmail('legacy@example.com');
      expect(upgradedUser?.passwordAlgorithm).toBe('bcrypt');
      expect(upgradedUser?.passwordHash).toMatch(/^\$2[aby]\$/);
      expect(upgradedUser?.passwordHash).not.toBe(
        createHash('sha256').update('LegacyPass123!').digest('hex'),
      );
    } finally {
      server.close();
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('rejects invalid login credentials', async () => {
    const { dataDir } = setupAuthTestEnv();
    const { server, baseUrl } = await startServer();

    try {
      const signupResponse = await fetch(`${baseUrl}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'login-user@example.com',
          password: 'ValidPass123!',
          displayName: 'Login User',
        }),
      });
      expect(signupResponse.status).toBe(201);

      const invalidLoginResponse = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'login-user@example.com',
          password: 'WrongPassword',
        }),
      });

      expect(invalidLoginResponse.status).toBe(401);
      const payload = await invalidLoginResponse.json();
      expect(payload.message).toMatch(/invalid email or password/i);
    } finally {
      server.close();
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
