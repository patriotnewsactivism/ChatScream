import React, { useEffect, useState } from 'react';
import {
  Activity,
  TrendingUp,
  Users,
  MessageSquare,
  Heart,
  Share2,
  DollarSign,
  AlertCircle,
  Clock,
  Eye,
} from 'lucide-react';
import type { StreamAnalytics, ViewerDataPoint } from '../services/streamAnalytics';

interface StreamAnalyticsDashboardProps {
  analytics: StreamAnalytics | null;
  isLive?: boolean;
}

const StreamAnalyticsDashboard: React.FC<StreamAnalyticsDashboardProps> = ({
  analytics,
  isLive = false,
}) => {
  const [recentViewers, setRecentViewers] = useState<ViewerDataPoint[]>([]);

  useEffect(() => {
    if (analytics && analytics.viewerStats.timeline.length > 0) {
      setRecentViewers(analytics.viewerStats.timeline.slice(-20));
    }
  }, [analytics]);

  if (!analytics) {
    return (
      <div className="bg-dark-800/70 rounded-xl border border-gray-700 p-6 text-center">
        <Activity size={48} className="mx-auto mb-4 text-gray-500" />
        <h3 className="text-lg font-semibold text-gray-300 mb-2">No Analytics Available</h3>
        <p className="text-sm text-gray-400">Start streaming to see real-time analytics</p>
      </div>
    );
  }

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m ${secs}s`;
  };

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  return (
    <div className="space-y-4">
      {isLive && (
        <div className="bg-gradient-to-r from-red-600/20 to-pink-600/20 border border-red-500/40 rounded-lg p-3 flex items-center gap-3">
          <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
          <div className="flex-1">
            <div className="text-sm font-semibold text-red-200">LIVE NOW</div>
            <div className="text-xs text-gray-300">
              {formatDuration(analytics.duration)} • {analytics.viewerStats.current} watching
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-dark-800/70 rounded-lg border border-gray-700 p-4">
          <div className="flex items-center justify-between mb-2">
            <Users size={16} className="text-brand-400" />
            {isLive && <div className="text-[10px] text-green-400 uppercase font-bold">Live</div>}
          </div>
          <div className="text-2xl font-bold">{formatNumber(analytics.viewerStats.current)}</div>
          <div className="text-xs text-gray-400">Current Viewers</div>
        </div>

        <div className="bg-dark-800/70 rounded-lg border border-gray-700 p-4">
          <div className="flex items-center justify-between mb-2">
            <TrendingUp size={16} className="text-green-400" />
          </div>
          <div className="text-2xl font-bold">{formatNumber(analytics.viewerStats.peak)}</div>
          <div className="text-xs text-gray-400">Peak Viewers</div>
        </div>

        <div className="bg-dark-800/70 rounded-lg border border-gray-700 p-4">
          <div className="flex items-center justify-between mb-2">
            <Eye size={16} className="text-blue-400" />
          </div>
          <div className="text-2xl font-bold">{formatNumber(analytics.viewerStats.average)}</div>
          <div className="text-xs text-gray-400">Avg Viewers</div>
        </div>

        <div className="bg-dark-800/70 rounded-lg border border-gray-700 p-4">
          <div className="flex items-center justify-between mb-2">
            <Clock size={16} className="text-purple-400" />
          </div>
          <div className="text-2xl font-bold">{formatDuration(analytics.duration)}</div>
          <div className="text-xs text-gray-400">Duration</div>
        </div>
      </div>

      <div className="bg-dark-800/70 rounded-xl border border-gray-700 p-4">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Activity size={16} className="text-brand-400" />
          Viewer Timeline
        </h3>
        <div className="h-32 flex items-end gap-1">
          {recentViewers.map((point, i) => {
            const maxViewers = Math.max(...recentViewers.map((p) => p.count), 1);
            const height = (point.count / maxViewers) * 100;
            return (
              <div
                key={i}
                className="flex-1 bg-gradient-to-t from-brand-600 to-brand-400 rounded-t opacity-80 hover:opacity-100 transition-opacity"
                style={{ height: `${height}%` }}
                title={`${point.count} viewers at ${point.timestamp.toLocaleTimeString()}`}
              />
            );
          })}
        </div>
        <div className="mt-2 flex justify-between text-[10px] text-gray-500">
          <span>-{recentViewers.length}min</span>
          <span>Now</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-dark-800/70 rounded-xl border border-gray-700 p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <MessageSquare size={16} className="text-green-400" />
            Engagement Metrics
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare size={14} className="text-gray-400" />
                <span className="text-sm text-gray-300">Chat Rate</span>
              </div>
              <span className="text-sm font-semibold">
                {analytics.engagement.chatRate.toFixed(2)}%
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Heart size={14} className="text-gray-400" />
                <span className="text-sm text-gray-300">Like Rate</span>
              </div>
              <span className="text-sm font-semibold">
                {analytics.engagement.likeRate.toFixed(2)}%
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Share2 size={14} className="text-gray-400" />
                <span className="text-sm text-gray-300">Share Rate</span>
              </div>
              <span className="text-sm font-semibold">
                {analytics.engagement.shareRate.toFixed(2)}%
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users size={14} className="text-gray-400" />
                <span className="text-sm text-gray-300">Retention</span>
              </div>
              <span className="text-sm font-semibold">
                {analytics.engagement.retentionRate.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>

        <div className="bg-dark-800/70 rounded-xl border border-gray-700 p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Activity size={16} className="text-blue-400" />
            Technical Performance
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-300">Avg Bitrate</span>
              <span className="text-sm font-semibold">
                {Math.round(analytics.technicalMetrics.averageBitrate)} kbps
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-300">Avg FPS</span>
              <span className="text-sm font-semibold">
                {Math.round(analytics.technicalMetrics.averageFps)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-300">Dropped Frames</span>
              <span
                className={`text-sm font-semibold ${analytics.technicalMetrics.droppedFramesPercent > 5 ? 'text-red-400' : ''}`}
              >
                {analytics.technicalMetrics.droppedFramesPercent.toFixed(2)}%
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-300">Avg RTT</span>
              <span className="text-sm font-semibold">
                {Math.round(analytics.technicalMetrics.averageRtt)}ms
              </span>
            </div>
          </div>
        </div>
      </div>

      {analytics.platformStats.length > 0 && (
        <div className="bg-dark-800/70 rounded-xl border border-gray-700 p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Users size={16} className="text-purple-400" />
            Platform Breakdown
          </h3>
          <div className="space-y-2">
            {analytics.platformStats.map((platform) => (
              <div
                key={platform.platform}
                className="flex items-center justify-between p-2 rounded bg-dark-900/50"
              >
                <span className="text-sm font-medium">{platform.platform}</span>
                <div className="flex items-center gap-4 text-xs text-gray-400">
                  <span>{platform.viewers} viewers</span>
                  <span>{platform.chatMessages} messages</span>
                  <span>{platform.likes} likes</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {analytics.revenue && analytics.revenue.total > 0 && (
        <div className="bg-gradient-to-br from-green-900/30 to-emerald-900/30 rounded-xl border border-green-500/30 p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <DollarSign size={16} className="text-green-400" />
            Revenue
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-gray-400 mb-1">Donations</div>
              <div className="text-xl font-bold text-green-400">
                ${analytics.revenue.donations.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">Subscriptions</div>
              <div className="text-xl font-bold text-green-400">
                ${analytics.revenue.subscriptions.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">Ad Revenue</div>
              <div className="text-xl font-bold text-green-400">
                ${analytics.revenue.adRevenue.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">Total</div>
              <div className="text-xl font-bold text-green-400">
                ${analytics.revenue.total.toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      )}

      {analytics.technicalMetrics.buffering.totalBufferEvents > 0 && (
        <div className="bg-amber-900/20 border border-amber-500/30 rounded-lg p-3 flex items-start gap-3">
          <AlertCircle size={16} className="text-amber-400 mt-0.5" />
          <div className="flex-1 text-sm">
            <div className="font-semibold text-amber-200">Buffering Detected</div>
            <div className="text-xs text-gray-300 mt-1">
              {analytics.technicalMetrics.buffering.totalBufferEvents} events,{' '}
              {analytics.technicalMetrics.buffering.totalBufferDuration.toFixed(1)}s total duration
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StreamAnalyticsDashboard;
