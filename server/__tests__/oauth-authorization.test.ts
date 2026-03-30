import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

type AuthSession = {
  token: string;
  user: {
    uid: string;
  };
};

const ORIGINAL_ENV = { ...process.env };

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

const signup = async (baseUrl: string, email: string): Promise<AuthSession> => {
  const response = await fetch(`${baseUrl}/api/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email,
      password: 'password123',
      displayName: email.split('@')[0],
    }),
  });

  if (!response.ok) {
    throw new Error(`Signup failed for ${email}: ${response.status}`);
  }

  const payload = await response.json();
  return payload.session;
};

afterEach(() => {
  vi.resetModules();
  process.env = { ...ORIGINAL_ENV };
});

describe('OAuth platform access control', () => {
  it('ignores non-admin userId on platform reads and disconnect mutations', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatscream-oauth-authz-'));
    process.env.IDENTITY_STORAGE_MODE = 'local';
    process.env.CHATSCREAM_DATA_DIR = dataDir;

    const { setConnectedPlatform } = await import('../store.js');
    const { server, baseUrl } = await startServer();

    try {
      const ownerSession = await signup(baseUrl, 'owner@example.com');
      const attackerSession = await signup(baseUrl, 'attacker@example.com');

      await setConnectedPlatform(ownerSession.user.uid, 'youtube', {
        channelId: 'owner-channel',
        connectedAt: new Date().toISOString(),
      });
      await setConnectedPlatform(attackerSession.user.uid, 'youtube', {
        channelId: 'attacker-channel',
        connectedAt: new Date().toISOString(),
      });

      const readAttempt = await fetch(
        `${baseUrl}/api/oauth/platforms?userId=${encodeURIComponent(ownerSession.user.uid)}`,
        {
          headers: {
            authorization: `Bearer ${attackerSession.token}`,
          },
        },
      );
      expect(readAttempt.status).toBe(200);
      const readPayload = await readAttempt.json();
      expect(readPayload.platforms.youtube.channelId).toBe('attacker-channel');

      const disconnectAttempt = await fetch(`${baseUrl}/api/oauth/disconnect`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${attackerSession.token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          userId: ownerSession.user.uid,
          platform: 'youtube',
        }),
      });
      expect(disconnectAttempt.status).toBe(200);

      const ownerPlatformsResponse = await fetch(`${baseUrl}/api/oauth/platforms`, {
        headers: {
          authorization: `Bearer ${ownerSession.token}`,
        },
      });
      expect(ownerPlatformsResponse.status).toBe(200);
      const ownerPayload = await ownerPlatformsResponse.json();
      expect(ownerPayload.platforms.youtube.channelId).toBe('owner-channel');

      const attackerPlatformsResponse = await fetch(`${baseUrl}/api/oauth/platforms`, {
        headers: {
          authorization: `Bearer ${attackerSession.token}`,
        },
      });
      expect(attackerPlatformsResponse.status).toBe(200);
      const attackerPayload = await attackerPlatformsResponse.json();
      expect(attackerPayload.platforms.youtube).toBeNull();
    } finally {
      server.close();
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
