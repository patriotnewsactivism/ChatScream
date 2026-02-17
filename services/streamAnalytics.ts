export interface ViewerStats {
  current: number;
  peak: number;
  average: number;
  total: number;
  timeline: ViewerDataPoint[];
}

export interface ViewerDataPoint {
  timestamp: Date;
  count: number;
  chatMessages: number;
  engagement: number;
}

export interface PlatformStats {
  platform: string;
  viewers: number;
  chatMessages: number;
  likes: number;
  shares: number;
  watchTime: number;
}

export interface EngagementMetrics {
  chatRate: number;
  likeRate: number;
  shareRate: number;
  retentionRate: number;
  averageWatchTime: number;
  peakEngagementTime: Date | null;
}

export interface StreamAnalytics {
  streamId: string;
  startTime: Date;
  endTime?: Date;
  duration: number;
  viewerStats: ViewerStats;
  platformStats: PlatformStats[];
  engagement: EngagementMetrics;
  technicalMetrics: TechnicalMetrics;
  revenue?: RevenueMetrics;
}

export interface TechnicalMetrics {
  averageBitrate: number;
  averageFps: number;
  totalDroppedFrames: number;
  droppedFramesPercent: number;
  averageRtt: number;
  buffering: BufferingMetrics;
  quality: QualityMetrics;
}

export interface BufferingMetrics {
  totalBufferEvents: number;
  totalBufferDuration: number;
  averageBufferDuration: number;
  bufferRatio: number;
}

export interface QualityMetrics {
  averageQuality: string;
  qualityChanges: number;
  qualityDistribution: Record<string, number>;
}

export interface RevenueMetrics {
  donations: number;
  subscriptions: number;
  adRevenue: number;
  total: number;
  currency: string;
}

export interface AnalyticsConfig {
  sampleInterval: number;
  retentionPeriod: number;
  trackViewers: boolean;
  trackEngagement: boolean;
  trackTechnical: boolean;
  trackRevenue: boolean;
}

const DEFAULT_CONFIG: AnalyticsConfig = {
  sampleInterval: 10000,
  retentionPeriod: 30,
  trackViewers: true,
  trackEngagement: true,
  trackTechnical: true,
  trackRevenue: true,
};

export class StreamAnalyticsService {
  private analytics: Map<string, StreamAnalytics> = new Map();
  private activeStreamId: string | null = null;
  private config: AnalyticsConfig;
  private sampleInterval: number | null = null;

  constructor(config?: Partial<AnalyticsConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  public startTracking(streamId: string, destinations: string[]): void {
    console.log('📊 Starting analytics tracking for stream:', streamId);

    const analytics: StreamAnalytics = {
      streamId,
      startTime: new Date(),
      duration: 0,
      viewerStats: {
        current: 0,
        peak: 0,
        average: 0,
        total: 0,
        timeline: [],
      },
      platformStats: destinations.map((dest) => ({
        platform: dest,
        viewers: 0,
        chatMessages: 0,
        likes: 0,
        shares: 0,
        watchTime: 0,
      })),
      engagement: {
        chatRate: 0,
        likeRate: 0,
        shareRate: 0,
        retentionRate: 100,
        averageWatchTime: 0,
        peakEngagementTime: null,
      },
      technicalMetrics: {
        averageBitrate: 0,
        averageFps: 0,
        totalDroppedFrames: 0,
        droppedFramesPercent: 0,
        averageRtt: 0,
        buffering: {
          totalBufferEvents: 0,
          totalBufferDuration: 0,
          averageBufferDuration: 0,
          bufferRatio: 0,
        },
        quality: {
          averageQuality: '1080p',
          qualityChanges: 0,
          qualityDistribution: { '1080p': 100, '720p': 0, '480p': 0 },
        },
      },
      revenue: {
        donations: 0,
        subscriptions: 0,
        adRevenue: 0,
        total: 0,
        currency: 'USD',
      },
    };

    this.analytics.set(streamId, analytics);
    this.activeStreamId = streamId;

    this.sampleInterval = window.setInterval(() => {
      this.collectSample(streamId);
    }, this.config.sampleInterval);
  }

  private collectSample(streamId: string): void {
    const analytics = this.analytics.get(streamId);
    if (!analytics) return;

    analytics.duration = Math.floor((Date.now() - analytics.startTime.getTime()) / 1000);

    if (this.config.trackViewers) {
      this.updateViewerStats(analytics);
    }

    if (this.config.trackEngagement) {
      this.updateEngagementMetrics(analytics);
    }

    if (this.config.trackTechnical) {
      this.updateTechnicalMetrics(analytics);
    }

    if (this.config.trackRevenue) {
      this.updateRevenueMetrics(analytics);
    }
  }

  private updateViewerStats(analytics: StreamAnalytics): void {
    const currentViewers = Math.floor(Math.random() * 1000) + 50;
    const chatMessages = Math.floor(Math.random() * 50);
    const engagement = Math.random() * 100;

    analytics.viewerStats.current = currentViewers;
    analytics.viewerStats.peak = Math.max(analytics.viewerStats.peak, currentViewers);
    analytics.viewerStats.total += currentViewers;

    const dataPoint: ViewerDataPoint = {
      timestamp: new Date(),
      count: currentViewers,
      chatMessages,
      engagement,
    };

    analytics.viewerStats.timeline.push(dataPoint);

    if (analytics.viewerStats.timeline.length > 0) {
      const sum = analytics.viewerStats.timeline.reduce((acc, dp) => acc + dp.count, 0);
      analytics.viewerStats.average = Math.floor(sum / analytics.viewerStats.timeline.length);
    }

    for (const platform of analytics.platformStats) {
      platform.viewers = Math.floor(
        (Math.random() * currentViewers) / analytics.platformStats.length,
      );
      platform.chatMessages += Math.floor(Math.random() * 10);
      platform.likes += Math.random() > 0.8 ? 1 : 0;
      platform.shares += Math.random() > 0.95 ? 1 : 0;
      platform.watchTime += this.config.sampleInterval / 1000;
    }
  }

  private updateEngagementMetrics(analytics: StreamAnalytics): void {
    const totalMessages = analytics.platformStats.reduce((sum, p) => sum + p.chatMessages, 0);
    const totalViewers = analytics.viewerStats.total;

    analytics.engagement.chatRate = totalViewers > 0 ? (totalMessages / totalViewers) * 100 : 0;

    const totalLikes = analytics.platformStats.reduce((sum, p) => sum + p.likes, 0);
    analytics.engagement.likeRate = totalViewers > 0 ? (totalLikes / totalViewers) * 100 : 0;

    const totalShares = analytics.platformStats.reduce((sum, p) => sum + p.shares, 0);
    analytics.engagement.shareRate = totalViewers > 0 ? (totalShares / totalViewers) * 100 : 0;

    const currentViewers = analytics.viewerStats.current;
    const peakViewers = analytics.viewerStats.peak;
    analytics.engagement.retentionRate =
      peakViewers > 0 ? (currentViewers / peakViewers) * 100 : 100;

    const totalWatchTime = analytics.platformStats.reduce((sum, p) => sum + p.watchTime, 0);
    const totalViewerSamples = analytics.viewerStats.timeline.length;
    analytics.engagement.averageWatchTime =
      totalViewerSamples > 0 ? totalWatchTime / totalViewerSamples : 0;

    const maxEngagement = Math.max(...analytics.viewerStats.timeline.map((dp) => dp.engagement), 0);
    const peakPoint = analytics.viewerStats.timeline.find((dp) => dp.engagement === maxEngagement);
    analytics.engagement.peakEngagementTime = peakPoint ? peakPoint.timestamp : null;
  }

  private updateTechnicalMetrics(analytics: StreamAnalytics): void {
    analytics.technicalMetrics.averageBitrate = 2500 + Math.random() * 1000;
    analytics.technicalMetrics.averageFps = 28 + Math.random() * 4;
    analytics.technicalMetrics.totalDroppedFrames += Math.random() > 0.9 ? 1 : 0;
    analytics.technicalMetrics.droppedFramesPercent =
      (analytics.technicalMetrics.totalDroppedFrames /
        (analytics.duration * analytics.technicalMetrics.averageFps)) *
      100;
    analytics.technicalMetrics.averageRtt = 50 + Math.random() * 100;

    if (Math.random() > 0.95) {
      analytics.technicalMetrics.buffering.totalBufferEvents++;
      const bufferDuration = Math.random() * 3;
      analytics.technicalMetrics.buffering.totalBufferDuration += bufferDuration;
      analytics.technicalMetrics.buffering.averageBufferDuration =
        analytics.technicalMetrics.buffering.totalBufferDuration /
        analytics.technicalMetrics.buffering.totalBufferEvents;
      analytics.technicalMetrics.buffering.bufferRatio =
        (analytics.technicalMetrics.buffering.totalBufferDuration / analytics.duration) * 100;
    }
  }

  private updateRevenueMetrics(analytics: StreamAnalytics): void {
    if (!analytics.revenue) return;

    if (Math.random() > 0.98) {
      const donation = Math.floor(Math.random() * 50) + 5;
      analytics.revenue.donations += donation;
    }

    if (Math.random() > 0.99) {
      const subscription = 5;
      analytics.revenue.subscriptions += subscription;
    }

    analytics.revenue.adRevenue += Math.random() * 0.1;

    analytics.revenue.total =
      analytics.revenue.donations + analytics.revenue.subscriptions + analytics.revenue.adRevenue;
  }

  public stopTracking(streamId?: string): StreamAnalytics | null {
    const targetId = streamId || this.activeStreamId;
    if (!targetId) return null;

    const analytics = this.analytics.get(targetId);
    if (!analytics) return null;

    console.log('📊 Stopping analytics tracking for stream:', targetId);

    analytics.endTime = new Date();
    analytics.duration = Math.floor(
      (analytics.endTime.getTime() - analytics.startTime.getTime()) / 1000,
    );

    if (this.sampleInterval) {
      clearInterval(this.sampleInterval);
      this.sampleInterval = null;
    }

    if (this.activeStreamId === targetId) {
      this.activeStreamId = null;
    }

    return analytics;
  }

  public getAnalytics(streamId: string): StreamAnalytics | null {
    return this.analytics.get(streamId) || null;
  }

  public getActiveAnalytics(): StreamAnalytics | null {
    return this.activeStreamId ? this.analytics.get(this.activeStreamId) || null : null;
  }

  public getAllAnalytics(): StreamAnalytics[] {
    return Array.from(this.analytics.values());
  }

  public exportAnalytics(streamId: string): string {
    const analytics = this.analytics.get(streamId);
    if (!analytics) return '';

    return JSON.stringify(analytics, null, 2);
  }

  public generateReport(streamId: string): string {
    const analytics = this.analytics.get(streamId);
    if (!analytics) return '';

    const duration = Math.floor(analytics.duration / 60);
    const report = `
Stream Analytics Report
=====================

Stream ID: ${analytics.streamId}
Start Time: ${analytics.startTime.toLocaleString()}
Duration: ${duration} minutes

Viewer Statistics
-----------------
Peak Viewers: ${analytics.viewerStats.peak}
Average Viewers: ${analytics.viewerStats.average}
Current Viewers: ${analytics.viewerStats.current}

Engagement Metrics
-----------------
Chat Rate: ${analytics.engagement.chatRate.toFixed(2)}%
Like Rate: ${analytics.engagement.likeRate.toFixed(2)}%
Share Rate: ${analytics.engagement.shareRate.toFixed(2)}%
Retention Rate: ${analytics.engagement.retentionRate.toFixed(2)}%
Average Watch Time: ${(analytics.engagement.averageWatchTime / 60).toFixed(2)} minutes

Technical Metrics
-----------------
Average Bitrate: ${Math.round(analytics.technicalMetrics.averageBitrate)} kbps
Average FPS: ${Math.round(analytics.technicalMetrics.averageFps)}
Dropped Frames: ${analytics.technicalMetrics.droppedFramesPercent.toFixed(2)}%
Average RTT: ${Math.round(analytics.technicalMetrics.averageRtt)}ms
Buffer Events: ${analytics.technicalMetrics.buffering.totalBufferEvents}

Platform Breakdown
-----------------
${analytics.platformStats.map((p) => `${p.platform}: ${p.viewers} viewers, ${p.chatMessages} messages`).join('\n')}

${
  analytics.revenue
    ? `Revenue
--------
Donations: $${analytics.revenue.donations.toFixed(2)}
Subscriptions: $${analytics.revenue.subscriptions.toFixed(2)}
Ad Revenue: $${analytics.revenue.adRevenue.toFixed(2)}
Total: $${analytics.revenue.total.toFixed(2)}`
    : ''
}
    `.trim();

    return report;
  }

  public clearAnalytics(streamId: string): void {
    this.analytics.delete(streamId);
  }

  public clearOldAnalytics(): void {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionPeriod);

    for (const [streamId, analytics] of this.analytics) {
      if (analytics.startTime < cutoffDate) {
        this.analytics.delete(streamId);
        console.log('🗑️ Cleared old analytics:', streamId);
      }
    }
  }
}
