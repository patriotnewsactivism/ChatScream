import { spawn } from 'child_process';
import EventEmitter from 'events';
import path from 'path';
import fs from 'fs';

export class FFmpegRelayWorker extends EventEmitter {
  constructor(options = {}) {
    super();
    this.streamId = options.streamId || `stream_${Date.now()}`;
    this.destinations = options.destinations || [];
    this.outputDir = options.outputDir || path.join(process.cwd(), 'uploads', 'recordings', this.streamId);
    this.enableHls = options.enableHls ?? true;
    this.enableVod = options.enableVod ?? true;
    this.resolution = options.resolution || '1920x1080';
    this.fps = options.fps || 60;
    this.videoBitrate = options.videoBitrate || '6000k';
    this.audioBitrate = options.audioBitrate || '160k';
    this.process = null;
    this.isRunning = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.hlsPath = path.join(this.outputDir, 'live.m3u8');
    this.vodPath = path.join(this.outputDir, 'vod.mp4');

    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  buildFFmpegArgs() {
    const args = [
      '-re',
      '-i', 'pipe:0',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-tune', 'zerolatency',
      '-b:v', this.videoBitrate,
      '-maxrate', this.videoBitrate,
      '-bufsize', '12000k',
      '-pix_fmt', 'yuv420p',
      '-g', String(this.fps * 2),
      '-r', String(this.fps),
      '-s', this.resolution,
      '-c:a', 'aac',
      '-b:a', this.audioBitrate,
      '-ar', '44100',
    ];

    // Multi-destination tee mapping
    const outputs = [];

    if (this.enableVod) {
      outputs.push(`[f=mp4:movflags=faststart]${this.vodPath}`);
    }

    if (this.enableHls) {
      outputs.push(
        `[f=hls:hls_time=2:hls_list_size=5:hls_flags=delete_segments]${this.hlsPath}`
      );
    }

    for (const dest of this.destinations) {
      if (dest.enabled && dest.url) {
        const fullRtmp = dest.key ? `${dest.url.replace(/\/+$/, '')}/${dest.key}` : dest.url;
        outputs.push(`[f=flv]${fullRtmp}`);
      }
    }

    if (outputs.length === 0) {
      outputs.push(`[f=mp4:movflags=faststart]${this.vodPath}`);
    }

    args.push('-f', 'tee', '-map', '0:v', '-map', '0:a?', outputs.join('|'));
    return args;
  }

  start() {
    if (this.isRunning) return;

    const args = this.buildFFmpegArgs();
    this.process = spawn('ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    this.isRunning = true;

    this.process.stderr.on('data', (data) => {
      const message = data.toString();
      this.emit('log', message);
      if (message.includes('frame=') && message.includes('fps=')) {
        this.emit('stats', { raw: message, timestamp: Date.now() });
      }
    });

    this.process.on('error', (err) => {
      this.emit('error', err);
      this.handleProcessExit(1);
    });

    this.process.on('close', (code) => {
      this.handleProcessExit(code);
    });

    this.emit('started', { streamId: this.streamId, vodPath: this.vodPath, hlsPath: this.hlsPath });
  }

  writeVideoChunk(chunk) {
    if (!this.isRunning || !this.process?.stdin?.writable) {
      return false;
    }
    return this.process.stdin.write(chunk);
  }

  handleProcessExit(code) {
    this.isRunning = false;
    if (code !== 0 && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      this.emit('reconnecting', { attempt: this.reconnectAttempts });
      setTimeout(() => this.start(), 2000);
    } else {
      this.emit('stopped', { code, streamId: this.streamId, vodPath: this.vodPath });
    }
  }

  stop() {
    if (!this.isRunning) return Promise.resolve();

    return new Promise((resolve) => {
      this.reconnectAttempts = this.maxReconnectAttempts; // Prevent auto-restart
      if (this.process?.stdin?.writable) {
        this.process.stdin.end();
      }
      const timeout = setTimeout(() => {
        if (this.process) {
          this.process.kill('SIGKILL');
        }
        this.isRunning = false;
        resolve();
      }, 3000);

      this.process.once('close', () => {
        clearTimeout(timeout);
        this.isRunning = false;
        resolve();
      });
    });
  }
}
