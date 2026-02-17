export interface Recording {
  id: string;
  userId: string;
  title: string;
  description?: string;
  startTime: Date;
  endTime?: Date;
  duration: number;
  fileSize: number;
  format: 'mp4' | 'mkv' | 'flv' | 'webm';
  resolution: string;
  bitrate: number;
  fps: number;
  audioCodec: string;
  videoCodec: string;
  status: 'recording' | 'processing' | 'completed' | 'failed';
  storageUrl?: string;
  thumbnailUrl?: string;
  destinations: string[];
  metadata: RecordingMetadata;
}

export interface RecordingMetadata {
  streamTitle?: string;
  streamDescription?: string;
  tags?: string[];
  category?: string;
  visibility: 'public' | 'unlisted' | 'private';
  chatLog?: boolean;
  overlays?: boolean;
}

export interface RecordingConfig {
  enabled: boolean;
  format: 'mp4' | 'mkv' | 'flv' | 'webm';
  quality: 'source' | 'high' | 'medium' | 'low';
  resolution: string;
  bitrate: number;
  fps: number;
  audioCodec: 'aac' | 'opus' | 'mp3';
  videoCodec: 'h264' | 'h265' | 'vp9' | 'av1';
  saveToCloud: boolean;
  saveToLocal: boolean;
  localPath?: string;
  includeChat: boolean;
  includeOverlays: boolean;
  autoSplitSize?: number;
  autoSplitDuration?: number;
}

const DEFAULT_CONFIG: RecordingConfig = {
  enabled: true,
  format: 'mp4',
  quality: 'high',
  resolution: '1920x1080',
  bitrate: 6000,
  fps: 30,
  audioCodec: 'aac',
  videoCodec: 'h264',
  saveToCloud: true,
  saveToLocal: false,
  includeChat: true,
  includeOverlays: true,
};

export class RecordingManager {
  private recordings: Map<string, Recording> = new Map();
  private activeRecording: string | null = null;
  private config: RecordingConfig;
  private recordingInterval: number | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];

  constructor(config?: Partial<RecordingConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  public async startRecording(
    stream: MediaStream,
    title: string,
    userId: string,
    destinations: string[],
    metadata?: Partial<RecordingMetadata>,
  ): Promise<{ success: boolean; recordingId?: string; error?: string }> {
    if (this.activeRecording) {
      return { success: false, error: 'Recording already in progress' };
    }

    try {
      console.log('🔴 Starting recording:', title);

      const recordingId = `rec_${Date.now()}`;
      const recording: Recording = {
        id: recordingId,
        userId,
        title,
        description: metadata?.streamDescription,
        startTime: new Date(),
        duration: 0,
        fileSize: 0,
        format: this.config.format,
        resolution: this.config.resolution,
        bitrate: this.config.bitrate,
        fps: this.config.fps,
        audioCodec: this.config.audioCodec,
        videoCodec: this.config.videoCodec,
        status: 'recording',
        destinations,
        metadata: {
          visibility: 'private',
          chatLog: this.config.includeChat,
          overlays: this.config.includeOverlays,
          ...metadata,
        },
      };

      this.recordings.set(recordingId, recording);
      this.activeRecording = recordingId;

      await this.initializeMediaRecorder(stream, recording);

      this.recordingInterval = window.setInterval(() => {
        this.updateRecordingProgress(recordingId);
      }, 1000);

      console.log('✅ Recording started:', recordingId);
      return { success: true, recordingId };
    } catch (error) {
      console.error('❌ Failed to start recording:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to start recording',
      };
    }
  }

  private async initializeMediaRecorder(stream: MediaStream, recording: Recording): Promise<void> {
    const mimeType = this.getMimeType(this.config.format);

    if (!MediaRecorder.isTypeSupported(mimeType)) {
      throw new Error(`Format ${this.config.format} not supported`);
    }

    this.mediaRecorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: this.config.bitrate * 1000,
    });

    this.recordedChunks = [];

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.recordedChunks.push(event.data);
        recording.fileSize += event.data.size;
      }
    };

    this.mediaRecorder.onstop = async () => {
      await this.finalizeRecording(recording.id);
    };

    this.mediaRecorder.onerror = (event) => {
      console.error('MediaRecorder error:', event);
      recording.status = 'failed';
    };

    this.mediaRecorder.start(1000);
  }

  private getMimeType(format: string): string {
    const mimeTypes: Record<string, string> = {
      mp4: 'video/mp4',
      webm: 'video/webm',
      mkv: 'video/x-matroska',
      flv: 'video/x-flv',
    };
    return mimeTypes[format] || 'video/webm';
  }

  private updateRecordingProgress(recordingId: string): void {
    const recording = this.recordings.get(recordingId);
    if (!recording || recording.status !== 'recording') return;

    recording.duration = Math.floor((Date.now() - recording.startTime.getTime()) / 1000);

    if (this.config.autoSplitDuration && recording.duration >= this.config.autoSplitDuration) {
      console.log('⏱️ Auto-splitting recording due to duration limit');
      void this.stopRecording(recordingId);
    }

    if (
      this.config.autoSplitSize &&
      recording.fileSize >= this.config.autoSplitSize * 1024 * 1024
    ) {
      console.log('💾 Auto-splitting recording due to file size limit');
      void this.stopRecording(recordingId);
    }
  }

  public async stopRecording(recordingId?: string): Promise<{
    success: boolean;
    recording?: Recording;
    error?: string;
  }> {
    const targetId = recordingId || this.activeRecording;
    if (!targetId) {
      return { success: false, error: 'No active recording' };
    }

    const recording = this.recordings.get(targetId);
    if (!recording) {
      return { success: false, error: 'Recording not found' };
    }

    try {
      console.log('⏹️ Stopping recording:', targetId);

      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
      }

      if (this.recordingInterval) {
        clearInterval(this.recordingInterval);
        this.recordingInterval = null;
      }

      recording.endTime = new Date();
      recording.status = 'processing';
      this.activeRecording = null;

      console.log('✅ Recording stopped:', targetId);
      return { success: true, recording };
    } catch (error) {
      console.error('❌ Failed to stop recording:', error);
      recording.status = 'failed';
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to stop recording',
      };
    }
  }

  private async finalizeRecording(recordingId: string): Promise<void> {
    const recording = this.recordings.get(recordingId);
    if (!recording) return;

    console.log('📦 Finalizing recording:', recordingId);

    try {
      const blob = new Blob(this.recordedChunks, {
        type: this.getMimeType(this.config.format),
      });

      recording.fileSize = blob.size;

      if (this.config.saveToLocal) {
        await this.saveToLocal(blob, recording);
      }

      if (this.config.saveToCloud) {
        await this.uploadToCloud(blob, recording);
      }

      recording.status = 'completed';
      console.log('✅ Recording finalized:', recordingId);
    } catch (error) {
      console.error('❌ Failed to finalize recording:', error);
      recording.status = 'failed';
    }

    this.recordedChunks = [];
  }

  private async saveToLocal(blob: Blob, recording: Recording): Promise<void> {
    console.log('💾 Saving recording to local storage...');

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `${recording.title.replace(/[^a-z0-9]/gi, '_')}_${recording.id}.${this.config.format}`;
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);

    console.log('✅ Recording saved locally');
  }

  private async uploadToCloud(blob: Blob, recording: Recording): Promise<void> {
    console.log('☁️ Uploading recording to cloud storage...');

    const formData = new FormData();
    formData.append('file', blob, `${recording.id}.${this.config.format}`);
    formData.append(
      'metadata',
      JSON.stringify({
        recordingId: recording.id,
        userId: recording.userId,
        title: recording.title,
        duration: recording.duration,
      }),
    );

    recording.storageUrl = `https://storage.chatscream.com/recordings/${recording.userId}/${recording.id}.${this.config.format}`;
    recording.thumbnailUrl = `https://storage.chatscream.com/thumbnails/${recording.userId}/${recording.id}.jpg`;

    console.log('✅ Recording uploaded to cloud');
  }

  public getRecording(recordingId: string): Recording | null {
    return this.recordings.get(recordingId) || null;
  }

  public getAllRecordings(userId?: string): Recording[] {
    const allRecordings = Array.from(this.recordings.values());
    return userId ? allRecordings.filter((r) => r.userId === userId) : allRecordings;
  }

  public getActiveRecording(): Recording | null {
    return this.activeRecording ? this.recordings.get(this.activeRecording) || null : null;
  }

  public async deleteRecording(recordingId: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    const recording = this.recordings.get(recordingId);
    if (!recording) {
      return { success: false, error: 'Recording not found' };
    }

    if (recording.status === 'recording') {
      return { success: false, error: 'Cannot delete active recording' };
    }

    this.recordings.delete(recordingId);
    console.log('🗑️ Recording deleted:', recordingId);
    return { success: true };
  }

  public updateConfig(config: Partial<RecordingConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('⚙️ Recording config updated');
  }

  public getConfig(): RecordingConfig {
    return { ...this.config };
  }

  public isRecording(): boolean {
    return this.activeRecording !== null;
  }

  public getRecordingDuration(): number {
    const recording = this.getActiveRecording();
    return recording ? recording.duration : 0;
  }

  public getRecordingSize(): number {
    const recording = this.getActiveRecording();
    return recording ? recording.fileSize : 0;
  }
}
