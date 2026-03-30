import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

const ORIGINAL_ENV = { ...process.env };

type RunningServer = {
  server: http.Server;
  baseUrl: string;
  dataDir: string;
};

const startServer = async (): Promise<RunningServer> => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatscream-test-'));
  process.env = {
    ...ORIGINAL_ENV,
    IDENTITY_STORAGE_MODE: 'local',
    CHATSCREAM_DATA_DIR: dataDir,
  };

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
    dataDir,
  };
};

const stopServer = async ({ server, dataDir }: RunningServer) => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
  fs.rmSync(dataDir, { recursive: true, force: true });
};

const signup = async (baseUrl: string, email: string, displayName: string) => {
  const response = await fetch(`${baseUrl}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password: 'password123',
      displayName,
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`Signup failed: ${JSON.stringify(payload)}`);
  }

  return {
    token: payload.session.token as string,
    uid: payload.session.user.uid as string,
  };
};

afterEach(() => {
  vi.resetModules();
  process.env = { ...ORIGINAL_ENV };
});

describe('user profile update authorization', () => {
  it('allows a non-admin to update their own allowlisted fields', async () => {
    const running = await startServer();

    try {
      const me = await signup(running.baseUrl, 'self@example.com', 'Self User');

      const response = await fetch(`${running.baseUrl}/api/users/${me.uid}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${me.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          displayName: 'Updated Self',
          photoURL: 'https://example.com/self.png',
          settings: { theme: 'dark' },
        }),
      });

      expect(response.status).toBe(200);
      const payload = await response.json();
      expect(payload.profile.displayName).toBe('Updated Self');
      expect(payload.profile.photoURL).toBe('https://example.com/self.png');
    } finally {
      await stopServer(running);
    }
  });

  it('denies non-admin updates to another user', async () => {
    const running = await startServer();

    try {
      const actor = await signup(running.baseUrl, 'actor@example.com', 'Actor');
      const target = await signup(running.baseUrl, 'target@example.com', 'Target');

      const response = await fetch(`${running.baseUrl}/api/users/${target.uid}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${actor.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          displayName: 'Hacked Name',
        }),
      });

      expect(response.status).toBe(403);
      const payload = await response.json();
      expect(payload.message).toMatch(/only update your own profile/i);
    } finally {
      await stopServer(running);
    }
  });

  it('denies non-admin attempts to update role or subscription', async () => {
    const running = await startServer();

    try {
      const me = await signup(running.baseUrl, 'nonadmin@example.com', 'Non Admin');

      const response = await fetch(`${running.baseUrl}/api/user/${me.uid}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${me.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          role: 'admin',
          subscription: { plan: 'pro', status: 'active' },
        }),
      });

      expect(response.status).toBe(403);
      const payload = await response.json();
      expect(payload.message).toMatch(/sensitive profile fields/i);

      const profileResponse = await fetch(`${running.baseUrl}/api/users/${me.uid}`, {
        headers: {
          Authorization: `Bearer ${me.token}`,
        },
      });
      const profilePayload = await profileResponse.json();
      expect(profilePayload.profile.displayName).toBe('Non Admin');
    } finally {
      await stopServer(running);
    }
  });
});
