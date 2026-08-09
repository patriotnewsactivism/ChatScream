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

// ── WebRTC Signaling rooms ────────────────────────────────────────────────
// Room map: roomId → Set<WebSocket>
const signalingRooms = new Map();

// ── Scream rooms: streamerUid → Set<WebSocket> ─────────────────────────
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
    console.log(`📡 Signal client joined room ${roomId} (${room.size} peers)`);

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
      broadcast(roomId, { type: 'peer-left' }, null);
      console.log(`📡 Signal client left room ${roomId} (${room.size} peers)`);
    });

    return; // Don't fall through to the RTMP ingest handler
  }

  // ── Scream room: /ws/scream/:streamerUid ────────────────────────────────
  const screamMatch = url.match(/^\/ws\/scream\/([^/?]+)/);
  if (screamMatch) {
    const streamerUid = screamMatch[1];
    const room = getScreamRoom(streamerUid);
    room.add(ws);
    console.log(`🔔 Scream listener joined for streamer ${streamerUid} (${room.size} listeners)`);

    ws.on('close', () => {
      room.delete(ws);
      if (room.size === 0) screamRooms.delete(streamerUid);
    });

    return; // Don't fall through to the RTMP ingest handler
  }

  // ── RTMP ingest handler (per-destination FFmpeg processes) ────────────────
  // Each destination gets its own FFmpeg process reading the same incoming
  // browser byte stream. This isolates failures: a bad stream key on one
  // platform no longer kills the connection to the others, and a single
  // destination can be retried/hot-swapped without disturbing the rest.
  if (!url.startsWith('/ws/signal')) {
    console.log('🔌 New ingest WebSocket connection');

    /** @type {Map<string, import('node:child_process').ChildProcess>} */
    const procs = new Map();
    /** @type {Map<string, object>} */
    const destinationsById = new Map();
    // Set of destIds whose process is being torn down intentionally
    // (remove/update/retry) so their 'close' handler doesn't report a spurious error.
    const intentionalKills = new Set();
    // First binary chunk received contains the WebM init segment (EBML header +
    // tracks). Cached so processes spawned after streaming has begun (a newly
    // added destination, or a retry) still get a decodable stream.
    let initSegmentChunk = null;

    let bytesReceived = 0;
    let lastStatsTime = Date.now();

    const statsInterval = setInterval(() => {
      if (procs.size > 0 && bytesReceived > 0) {
        const now = Date.now();
        const dt = (now - lastStatsTime) / 1000;
        const bitrateKbps = Math.round((bytesReceived * 8) / dt / 1000);
        ws.send(JSON.stringify({ type: 'stats', bitrate: bitrateKbps }));
        bytesReceived = 0;
        lastStatsTime = now;
      }
    }, 2000);

    // Default RTMP ingest URLs per platform (used when serverUrl is missing)
    const DEFAULT_RTMP_URLS = {
      youtube: 'rtmp://a.rtmp.youtube.com/live2/',
      facebook: 'rtmps://live-api-s.facebook.com:443/rtmp/',
      twitch: 'rtmp://live.twitch.tv/app/',
      kick: 'rtmps://fa723fc1b171.global-contribute.live-video.net:443/app/',
      rumble: 'rtmp://live-ingest.rumble.com/live/',
      custom_rtmp: '',
    };

    const resolveServerUrl = (d) => {
      if (d.serverUrl && d.serverUrl.trim()) return d.serverUrl.trim();
      // Try to detect platform from the destination name or platform field
      const name = (d.platform || d.name || '').toLowerCase();
      for (const [key, url] of Object.entries(DEFAULT_RTMP_URLS)) {
        if (name.includes(key.replace('_', ' ')) || name.includes(key.replace('_', ''))) {
          return url;
        }
      }
      return '';
    };

    const buildSingleDestArgs = (outputUrl) => [
      // No -re flag — we receive chunks in real-time from WebSocket,
      // -re would throttle pipe input and cause buffering/drift
      '-fflags',
      '+nobuffer+flush_packets',
      '-flags',
      'low_delay',
      '-i',
      'pipe:0',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-tune',
      'zerolatency',
      '-g',
      '60',
      '-b:v',
      '4500k',
      '-maxrate',
      '4500k',
      '-bufsize',
      '9000k',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-ar',
      '44100',
      '-f',
      'flv',
      outputUrl,
    ];

    /**
     * Spawn (or respawn) the FFmpeg process for a single destination. Killing
     * one destination's process never touches the others.
     */
    const spawnDestination = (dest) => {
      const serverUrl = resolveServerUrl(dest);
      if (!serverUrl) {
        console.warn('⚠️ Skipping destination with no server URL:', dest);
        ws.send(
          JSON.stringify({
            type: 'destination_error',
            destId: dest.id,
            message: 'No RTMP server URL configured for this destination.',
          }),
        );
        return;
      }
      const base = serverUrl.endsWith('/') ? serverUrl : serverUrl + '/';
      const outputUrl = `${base}${(dest.streamKey || '').trim()}`;

      // Tear down any existing process for this destination first.
      const existing = procs.get(dest.id);
      if (existing) {
        intentionalKills.add(dest.id);
        existing.stdin.end();
        existing.kill();
      }

      console.log(`🚀 Spawning FFmpeg for destination [${dest.id}] ${dest.platform || dest.name || ''}`);
      const proc = spawn('ffmpeg', buildSingleDestArgs(outputUrl));

      proc.on('error', (err) => {
        console.error(`Failed to start FFmpeg for [${dest.id}]:`, err);
        const hint =
          err.code === 'ENOENT'
            ? 'FFmpeg is not installed on this server. Install FFmpeg to enable streaming.'
            : `FFmpeg failed to start: ${err.message}`;
        ws.send(JSON.stringify({ type: 'destination_error', destId: dest.id, message: hint }));
      });

      // Parse FFmpeg stderr for connection state — everything here pertains
      // to this one destination, so no URL correlation is needed anymore.
      let stderrBuffer = '';
      proc.stderr.on('data', (data) => {
        stderrBuffer += data.toString();
        const lines = stderrBuffer.split('\n');
        stderrBuffer = lines.pop() ?? ''; // keep incomplete last line

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line) continue;
          console.log(`[FFmpeg:${dest.id}] ${line}`);

          if (/Output #\d+[^']*to '[^']+'/i.test(line)) {
            ws.send(JSON.stringify({ type: 'destination_connected', destId: dest.id }));
            continue;
          }

          const errorKeywords =
            /connection refused|connection timed out|connection reset|no route to host|failed to connect|invalid data|authentication failed|refused|403|401|stream key|forbidden/i;
          if (errorKeywords.test(line)) {
            ws.send(JSON.stringify({ type: 'destination_error', destId: dest.id, message: line }));
          }
        }
      });

      proc.on('close', (code) => {
        if (stderrBuffer.trim()) console.log(`[FFmpeg:${dest.id}] ${stderrBuffer.trim()}`);
        stderrBuffer = '';

        // Only remove from the map if this is still the current process for
        // the destination (avoids a stale close racing a fresh respawn).
        if (procs.get(dest.id) === proc) procs.delete(dest.id);

        const wasIntentional = intentionalKills.delete(dest.id);
        console.log(`FFmpeg [${dest.id}] closed with code ${code}${wasIntentional ? ' (intentional)' : ''}`);
        if (code !== 0 && code !== null && !wasIntentional) {
          ws.send(
            JSON.stringify({
              type: 'destination_error',
              destId: dest.id,
              message: `Stream to this destination dropped (FFmpeg exited with code ${code}). Check the stream key and RTMP URL.`,
            }),
          );
        }
      });

      // Prime a process that's joining an already-running stream (added
      // later, or retried) with the cached WebM init segment so it has a
      // decodable header before live chunks start arriving.
      if (initSegmentChunk && proc.stdin.writable) {
        proc.stdin.write(initSegmentChunk);
      }

      procs.set(dest.id, proc);
    };

    const removeDestination = (destId) => {
      const proc = procs.get(destId);
      destinationsById.delete(destId);
      if (proc) {
        intentionalKills.add(destId);
        proc.stdin.end();
        proc.kill();
      }
    };

    ws.on('message', (data, isBinary) => {
      if (!isBinary) {
        try {
          const msg = JSON.parse(data.toString());

          if (msg.type === 'start') {
            const destinations = msg.destinations || [];
            if (destinations.length === 0) {
              ws.send(
                JSON.stringify({ type: 'error', message: 'No valid destinations to stream to.' }),
              );
            }
            for (const d of destinations) {
              destinationsById.set(d.id, d);
              spawnDestination(d);
            }
          } else if (msg.type === 'update_destinations') {
            // Diff against the current set — only spawn/kill what actually
            // changed, instead of restarting every destination on any edit.
            const next = msg.destinations || [];
            const nextIds = new Set(next.map((d) => d.id));

            for (const existingId of Array.from(destinationsById.keys())) {
              if (!nextIds.has(existingId)) removeDestination(existingId);
            }

            for (const d of next) {
              const prev = destinationsById.get(d.id);
              const changed =
                !prev || prev.streamKey !== d.streamKey || prev.serverUrl !== d.serverUrl;
              destinationsById.set(d.id, d);
              if (changed) spawnDestination(d);
            }

            console.log('🔄 Updated destinations:', destinationsById.size);
            ws.send(JSON.stringify({ type: 'destinations_updated', count: destinationsById.size }));
          } else if (msg.type === 'retry_destination') {
            const dest = destinationsById.get(msg.destId);
            if (dest) {
              console.log(`🔁 Retrying destination [${dest.id}]`);
              spawnDestination(dest);
            }
          }
        } catch (e) {
          console.error('Failed to parse WS command', e);
        }
      } else {
        bytesReceived += data.length;
        if (!initSegmentChunk) initSegmentChunk = data;
        for (const proc of procs.values()) {
          if (proc.stdin.writable) proc.stdin.write(data);
        }
      }
    });

    ws.on('close', () => {
      console.log('🔌 Ingest WebSocket connection closed');
      clearInterval(statsInterval);
      for (const [destId, proc] of procs) {
        intentionalKills.add(destId);
        proc.stdin.end();
        proc.kill();
      }
      procs.clear();
      destinationsById.clear();
    });
  } // end of RTMP ingest handler
});

// Check FFmpeg availability at startup
const checkFfmpeg = () => {
  try {
    const version = execFileSync('ffmpeg', ['-version'], { timeout: 5000 })
      .toString()
      .split('\n')[0];
    console.log(`✅ FFmpeg available: ${version}`);
    return true;
  } catch {
    console.warn('⚠️  FFmpeg is NOT installed — RTMP streaming will not work.');
    console.warn('   Install FFmpeg or deploy with Docker/nixpacks to enable streaming.');
    return false;
  }
};

// Wire the scream broadcaster so the Stripe webhook can push to WebSocket rooms
setScreamBroadcaster(broadcastScream);

const startServer = async () => {
  try {
    checkFfmpeg();
    const identityStorage = await initIdentityStorage();
    seedLeaderboard();
    server.listen(port, '0.0.0.0', () => {
      console.log(
        `ChatScream API + WebSocket listening on http://0.0.0.0:${port} (identity: ${identityStorage})`,
      );
    });
  } catch (error) {
    console.error('Failed to initialize identity storage. Refusing to boot API.', error);
    process.exit(1);
  }
};

void startServer();

const shutdown = async () => {
  console.log('Shutting down server...');
  flushState();
  await closeIdentityStorage();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
};

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
