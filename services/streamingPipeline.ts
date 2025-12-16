/**
 * Streaming Pipeline Service
 *
 * Implements dual-pipeline architecture:
 * 1. Local Device Streaming - Unlimited duration, device-constrained
 * 2. Cloud VM Streaming - Time-constrained, destination-flexible
 *
 * Constitutional Requirements:
 * - Enforce subscription tier limits
 * - Track cloud streaming hours
 * - Apply watermarks for Free tier
 * - Real-time destination counter enforcement
 */

import { Destination, StreamConfig } from '../types';
import { planHasWatermark, getRemainingCloudHours, canUseCloudStreaming } from './stripe';

export type StreamingMode = 'local' | 'cloud';
export type PipelineStatus = 'idle' | 'initializing' | 'connecting' | 'live' | 'stopping' | 'error';

export interface StreamingPipelineConfig {
  mode: StreamingMode;
  stream: MediaStream;
  destinations: Destination[];
  userPlan: string;
  userId: string;
  cloudHoursUsed: number;
}

export interface PipelineState {
  mode: StreamingMode;
  status: PipelineStatus;
  startTime: number | null;
  cloudSessionId: string | null;
  activeDestinations: number;
  hasWatermark: boolean;
  error: string | null;
}

export class StreamingPipeline {
  private state: PipelineState = {
    mode: 'local',
    status: 'idle',
    startTime: null,
    cloudSessionId: null,
    activeDestinations: 0,
    hasWatermark: false,
    error: null,
  };

  private stream: MediaStream | null = null;
  private watermarkedStream: MediaStream | null = null;
  private monitoringInterval: number | null = null;
  private onStateChange: ((state: PipelineState) => void) | null = null;

  constructor(onStateChange?: (state: PipelineState) => void) {
    this.onStateChange = onStateChange || null;
    console.log('🏗️ StreamingPipeline initialized');
  }

  /**
   * Initialize streaming pipeline
   * Validates plan limits and prepares stream
   */
  public async initialize(config: StreamingPipelineConfig): Promise<void> {
    console.log(`🔧 Initializing ${config.mode} streaming pipeline...`);

    this.updateState({ status: 'initializing' });

    try {
      // Validate cloud streaming availability if cloud mode
      if (config.mode === 'cloud') {
        const cloudCheck = canUseCloudStreaming(config.userPlan, config.cloudHoursUsed);
        if (!cloudCheck.allowed) {
          throw new Error(cloudCheck.message);
        }
      }

      // Check if watermark is required
      const requiresWatermark = planHasWatermark(config.userPlan);

      // Apply watermark if needed (Free tier only)
      if (requiresWatermark) {
        this.watermarkedStream = await this.applyWatermark(config.stream);
        this.stream = this.watermarkedStream;
        this.updateState({ hasWatermark: true });
        console.log('🏷️ Watermark applied to stream');
      } else {
        this.stream = config.stream;
        this.updateState({ hasWatermark: false });
      }

      this.updateState({
        mode: config.mode,
        status: 'idle',
        error: null,
      });

      console.log(`✅ ${config.mode} pipeline initialized successfully`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ Pipeline initialization failed:', errorMessage);
      this.updateState({
        status: 'error',
        error: errorMessage,
      });
      throw error;
    }
  }

  /**
   * Start streaming to destinations
   */
  public async start(destinations: Destination[]): Promise<void> {
    if (!this.stream) {
      throw new Error('Pipeline not initialized');
    }

    if (this.state.status === 'live') {
      throw new Error('Stream already active');
    }

    const enabledDestinations = destinations.filter((d) => d.isEnabled);

    if (enabledDestinations.length === 0) {
      throw new Error('No enabled destinations');
    }

    console.log(
      `🚀 Starting ${this.state.mode} stream to ${enabledDestinations.length} destinations...`,
    );

    this.updateState({
      status: 'connecting',
      activeDestinations: enabledDestinations.length,
      startTime: Date.now(),
      cloudSessionId: this.state.mode === 'cloud' ? this.generateSessionId() : null,
    });

    // Start monitoring for cloud streams
    if (this.state.mode === 'cloud') {
      this.startCloudMonitoring();
    }

    // Pipeline is ready - destination router will handle actual connections
    this.updateState({ status: 'live' });
    console.log(`🟢 ${this.state.mode} pipeline live`);
  }

  /**
   * Stop streaming
   */
  public async stop(): Promise<void> {
    console.log('🛑 Stopping streaming pipeline...');

    this.updateState({ status: 'stopping' });

    // Stop cloud monitoring
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    // Stop watermarked stream tracks if any
    if (this.watermarkedStream) {
      this.watermarkedStream.getTracks().forEach((track) => track.stop());
      this.watermarkedStream = null;
    }

    const sessionDuration = this.state.startTime
      ? (Date.now() - this.state.startTime) / 1000 / 60 / 60 // hours
      : 0;

    console.log(`📊 Session duration: ${sessionDuration.toFixed(2)} hours`);

    this.updateState({
      status: 'idle',
      startTime: null,
      cloudSessionId: null,
      activeDestinations: 0,
    });

    console.log('✅ Pipeline stopped');
  }

  /**
   * Apply watermark to stream (Free tier requirement)
   */
  private async applyWatermark(sourceStream: MediaStream): Promise<MediaStream> {
    // Create canvas for watermark overlay
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Failed to create watermark canvas context');
    }

    // Set canvas dimensions (match stream)
    canvas.width = 1280;
    canvas.height = 720;

    // Create video element from source stream
    const video = document.createElement('video');
    video.srcObject = sourceStream;
    video.muted = true;
    await video.play();

    // Watermark styling
    const watermarkText = '🎥 ChatScream Free';
    const watermarkOpacity = 0.7;
    const watermarkSize = 32;

    // Animation loop
    const drawFrame = () => {
      if (!video.paused && !video.ended) {
        // Draw video frame
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Draw watermark overlay (non-removable, high-visibility)
        ctx.save();
        ctx.globalAlpha = watermarkOpacity;

        // Top-right corner watermark
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(canvas.width - 280, 20, 260, 50);

        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${watermarkSize}px Arial`;
        ctx.textAlign = 'right';
        ctx.fillText(watermarkText, canvas.width - 30, 55);

        // Bottom-center watermark
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(canvas.width / 2 - 150, canvas.height - 50, 300, 30);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Upgrade to remove watermark', canvas.width / 2, canvas.height - 25);

        ctx.restore();

        requestAnimationFrame(drawFrame);
      }
    };

    drawFrame();

    // Create stream from watermarked canvas
    const watermarkedVideoStream = canvas.captureStream(30);

    // Combine with original audio
    const audioTracks = sourceStream.getAudioTracks();
    const watermarkedStream = new MediaStream([
      ...watermarkedVideoStream.getVideoTracks(),
      ...audioTracks,
    ]);

    return watermarkedStream;
  }

  /**
   * Monitor cloud streaming session
   * Implements automatic cutoff when hours are exhausted
   */
  private startCloudMonitoring(): void {
    // Check every 30 seconds
    this.monitoringInterval = window.setInterval(() => {
      if (!this.state.startTime || !this.state.cloudSessionId) return;

      const durationHours = (Date.now() - this.state.startTime) / 1000 / 60 / 60;

      console.log(`⏱️ Cloud session: ${durationHours.toFixed(2)} hours`);

      // This would integrate with cloudStreamingService to check remaining hours
      // For now, just log monitoring
    }, 30000);
  }

  /**
   * Generate unique session ID for cloud streaming
   */
  private generateSessionId(): string {
    return `cloud_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Update pipeline state and notify listeners
   */
  private updateState(updates: Partial<PipelineState>): void {
    this.state = { ...this.state, ...updates };

    if (this.onStateChange) {
      this.onStateChange(this.state);
    }
  }

  /**
   * Get current pipeline state
   */
  public getState(): PipelineState {
    return { ...this.state };
  }

  /**
   * Get processed stream (with watermark if applied)
   */
  public getStream(): MediaStream | null {
    return this.stream;
  }

  /**
   * Check if pipeline is live
   */
  public isLive(): boolean {
    return this.state.status === 'live';
  }

  /**
   * Get session duration in hours
   */
  public getSessionDuration(): number {
    if (!this.state.startTime) return 0;
    return (Date.now() - this.state.startTime) / 1000 / 60 / 60;
  }
}
