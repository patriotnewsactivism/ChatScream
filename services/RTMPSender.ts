import { Destination, StreamConfig } from '../types';
import { StreamingPipeline, StreamingMode, PipelineState } from './streamingPipeline';
import { DestinationRouter } from './destinationRouter';
import { streamEnforcement, EnforcementResult } from './streamEnforcement';
import type { PlanTier } from './stripe';
import { captureException } from './sentry';

/**
 * Enhanced RTMP Sender with Dual-Pipeline Architecture
 *
 * Integrates:
 * 1. StreamingPipeline - Local/Cloud dual-pipeline streaming
 * 2. DestinationRouter - Multi-destination forwarding
 * 3. StreamEnforcement - Constitutional enforcement of limits
 *
 * This replaces the placeholder implementation with a comprehensive
 * streaming architecture that enforces subscription tier limits.
 */

type StatusUpdate = (id: string, status: Destination['status']) => void;

export interface RTMPSenderConfig {
  userPlan: PlanTier;
  userId: string;
  cloudHoursUsed: number;
  streamingMode: StreamingMode;
}

export class RTMPSender {
  private pipeline: StreamingPipeline;
  private router: DestinationRouter;
  private config: RTMPSenderConfig;
  private destinations: Destination[] = [];
  private stream: MediaStream | null = null;
  private statusUpdater: StatusUpdate;
  private monitoringInterval: number | null = null;

  constructor(statusUpdater: StatusUpdate, config: RTMPSenderConfig) {
    this.statusUpdater = statusUpdater;
    this.config = config;

    // Initialize pipeline with state change callback
    this.pipeline = new StreamingPipeline((state: PipelineState) => {
      this.handlePipelineStateChange(state);
    });

    // Initialize router with plan and status callback
    this.router = new DestinationRouter(config.userPlan, (destId: string, status: any) => {
      this.statusUpdater(destId, status);
    });

    console.log('⚙️ Enhanced RTMPSender initialized:', {
      mode: config.streamingMode,
      plan: config.userPlan,
    });
  }

  /**
   * Connect to destinations with full enforcement
   */
  public async connect(stream: MediaStream, destinations: Destination[]): Promise<void> {
    if (this.stream) await this.disconnect();

    this.stream = stream;
    this.destinations = destinations.filter((d) => d.isEnabled);

    if (this.destinations.length === 0) {
      console.log('🚫 No enabled destinations to connect to.');
      return;
    }

    console.log(`📡 Attempting to connect to ${this.destinations.length} destinations...`);

    try {
      // Step 1: Validate stream request with enforcement
      const enforcementResult = streamEnforcement.validateStreamRequest({
        userId: this.config.userId,
        userPlan: this.config.userPlan,
        currentDestinations: 0,
        cloudHoursUsed: this.config.cloudHoursUsed,
        requestedDestinations: this.destinations.length,
        streamingMode: this.config.streamingMode,
      });

      this.logEnforcementResult(enforcementResult);

      // Reject if not allowed and cloud mode
      if (!enforcementResult.allowed && this.config.streamingMode === 'cloud') {
        throw new Error(enforcementResult.reason);
      }

      // Split destinations by enforcement
      const split = streamEnforcement.splitDestinationsByEnforcement(
        this.config.userPlan,
        this.destinations,
      );

      if (split.rejected.length > 0) {
        console.warn(
          `⚠️ ${split.rejected.length} destinations rejected:`,
          split.rejected.map((d) => d.name),
        );

        // Update rejected destinations to offline
        split.rejected.forEach((dest) => {
          this.statusUpdater(dest.id, 'offline');
        });
      }

      // Step 2: Initialize streaming pipeline
      await this.pipeline.initialize({
        mode: this.config.streamingMode,
        stream: this.stream,
        destinations: split.allowed,
        userPlan: this.config.userPlan,
        userId: this.config.userId,
        cloudHoursUsed: this.config.cloudHoursUsed,
      });

      // Step 3: Start pipeline
      await this.pipeline.start(split.allowed);

      // Step 4: Route to destinations
      const processedStream = this.pipeline.getStream();
      if (!processedStream) {
        throw new Error('Failed to get processed stream from pipeline');
      }

      await this.router.route(processedStream, split.allowed);

      // Step 5: Register active enforcement
      streamEnforcement.registerActiveStream(this.config.userId, {
        userId: this.config.userId,
        userPlan: this.config.userPlan,
        currentDestinations: split.allowed.length,
        cloudHoursUsed: this.config.cloudHoursUsed,
        requestedDestinations: split.allowed.length,
        streamingMode: this.config.streamingMode,
      });

      // Start monitoring for cloud mode
      if (this.config.streamingMode === 'cloud') {
        this.startCloudMonitoring();
      }

      console.log(`🟢 Successfully went live to ${split.allowed.length} destinations.`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ Connection failed:', errorMessage);
      captureException(new Error(errorMessage), {
        stage: 'connect',
        destinations: this.destinations.length,
        userId: this.config.userId,
        plan: this.config.userPlan,
      });

      // Update all destinations to error
      this.destinations.forEach((dest) => {
        this.statusUpdater(dest.id, 'error');
      });

      throw error;
    }
  }

  /**
   * Disconnect from all destinations
   */
  public async disconnect(): Promise<void> {
    console.log('🔴 Disconnecting from all destinations...');

    // Stop monitoring
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    // Unregister enforcement
    streamEnforcement.unregisterActiveStream(this.config.userId);

    // Disconnect router
    await this.router.disconnectAll();

    // Stop pipeline
    await this.pipeline.stop();

    // Clean up stream
    if (this.stream) {
      this.stream = null;
    }

    // Update all destination statuses
    this.destinations.forEach((dest) => {
      this.statusUpdater(dest.id, 'offline');
    });

    this.destinations = [];

    console.log('✅ Disconnected successfully.');
  }

  /**
   * Update stream metadata
   */
  public updateMetadata(config: StreamConfig): void {
    console.log('📝 Metadata updated:', config);
    // This would update platform-specific metadata via APIs
  }

  /**
   * Check if connected
   */
  public isConnected(): boolean {
    return this.pipeline.isLive() && this.router.isActive();
  }

  /**
   * Add destination to active stream
   */
  public async addDestination(destination: Destination): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('Not connected');
    }

    // Enforce destination limit
    const enforcement = streamEnforcement.enforceDestinationAdd(
      this.config.userId,
      this.config.userPlan,
      this.destinations.length,
    );

    if (!enforcement.allowed) {
      throw new Error(enforcement.reason);
    }

    await this.router.addDestination(destination);
    this.destinations.push(destination);

    console.log(`✅ Added destination: ${destination.name}`);
  }

  /**
   * Remove destination from active stream
   */
  public async removeDestination(destId: string): Promise<void> {
    await this.router.removeDestination(destId);
    this.destinations = this.destinations.filter((d) => d.id !== destId);

    console.log(`✅ Removed destination: ${destId}`);
  }

  /**
   * Get streaming statistics
   */
  public getStats(): {
    mode: StreamingMode;
    status: string;
    duration: number;
    destinations: number;
    routerStats: any;
  } {
    const pipelineState = this.pipeline.getState();
    const routerStats = this.router.getStats();

    return {
      mode: pipelineState.mode,
      status: pipelineState.status,
      duration: this.pipeline.getSessionDuration(),
      destinations: routerStats.total,
      routerStats,
    };
  }

  /**
   * Handle pipeline state changes
   */
  private handlePipelineStateChange(state: PipelineState): void {
    console.log('🔄 Pipeline state changed:', state.status);

    // Handle errors
    if (state.status === 'error' && state.error) {
      console.error('❌ Pipeline error:', state.error);
      captureException(new Error(state.error), {
        stage: 'pipeline',
        userId: this.config.userId,
        plan: this.config.userPlan,
      });
      this.disconnect();
    }
  }

  /**
   * Monitor cloud streaming hours and enforce cutoff
   */
  private startCloudMonitoring(): void {
    const pipelineState = this.pipeline.getState();
    if (!pipelineState.startTime) return;

    // Check every 30 seconds
    this.monitoringInterval = window.setInterval(() => {
      const cutoffCheck = streamEnforcement.checkCloudHoursCutoff(
        this.config.userId,
        this.config.userPlan,
        pipelineState.startTime!,
        this.config.cloudHoursUsed,
      );

      if (cutoffCheck.shouldCutoff) {
        console.log('🚨 CLOUD HOURS EXHAUSTED - AUTOMATIC CUTOFF');
        this.disconnect();

        // Notify user
        alert(cutoffCheck.reason);
      } else if (cutoffCheck.timeRemaining < 0.25 && cutoffCheck.timeRemaining > 0) {
        // Warning at 15 minutes remaining
        const minutesLeft = Math.floor(cutoffCheck.timeRemaining * 60);
        console.log(`⚠️ ${minutesLeft} minutes of cloud streaming remaining`);
      }
    }, 30000);
  }

  /**
   * Log enforcement result
   */
  private logEnforcementResult(result: EnforcementResult): void {
    console.log('🔒 Enforcement Result:', {
      allowed: result.allowed,
      reason: result.reason,
      enforcement: result.enforcement,
    });

    if (result.recommendations && result.recommendations.length > 0) {
      console.log('💡 Recommendations:', result.recommendations);
    }
  }

  /**
   * Update configuration (e.g., if plan changes mid-stream)
   */
  public updateConfig(config: Partial<RTMPSenderConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('🔄 Configuration updated:', this.config);
  }
}
