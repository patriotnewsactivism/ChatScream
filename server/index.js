import express from 'express';
import { WebSocketServer } from 'ws';
import { spawn, execFileSync } from 'node:child_process';
import http from 'node:http';
import app from './app.js';
import {
  closeIdentityStorage,
  flushState,
  initIdentityStorage,
  seedLeaderboard,
  setScreamBroadcaster,
} from './store.js';

const port = Number(process.env.PORT || 8787);
const server = http.createServer(app);

const wss = new WebSocketServer({ server, path: undefined });

// ââ WebRTC Signaling rooms ââââââââââââââââââââââââââââââââââââââââââââââââ
// Room map: roomId â Set<WebSocket>
const signalingRooms = new Map();

// ââ Scream rooms: streamerUid â Set<WebSocket> âââââââââââââââââââââââââ
// Streamers join their own scream room to receive real-time donation alerts.
// The Stripe webhook broadcasts to these rooms when a chat scream is paid.
const screamRooms = new Map();

const getScreamRoom = (streamerUid) => {
  if (!screamRooms.has(streamerUid)) screamRooms.set(streamerUid, new Set());
  return screamRooms.get(streamerUid);
};

export const broadcastScream = (streamerUid, alert) => {
  const room = screamRooms.get(streamerUid);
  if (!room) return;
  const raw = JSON.stringify({ type: 'scream_alert', alert });
  room.forEach((client) => {
    if (client.readyState === 1) client.send(raw);
  });
};

const getRoom = (roomId) => {
  if (!signalingRooms.has(roomId)) signalingRooms.set(roomId, new Set());
  return signalingRooms.get(roomId);
};

const broadcast = (roomId, msg, exclude) => {
  const room = signalingRooms.get(roomId);
  if (!room) return;
  const raw = JSON.stringify(msg);
  room.forEach((client) => {
    if (client !== exclude && client.readyState === 1) client.send(raw);
  });
};

wss.on('connection', (ws, req) => {
  // Route /ws/signal/:roomId to the signaling handler
  const url = req.url || '';
  const signalMatch = url.match(/^\/ws\/signal\/([^/?]+)/);
  if (signalMatch) {
    const roomId = signalMatch[1];
    const room = getRoom(roomId);
    room.add(ws);
    console.log(`ð¡ Signal client joined room ${roomId} (${room.size} peers)`);

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        // Relay the message to all other peers in the room
        broadcast(roomId, msg, ws);
      } catch (e) {
        console.error('[Signal] Bad message', e);
      }
    });

    ws.on('close', () => {
      room.delete(ws);
      if (room.size === 0) signalingRooms.delete(roomId);
    });
  }
});

server.listen(port, () => {
  console.log(`ð Server running on port ${port}`);
  initIdentityStorage();
  seedLeaderboard();
  setScreamBroadcaster();
});

process.on('SIGINT', () => {
  closeIdentityStorage();
  flushState();
  process.exit(0);
});

const trimTrailingSlash = (url) => url.replace(/\/$/, '');

const getApiBaseUrl = () => {
  const rawValue = (process.env.VITE_API_BASE_URL || '').trim();
  return rawValue ? trimTrailingSlash(rawValue) : '';
};

export const buildApiUrl = (path: string): string => {
  if (/^https?:\/\//i.test(path)) return path;
  const base = getApiBaseUrl();
  if (!base) return path;
  return `${base}${path}`;
};

// WebSocket equivalent of buildApiUrl â the frontend (Vercel) and backend
// (Railway) are on different hosts, so signaling sockets must point at the
// configured API host, not window.location.host (which is Vercel's).
export const buildWsUrl = (path: string): string => {
  const base = getApiBaseUrl();
  if (base) {
    return `${base.replace(/^http/i, 'ws')}${path}`;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${path}`;
};

const getApiUrlCandidates = (path: string): string[] => {
  if (/^https?:\/\//i.test(path)) return [path];

  const configuredBase = getApiBaseUrl();
  if (configuredBase) {
    return [`${configuredBase}${path}`];
  }

  const sameOrigin = path;
  const fallbackBases = getFallbackApiBaseUrls();

  return [sameOrigin, ...fallbackBases.map((fallbackBase) => `${fallbackBase}${path}`)];
};

const isRetryableStatus = (status: number): boolean => status >= 500 || status === 404;

const parseResponseBody = async (response: Response): Promise<unknown> => {
  if (response.status === 204) return null;

  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
};

const toErrorMessage = (status: number, data: unknown, statusText: string): string => {
  if (typeof data === 'string' && data.trim()) return data;
  if (data && typeof data === 'object') {
    const maybeData = data as Record<string, unknown>;
    if (typeof maybeData.message === 'string' && maybeData.message.trim()) {
      return maybeData.message;
    }
    if (typeof maybeData.error === 'string' && maybeData.error.trim()) {
      return maybeData.error;
    }
  }
  return `Request failed (${status}): ${statusText || 'Unknown error'}`;
};

export const apiRequest = async <T>(path: string, options: ApiRequestOptions = {}): Promise<T> => {
  const headers: Record<string, string> = { ...(options.headers || {}) };
  const hasBody = options.body !== undefined;

  if (hasBody && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const urls = getApiUrlCandidates(path);
  let lastError: unknown;

  for (const [index, url] of urls.entries()) {
    try {
      const response = await fetch(url, {
        method: options.method || 'GET',
        headers,
        body: hasBody ? JSON.stringify(options.body) : undefined,
        credentials: options.credentials || 'include',
      });

      const data = await parseResponseBody(response);
      if (response.ok) {
        return data as T;
      }

      const message = toErrorMessage(response.status, data, response.statusText);
      const error = new ApiRequestError(message, response.status, data);
      lastError = error;

      const shouldTryFallback = index < urls.length - 1 && isRetryableStatus(response.status);
      if (!shouldTryFallback) {
        throw error;
      }
    } catch (error) {
      lastError = error;
      if (error instanceof ApiRequestError && !isRetryableStatus(error.status)) {
        throw error;
      }
      if (index === urls.length - 1) {
        throw error;
      }
    }
  }

  throw (lastError as Error) || new Error('Request failed.');
};
