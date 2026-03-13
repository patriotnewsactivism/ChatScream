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

          // FFmpeg command to receive from pipe and push to multiple RTMP destinations
          // We re-encode to H.264/AAC to ensure compatibility with RTMP platforms
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
            '60', // 2 second keyframe interval for 30fps
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

          console.log('🚀 Spawning FFmpeg with args:', ffmpegArgs.join(' '));
          ffmpeg = spawn('ffmpeg', ffmpegArgs);

          ffmpeg.stderr.on('data', (data) => {
            // Optional: log ffmpeg output for debugging
            // console.log(`FFmpeg STDERR: ${data}`);
          });

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
      // Binary data (stream chunk)
      if (ffmpeg && ffmpeg.stdin.writable) {
        ffmpeg.stdin.write(data);
      }
    }
  });

  ws.on('close', () => {
    console.log('🔌 Ingest WebSocket connection closed');
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

process.on('SIGINT', () => {
  void shutdown();
});
process.on('SIGTERM', () => {
  void shutdown();
});
