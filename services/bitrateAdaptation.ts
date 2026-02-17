export interface NetworkConditions {
  bandwidth: number;
  rtt: number;
  packetLoss: number;
  jitter: number;
  timestamp: Date;
}

export interface BitrateProfile {
  name: string;
  bitrate: number;
  resolution: { width: number; height: number };
  fps: number;
  minBandwidth: number;
}

export interface AdaptationConfig {
  enabled: boolean;
  algorithm: 'conservative' | 'balanced' | 'aggressive';
  minBitrate: number;
  maxBitrate: number;
  targetBufferSize: number;
  rampUpSpeed: number;
  rampDownSpeed: number;
  stabilityWindow: number;
}

const DEFAULT_CONFIG: AdaptationConfig = {
  enabled: true,
  algorithm: 'balanced',
  minBitrate: 500,
  maxBitrate: 6000,
  targetBufferSize: 30,
  rampUpSpeed: 0.1,
  rampDownSpeed: 0.3,
  stabilityWindow: 10,
};

const BITRATE_PROFILES: BitrateProfile[] = [
  {
    name: '480p30',
    bitrate: 1000,
    resolution: { width: 854, height: 480 },
    fps: 30,
    minBandwidth: 1500,
  },
  {
    name: '720p30',
    bitrate: 2500,
    resolution: { width: 1280, height: 720 },
    fps: 30,
    minBandwidth: 3500,
  },
  {
    name: '1080p30',
    bitrate: 4500,
    resolution: { width: 1920, height: 1080 },
    fps: 30,
    minBandwidth: 6000,
  },
  {
    name: '1080p60',
    bitrate: 6000,
    resolution: { width: 1920, height: 1080 },
    fps: 60,
    minBandwidth: 8000,
  },
];

export class BitrateAdaptationEngine {
  private config: AdaptationConfig;
  private currentBitrate: number;
  private targetBitrate: number;
  private currentProfile: BitrateProfile;
  private networkHistory: NetworkConditions[] = [];
  private adaptationInterval: number | null = null;
  private onBitrateChange?: (bitrate: number, profile: BitrateProfile) => void;
  private onQualityChange?: (profile: BitrateProfile) => void;

  constructor(
    initialBitrate: number = 2500,
    config?: Partial<AdaptationConfig>,
    onBitrateChange?: (bitrate: number, profile: BitrateProfile) => void,
    onQualityChange?: (profile: BitrateProfile) => void,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.currentBitrate = initialBitrate;
    this.targetBitrate = initialBitrate;
    this.currentProfile = this.selectProfile(initialBitrate);
    this.onBitrateChange = onBitrateChange;
    this.onQualityChange = onQualityChange;
  }

  public start(): void {
    if (!this.config.enabled) return;

    console.log('🔄 Starting bitrate adaptation engine');
    this.adaptationInterval = window.setInterval(() => {
      this.adaptBitrate();
    }, 2000);
  }

  public stop(): void {
    console.log('🛑 Stopping bitrate adaptation engine');
    if (this.adaptationInterval) {
      clearInterval(this.adaptationInterval);
      this.adaptationInterval = null;
    }
  }

  public updateNetworkConditions(conditions: NetworkConditions): void {
    this.networkHistory.push(conditions);

    const maxHistory = this.config.stabilityWindow;
    if (this.networkHistory.length > maxHistory) {
      this.networkHistory.shift();
    }
  }

  private adaptBitrate(): void {
    if (this.networkHistory.length < 3) return;

    const avgConditions = this.calculateAverageConditions();
    const optimalBitrate = this.calculateOptimalBitrate(avgConditions);

    if (optimalBitrate !== this.targetBitrate) {
      this.targetBitrate = optimalBitrate;
      this.transitionBitrate();
    }
  }

  private calculateAverageConditions(): NetworkConditions {
    const recentHistory = this.networkHistory.slice(-this.config.stabilityWindow);

    const sum = recentHistory.reduce(
      (acc, cond) => ({
        bandwidth: acc.bandwidth + cond.bandwidth,
        rtt: acc.rtt + cond.rtt,
        packetLoss: acc.packetLoss + cond.packetLoss,
        jitter: acc.jitter + cond.jitter,
      }),
      { bandwidth: 0, rtt: 0, packetLoss: 0, jitter: 0 },
    );

    const count = recentHistory.length;
    return {
      bandwidth: sum.bandwidth / count,
      rtt: sum.rtt / count,
      packetLoss: sum.packetLoss / count,
      jitter: sum.jitter / count,
      timestamp: new Date(),
    };
  }

  private calculateOptimalBitrate(conditions: NetworkConditions): number {
    const availableBandwidth = conditions.bandwidth;
    const packetLoss = conditions.packetLoss;
    const rtt = conditions.rtt;

    const safetyMargin = this.getSafetyMargin();
    const effectiveBandwidth = availableBandwidth * (1 - safetyMargin);

    let optimalBitrate = effectiveBandwidth;

    if (packetLoss > 0.02) {
      optimalBitrate *= 1 - packetLoss * 2;
    }

    if (rtt > 200) {
      optimalBitrate *= Math.max(0.5, 1 - (rtt - 200) / 1000);
    }

    optimalBitrate = Math.max(this.config.minBitrate, optimalBitrate);
    optimalBitrate = Math.min(this.config.maxBitrate, optimalBitrate);

    return Math.round(optimalBitrate);
  }

  private getSafetyMargin(): number {
    switch (this.config.algorithm) {
      case 'conservative':
        return 0.4;
      case 'balanced':
        return 0.25;
      case 'aggressive':
        return 0.15;
      default:
        return 0.25;
    }
  }

  private transitionBitrate(): void {
    const isRampUp = this.targetBitrate > this.currentBitrate;
    const speed = isRampUp ? this.config.rampUpSpeed : this.config.rampDownSpeed;
    const change = (this.targetBitrate - this.currentBitrate) * speed;

    this.currentBitrate = Math.round(this.currentBitrate + change);

    if (Math.abs(this.targetBitrate - this.currentBitrate) < 50) {
      this.currentBitrate = this.targetBitrate;
    }

    const newProfile = this.selectProfile(this.currentBitrate);
    if (newProfile.name !== this.currentProfile.name) {
      console.log(`📊 Quality changed: ${this.currentProfile.name} → ${newProfile.name}`);
      this.currentProfile = newProfile;
      if (this.onQualityChange) {
        this.onQualityChange(newProfile);
      }
    }

    console.log(
      `🔄 Bitrate adapted: ${this.currentBitrate} kbps (target: ${this.targetBitrate} kbps)`,
    );

    if (this.onBitrateChange) {
      this.onBitrateChange(this.currentBitrate, this.currentProfile);
    }
  }

  private selectProfile(bitrate: number): BitrateProfile {
    const sortedProfiles = [...BITRATE_PROFILES].sort((a, b) => a.bitrate - b.bitrate);

    for (let i = sortedProfiles.length - 1; i >= 0; i--) {
      if (bitrate >= sortedProfiles[i].bitrate) {
        return sortedProfiles[i];
      }
    }

    return sortedProfiles[0];
  }

  public getCurrentBitrate(): number {
    return this.currentBitrate;
  }

  public getTargetBitrate(): number {
    return this.targetBitrate;
  }

  public getCurrentProfile(): BitrateProfile {
    return this.currentProfile;
  }

  public getAvailableProfiles(): BitrateProfile[] {
    return BITRATE_PROFILES;
  }

  public setManualBitrate(bitrate: number): void {
    this.config.enabled = false;
    this.currentBitrate = bitrate;
    this.targetBitrate = bitrate;
    this.currentProfile = this.selectProfile(bitrate);

    console.log(`🎯 Manual bitrate set: ${bitrate} kbps`);

    if (this.onBitrateChange) {
      this.onBitrateChange(this.currentBitrate, this.currentProfile);
    }
  }

  public enableAdaptation(): void {
    this.config.enabled = true;
    this.start();
    console.log('✅ Bitrate adaptation enabled');
  }

  public disableAdaptation(): void {
    this.config.enabled = false;
    this.stop();
    console.log('⏸️ Bitrate adaptation disabled');
  }

  public updateConfig(config: Partial<AdaptationConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('⚙️ Adaptation config updated');
  }

  public getConfig(): AdaptationConfig {
    return { ...this.config };
  }

  public getNetworkHistory(): NetworkConditions[] {
    return [...this.networkHistory];
  }

  public getAdaptationMetrics(): {
    currentBitrate: number;
    targetBitrate: number;
    currentProfile: BitrateProfile;
    averageConditions: NetworkConditions | null;
    stabilityScore: number;
  } {
    const avgConditions = this.networkHistory.length > 0 ? this.calculateAverageConditions() : null;

    const stabilityScore = this.calculateStabilityScore();

    return {
      currentBitrate: this.currentBitrate,
      targetBitrate: this.targetBitrate,
      currentProfile: this.currentProfile,
      averageConditions: avgConditions,
      stabilityScore,
    };
  }

  private calculateStabilityScore(): number {
    if (this.networkHistory.length < 2) return 100;

    const variations = [];
    for (let i = 1; i < this.networkHistory.length; i++) {
      const prev = this.networkHistory[i - 1];
      const curr = this.networkHistory[i];
      const variation = Math.abs(curr.bandwidth - prev.bandwidth) / prev.bandwidth;
      variations.push(variation);
    }

    const avgVariation = variations.reduce((sum, v) => sum + v, 0) / variations.length;
    return Math.max(0, Math.min(100, (1 - avgVariation) * 100));
  }

  public predictNextBitrate(): number {
    if (this.networkHistory.length < 5) return this.currentBitrate;

    const recentTrend = this.networkHistory.slice(-5);
    const bandwidthTrend = recentTrend.map((cond) => cond.bandwidth);

    const slope =
      (bandwidthTrend[bandwidthTrend.length - 1] - bandwidthTrend[0]) / bandwidthTrend.length;

    const predictedBandwidth = bandwidthTrend[bandwidthTrend.length - 1] + slope * 3;

    return this.calculateOptimalBitrate({
      bandwidth: predictedBandwidth,
      rtt: recentTrend[recentTrend.length - 1].rtt,
      packetLoss: recentTrend[recentTrend.length - 1].packetLoss,
      jitter: recentTrend[recentTrend.length - 1].jitter,
      timestamp: new Date(),
    });
  }
}
