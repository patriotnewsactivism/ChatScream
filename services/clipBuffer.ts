/**
 * Clip Buffer Service
 *
 * Maintains a rolling 30-second buffer of the canvas stream so creators
 * can save "that moment" at any time during a live broadcast.
 *
 * Usage:
 *   const buf = new ClipBuffer(canvasStream);
 *   buf.start();
 *   // later…
 *   buf.saveClip('my-clip.webm');
 *   buf.stop();
 */

const BUFFER_SECONDS = 30;

export class ClipBuffer {
  private stream: MediaStream;
  private recorder: MediaRecorder | null = null;
  private chunks: { blob: Blob; ts: number }[] = [];
  private running = false;

  constructor(stream: MediaStream) {
    this.stream = stream;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.chunks = [];
    this.record();
  }

  stop() {
    this.running = false;
    this.recorder?.stop();
    this.recorder = null;
  }

  /** Save the last BUFFER_SECONDS of video as a WebM download. */
  async saveClip(filename = `clip-${Date.now()}.webm`): Promise<void> {
    const cutoff = Date.now() - BUFFER_SECONDS * 1000;
    const recent = this.chunks.filter((c) => c.ts >= cutoff).map((c) => c.blob);
    if (recent.length === 0) {
      console.warn('[ClipBuffer] No clip data available yet.');
      return;
    }
    const blob = new Blob(recent, { type: recent[0].type || 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  /** True when we have at least 5 seconds buffered. */
  get hasData(): boolean {
    const cutoff = Date.now() - 5_000;
    return this.chunks.some((c) => c.ts >= cutoff);
  }

  private record() {
    if (!this.running) return;

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=h264,aac')
      ? 'video/webm;codecs=h264,aac'
      : 'video/webm';

    try {
      this.recorder = new MediaRecorder(this.stream, { mimeType });
    } catch {
      this.recorder = new MediaRecorder(this.stream);
    }

    this.recorder.ondataavailable = (evt) => {
      if (evt.data.size > 0) {
        this.chunks.push({ blob: evt.data, ts: Date.now() });
        // Prune old chunks beyond buffer window + 5s margin
        const cutoff = Date.now() - (BUFFER_SECONDS + 5) * 1000;
        this.chunks = this.chunks.filter((c) => c.ts >= cutoff);
      }
    };

    this.recorder.onstop = () => {
      // Chain into the next recording segment immediately
      if (this.running) this.record();
    };

    // Record in 2-second segments so pruning is precise
    this.recorder.start(2000);

    // Stop the segment after BUFFER_SECONDS so the buffer cycles cleanly
    setTimeout(() => {
      if (this.recorder?.state === 'recording') this.recorder.stop();
    }, BUFFER_SECONDS * 1000);
  }
}
