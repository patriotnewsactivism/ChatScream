import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Clock, Copy, Gauge, Globe, LayoutTemplate, Play, ShieldCheck, Sparkles, Wallet2, Wand2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Platform } from '../types';

const planMinutes: Record<string, number> = {
  free: 0,
  pro: 180,
  expert: 600,
  enterprise: 3000,
};

const CreatorDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user, userProfile, logout } = useAuth();
  const plan = userProfile?.subscription?.plan || 'free';
  const includedMinutes = planMinutes[plan] ?? 0;
  const referralCode = userProfile?.affiliate?.code || '';
  const referralLink = typeof window === 'undefined' || !referralCode
    ? ''
    : `${window.location.origin}/signup?ref=${encodeURIComponent(referralCode)}`;
  const canAccessAdmin = (user?.email || '').trim().toLowerCase() === 'mreardon@wtpnews.org' || userProfile?.role === 'admin';

  const copyToClipboard = async (text: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
  };

  const destinations = [
    { name: 'YouTube', platform: Platform.YOUTUBE, status: 'Connected via OAuth' },
    { name: 'Facebook Live', platform: Platform.FACEBOOK, status: 'Quick connect available' },
    { name: 'Twitch', platform: Platform.TWITCH, status: 'One-click connect ready' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-dark-900 via-dark-900 to-black text-white">
      <div className="max-w-6xl mx-auto px-4 py-10 space-y-8">
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
              <span className="text-sm text-gray-400">Cloud VM hours</span>
              <Gauge size={16} className="text-brand-400" />
            </div>
            <p className="text-3xl font-bold">{(includedMinutes / 60).toFixed(0)} hrs</p>
            <p className="text-xs text-gray-400">Included with your {plan} plan</p>
            <p className="text-[11px] text-gray-500 mt-2">Free: 0, $19: 3 hours, $29: 10 hours, $59: 50 hours.</p>
          </div>
          <div className="p-4 rounded-xl border border-gray-800 bg-dark-800/70 space-y-2">
            <div className="flex items-center gap-2 text-brand-300">
              <Sparkles size={16} />
              <span className="text-sm font-semibold">One-click destinations</span>
            </div>
            <p className="text-sm text-gray-300">Connect YouTube, Facebook, or Twitch without copying RTMP keys.</p>
            <button
              onClick={() => navigate('/studio#destinations')}
              className="text-xs text-brand-300 underline"
            >
              Manage connections
            </button>
          </div>
          <div className="p-4 rounded-xl border border-gray-800 bg-dark-800/70 space-y-2">
            <div className="flex items-center gap-2 text-emerald-300">
              <ShieldCheck size={16} />
              <span className="text-sm font-semibold">Payouts & monetization</span>
            </div>
            <p className="text-sm text-gray-300">Keep your chatscreamers configured and monitor how you get paid out.</p>
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
              <p className="text-sm text-gray-400">Share your link to credit signups back to you.</p>
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
                <div className="p-3 rounded-lg border border-gray-700 bg-dark-900">
                  <p className="text-sm font-semibold">Q&A with community</p>
                  <p className="text-xs text-gray-400">Tomorrow • Multi-destination</p>
                  <div className="mt-2 flex items-center gap-2 text-xs text-gray-300">
                    <Clock size={14} /> 45 min cloud-hosted time reserved
                  </div>
                </div>
                <div className="p-3 rounded-lg border border-gray-700 bg-dark-900">
                  <p className="text-sm font-semibold">Product drop teaser</p>
                  <p className="text-xs text-gray-400">Saturday • YouTube + Twitch</p>
                  <div className="mt-2 flex items-center gap-2 text-xs text-gray-300">
                    <Wand2 size={14} /> Templates + chat automations ready
                  </div>
                </div>
              </div>
            </div>

            <div className="p-5 border border-gray-800 rounded-xl bg-dark-800/70">
              <div className="flex items-center gap-2 mb-3">
                <LayoutTemplate size={16} className="text-purple-300" />
                <h2 className="font-semibold">Templates & chat settings</h2>
              </div>
              <p className="text-sm text-gray-300 mb-3">Save overlays, chat moderation defaults, and payout routing in one place—just like Streamlabs or Streamyard.</p>
              <div className="flex flex-wrap gap-2">
                <span className="px-3 py-1 rounded-full text-xs bg-purple-500/15 text-purple-200 border border-purple-500/30">Overlay packs</span>
                <span className="px-3 py-1 rounded-full text-xs bg-amber-500/15 text-amber-200 border border-amber-500/30">Auto-moderation</span>
                <span className="px-3 py-1 rounded-full text-xs bg-emerald-500/15 text-emerald-200 border border-emerald-500/30">Payout rules</span>
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
                {destinations.map(dest => (
                  <div key={dest.platform} className="p-3 rounded-lg border border-gray-700 bg-dark-900">
                    <p className="text-sm font-semibold">{dest.name}</p>
                    <p className="text-xs text-gray-400">{dest.status}</p>
                  </div>
                ))}
              </div>
              <button
                onClick={() => navigate('/studio#destinations')}
                className="mt-3 text-sm text-brand-300 hover:text-brand-200"
              >
                Add or edit destinations
              </button>
            </div>
            <div className="p-5 border border-gray-800 rounded-xl bg-dark-800/70">
              <div className="flex items-center gap-2 mb-2">
                <Wallet2 size={16} className="text-emerald-300" />
                <h3 className="font-semibold">Monetization</h3>
              </div>
              <p className="text-sm text-gray-300">Track chat screamers, donations, and payouts at a glance.</p>
              <div className="mt-2 flex items-center gap-2 text-xs text-gray-400">
                <ShieldCheck size={14} /> Secure payouts configured
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreatorDashboard;
