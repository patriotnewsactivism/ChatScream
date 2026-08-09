import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  Calendar,
  Clock,
  Copy,
  ExternalLink,
  Gauge,
  Globe,
  LayoutTemplate,
  Play,
  ShieldCheck,
  Sparkles,
  Wallet2,
  Wand2,
  Loader2,
  Trophy,
  Users,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Platform } from '../types';
import { createCheckoutSession, getPlanById, PRICING_PLANS } from '../services/stripe';
import BackendStatusCard from '../components/BackendStatusCard';
import AuthStatusBanner from '../components/AuthStatusBanner';
import {
  getAnalyticsOverview,
  getLeaderboardStats,
  getSchedules,
  disconnectPlatform,
  AnalyticsOverview,
  LeaderboardStats,
  StreamSchedule,
} from '../services/backend';

const CreatorDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { userProfile, logout, sessionToken, refreshProfile } = useAuth();
  const [upgrading, setUpgrading] = useState(false);
  const [upgradeError, setUpgradeError] = useState('');
  const [analytics, setAnalytics] = useState<AnalyticsOverview | null>(null);
  const [leaderboardStats, setLeaderboardStats] = useState<LeaderboardStats | null>(null);
  const [schedules, setSchedules] = useState<StreamSchedule[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [checkoutSuccess, setCheckoutSuccess] = useState(false);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [disconnectError, setDisconnectError] = useState('');
  const plan = userProfile?.subscription?.plan || 'free';
  const planLabel = getPlanById(plan)?.name || 'Free';
  const referralCode = userProfile?.affiliate?.code || '';
  const referralLink =
    typeof window === 'undefined' || !referralCode
      ? ''
      : `${window.location.origin}/signup?ref=${encodeURIComponent(referralCode)}`;
  const canAccessAdmin = userProfile?.role === 'admin';
  const nextPlan = PRICING_PLANS.find((p) => p.price > 0 && p.id !== plan);

  const copyToClipboard = async (text: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      if (!userProfile?.uid) return;
      setLoadingData(true);

      // Handle checkout success redirect
      const params = new URLSearchParams(window.location.search);
      if (params.get('checkout') === 'success') {
        setCheckoutSuccess(true);
        // Clean URL without reload
        params.delete('checkout');
        const newUrl = `${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}`;
        window.history.replaceState({}, '', newUrl);
        // Refresh profile to pick up new plan status
        await refreshProfile();
        // Auto-dismiss after 8 seconds
        setTimeout(() => setCheckoutSuccess(false), 8000);
      }

      try {
        const [analyticsResult, leaderboardResult, scheduleResult] = await Promise.allSettled([
          getAnalyticsOverview(),
          getLeaderboardStats(userProfile.uid),
          getSchedules(),
        ]);
        if (analyticsResult.status === 'fulfilled') setAnalytics(analyticsResult.value);
        if (leaderboardResult.status === 'fulfilled') setLeaderboardStats(leaderboardResult.value);
        if (scheduleResult.status === 'fulfilled') setSchedules(scheduleResult.value);
      } catch {
        // Silently handle — dashboard shows defaults
      } finally {
        setLoadingData(false);
      }
    };
    fetchData();
  }, [userProfile?.uid]);

  const handleUpgrade = async () => {
    if (!nextPlan || !userProfile) return;
    setUpgrading(true);
    setUpgradeError('');
    try {
      const url = await createCheckoutSession(
        nextPlan.stripePriceId,
        userProfile.uid,
        userProfile.email,
        `${window.location.origin}/dashboard?checkout=success`,
        `${window.location.origin}/dashboard`,
        referralCode || undefined,
        sessionToken,
      );
      window.location.href = url;
    } catch (err) {
      setUpgradeError(err instanceof Error ? err.message : 'Could not start checkout.');
      setUpgrading(false);
    }
  };

  const connected = userProfile?.connectedPlatforms || {};
  const destinations = [
    {
      name: 'YouTube',
      platform: Platform.YOUTUBE,
      status: connected.youtube?.channelName
        ? `Connected — ${connected.youtube.channelName}`
        : 'Not connected',
      isConnected: Boolean(connected.youtube),
    },
    {
      name: 'Facebook Live',
      platform: Platform.FACEBOOK,
      status: connected.facebook?.pageName
        ? `Connected — ${connected.facebook.pageName}`
        : 'Not connected',
      isConnected: Boolean(connected.facebook),
    },
    {
      name: 'Twitch',
      platform: Platform.TWITCH,
      status: connected.twitch?.channelName
        ? `Connected — ${connected.twitch.channelName}`
        : 'Not connected',
      isConnected: Boolean(connected.twitch),
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-dark-900 via-dark-900 to-black text-white">
      <div className="max-w-6xl mx-auto px-4 py-10 space-y-8">
        <AuthStatusBanner />
        {checkoutSuccess && (
          <div className="p-4 bg-emerald-500/15 border border-emerald-500/30 rounded-xl flex items-center gap-3 animate-fade-in">
            <ShieldCheck size={18} className="text-emerald-400 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-300">Payment successful!</p>
              <p className="text-xs text-emerald-400/80">
                Your plan has been updated. Enjoy your new features!
              </p>
            </div>
            <button
              onClick={() => setCheckoutSuccess(false)}
              className="ml-auto text-gray-500 hover:text-white shrink-0"
            >
              &times;
            </button>
          </div>
        )}
        <div className="flex items-center justify-end gap-2 flex-wrap">
          {canAccessAdmin && (
            <button
              onClick={() => navigate('/admin')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-dark-800 border border-gray-700 hover:border-brand-500 font-semibold"
            >
              <ShieldCheck size={16} /> Admin Portal
            </button>
          )}
          <button
            onClick={() => navigate('/studio')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-dark-800 border border-gray-700 hover:border-brand-500 font-semibold"
          >
            <Play size={16} /> Studio
          </button>
          <button
            onClick={async () => {
              try {
                await logout();
              } finally {
                navigate('/');
              }
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 font-semibold"
          >
            Sign Out
          </button>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-sm text-gray-400">Welcome back</p>
            <h1 className="text-3xl font-bold">Creator control center</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => navigate('/studio')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white font-semibold shadow-lg"
            >
              <Play size={16} /> Open Studio
            </button>
            <button
              onClick={() => navigate('/studio#schedule')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-700 hover:border-brand-500"
            >
              <Calendar size={16} /> Schedule broadcast
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl border border-gray-800 bg-dark-800/70">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-gray-400 flex items-center gap-1.5">
                Cloud VM hours
                <span className="text-[10px] font-bold uppercase tracking-wide bg-cyan-500/20 text-cyan-300 px-1.5 py-0.5 rounded">
                  Coming Soon
                </span>
              </span>
              <Gauge size={16} className="text-brand-400" />
            </div>
            <p className="text-3xl font-bold text-gray-500">Not yet live</p>
            <p className="text-xs text-gray-400">
              Always-on cloud encoding is in active development — your {planLabel} plan will
              include it once it ships.
            </p>
            <p className="text-[11px] text-gray-500 mt-2">
              Planned allotments — Free: 0, $19: 3 hrs, $29: 10 hrs, $59: 50 hrs.
            </p>
          </div>
          <div className="p-4 rounded-xl border border-gray-800 bg-dark-800/70 space-y-2">
            <div className="flex items-center gap-2 text-brand-300">
              <Sparkles size={16} />
              <span className="text-sm font-semibold">Screams received</span>
            </div>
            <p className="text-2xl font-bold">{analytics ? analytics.totalScreams : '—'}</p>
            {analytics && analytics.totalDonations > 0 && (
              <p className="text-xs text-emerald-400">
                ${analytics.totalDonations.toFixed(2)} in donations
              </p>
            )}
            <p className="text-sm text-gray-300">
              Viewers send paid screams that appear on your stream.
            </p>
          </div>
          <div className="p-4 rounded-xl border border-gray-800 bg-dark-800/70 space-y-2">
            <div className="flex items-center gap-2 text-emerald-300">
              <ShieldCheck size={16} />
              <span className="text-sm font-semibold">Payouts & monetization</span>
            </div>
            <p className="text-sm text-gray-300">
              Keep your chatscreamers configured and monitor how you get paid out.
            </p>
            <button
              onClick={() => navigate('/studio#monetization')}
              className="text-xs text-emerald-300 underline"
            >
              Review payout settings
            </button>
          </div>
        </div>

        <div className="p-5 border border-gray-800 rounded-xl bg-dark-800/70 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="font-semibold">Affiliate / Referral Link</h2>
              <p className="text-sm text-gray-400">
                Share your link to credit signups back to you.
              </p>
            </div>
            <button
              onClick={() => copyToClipboard(referralLink || referralCode)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 hover:border-brand-500 text-sm font-semibold disabled:opacity-60"
              disabled={!referralCode}
            >
              <Copy size={16} /> Copy
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-1">
              <div className="text-[11px] uppercase font-bold text-gray-400">Code</div>
              <div className="mt-2 px-3 py-2 rounded-lg bg-dark-900 border border-gray-700 text-sm text-white break-all">
                {referralCode || 'Generating…'}
              </div>
            </div>
            <div className="md:col-span-2">
              <div className="text-[11px] uppercase font-bold text-gray-400">Link</div>
              <div className="mt-2 px-3 py-2 rounded-lg bg-dark-900 border border-gray-700 text-sm text-white break-all">
                {referralLink || 'Generating…'}
              </div>
            </div>
          </div>
        </div>

        <BackendStatusCard />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-3">
            <div className="p-5 border border-gray-800 rounded-xl bg-dark-800/70">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Calendar size={16} className="text-brand-400" />
                  <h2 className="font-semibold">Upcoming broadcasts</h2>
                </div>
                <button
                  onClick={() => navigate('/studio#schedule')}
                  className="text-sm text-brand-300 hover:text-brand-200"
                >
                  Create new
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {loadingData ? (
                  <div className="col-span-2 flex items-center justify-center py-4">
                    <Loader2 size={18} className="animate-spin text-gray-500" />
                    <span className="ml-2 text-sm text-gray-500">Loading schedules...</span>
                  </div>
                ) : schedules.length > 0 ? (
                  schedules.map((s) => (
                    <div key={s.id} className="p-3 rounded-lg border border-gray-700 bg-dark-900">
                      <p className="text-sm font-semibold">{s.title}</p>
                      <p className="text-xs text-gray-400">
                        {new Date(s.scheduledAt).toLocaleDateString(undefined, {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                      <div className="mt-2 flex items-center gap-2 text-xs text-gray-300">
                        <Clock size={14} />{' '}
                        {s.platforms.length > 0 ? s.platforms.join(' + ') : 'No platforms set'}
                        {s.autoStart && <span className="text-brand-400">· Auto-start</span>}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-3 rounded-lg border border-gray-700 bg-dark-900">
                    <p className="text-sm font-semibold">No upcoming broadcasts</p>
                    <p className="text-xs text-gray-400">Schedule your first stream</p>
                    <div className="mt-2 flex items-center gap-2 text-xs text-gray-300">
                      <Wand2 size={14} /> Plan ahead to build your audience
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="p-5 border border-gray-800 rounded-xl bg-dark-800/70">
              <div className="flex items-center gap-2 mb-3">
                <LayoutTemplate size={16} className="text-purple-300" />
                <h2 className="font-semibold">Templates & chat settings</h2>
              </div>
              <p className="text-sm text-gray-300 mb-3">
                Save overlays, chat moderation defaults, and payout routing in one place—just like
                Streamlabs or Streamyard.
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="px-3 py-1 rounded-full text-xs bg-purple-500/15 text-purple-200 border border-purple-500/30">
                  Overlay packs
                </span>
                <span className="px-3 py-1 rounded-full text-xs bg-amber-500/15 text-amber-200 border border-amber-500/30">
                  Auto-moderation
                </span>
                <span className="px-3 py-1 rounded-full text-xs bg-emerald-500/15 text-emerald-200 border border-emerald-500/30">
                  Payout rules
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="p-5 border border-gray-800 rounded-xl bg-dark-800/70">
              <div className="flex items-center gap-2 mb-2">
                <Globe size={16} className="text-brand-400" />
                <h3 className="font-semibold">Destinations</h3>
              </div>
              <div className="space-y-2">
                {destinations.map((dest) => (
                  <div
                    key={dest.platform}
                    className="p-3 rounded-lg border border-gray-700 bg-dark-900 flex items-center gap-3"
                  >
                    <div
                      className={`w-2 h-2 rounded-full shrink-0 ${dest.isConnected ? 'bg-green-400' : 'bg-gray-600'}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{dest.name}</p>
                      <p className="text-xs text-gray-400 truncate">{dest.status}</p>
                    </div>
                    {dest.isConnected && disconnecting !== dest.platform && (
                      <button
                        onClick={() => setDisconnecting(dest.platform)}
                        className="text-[10px] text-red-400 hover:text-red-300 font-bold uppercase shrink-0"
                      >
                        Disconnect
                      </button>
                    )}
                    {dest.isConnected && disconnecting === dest.platform && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={async () => {
                            setDisconnectError('');
                            try {
                              await disconnectPlatform(dest.platform);
                              await refreshProfile();
                              setDisconnecting(null);
                            } catch (err) {
                              setDisconnectError(
                                err instanceof Error ? err.message : 'Failed to disconnect',
                              );
                              setDisconnecting(null);
                            }
                          }}
                          className="text-[10px] bg-red-600 hover:bg-red-500 text-white font-bold px-2 py-0.5 rounded"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => {
                            setDisconnecting(null);
                            setDisconnectError('');
                          }}
                          className="text-[10px] text-gray-400 hover:text-white font-bold px-1"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {disconnectError && (
                  <div className="p-2 bg-red-900/30 border border-red-500/30 rounded-lg text-xs text-red-400">
                    {disconnectError}
                  </div>
                )}
              </div>
              <button
                onClick={() => navigate('/studio#destinations')}
                className="mt-3 text-sm text-brand-300 hover:text-brand-200 inline-flex items-center gap-1"
              >
                <ExternalLink size={13} /> Manage in Studio
              </button>
            </div>
            <div className="p-5 border border-gray-800 rounded-xl bg-dark-800/70">
              <div className="flex items-center gap-2 mb-2">
                <Users size={16} className="text-emerald-300" />
                <h3 className="font-semibold">Top Donors</h3>
              </div>
              {analytics && analytics.topDonors.length > 0 ? (
                <div className="space-y-1.5">
                  {analytics.topDonors.map((d, i) => (
                    <div key={d.name} className="flex items-center justify-between text-sm">
                      <span className="text-gray-300 truncate max-w-[60%]">
                        {i + 1}. {d.name}
                      </span>
                      <span className="text-emerald-400 font-medium">${d.total.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">
                  No donations yet. Share your stream link to start receiving screams!
                </p>
              )}
            </div>

            <div className="p-5 border border-gray-800 rounded-xl bg-dark-800/70">
              <div className="flex items-center gap-2 mb-2">
                <Wallet2 size={16} className="text-emerald-300" />
                <h3 className="font-semibold">Monetization</h3>
              </div>
              <p className="text-sm text-gray-300">
                Track chat screamers, donations, and payouts at a glance.
              </p>
              <div className="mt-2 flex items-center gap-2 text-xs text-gray-400">
                <ShieldCheck size={14} /> Secure payouts configured
              </div>
            </div>

            {leaderboardStats && (
              <div className="p-5 border border-gray-800 rounded-xl bg-dark-800/70">
                <div className="flex items-center gap-2 mb-2">
                  <Trophy size={16} className="text-yellow-400" />
                  <h3 className="font-semibold">Weekly Leaderboard</h3>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-400">Your rank</span>
                    <span className="text-sm font-bold text-white">
                      #{leaderboardStats.rank} of {leaderboardStats.totalEntries}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-400">Screams this week</span>
                    <span className="text-sm font-bold text-brand-300">
                      {leaderboardStats.screams}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-400">Total donated</span>
                    <span className="text-sm font-bold text-emerald-300">
                      ${leaderboardStats.donated.toFixed(2)}
                    </span>
                  </div>
                  {leaderboardStats.previousWins > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-400">Previous wins</span>
                      <span className="text-sm font-bold text-yellow-300">
                        {leaderboardStats.previousWins}x
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {plan === 'free' && nextPlan && (
              <div className="p-5 border border-brand-500/30 rounded-xl bg-brand-500/5">
                <p className="text-xs text-brand-400 font-semibold uppercase tracking-wide mb-1">
                  Upgrade your plan
                </p>
                <p className="text-sm text-gray-300 mb-3">
                  Unlock more destinations and advanced screams with {nextPlan.name}. Cloud
                  streaming is on the roadmap and not yet available.
                </p>
                {upgradeError && <p className="text-xs text-red-400 mb-2">{upgradeError}</p>}
                <button
                  onClick={handleUpgrade}
                  disabled={upgrading}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-pink-600 hover:from-brand-500 hover:to-pink-500 font-semibold text-white text-sm flex items-center justify-center gap-2 disabled:opacity-60 transition-all"
                >
                  <ArrowUpRight size={15} />
                  {upgrading
                    ? 'Redirecting…'
                    : `Upgrade to ${nextPlan.name} — $${nextPlan.price}/mo`}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreatorDashboard;
