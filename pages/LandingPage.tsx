import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import AuthStatusBanner from '../components/AuthStatusBanner';
import { PRICING_PLANS, formatPrice } from '../services/stripe';
import {
  Play,
  Radio,
  Layers,
  Music,
  Mic,
  Scale,
  Bookmark,
  MessageSquare,
  Shield,
  Check,
  Video,
  ArrowRight,
  Menu,
  X,
  Youtube,
  Facebook,
  Twitch,
  Cloud,
  Smartphone,
  Disc,
  Type,
  Users,
  Captions,
  Trophy,
  Sparkles,
  Wrench,
  LogOut,
  Settings,
} from 'lucide-react';

interface LeaderboardEntry {
  rank: number;
  username: string;
  screams: number;
  donated: number;
  weeklyGain: number;
}

/** Everything here ships today. If it is not in the app, it does not go in this list. */
const CAPABILITIES = [
  {
    icon: Radio,
    title: 'Simulcast to 9 destinations',
    body: 'YouTube, Facebook, Twitch and TikTok connect with one click. Kick, X, Rumble, LinkedIn and any custom RTMP server take a server URL and stream key.',
  },
  {
    icon: Layers,
    title: 'A scene engine you actually own',
    body: 'Build scenes, rename, duplicate and reorder them, and switch with a live thumbnail of each one. Six layouts: full camera, full screen, picture-in-picture, split, newsroom and portrait.',
  },
  {
    icon: Video,
    title: 'Program / preview switching',
    body: 'Set up the next shot off-air, then TAKE it to program — the switcher workflow, in a browser tab.',
  },
  {
    icon: Music,
    title: 'Media bin with real playback',
    body: 'Images, video clips and music. Clips and tracks play from your device instead of uploading, so a large file never blocks a live show.',
  },
  {
    icon: Mic,
    title: 'Live audio mixer',
    body: 'Independent mic, music and clip levels with live meters, mute, and a monitor bus so you hear exactly what your audience hears.',
  },
  {
    icon: Type,
    title: 'Broadcast graphics',
    body: 'Lower thirds, a scoreboard, an on-screen timer and image overlays. Add your logo, a ticker and a now-playing bug from the branding panel.',
  },
  {
    icon: Captions,
    title: 'Automatic captions',
    body: 'Live captions burned into the canvas, plus a running transcript of the whole stream.',
  },
  {
    icon: Disc,
    title: 'Recording that survives a phone',
    body: 'Record locally in chunks while you stream. It watches device memory and pauses rather than losing the take, and everything lands in your recordings library.',
  },
  {
    icon: MessageSquare,
    title: 'One chat from every platform',
    body: 'Comments from every connected destination merge into a single stream you can read and put on screen, with an AI moderator you configure.',
  },
  {
    icon: Users,
    title: 'Guest cameras',
    body: 'Send an invite link and bring a remote guest into the show over WebRTC. No install on their end.',
  },
];

/** The field-work features. This is the part other multistream tools do not have. */
const FIELD_KIT = [
  {
    icon: Bookmark,
    title: 'Evidence markers',
    body: 'Drop a timestamped marker mid-stream — a name, a badge number, a moment worth finding again — and export the log with the recording.',
  },
  {
    icon: Scale,
    title: 'Know Your Rights overlays',
    body: 'Search case law from the studio and put the citation on screen as a lower third while it is happening.',
  },
  {
    icon: Smartphone,
    title: 'Built for one thumb',
    body: 'The phone layout is the real product, not a shrunken desktop: big targets, a full-width preview, and the scene switcher within reach. Installs as a PWA.',
  },
  {
    icon: Shield,
    title: 'Your keys stay yours',
    body: 'Stream keys are handled server-side and never exposed to the browser. Connect with OAuth or paste a key — either way it is not sitting in your page source.',
  },
];

const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, userProfile, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardEntry[]>([]);

  const referralCode = searchParams.get('ref') || '';

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const apiBase = import.meta.env.VITE_API_URL || '';
        const res = await fetch(`${apiBase}/api/leaderboard`);
        if (res.ok) {
          const data = await res.json();
          if (data.entries && data.entries.length > 0) {
            setLeaderboardData(data.entries.slice(0, 5));
          }
        }
      } catch {
        // Leaderboard is a nice-to-have; the page stands without it.
      }
    };
    void fetchLeaderboard();
    const interval = setInterval(() => void fetchLeaderboard(), 30000);
    return () => clearInterval(interval);
  }, []);

  const goStudio = () => navigate(user ? '/studio' : '/signup');

  const navLinks = [
    { href: '#studio', label: 'The Studio' },
    { href: '#field', label: 'Field Kit' },
    { href: '#roadmap', label: 'Roadmap' },
    { href: '#pricing', label: 'Pricing' },
  ];

  return (
    <div className="min-h-screen bg-dark-950 text-white">
      <AuthStatusBanner />

      {/* ── Nav ── */}
      <nav
        className={`fixed top-0 inset-x-0 z-50 transition-colors ${
          scrolled ? 'bg-dark-950/95 backdrop-blur-md border-b border-gray-800' : 'bg-transparent'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center gap-2 shrink-0">
              <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center font-black">
                S
              </div>
              <span className="font-black tracking-tight">CHATSCREAM</span>
            </Link>

            <div className="hidden md:flex items-center gap-8">
              {navLinks.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  className="text-sm text-gray-300 hover:text-white transition-colors"
                >
                  {l.label}
                </a>
              ))}
            </div>

            <div className="hidden md:flex items-center gap-3">
              {user ? (
                <>
                  <Link
                    to="/studio"
                    className="px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-sm font-bold transition-colors"
                  >
                    Open Studio
                  </Link>
                  <button
                    onClick={logout}
                    title="Sign out"
                    className="p-2 rounded-lg text-gray-400 hover:text-white transition-colors"
                  >
                    <LogOut size={16} />
                  </button>
                </>
              ) : (
                <>
                  <Link to="/login" className="text-sm text-gray-300 hover:text-white">
                    Sign in
                  </Link>
                  <Link
                    to="/signup"
                    className="px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-sm font-bold transition-colors"
                  >
                    Start free
                  </Link>
                </>
              )}
            </div>

            <button
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="md:hidden p-2 text-gray-300"
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            >
              {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t border-gray-800 bg-dark-950 px-4 py-4 space-y-3">
            {navLinks.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setMobileMenuOpen(false)}
                className="block text-gray-300 py-1"
              >
                {l.label}
              </a>
            ))}
            <Link
              to={user ? '/studio' : '/signup'}
              className="block text-center px-4 py-2.5 rounded-lg bg-brand-500 font-bold"
            >
              {user ? 'Open Studio' : 'Start free'}
            </Link>
          </div>
        )}
      </nav>

      {/* ── Hero ── */}
      <header className="relative pt-32 pb-20 md:pt-44 md:pb-28 overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              'radial-gradient(60% 50% at 50% 0%, rgba(249,115,22,0.18) 0%, transparent 70%)',
          }}
        />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-brand-500/40 bg-brand-500/10 text-brand-300 text-xs font-bold uppercase tracking-wider">
            <Smartphone size={13} />
            Field studio · runs in your browser
          </span>

          <h1 className="mt-6 text-4xl md:text-6xl font-black tracking-tight leading-[1.05]">
            A live production truck
            <br />
            <span className="text-brand-500">that fits in your pocket.</span>
          </h1>

          <p className="mt-6 text-lg text-gray-400 max-w-2xl mx-auto leading-relaxed">
            ChatScream is a full multi-destination streaming studio that runs on the device you
            already carry. Scenes, overlays, a real audio mixer, merged chat and timestamped
            evidence markers — built for people who go live from where it is happening.
          </p>

          <div className="mt-9 flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={goStudio}
              className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl bg-brand-500 hover:bg-brand-600 font-bold transition-colors"
            >
              <Play size={18} fill="currentColor" />
              {user ? 'Open the Studio' : 'Start streaming free'}
            </button>
            <a
              href="#studio"
              className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl border border-gray-700 hover:border-gray-500 font-bold transition-colors"
            >
              See what it does
              <ArrowRight size={16} />
            </a>
          </div>

          <p className="mt-4 text-xs text-gray-500">
            No install, no download. Free tier streams to 2 destinations at 720p.
          </p>

          <div className="mt-12 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-gray-500">
            <span className="text-[11px] font-bold uppercase tracking-widest">Goes live on</span>
            <Youtube size={20} />
            <Facebook size={20} />
            <Twitch size={20} />
            <span className="text-sm font-semibold">TikTok</span>
            <span className="text-sm font-semibold">Kick</span>
            <span className="text-sm font-semibold">Rumble</span>
            <span className="text-sm font-semibold">X</span>
            <span className="text-sm font-semibold">LinkedIn</span>
            <span className="text-sm font-semibold">RTMP</span>
          </div>
        </div>
      </header>

      {/* ── What ships today ── */}
      <section id="studio" className="py-20 md:py-28 border-t border-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <h2 className="text-3xl md:text-4xl font-black tracking-tight">
              Everything below works right now
            </h2>
            <p className="mt-3 text-gray-400">
              Encoding happens on your device, so there is no queue and no render wait. Open a tab
              and go live.
            </p>
          </div>

          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {CAPABILITIES.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="rounded-2xl border border-gray-800 bg-dark-900/60 p-6 hover:border-gray-700 transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-brand-500/15 text-brand-400 flex items-center justify-center">
                  <Icon size={20} />
                </div>
                <h3 className="mt-4 font-bold">{title}</h3>
                <p className="mt-2 text-sm text-gray-400 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Field kit ── */}
      <section id="field" className="py-20 md:py-28 bg-dark-900/40 border-y border-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <span className="text-xs font-bold uppercase tracking-widest text-brand-400">
              What makes it different
            </span>
            <h2 className="mt-3 text-3xl md:text-4xl font-black tracking-tight">
              Made for accountability work
            </h2>
            <p className="mt-3 text-gray-400">
              Most multistream tools are built for gaming setups with a desk and a capture card.
              This one is built for the sidewalk, the courthouse steps and the city council meeting.
            </p>
          </div>

          <div className="mt-12 grid gap-5 sm:grid-cols-2">
            {FIELD_KIT.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="flex gap-4 rounded-2xl border border-gray-800 bg-dark-950/60 p-6"
              >
                <div className="shrink-0 w-11 h-11 rounded-xl bg-brand-500/15 text-brand-400 flex items-center justify-center">
                  <Icon size={21} />
                </div>
                <div>
                  <h3 className="font-bold">{title}</h3>
                  <p className="mt-1.5 text-sm text-gray-400 leading-relaxed">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Roadmap: honest about what is not built ── */}
      <section id="roadmap" className="py-20 md:py-28">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-dashed border-gray-700 bg-dark-900/40 p-8 md:p-12">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-gray-700 bg-dark-950 text-gray-400 text-xs font-bold uppercase tracking-wider">
              <Wrench size={13} />
              In development — not available yet
            </span>

            <h2 className="mt-6 text-3xl md:text-4xl font-black tracking-tight">
              Cloud broadcasting
            </h2>
            <p className="mt-4 text-gray-400 leading-relaxed max-w-3xl">
              We are building a cloud encoder that takes a link to a file you already have — a
              direct HTTP(S) URL, a Google Drive file or a Dropbox share — encodes it once off your
              device, and fans it out to every destination you have connected. Close the laptop and
              it keeps going.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {[
                {
                  icon: Cloud,
                  title: 'Stream from a link',
                  body: 'Point it at a Drive or Dropbox file instead of uploading it again.',
                },
                {
                  icon: Radio,
                  title: 'Encode once, fan out',
                  body: 'One encode in the cloud, up to 10 RTMP destinations.',
                },
                {
                  icon: Smartphone,
                  title: 'Device-independent',
                  body: 'The broadcast keeps running after you put your phone away.',
                },
              ].map(({ icon: Icon, title, body }) => (
                <div key={title} className="rounded-xl border border-gray-800 bg-dark-950/70 p-5">
                  <Icon size={18} className="text-gray-500" />
                  <h3 className="mt-3 text-sm font-bold text-gray-200">{title}</h3>
                  <p className="mt-1.5 text-xs text-gray-500 leading-relaxed">{body}</p>
                </div>
              ))}
            </div>

            <p className="mt-8 text-sm text-gray-500 border-t border-gray-800 pt-6">
              We would rather say this plainly than sell it early: cloud broadcasting is{' '}
              <strong className="text-gray-300">not live yet</strong>. Everything in the sections
              above is. Plans that include cloud hours will start counting them the day it ships.
            </p>
          </div>
        </div>
      </section>

      {/* ── Leaderboard (real data, hidden when empty) ── */}
      {leaderboardData.length > 0 && (
        <section className="py-20 md:py-28 bg-dark-900/40 border-y border-gray-900">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <Trophy size={22} className="text-amber-400" />
              <h2 className="text-2xl md:text-3xl font-black tracking-tight">Top Screamers</h2>
            </div>
            <p className="mt-2 text-sm text-gray-400">
              Live from the platform, refreshed every 30 seconds.
            </p>

            <div className="mt-8 divide-y divide-gray-800 rounded-2xl border border-gray-800 overflow-hidden">
              {leaderboardData.map((entry) => (
                <div
                  key={entry.rank}
                  className="flex items-center gap-4 bg-dark-950/60 px-5 py-4"
                >
                  <span className="w-7 text-center font-black text-gray-500">#{entry.rank}</span>
                  <span className="flex-1 min-w-0 truncate font-semibold">{entry.username}</span>
                  <span className="text-sm text-brand-400 font-bold tabular-nums">
                    {entry.screams.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Pricing ── */}
      <section id="pricing" className="py-20 md:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-black tracking-tight">Simple pricing</h2>
            <p className="mt-3 text-gray-400">
              Local streaming is unlimited on every plan, including the free one.
            </p>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {PRICING_PLANS.map((plan) => {
              const featured = plan.id === 'pro';
              return (
                <div
                  key={plan.id}
                  className={`flex flex-col rounded-2xl border p-6 ${
                    featured
                      ? 'border-brand-500 bg-brand-500/5 ring-1 ring-brand-500/30'
                      : 'border-gray-800 bg-dark-900/60'
                  }`}
                >
                  {featured && (
                    <span className="self-start mb-3 px-2.5 py-1 rounded-full bg-brand-500 text-[10px] font-black uppercase tracking-wider">
                      Most popular
                    </span>
                  )}
                  <h3 className="font-black text-lg">{plan.name}</h3>
                  <p className="mt-1 text-xs text-gray-500 leading-relaxed min-h-[2.5rem]">
                    {plan.description}
                  </p>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-3xl font-black">{formatPrice(plan.price)}</span>
                    <span className="text-sm text-gray-500">/{plan.interval}</span>
                  </div>
                  <ul className="mt-6 space-y-2.5 flex-1">
                    {plan.features.map((f) => (
                      <li key={f} className="flex gap-2 text-sm text-gray-300">
                        <Check size={15} className="shrink-0 mt-0.5 text-brand-400" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <Link
                    to={user ? '/studio' : `/signup${referralCode ? `?ref=${referralCode}` : ''}`}
                    className={`mt-6 text-center px-4 py-2.5 rounded-xl font-bold text-sm transition-colors ${
                      featured
                        ? 'bg-brand-500 hover:bg-brand-600'
                        : 'border border-gray-700 hover:border-gray-500'
                    }`}
                  >
                    {plan.price === 0 ? 'Start free' : `Choose ${plan.name}`}
                  </Link>
                </div>
              );
            })}
          </div>

          <p className="mt-8 text-center text-xs text-gray-500">
            Cloud broadcast hours included with paid plans begin when cloud broadcasting ships. See
            the <a href="#roadmap" className="underline hover:text-gray-300">roadmap</a>.
          </p>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-20 md:py-28 border-t border-gray-900">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <Sparkles size={26} className="mx-auto text-brand-400" />
          <h2 className="mt-5 text-3xl md:text-4xl font-black tracking-tight">
            Open a tab. Go live.
          </h2>
          <p className="mt-3 text-gray-400">
            Nothing to install. Bring a phone and a link to whatever you are covering.
          </p>
          <button
            onClick={goStudio}
            className="mt-8 inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-brand-500 hover:bg-brand-600 font-bold transition-colors"
          >
            <Play size={18} fill="currentColor" />
            {user ? 'Open the Studio' : 'Start streaming free'}
          </button>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-900 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-brand-500 flex items-center justify-center font-black text-sm">
                  S
                </div>
                <span className="font-black tracking-tight">CHATSCREAM</span>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                A live production studio for the field. Houston, TX.
              </p>
            </div>

            <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-400">
              <a href="#studio" className="hover:text-white">
                The Studio
              </a>
              <a href="#field" className="hover:text-white">
                Field Kit
              </a>
              <a href="#pricing" className="hover:text-white">
                Pricing
              </a>
              <Link to="/privacy-policy" className="hover:text-white">
                Privacy
              </Link>
              <Link to="/terms" className="hover:text-white">
                Terms
              </Link>
              {userProfile?.role === 'admin' && (
                <Link to="/admin" className="hover:text-white inline-flex items-center gap-1">
                  <Settings size={13} /> Admin
                </Link>
              )}
            </nav>
          </div>

          <p className="mt-8 pt-6 border-t border-gray-900 text-xs text-gray-600">
            © {new Date().getFullYear()} ChatScream. Local device streaming is unlimited on all
            plans. Cloud broadcasting is in development and not yet available.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
