export interface StreamHealth {
  destinationId: string;
  isHealthy: boolean;
  bitrate: number;
  targetBitrate: number;
  fps: number;
  targetFps: number;
  droppedFrames: number;
  droppedFramesPercent: number;
  rtt: number;
  packetLoss: number;
  jitter: number;
  bandwidth: number;
  cpuUsage: number;
  memoryUsage: number;
  encoderLoad: number;
  warnings: HealthWarning[];
  lastCheck: Date;
}

export interface HealthWarning {
  severity: 'info' | 'warning' | 'critical';
  category: 'bitrate' | 'fps' | 'dropped-frames' | 'network' | 'cpu' | 'memory' | 'encoder';
  message: string;
  timestamp: Date;
  autoResolve?: boolean;
}

export interface MonitorConfig {
  checkInterval: number;
  bitrateThreshold: number;
  fpsThreshold: number;
  droppedFramesThreshold: number;
  rttThreshold: number;
  packetLossThreshold: number;
  cpuThreshold: number;
  memoryThreshold: number;
  autoReconnect: boolean;
  autoAdjustBitrate: boolean;
}

const DEFAULT_CONFIG: MonitorConfig = {
  checkInterval: 2000,
  bitrateThreshold: 0.8,
  fpsThreshold: 0.9,
  droppedFramesThreshold: 0.05,
  rttThreshold: 500,
  packetLossThreshold: 0.02,
  cpuThreshold: 85,
  memoryThreshold: 90,
  autoReconnect: true,
  autoAdjustBitrate: true,
};

export type HealthStatus = 'excellent' | 'good' | 'fair' | 'poor' | 'critical';

export class StreamHealthMonitor {
  private healthData: Map<string, StreamHealth> = new Map();
  private config: MonitorConfig;
  private monitorInterval: number | null = null;
  private onHealthChange?: (destId: string, health: StreamHealth) => void;
  private onRecommendAction?: (
    destId: string,
    action: 'reconnect' | 'adjust-bitrate' | 'reduce-quality' | 'stop',
    reason: string,
  ) => void;

  constructor(config?: Partial<MonitorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  public startMonitoring(
    destinationIds: string[],
    onHealthChange?: (destId: string, health: StreamHealth) => void,
    onRecommendAction?: (
      destId: string,
      action: 'reconnect' | 'adjust-bitrate' | 'reduce-quality' | 'stop',
      reason: string,
    ) => void,
  ): void {
    console.log('🏥 Starting health monitoring for', destinationIds.length, 'destinations');
    this.onHealthChange = onHealthChange;
    this.onRecommendAction = onRecommendAction;

    for (const destId of destinationIds) {
      this.initializeHealth(destId);
    }

    this.monitorInterval = window.setInterval(() => {
      this.checkAllHealth();
    }, this.config.checkInterval);
  }

  public stopMonitoring(): void {
    console.log('🛑 Stopping health monitoring');
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    this.healthData.clear();
  }

  private initializeHealth(destId: string): void {
    const health: StreamHealth = {
      destinationId: destId,
      isHealthy: true,
      bitrate: 2500,
      targetBitrate: 2500,
      fps: 30,
      targetFps: 30,
      droppedFrames: 0,
      droppedFramesPercent: 0,
      rtt: 50,
      packetLoss: 0,
      jitter: 5,
      bandwidth: 5000,
      cpuUsage: 30,
      memoryUsage: 40,
      encoderLoad: 35,
      warnings: [],
      lastCheck: new Date(),
    };
    this.healthData.set(destId, health);
  }

  private checkAllHealth(): void {
    for (const [destId, health] of this.healthData) {
      this.updateHealthMetrics(destId, health);
      this.analyzeHealth(destId, health);

      if (this.onHealthChange) {
        this.onHealthChange(destId, health);
      }
    }
  }

  private updateHealthMetrics(destId: string, health: StreamHealth): void {
    health.bitrate = Math.max(0, health.bitrate + (Math.random() - 0.5) * 200);
    health.fps = Math.max(0, health.fps + (Math.random() - 0.5) * 2);
    health.droppedFrames += Math.random() > 0.95 ? 1 : 0;
    health.droppedFramesPercent =
      health.fps > 0 ? (health.droppedFrames / (health.fps * 60)) * 100 : 0;
    health.rtt = Math.max(10, health.rtt + (Math.random() - 0.5) * 50);
    health.packetLoss = Math.max(0, Math.min(1, health.packetLoss + (Math.random() - 0.5) * 0.01));
    health.jitter = Math.max(0, health.jitter + (Math.random() - 0.5) * 5);
    health.cpuUsage = Math.max(0, Math.min(100, health.cpuUsage + (Math.random() - 0.5) * 5));
    health.memoryUsage = Math.max(0, Math.min(100, health.memoryUsage + (Math.random() - 0.5) * 3));
    health.encoderLoad = Math.max(0, Math.min(100, health.encoderLoad + (Math.random() - 0.5) * 5));
    health.lastCheck = new Date();
  }

  private analyzeHealth(destId: string, health: StreamHealth): void {
    health.warnings = [];

    const bitrateRatio = health.bitrate / health.targetBitrate;
    if (bitrateRatio < this.config.bitrateThreshold) {
      health.warnings.push({
        severity: bitrateRatio < 0.5 ? 'critical' : 'warning',
        category: 'bitrate',
        message: `Bitrate below target: ${Math.round(bitrateRatio * 100)}% (${Math.round(health.bitrate)} / ${health.targetBitrate} kbps)`,
        timestamp: new Date(),
      });

      if (this.config.autoAdjustBitrate && bitrateRatio < 0.6) {
        this.recommendAction(destId, 'adjust-bitrate', 'Low bitrate detected');
      }
    }

    const fpsRatio = health.fps / health.targetFps;
    if (fpsRatio < this.config.fpsThreshold) {
      health.warnings.push({
        severity: fpsRatio < 0.7 ? 'critical' : 'warning',
        category: 'fps',
        message: `FPS below target: ${Math.round(fpsRatio * 100)}% (${Math.round(health.fps)} / ${health.targetFps} fps)`,
        timestamp: new Date(),
      });
    }

    if (health.droppedFramesPercent > this.config.droppedFramesThreshold * 100) {
      health.warnings.push({
        severity: health.droppedFramesPercent > 10 ? 'critical' : 'warning',
        category: 'dropped-frames',
        message: `High dropped frames: ${health.droppedFramesPercent.toFixed(2)}%`,
        timestamp: new Date(),
      });
    }

    if (health.rtt > this.config.rttThreshold) {
      health.warnings.push({
        severity: health.rtt > 1000 ? 'critical' : 'warning',
        category: 'network',
        message: `High latency: ${Math.round(health.rtt)}ms RTT`,
        timestamp: new Date(),
      });
    }

    if (health.packetLoss > this.config.packetLossThreshold) {
      health.warnings.push({
        severity: health.packetLoss > 0.05 ? 'critical' : 'warning',
        category: 'network',
        message: `Packet loss: ${(health.packetLoss * 100).toFixed(2)}%`,
        timestamp: new Date(),
      });

      if (health.packetLoss > 0.1 && this.config.autoReconnect) {
        this.recommendAction(destId, 'reconnect', 'High packet loss detected');
      }
    }

    if (health.cpuUsage > this.config.cpuThreshold) {
      health.warnings.push({
        severity: health.cpuUsage > 95 ? 'critical' : 'warning',
        category: 'cpu',
        message: `High CPU usage: ${Math.round(health.cpuUsage)}%`,
        timestamp: new Date(),
      });

      if (health.cpuUsage > 95) {
        this.recommendAction(destId, 'reduce-quality', 'CPU overload');
      }
    }

    if (health.memoryUsage > this.config.memoryThreshold) {
      health.warnings.push({
        severity: health.memoryUsage > 95 ? 'critical' : 'warning',
        category: 'memory',
        message: `High memory usage: ${Math.round(health.memoryUsage)}%`,
        timestamp: new Date(),
      });
    }

    if (health.encoderLoad > 90) {
      health.warnings.push({
        severity: health.encoderLoad > 95 ? 'critical' : 'warning',
        category: 'encoder',
        message: `Encoder overloaded: ${Math.round(health.encoderLoad)}%`,
        timestamp: new Date(),
      });
    }

    health.isHealthy = health.warnings.filter((w) => w.severity === 'critical').length === 0;
  }

  private recommendAction(
    destId: string,
    action: 'reconnect' | 'adjust-bitrate' | 'reduce-quality' | 'stop',
    reason: string,
  ): void {
    console.log(`💡 Recommending action for ${destId}: ${action} (${reason})`);
    if (this.onRecommendAction) {
      this.onRecommendAction(destId, action, reason);
    }
  }

  public getHealth(destId: string): StreamHealth | null {
    return this.healthData.get(destId) || null;
  }

  public getAllHealth(): StreamHealth[] {
    return Array.from(this.healthData.values());
  }

  public getOverallStatus(): HealthStatus {
    const allHealth = this.getAllHealth();
    if (allHealth.length === 0) return 'excellent';

    const criticalCount = allHealth.filter((h) =>
      h.warnings.some((w) => w.severity === 'critical'),
    ).length;
    const warningCount = allHealth.filter(
      (h) =>
        h.warnings.some((w) => w.severity === 'warning') &&
        !h.warnings.some((w) => w.severity === 'critical'),
    ).length;

    if (criticalCount > allHealth.length / 2) return 'critical';
    if (criticalCount > 0) return 'poor';
    if (warningCount > allHealth.length / 2) return 'fair';
    if (warningCount > 0) return 'good';
    return 'excellent';
  }

  public addDestination(destId: string): void {
    if (!this.healthData.has(destId)) {
      this.initializeHealth(destId);
    }
  }

  public removeDestination(destId: string): void {
    this.healthData.delete(destId);
  }

  public updateTargetBitrate(destId: string, bitrate: number): void {
    const health = this.healthData.get(destId);
    if (health) {
      health.targetBitrate = bitrate;
    }
  }

  public updateTargetFps(destId: string, fps: number): void {
    const health = this.healthData.get(destId);
    if (health) {
      health.targetFps = fps;
    }
  }
}
