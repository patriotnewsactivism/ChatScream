// Railway deployment entry point
// Exports Express app for Railway detection while maintaining WebSocket support

import express from 'express';
import { WebSocketServer } from 'ws';
import { spawn } from 'node:child_process';
import http from 'node:http';
import app from './app.js';
import { closeIdentityStorage, flushState, initIdentityStorage, seedLeaderboard } from './store.js';

const port = Number(process.env.PORT || 8787);
const server = http.createServer(app);

// Start WebSocket server
const wss = new WebSocketServer({ server, path: undefined });

// ── WebRTC Signaling rooms ────────────────────────────────────────────────
const signalingRooms = new Map();

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
  const url = req.url || '';
  const signalMatch = url.match(/^\/ws\/signal\/([^/?]+)/);
  if (signalMatch) {
    const roomId = signalMatch[1];
    const room = getRoom(roomId);
    room.add(ws);
    console.log(`📡 Signal client joined room ${roomId} (${room.size} peers)`);

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        broadcast(roomId, msg, ws);
      } catch (e) {
        console.error('[Signal] Bad message', e);
      }
    });

    ws.on('close', () => {
      room.delete(ws);
      if (room.size === 0) signalingRooms.delete(roomId);
      broadcast(roomId, { type: 'peer-left' }, null);
      console.log(`📡 Signal client left room ${roomId} (${room.size} peers)`);
    });

    return;
  }

  // RTMP ingest handler (simplified for Railway - skip FFmpeg for now)
  console.log('🔌 WebSocket connection (not RTMP ingest on Railway)');
  ws.close();
});

// Initialize and start server
const startServer = async () => {
  try {
    const identityStorage = await initIdentityStorage();
    seedLeaderboard();
    server.listen(port, '0.0.0.0', () => {
      console.log(`🚀 ChatScream API listening on port ${port} (identity: ${identityStorage})`);
    });
  } catch (error) {
    console.error('❌ Failed to initialize:', error);
    process.exit(1);
  }
};

// Start server immediately for Railway
startServer();

// Export app for Railway's HTTP routing
export default app;

// Cleanup on shutdown
const shutdown = async () => {
  console.log('🛑 Shutting down...');
  flushState();
  await closeIdentityStorage();
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
};

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
