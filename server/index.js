import express from 'express';
import { WebSocketServer } from 'ws';
import { spawn, execFileSync } from 'node:child_process';
import http from 'node:http';
import app from './app.js';
import { closeIdentityStorage, flushState, initIdentityStorage, seedLeaderboard } from './store.js';

const port = Number(process.env.PORT || 8787);
const server = http.createServer(app);

const wss = new WebSocketServer({ server, path: undefined });

// ── WebRTC Signaling rooms ────────────────────────────────────────────────
// Room map: roomId → Set<WebSocket>
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

  // ── RTMP ingest handler (original) ───────────────────────────────────────
  if (!url.startsWith('/ws/signal')) {
    console.log('🔌 New ingest WebSocket connection');

    let ffmpeg = null;
    let bytesReceived = 0;
    let lastStatsTime = Date.now();
    let activeDestinations = [];
    // Buffer incoming stream chunks while FFmpeg restarts after a destination update
    let pendingBuffer = [];
    let isRestarting = false;

    const statsInterval = setInterval(() => {
      if (ffmpeg && bytesReceived > 0) {
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

    const buildFfmpegArgs = (destinations) => {
      const args = [
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
      ];
      destinations.forEach((d) => {
        const serverUrl = resolveServerUrl(d);
        if (!serverUrl) {
          console.warn(`⚠️ Skipping destination with no server URL:`, d);
          return;
        }
        const url = serverUrl.endsWith('/') ? serverUrl : serverUrl + '/';
        const key = (d.streamKey || '').trim();
        args.push('-f', 'flv', `${url}${key}`);
      });
      return args;
    };

    const spawnFfmpeg = (destinations) => {
      if (destinations.length === 0) {
        ws.send(JSON.stringify({ type: 'error', message: 'No valid destinations to stream to.' }));
        return;
      }
      const args = buildFfmpegArgs(destinations);
      // Check if any actual output destinations were added to the args
      const hasOutputs = args.some((a) => a.startsWith('rtmp') || a.startsWith('rtmps'));
      if (!hasOutputs) {
        ws.send(
          JSON.stringify({
            type: 'error',
            message:
              'No destinations have valid RTMP URLs. Check your stream key and server URL settings.',
          }),
        );
        return;
      }
      console.log('🚀 Spawning FFmpeg for', destinations.length, 'destination(s)');
      console.log('   Args:', args.join(' '));
      const proc = spawn('ffmpeg', args);

      proc.on('error', (err) => {
        console.error('Failed to start FFmpeg process:', err);
        const hint =
          err.code === 'ENOENT'
            ? 'FFmpeg is not installed on this server. Install FFmpeg to enable streaming.'
            : `FFmpeg failed to start: ${err.message}`;
        ws.send(JSON.stringify({ type: 'error', message: hint }));
      });

      // Log FFmpeg stderr for debugging (contains progress, warnings, errors)
      proc.stderr.on('data', (data) => {
        const line = data.toString().trim();
        if (line) console.log(`[FFmpeg] ${line}`);
      });

      proc.on('close', (code) => {
        console.log(`FFmpeg process closed with code ${code}`);
        if (code !== 0 && code !== null && !isRestarting) {
          ws.send(
            JSON.stringify({
              type: 'error',
              message: `FFmpeg exited unexpectedly (code ${code}). Check stream keys and RTMP URLs.`,
            }),
          );
        }
      });

      // Flush buffered chunks into the new process
      if (pendingBuffer.length > 0) {
        for (const chunk of pendingBuffer) {
          if (proc.stdin.writable) proc.stdin.write(chunk);
        }
        pendingBuffer = [];
      }

      ffmpeg = proc;
      isRestarting = false;
    };

    ws.on('message', (data, isBinary) => {
      if (!isBinary) {
        try {
          const msg = JSON.parse(data.toString());

          if (msg.type === 'start') {
            activeDestinations = msg.destinations || [];
            if (ffmpeg) {
              ffmpeg.stdin.end();
              ffmpeg.kill();
            }
            spawnFfmpeg(activeDestinations);
          } else if (msg.type === 'update_destinations') {
            // Hot-swap destinations: restart FFmpeg with updated list
            activeDestinations = msg.destinations || [];
            console.log('🔄 Updating destinations:', activeDestinations.length);

            isRestarting = true;
            if (ffmpeg) {
              ffmpeg.stdin.end();
              ffmpeg.kill();
              ffmpeg = null;
            }
            // Brief pause lets the old process fully die before restarting
            setTimeout(() => spawnFfmpeg(activeDestinations), 500);
            ws.send(
              JSON.stringify({ type: 'destinations_updated', count: activeDestinations.length }),
            );
          }
        } catch (e) {
          console.error('Failed to parse WS command', e);
        }
      } else {
        bytesReceived += data.length;
        if (isRestarting) {
          // Buffer up to 5 MB during restart to avoid losing frames
          if (pendingBuffer.reduce((s, b) => s + b.length, 0) < 5 * 1024 * 1024) {
            pendingBuffer.push(data);
          }
        } else if (ffmpeg && ffmpeg.stdin.writable) {
          ffmpeg.stdin.write(data);
        }
      }
    });

    ws.on('close', () => {
      console.log('🔌 Ingest WebSocket connection closed');
      clearInterval(statsInterval);
      if (ffmpeg) {
        ffmpeg.stdin.end();
        ffmpeg.kill();
        ffmpeg = null;
      }
      pendingBuffer = [];
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
