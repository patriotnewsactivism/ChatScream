import app from './app.js';
import { closeIdentityStorage, flushState } from './store.js';
import { WebSocketServer } from 'ws';
import { spawn } from 'node:child_process';

const port = Number(process.env.PORT || 8787);

const server = app.listen(port, () => {
  console.log(`ChatScream API listening on http://localhost:${port}`);
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  console.log('🔌 New ingest WebSocket connection');

  let ffmpeg = null;
  let bytesReceived = 0;
  let lastStatsTime = Date.now();

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

  ws.on('message', (data, isBinary) => {
    if (!isBinary) {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'start') {
          const { destinations } = msg;
          if (ffmpeg) {
            ffmpeg.stdin.end();
            ffmpeg.kill();
          }

          const ffmpegArgs = [
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
            '-c:a',
            'aac',
            '-b:a',
            '128k',
            '-ar',
            '44100',
          ];

          destinations.forEach((d) => {
            const url = d.serverUrl.endsWith('/') ? d.serverUrl : d.serverUrl + '/';
            ffmpegArgs.push('-f', 'flv', `${url}${d.streamKey}`);
          });

          console.log('🚀 Spawning FFmpeg');
          ffmpeg = spawn('ffmpeg', ffmpegArgs);

          ffmpeg.on('error', (err) => {
            console.error('Failed to start FFmpeg process:', err);
            ws.send(JSON.stringify({ type: 'error', message: 'FFmpeg failed to start' }));
          });

          ffmpeg.on('close', (code) => {
            console.log(`FFmpeg process closed with code ${code}`);
            if (code !== 0 && code !== null) {
              ws.send(
                JSON.stringify({ type: 'error', message: `FFmpeg exited with code ${code}` }),
              );
            }
          });
        }
      } catch (e) {
        console.error('Failed to parse WS command', e);
      }
    } else {
      bytesReceived += data.length;
      if (ffmpeg && ffmpeg.stdin.writable) {
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
  });
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
