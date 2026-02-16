import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { buildApiUrl } from '../services/apiClient';
import {
  BarChart3,
  Clock,
  Users,
  DollarSign,
  TrendingUp,
  Calendar,
  Radio,
  Trophy,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';

interface AnalyticsStats {
  totalStreams: number;
  totalDuration: number;
  avgDuration: number;
  peakViewers: number;
  totalScreams: number;
  totalRevenue: number;
}

interface StreamSession {
  id: string;
  startedAt: string;
  endedAt?: string;
  duration: number;
  peakViewers: number;
  platforms: string[];
  layout: string;
  status: string;
}

interface AnalyticsData {
  period: string;
  stats: AnalyticsStats;
  recentSessions: StreamSession[];
}

const AnalyticsDashboard: React.FC = () => {
  const { user } = useAuth();
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState(30);

  const fetchAnalytics = async () => {
    if (!user) return;

    setLoading(true);
    setError(null);

    try {
      const token = await user.getIdToken();
      const response = await fetch(buildApiUrl(`/api/analytics/user?days=${selectedPeriod}`), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch analytics');
      }

      const data = await response.json();
      setAnalytics(data);
    } catch (err) {
      console.error('Analytics fetch error:', err);
      setError('Unable to load analytics. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [user, selectedPeriod]);

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const formatDate = (dateStr: string): string => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="p-6 bg-dark-800 rounded-xl border border-gray-700">
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-8 h-8 text-brand-500 animate-spin" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-dark-800 rounded-xl border border-gray-700">
        <div className="flex items-center gap-3 text-red-400">
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
        <button
          onClick={fetchAnalytics}
          className="mt-4 px-4 py-2 bg-brand-600 hover:bg-brand-500 rounded-lg text-white text-sm"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-6 h-6 text-brand-400" />
          <h2 className="text-xl font-bold text-white">Analytics</h2>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(Number(e.target.value))}
            className="bg-dark-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:border-brand-500 outline-none"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>

          <button
            onClick={fetchAnalytics}
            className="p-2 bg-dark-700 hover:bg-dark-600 rounded-lg transition-colors"
            aria-label="Refresh analytics"
          >
            <RefreshCw size={18} className="text-gray-400" />
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard
          icon={Radio}
          label="Total Streams"
          value={analytics?.stats.totalStreams || 0}
          color="brand"
        />
        <StatCard
          icon={Clock}
          label="Total Time"
          value={formatDuration(analytics?.stats.totalDuration || 0)}
          color="cyan"
        />
        <StatCard
          icon={TrendingUp}
          label="Avg Duration"
          value={formatDuration(analytics?.stats.avgDuration || 0)}
          color="green"
        />
        <StatCard
          icon={Users}
          label="Peak Viewers"
          value={analytics?.stats.peakViewers || 0}
          color="purple"
        />
        <StatCard
          icon={Trophy}
          label="Screams"
          value={analytics?.stats.totalScreams || 0}
          color="yellow"
        />
        <StatCard
          icon={DollarSign}
          label="Revenue"
          value={`$${(analytics?.stats.totalRevenue || 0).toFixed(2)}`}
          color="emerald"
        />
      </div>

      {/* Recent Sessions */}
      <div className="bg-dark-800 rounded-xl border border-gray-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-700 flex items-center gap-2">
          <Calendar size={18} className="text-gray-400" />
          <h3 className="font-semibold text-white">Recent Streams</h3>
        </div>

        {analytics?.recentSessions.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            <Radio size={32} className="mx-auto mb-3 opacity-50" />
            <p>No streams yet. Start streaming to see your analytics!</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-700">
            {analytics?.recentSessions.map((session) => (
              <div
                key={session.id}
                className="px-6 py-4 flex items-center justify-between hover:bg-dark-700/50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      session.status === 'active' ? 'bg-red-500 animate-pulse' : 'bg-gray-500'
                    }`}
                  />
                  <div>
                    <p className="text-white font-medium">
                      {session.startedAt ? formatDate(session.startedAt) : 'Unknown'}
                    </p>
                    <p className="text-sm text-gray-400">
                      {session.platforms?.join(', ') || 'No platforms'} â€¢{' '}
                      {session.layout || 'Default layout'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-6 text-sm">
                  <div className="text-right">
                    <p className="text-gray-400">Duration</p>
                    <p className="text-white font-medium">
                      {formatDuration(session.duration || 0)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-gray-400">Peak Viewers</p>
                    <p className="text-white font-medium">{session.peakViewers || 0}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color: 'brand' | 'cyan' | 'green' | 'purple' | 'yellow' | 'emerald';
}

const StatCard: React.FC<StatCardProps> = ({ icon: Icon, label, value, color }) => {
  const colorClasses = {
    brand: 'from-brand-500/20 to-brand-600/10 text-brand-400',
    cyan: 'from-cyan-500/20 to-cyan-600/10 text-cyan-400',
    green: 'from-green-500/20 to-green-600/10 text-green-400',
    purple: 'from-purple-500/20 to-purple-600/10 text-purple-400',
    yellow: 'from-yellow-500/20 to-yellow-600/10 text-yellow-400',
    emerald: 'from-emerald-500/20 to-emerald-600/10 text-emerald-400',
  };

  return (
    <div
      className={`p-4 rounded-xl bg-gradient-to-br ${colorClasses[color]} border border-gray-700/50`}
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon size={16} />
        <span className="text-xs text-gray-400 uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
    </div>
  );
};

export default AnalyticsDashboard;
