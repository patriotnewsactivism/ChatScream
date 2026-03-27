import express from 'express';
import { WebSocketServer } from 'ws';
import { spawn } from 'node:child_process';
import http from 'node:http';
import app from './app.js';
import { closeIdentityStorage, flushState } from './store.js';

const port = Number(process.env.PORT || 8787);
const server = http.createServer(app);

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
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

  const buildFfmpegArgs = (destinations) => {
    const args = [
      '-re',
      '-i', 'pipe:0',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-tune', 'zerolatency',
      '-g', '60',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ar', '44100',
    ];
    destinations.forEach((d) => {
      const url = d.serverUrl.endsWith('/') ? d.serverUrl : d.serverUrl + '/';
      args.push('-f', 'flv', `${url}${d.streamKey}`);
    });
    return args;
  };

  const spawnFfmpeg = (destinations) => {
    if (destinations.length === 0) return;
    const args = buildFfmpegArgs(destinations);
    console.log('🚀 Spawning FFmpeg for', destinations.length, 'destination(s)');
    const proc = spawn('ffmpeg', args);

    proc.on('error', (err) => {
      console.error('Failed to start FFmpeg process:', err);
      ws.send(JSON.stringify({ type: 'error', message: 'FFmpeg failed to start' }));
    });

    proc.on('close', (code) => {
      console.log(`FFmpeg process closed with code ${code}`);
      if (code !== 0 && code !== null && !isRestarting) {
        ws.send(JSON.stringify({ type: 'error', message: `FFmpeg exited with code ${code}` }));
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
          ws.send(JSON.stringify({ type: 'destinations_updated', count: activeDestinations.length }));
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
});

server.listen(port, () => {
  console.log(`ChatScream API + WebSocket listening on http://localhost:${port}`);
});

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
