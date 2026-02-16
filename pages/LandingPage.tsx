import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import AuthStatusBanner from '../components/AuthStatusBanner';
import { PRICING_PLANS, formatPrice } from '../services/stripe';
import {
  Megaphone,
  Play,
  Zap,
  Globe,
  MessageSquare,
  Shield,
  ShieldCheck,
  ChevronRight,
  Check,
  CheckCircle2,
  Star,
  Users,
  Video,
  Sparkles,
  ArrowRight,
  Menu,
  X,
  Youtube,
  Facebook,
  Twitch,
  Radio,
  Clock,
  Cloud,
  CloudCog,
  BarChart3,
  DollarSign,
  Trophy,
  Crown,
  Volume2,
  Wifi,
  WifiOff,
  HardDrive,
  Server,
  Database,
  Upload,
  TrendingUp,
  Gift,
  AlertTriangle,
  MapPin,
  Smartphone,
  Monitor,
  Laptop,
  Camera,
  Hash,
  Copy,
  ExternalLink,
  Infinity,
  LogOut,
  Settings,
} from 'lucide-react';

const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeScreamTier, setActiveScreamTier] = useState(0);

  const referralCode = searchParams.get('ref') || '';

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Animate through scream tiers for demo
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveScreamTier((prev) => (prev + 1) % 3);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleGetStarted = () => {
    if (user) {
      navigate('/dashboard');
    } else {
      navigate(referralCode ? `/signup?ref=${referralCode}` : '/signup');
    }
  };

  const handleSignOut = async () => {
    setMobileMenuOpen(false);
    try {
      await logout();
      navigate('/');
    } catch (err) {
      console.warn('Sign out failed:', err);
    }
  };

  const canAccessAdmin = (user?.email || '').trim().toLowerCase() === 'mreardon@wtpnews.org';

  const screamTiers = [
    {
      amount: '$5',
      effect: 'Standard Scream',
      color: 'from-green-500 to-emerald-500',
      description: 'Visual alert + Text-to-Speech',
    },
    {
      amount: '$10-20',
      effect: 'Loud Scream',
      color: 'from-yellow-500 to-orange-500',
      description: 'Larger overlay, louder SFX, animation',
    },
    {
      amount: '$50+',
      effect: 'MAXIMUM SCREAM',
      color: 'from-red-500 to-pink-500',
      description: 'Screen takeover, chaotic visuals!',
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-dark-900 via-dark-900 to-black text-white">
      {/* Navigation */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled ? 'bg-dark-900/95 backdrop-blur-lg shadow-xl' : 'bg-transparent'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 md:h-20">
            {/* Logo */}
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
              <div className="bg-gradient-to-br from-brand-500 to-brand-600 p-2 rounded-xl shadow-lg shadow-brand-500/30 animate-glow">
                <Megaphone size={24} className="text-white" />
              </div>
              <span className="text-xl font-bold">
                Chat<span className="text-brand-400">Scream</span>
              </span>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-8">
              <a href="#cloud-power" className="text-gray-300 hover:text-white transition-colors">
                Cloud Power
              </a>
              <a href="#chat-screamer" className="text-gray-300 hover:text-white transition-colors">
                Chat Screamer
              </a>
              <a href="#leaderboard" className="text-gray-300 hover:text-white transition-colors">
                Leaderboard
              </a>
              <a href="#pricing" className="text-gray-300 hover:text-white transition-colors">
                Pricing
              </a>
            </div>

            {/* CTA Buttons */}
            <div className="hidden md:flex items-center gap-4">
              {user ? (
                <>
                  <button
                    onClick={() => navigate('/dashboard')}
                    className="px-5 py-2.5 bg-brand-600 hover:bg-brand-500 rounded-full font-semibold transition-all shadow-lg shadow-brand-600/30 flex items-center gap-2"
                  >
                    Dashboard <ArrowRight size={18} />
                  </button>
                  <button
                    onClick={() => navigate('/studio')}
                    className="px-5 py-2.5 border border-gray-600 hover:border-gray-500 rounded-full font-semibold text-gray-200 hover:text-white transition-all flex items-center gap-2"
                  >
                    Studio <Radio size={18} />
                  </button>
                  {canAccessAdmin && (
                    <button
                      onClick={() => navigate('/admin')}
                      className="px-5 py-2.5 border border-gray-600 hover:border-gray-500 rounded-full font-semibold text-gray-200 hover:text-white transition-all flex items-center gap-2"
                    >
                      <Settings size={18} /> Admin
                    </button>
                  )}
                  <button
                    onClick={handleSignOut}
                    className="px-5 py-2.5 bg-red-600 hover:bg-red-500 rounded-full font-semibold transition-all shadow-lg shadow-red-900/30 flex items-center gap-2"
                  >
                    <LogOut size={18} /> Sign Out
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => navigate('/login')}
                    className="px-5 py-2.5 text-gray-300 hover:text-white transition-colors font-medium"
                  >
                    Sign In
                  </button>
                  <button
                    onClick={handleGetStarted}
                    className="px-6 py-2.5 bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 rounded-full font-semibold transition-all shadow-lg shadow-brand-600/30 flex items-center gap-2"
                  >
                    Start Screaming <Megaphone size={18} />
                  </button>
                </>
              )}
            </div>

            {/* Mobile Menu Button */}
            <button
              className="md:hidden p-2 text-gray-300"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-dark-800/95 backdrop-blur-lg border-t border-gray-800">
            <div className="px-4 py-6 space-y-4">
              <a
                href="#cloud-power"
                className="block text-gray-300 hover:text-white py-2"
                onClick={() => setMobileMenuOpen(false)}
              >
                Cloud Power
              </a>
              <a
                href="#chat-screamer"
                className="block text-gray-300 hover:text-white py-2"
                onClick={() => setMobileMenuOpen(false)}
              >
                Chat Screamer
              </a>
              <a
                href="#leaderboard"
                className="block text-gray-300 hover:text-white py-2"
                onClick={() => setMobileMenuOpen(false)}
              >
                Leaderboard
              </a>
              <a
                href="#pricing"
                className="block text-gray-300 hover:text-white py-2"
                onClick={() => setMobileMenuOpen(false)}
              >
                Pricing
              </a>
              <div className="pt-4 border-t border-gray-700 space-y-3">
                {user ? (
                  <>
                    <button
                      onClick={() => {
                        navigate('/dashboard');
                        setMobileMenuOpen(false);
                      }}
                      className="w-full px-6 py-3 bg-brand-600 rounded-full font-semibold"
                    >
                      Open Dashboard
                    </button>
                    <button
                      onClick={() => {
                        navigate('/studio');
                        setMobileMenuOpen(false);
                      }}
                      className="w-full px-6 py-3 border border-gray-600 rounded-full font-semibold"
                    >
                      Open Studio
                    </button>
                    {canAccessAdmin && (
                      <button
                        onClick={() => {
                          navigate('/admin');
                          setMobileMenuOpen(false);
                        }}
                        className="w-full px-6 py-3 border border-gray-600 rounded-full font-semibold flex items-center justify-center gap-2"
                      >
                        <Settings size={18} /> Admin Portal
                      </button>
                    )}
                    <button
                      onClick={handleSignOut}
                      className="w-full px-6 py-3 bg-red-600 rounded-full font-semibold flex items-center justify-center gap-2"
                    >
                      <LogOut size={18} /> Sign Out
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        navigate('/login');
                        setMobileMenuOpen(false);
                      }}
                      className="w-full px-6 py-3 border border-gray-600 rounded-full font-medium"
                    >
                      Sign In
                    </button>
                    <button
                      onClick={() => {
                        handleGetStarted();
                        setMobileMenuOpen(false);
                      }}
                      className="w-full px-6 py-3 bg-brand-600 rounded-full font-semibold"
                    >
                      Start Screaming
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </nav>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        <AuthStatusBanner />
      </div>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 md:pt-40 md:pb-32 overflow-hidden">
        {/* Background Effects */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-brand-600/20 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl animate-pulse delay-1000" />
          <div className="absolute top-1/2 right-1/3 w-64 h-64 bg-pink-600/15 rounded-full blur-3xl animate-pulse delay-500" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-4xl mx-auto">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600/20 border border-brand-500/30 rounded-full text-brand-400 text-sm font-medium mb-6 animate-fade-in">
              <Zap size={16} />
              <span>Zero Bandwidth Streaming - Your Upload, Our Power!</span>
            </div>

            {/* Headline */}
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold leading-tight mb-6">
              Stream Without Limits.
              <span className="block bg-gradient-to-r from-brand-400 via-pink-500 to-purple-500 bg-clip-text text-transparent">
                Scream for Attention.
              </span>
            </h1>

            {/* Subheadline */}
            <p className="text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto mb-8">
              Go live with <strong className="text-white">unlimited local device streaming</strong>{' '}
              from your phone, tablet, or desktop. Upgrade anytime for{' '}
              <strong className="text-brand-400">cloud-powered streaming</strong> that uses ZERO of
              your bandwidth. Let viewers send donation-triggered{' '}
              <strong className="text-white">"Screams"</strong> that take over the screen for
              maximum engagement!
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
              <button
                onClick={handleGetStarted}
                className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 rounded-full font-bold text-lg transition-all shadow-xl shadow-brand-600/30 flex items-center justify-center gap-2 group"
              >
                <Megaphone size={20} />
                Start Screaming Free
                <ChevronRight
                  size={20}
                  className="group-hover:translate-x-1 transition-transform"
                />
              </button>
              <button
                onClick={() =>
                  document.getElementById('chat-screamer')?.scrollIntoView({ behavior: 'smooth' })
                }
                className="w-full sm:w-auto px-8 py-4 border border-gray-600 hover:border-gray-500 rounded-full font-semibold text-gray-300 hover:text-white transition-all flex items-center justify-center gap-2"
              >
                <Video size={20} />
                See It In Action
              </button>
            </div>

            {/* Zero Bandwidth Callout */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-6 mb-8">
              <div className="flex items-center gap-3 px-5 py-3 bg-gradient-to-r from-green-900/30 to-emerald-900/30 border border-green-500/30 rounded-xl">
                <WifiOff size={24} className="text-green-400" />
                <div className="text-left">
                  <div className="font-bold text-green-400">Zero Bandwidth</div>
                  <div className="text-xs text-gray-400">Stream uses our servers, not yours</div>
                </div>
              </div>
              <div className="flex items-center gap-3 px-5 py-3 bg-gradient-to-r from-purple-900/30 to-pink-900/30 border border-purple-500/30 rounded-xl">
                <Cloud size={24} className="text-purple-400" />
                <div className="text-left">
                  <div className="font-bold text-purple-400">Cloud Powered</div>
                  <div className="text-xs text-gray-400">Constant high-bitrate CBR streaming</div>
                </div>
              </div>
            </div>

            {/* Social Proof */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-6 text-gray-400 text-sm">
              <div className="flex items-center gap-2">
                <div className="flex -space-x-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div
                      key={i}
                      className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-pink-500 border-2 border-dark-900"
                    />
                  ))}
                </div>
                <span>3,500+ Screamers</span>
              </div>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Star key={i} size={16} fill="#f59e0b" className="text-amber-500" />
                ))}
                <span className="ml-1">4.9/5 Rating</span>
              </div>
            </div>
          </div>

          {/* Platform Logos */}
          <div className="mt-16 flex flex-wrap items-center justify-center gap-8 opacity-60">
            <div className="flex items-center gap-2 text-gray-400">
              <Youtube size={32} className="text-red-500" />
              <span className="font-medium">YouTube</span>
            </div>
            <div className="flex items-center gap-2 text-gray-400">
              <Facebook size={32} className="text-blue-500" />
              <span className="font-medium">Facebook</span>
            </div>
            <div className="flex items-center gap-2 text-gray-400">
              <Twitch size={32} className="text-purple-500" />
              <span className="font-medium">Twitch</span>
            </div>
            <div className="flex items-center gap-2 text-gray-400">
              <Radio size={32} className="text-brand-500" />
              <span className="font-medium">Custom RTMP</span>
            </div>
          </div>
        </div>
      </section>

      {/* Stream From Any Device Section - NEW */}
      <section
        id="any-device"
        className="py-20 md:py-32 bg-gradient-to-b from-dark-900 to-dark-800/50 relative overflow-hidden"
      >
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-brand-600/10 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600/20 border border-brand-500/30 rounded-full text-brand-400 text-sm font-medium mb-6">
              <Infinity size={16} />
              <span>Unlimited Local Streaming</span>
            </div>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
              Stream From <span className="text-brand-400">Any Device</span>
            </h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              Use your phone, tablet, laptop, or desktop as a camera source. Go live instantly with
              unlimited local device streaming - no extra software needed!
            </p>
          </div>

          {/* Device Grid */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
            {[
              {
                icon: Smartphone,
                title: 'Phone Camera',
                description:
                  'Turn your smartphone into a professional camera. Perfect for on-the-go streaming.',
                color: 'from-green-500 to-emerald-500',
              },
              {
                icon: Laptop,
                title: 'Laptop Webcam',
                description:
                  'Use your built-in webcam or external USB cameras without any configuration.',
                color: 'from-blue-500 to-cyan-500',
              },
              {
                icon: Monitor,
                title: 'Desktop Setup',
                description:
                  'Full studio setup support with multiple camera sources and screen sharing.',
                color: 'from-purple-500 to-pink-500',
              },
              {
                icon: Camera,
                title: 'Pro Cameras',
                description: 'Connect DSLR, mirrorless, and action cameras via capture cards.',
                color: 'from-orange-500 to-red-500',
              },
            ].map((device, index) => (
              <div
                key={index}
                className="relative group p-6 rounded-2xl bg-dark-800/50 border border-gray-800 hover:border-gray-700 transition-all hover:transform hover:-translate-y-1"
              >
                <div
                  className={`w-14 h-14 rounded-xl bg-gradient-to-br ${device.color} flex items-center justify-center mb-4 shadow-lg group-hover:scale-110 transition-transform`}
                >
                  <device.icon size={28} className="text-white" />
                </div>
                <h3 className="font-bold text-white mb-2">{device.title}</h3>
                <p className="text-gray-400 text-sm">{device.description}</p>
              </div>
            ))}
          </div>

          {/* Feature Highlights */}
          <div className="bg-gradient-to-br from-dark-800/80 to-dark-900/80 rounded-2xl border border-gray-800 p-8 md:p-12">
            <div className="grid md:grid-cols-2 gap-8 items-center">
              <div>
                <h3 className="text-2xl font-bold mb-6">Why Local Device Streaming?</h3>
                <div className="space-y-4">
                  {[
                    {
                      title: 'Zero Latency Preview',
                      description: 'See exactly what your viewers see in real-time',
                    },
                    {
                      title: 'Browser-Based Studio',
                      description: 'No downloads, no plugins - just open and stream',
                    },
                    {
                      title: 'Multi-Device Support',
                      description: 'Switch cameras or add multiple sources instantly',
                    },
                    {
                      title: 'Mobile Optimized',
                      description: 'Full-featured streaming studio on your phone',
                    },
                  ].map((item, index) => (
                    <div key={index} className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-brand-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Check size={14} className="text-brand-400" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-white">{item.title}</h4>
                        <p className="text-gray-400 text-sm">{item.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="relative">
                <div className="aspect-video bg-gradient-to-br from-dark-700 to-dark-800 rounded-xl border border-gray-700 shadow-2xl overflow-hidden">
                  {/* Simulated mobile streaming UI */}
                  <div className="absolute inset-0 p-4">
                    <div className="h-full bg-gradient-to-br from-gray-800/50 to-gray-900/50 rounded-lg flex items-center justify-center relative">
                      {/* Simulated camera feed */}
                      <div className="absolute inset-2 bg-gradient-to-br from-brand-900/30 to-purple-900/30 rounded animate-pulse" />

                      {/* Live indicator */}
                      <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1 bg-red-600 rounded-full z-10">
                        <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                        <span className="text-white text-xs font-bold">LIVE</span>
                      </div>

                      {/* Mobile controls overlay */}
                      <div className="absolute bottom-4 left-4 right-4 flex items-center justify-center gap-4 z-10">
                        <div className="w-12 h-12 rounded-full bg-white/10 backdrop-blur flex items-center justify-center">
                          <Camera size={20} className="text-white" />
                        </div>
                        <div className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center shadow-lg shadow-red-500/30">
                          <div className="w-6 h-6 bg-white rounded" />
                        </div>
                        <div className="w-12 h-12 rounded-full bg-white/10 backdrop-blur flex items-center justify-center">
                          <Monitor size={20} className="text-white" />
                        </div>
                      </div>

                      {/* Phone frame */}
                      <Smartphone size={48} className="text-gray-600 absolute" />
                    </div>
                  </div>
                </div>

                {/* Floating badges */}
                <div className="absolute -top-4 -right-4 px-4 py-2 bg-gradient-to-r from-brand-500 to-brand-600 rounded-full text-white text-sm font-bold shadow-lg animate-bounce-subtle">
                  Unlimited!
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Cloud Power Section */}
      <section id="cloud-power" className="py-20 md:py-32 bg-dark-800/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-600/20 border border-cyan-500/30 rounded-full text-cyan-400 text-sm font-medium mb-6">
              <Cloud size={16} />
              <span>The Cloud Engine</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Your Stream, <span className="text-cyan-400">Our Servers</span>
            </h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              Upload your content to our cloud. We handle the heavy lifting with constant,
              high-bitrate streaming - regardless of YOUR internet connection.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-12 items-center">
            {/* Visual Demo */}
            <div className="relative">
              <div className="bg-gradient-to-br from-dark-800 to-dark-900 rounded-2xl border border-gray-800 p-8">
                {/* Cloud Architecture Visualization */}
                <div className="space-y-6">
                  {/* User Upload */}
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 bg-gradient-to-br from-gray-700 to-gray-800 rounded-xl flex items-center justify-center">
                      <Upload size={28} className="text-gray-400" />
                    </div>
                    <ArrowRight className="text-gray-600" />
                    <div className="flex-1 h-3 bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full w-1/3 bg-gradient-to-r from-red-500 to-orange-500 rounded-full animate-pulse" />
                    </div>
                    <span className="text-xs text-gray-500">Your Upload</span>
                  </div>

                  {/* Cloud Processing */}
                  <div className="flex justify-center">
                    <div className="w-24 h-24 bg-gradient-to-br from-cyan-600/30 to-purple-600/30 rounded-2xl border border-cyan-500/30 flex items-center justify-center animate-glow">
                      <Cloud size={40} className="text-cyan-400" />
                    </div>
                  </div>

                  {/* Output Streams */}
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-gray-500">Our Output</span>
                    <div className="flex-1 h-3 bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full w-full bg-gradient-to-r from-green-500 to-emerald-500 rounded-full" />
                    </div>
                    <ArrowRight className="text-gray-600" />
                    <div className="flex gap-2">
                      <Youtube size={20} className="text-red-500" />
                      <Facebook size={20} className="text-blue-500" />
                      <Twitch size={20} className="text-purple-500" />
                    </div>
                  </div>
                </div>

                {/* Stats */}
                <div className="mt-8 grid grid-cols-3 gap-4">
                  <div className="text-center p-3 bg-dark-900/50 rounded-xl">
                    <div className="text-2xl font-bold text-cyan-400">0%</div>
                    <div className="text-xs text-gray-500">Your Bandwidth</div>
                  </div>
                  <div className="text-center p-3 bg-dark-900/50 rounded-xl">
                    <div className="text-2xl font-bold text-green-400">8 Mbps</div>
                    <div className="text-xs text-gray-500">Constant CBR</div>
                  </div>
                  <div className="text-center p-3 bg-dark-900/50 rounded-xl">
                    <div className="text-2xl font-bold text-purple-400">4K</div>
                    <div className="text-xs text-gray-500">Max Quality</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Features List */}
            <div className="space-y-6">
              {[
                {
                  icon: HardDrive,
                  title: 'Cloud Storage Integration',
                  description:
                    'Connect Google Drive, OneDrive, or Dropbox. Stream directly from your cloud files.',
                  color: 'from-blue-500 to-cyan-500',
                },
                {
                  icon: WifiOff,
                  title: 'Zero-Bandwidth Promise',
                  description:
                    'Upload once, stream forever. Your home internet is never the bottleneck.',
                  color: 'from-green-500 to-emerald-500',
                },
                {
                  icon: Zap,
                  title: 'Constant High-Bitrate',
                  description:
                    'Our servers output constant bitrate (CBR) streams regardless of your connection quality.',
                  color: 'from-yellow-500 to-orange-500',
                },
                {
                  icon: Globe,
                  title: 'Global Edge Network',
                  description:
                    'Stream from the server closest to your audience for minimal latency.',
                  color: 'from-purple-500 to-pink-500',
                },
              ].map((feature, index) => (
                <div
                  key={index}
                  className="flex gap-4 p-4 bg-dark-800/50 rounded-xl border border-gray-800 hover:border-gray-700 transition-all"
                >
                  <div
                    className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center flex-shrink-0`}
                  >
                    <feature.icon size={24} className="text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white mb-1">{feature.title}</h3>
                    <p className="text-gray-400 text-sm">{feature.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Chat Screamer Feature Highlight */}
      <section id="chat-screamer" className="py-20 md:py-32 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-brand-900/20 via-transparent to-pink-900/20" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600/20 border border-brand-500/30 rounded-full text-brand-400 text-sm font-medium mb-6">
              <Megaphone size={16} />
              <span>The USP - Unique Selling Point</span>
            </div>
            <h2 className="text-3xl md:text-5xl font-bold mb-4">
              The{' '}
              <span className="bg-gradient-to-r from-brand-400 to-pink-500 bg-clip-text text-transparent">
                Chat Screamer
              </span>
            </h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              Donation-triggered alerts that DEMAND attention. The more they donate, the more
              OBNOXIOUS it gets!
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Interactive Demo */}
            <div className="relative order-2 lg:order-1">
              <div className="aspect-video bg-gradient-to-br from-dark-800 to-dark-900 rounded-2xl border border-gray-800 shadow-2xl overflow-hidden">
                {/* Simulated Stream Preview */}
                <div className="absolute inset-0 bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-24 h-24 rounded-full bg-gray-700 mx-auto mb-4" />
                    <div className="text-gray-500 text-sm">Live Stream Preview</div>
                  </div>
                </div>

                {/* Scream Alert Demo */}
                <div
                  className={`absolute inset-0 flex items-center justify-center transition-all duration-500 ${
                    activeScreamTier === 2
                      ? 'bg-gradient-to-br from-red-600/80 to-pink-600/80 backdrop-blur-sm'
                      : ''
                  }`}
                >
                  <div
                    className={`transform transition-all duration-500 ${
                      activeScreamTier === 0
                        ? 'scale-100'
                        : activeScreamTier === 1
                          ? 'scale-110'
                          : 'scale-125 animate-shake'
                    }`}
                  >
                    <div
                      className={`px-8 py-6 rounded-2xl shadow-2xl bg-gradient-to-r ${screamTiers[activeScreamTier].color} animate-scream`}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <DollarSign
                          size={activeScreamTier === 2 ? 32 : 24}
                          className="text-white"
                        />
                        <span className="text-white/80 text-sm font-medium">SCREAM ALERT!</span>
                      </div>
                      <div
                        className={`font-bold text-white ${
                          activeScreamTier === 0
                            ? 'text-xl'
                            : activeScreamTier === 1
                              ? 'text-2xl'
                              : 'text-4xl'
                        }`}
                      >
                        {screamTiers[activeScreamTier].amount} -{' '}
                        {screamTiers[activeScreamTier].effect}
                      </div>
                      <div className="text-white/70 text-sm mt-2">
                        "{activeScreamTier === 2 ? 'LETS GOOOOO!!!' : 'Great stream!'}"
                      </div>
                    </div>
                  </div>
                </div>

                {/* Live Badge */}
                <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 bg-red-600 rounded-full">
                  <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                  <span className="text-white text-xs font-bold">LIVE</span>
                </div>

                {/* Viewer Count */}
                <div className="absolute top-4 right-4 flex items-center gap-2 px-3 py-1.5 bg-black/50 backdrop-blur rounded-full">
                  <Users size={14} />
                  <span className="text-white text-xs font-medium">1,234 viewers</span>
                </div>
              </div>

              {/* Tier Selector */}
              <div className="flex justify-center gap-4 mt-6">
                {screamTiers.map((tier, index) => (
                  <button
                    key={index}
                    onClick={() => setActiveScreamTier(index)}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                      activeScreamTier === index
                        ? `bg-gradient-to-r ${tier.color} text-white shadow-lg`
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    {tier.amount}
                  </button>
                ))}
              </div>
            </div>

            {/* Feature Description */}
            <div className="order-1 lg:order-2">
              <h3 className="text-2xl font-bold mb-6">
                How It Works: <span className="text-brand-400">Send a Scream</span>
              </h3>

              <div className="space-y-6">
                {[
                  {
                    tier: '$5 - $10',
                    title: 'Standard Scream',
                    description:
                      'A tasteful visual alert with Text-to-Speech reading your message aloud.',
                    icon: Volume2,
                    color: 'from-green-500 to-emerald-500',
                  },
                  {
                    tier: '$10 - $20',
                    title: 'Loud Scream',
                    description:
                      'Larger overlay, louder sound effects, distinct animation that grabs attention.',
                    icon: MessageSquare,
                    color: 'from-yellow-500 to-orange-500',
                  },
                  {
                    tier: '$50+',
                    title: 'MAXIMUM SCREAM',
                    description:
                      'Full screen takeover effect with chaotic audio/visuals. TOS compliant but intentionally obnoxious!',
                    icon: AlertTriangle,
                    color: 'from-red-500 to-pink-500',
                  },
                ].map((item, index) => (
                  <div
                    key={index}
                    className="flex gap-4 p-4 bg-dark-800/50 rounded-xl border border-gray-800"
                  >
                    <div
                      className={`w-12 h-12 rounded-xl bg-gradient-to-br ${item.color} flex items-center justify-center flex-shrink-0`}
                    >
                      <item.icon size={24} className="text-white" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-bold bg-gradient-to-r ${item.color} text-white`}
                        >
                          {item.tier}
                        </span>
                        <h4 className="font-bold text-white">{item.title}</h4>
                      </div>
                      <p className="text-gray-400 text-sm">{item.description}</p>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={handleGetStarted}
                className="mt-8 px-8 py-4 bg-gradient-to-r from-brand-600 to-pink-600 hover:from-brand-500 hover:to-pink-500 rounded-full font-bold text-lg transition-all shadow-xl shadow-brand-600/30 flex items-center gap-2"
              >
                <Megaphone size={20} />
                Enable Chat Screamer
                <ArrowRight size={20} />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Scream Leaderboard Section */}
      <section id="leaderboard" className="py-20 md:py-32 bg-dark-800/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-600/20 border border-yellow-500/30 rounded-full text-yellow-400 text-sm font-medium mb-6">
              <Trophy size={16} />
              <span>Gamification</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              The Weekly <span className="text-yellow-400">Scream Leaderboard</span>
            </h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              Compete for the crown! The streamer with the most Chat Screams each week wins a FREE
              month of Professional tier.
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Leaderboard Preview */}
            <div className="bg-gradient-to-br from-dark-800 to-dark-900 rounded-2xl border border-gray-800 p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <Trophy className="text-yellow-400" size={20} />
                  This Week's Top Screamers
                </h3>
                <span className="text-xs text-gray-500">Resets Sunday</span>
              </div>

              <div className="space-y-3">
                {[
                  {
                    rank: 1,
                    name: 'StreamerKing',
                    screams: 247,
                    badge: Crown,
                    color: 'from-yellow-500 to-amber-500',
                  },
                  {
                    rank: 2,
                    name: 'GamerGirl99',
                    screams: 189,
                    badge: Trophy,
                    color: 'from-gray-400 to-gray-500',
                  },
                  {
                    rank: 3,
                    name: 'ProPlayer',
                    screams: 156,
                    badge: Trophy,
                    color: 'from-amber-700 to-amber-800',
                  },
                  { rank: 4, name: 'ContentCreator', screams: 98, badge: null, color: null },
                  { rank: 5, name: 'LiveStreamer', screams: 67, badge: null, color: null },
                ].map((player) => (
                  <div
                    key={player.rank}
                    className={`flex items-center gap-4 p-4 rounded-xl transition-all ${
                      player.rank === 1
                        ? 'bg-gradient-to-r from-yellow-900/30 to-amber-900/30 border border-yellow-500/30'
                        : 'bg-dark-900/50 hover:bg-dark-900'
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                        player.color
                          ? `bg-gradient-to-br ${player.color} text-white`
                          : 'bg-gray-700 text-gray-400'
                      }`}
                    >
                      {player.rank}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{player.name}</span>
                        {player.badge && <player.badge size={16} className="text-yellow-400" />}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-brand-400">{player.screams}</div>
                      <div className="text-xs text-gray-500">screams</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 p-4 bg-gradient-to-r from-green-900/30 to-emerald-900/30 border border-green-500/30 rounded-xl">
                <div className="flex items-center gap-3">
                  <Gift className="text-green-400" size={24} />
                  <div>
                    <div className="font-bold text-green-400">Weekly Prize</div>
                    <div className="text-sm text-gray-400">
                      1 FREE month of Professional ($59 value)
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* How It Works */}
            <div>
              <h3 className="text-2xl font-bold mb-6">How to Win</h3>

              <div className="space-y-4">
                {[
                  {
                    step: '1',
                    title: 'Receive Screams',
                    description:
                      'Every donation $5+ triggers a Chat Scream and counts towards your total.',
                  },
                  {
                    step: '2',
                    title: 'Climb the Ranks',
                    description:
                      'The leaderboard tracks total Scream QUANTITY, not dollar amount. More engagement = higher rank.',
                  },
                  {
                    step: '3',
                    title: 'Win Weekly',
                    description:
                      'Top streamer each week automatically receives a credit for one free month of Professional tier.',
                  },
                ].map((item, index) => (
                  <div key={index} className="flex gap-4">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-500 to-amber-500 flex items-center justify-center font-bold text-white flex-shrink-0">
                      {item.step}
                    </div>
                    <div>
                      <h4 className="font-bold text-white mb-1">{item.title}</h4>
                      <p className="text-gray-400 text-sm">{item.description}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-8 p-4 bg-gradient-to-r from-purple-900/30 to-pink-900/30 border border-purple-500/30 rounded-xl">
                <div className="flex items-center gap-3">
                  <TrendingUp className="text-purple-400" size={24} />
                  <div>
                    <div className="font-bold text-purple-400">Pro Tip</div>
                    <div className="text-sm text-gray-400">
                      Encourage smaller, frequent donations over single large ones for leaderboard
                      success!
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 md:py-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Simple, Transparent
              <span className="text-brand-400"> Pricing</span>
            </h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              Start free, upgrade when you're ready. The Professional tier unlocks advanced Chat
              Screamer customization.
            </p>
            {referralCode && (
              <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-green-600/20 border border-green-500/30 rounded-full text-green-400 text-sm font-medium">
                <Check size={16} />
                <span>Referral code applied: {referralCode.toUpperCase()} - Extended trial!</span>
              </div>
            )}
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {PRICING_PLANS.map((plan) => (
              <div
                key={plan.id}
                className={`relative p-6 rounded-2xl border transition-all ${
                  plan.id === 'pro'
                    ? 'bg-gradient-to-br from-brand-900/50 to-pink-900/30 border-brand-500/50 shadow-xl shadow-brand-500/10 scale-105 z-10'
                    : 'bg-dark-800/50 border-gray-800 hover:border-gray-700'
                }`}
              >
                {plan.id === 'pro' && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-brand-500 to-pink-500 rounded-full text-xs font-bold whitespace-nowrap flex items-center gap-1">
                    <Crown size={12} /> INFLUENCER TIER
                  </div>
                )}

                <h3 className="text-xl font-bold mb-2">{plan.name}</h3>
                <p className="text-gray-400 text-sm mb-4">{plan.description}</p>

                <div className="mb-6">
                  <span className="text-4xl font-bold">{formatPrice(plan.price)}</span>
                  <span className="text-gray-400">/{plan.interval}</span>
                </div>

                <ul className="space-y-3 mb-6">
                  {plan.features.slice(0, 6).map((feature, index) => (
                    <li key={index} className="flex items-start gap-2 text-sm text-gray-300">
                      <Check size={16} className="text-brand-400 mt-0.5 flex-shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={handleGetStarted}
                  className={`w-full py-3 rounded-full font-semibold transition-all ${
                    plan.id === 'pro'
                      ? 'bg-gradient-to-r from-brand-600 to-pink-600 hover:from-brand-500 hover:to-pink-500 text-white shadow-lg shadow-brand-600/30'
                      : 'bg-gray-700 hover:bg-gray-600 text-white'
                  }`}
                >
                  {plan.price === 0 ? 'Start Free' : 'Get Started'}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section id="testimonials" className="py-20 md:py-32 bg-dark-800/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Loved by
              <span className="text-brand-400"> Screamers</span>
            </h2>
            <p className="text-gray-400 text-lg">
              Join thousands of content creators making their streams unforgettable.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                name: 'Alex Gaming',
                role: 'Twitch Partner',
                quote:
                  'Chat Screamer is INSANE! My viewers go crazy trying to trigger the Maximum Scream. Donations went up 300%!',
                rating: 5,
              },
              {
                name: 'Sarah Creates',
                role: 'YouTube Creator',
                quote:
                  "Zero bandwidth streaming changed everything. I was dropping frames before, now it's crystal clear 4K every time.",
                rating: 5,
              },
              {
                name: 'Mike Productions',
                role: 'Event Streamer',
                quote:
                  'Won the leaderboard twice now! That free month of Pro paid for itself with the exposure I got.',
                rating: 5,
              },
            ].map((testimonial, index) => (
              <div key={index} className="p-6 rounded-2xl bg-dark-900/50 border border-gray-800">
                <div className="flex items-center gap-1 mb-4">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star key={i} size={16} fill="#f59e0b" className="text-amber-500" />
                  ))}
                </div>
                <p className="text-gray-300 mb-6 italic">"{testimonial.quote}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-500 to-pink-500" />
                  <div>
                    <div className="font-semibold">{testimonial.name}</div>
                    <div className="text-gray-400 text-sm">{testimonial.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Operational Readiness Section */}
      <section className="py-20 md:py-32 bg-dark-800/70">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600/20 border border-emerald-500/30 rounded-full text-emerald-400 text-sm font-medium mb-6">
              <ShieldCheck size={16} />
              <span>Google Cloud Ready</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Deployment Ready out of Houston, TX
            </h2>
            <p className="text-gray-400 text-lg max-w-3xl mx-auto">
              Cloud resources stay linked and validated so you can focus on production testing—no
              guessing whether the VM or database connections are live.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-4 text-sm text-gray-300">
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-dark-900/70 border border-gray-800">
                <Shield size={16} className="text-brand-400" />
                <span>Copyright 2025</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-dark-900/70 border border-gray-800">
                <MapPin size={16} className="text-pink-400" />
                <span>Based in Houston, TX</span>
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl border border-gray-800 bg-dark-900/60">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500/30 to-blue-500/30 flex items-center justify-center">
                    <CloudCog size={24} className="text-cyan-300" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white">Google Cloud Link</h3>
                    <p className="text-sm text-gray-400">Project wiring & IAM verified.</p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 text-xs text-green-400 bg-green-500/10 border border-green-500/30 rounded-full px-2 py-1">
                  <CheckCircle2 size={14} />
                  Linked
                </span>
              </div>
              <ul className="space-y-2 text-sm text-gray-300 pl-1 list-disc list-inside">
                <li>Service accounts scoped for streaming and storage access.</li>
                <li>Audit logging stays on for every rollout checkpoint.</li>
              </ul>
            </div>

            <div className="p-6 rounded-2xl border border-gray-800 bg-dark-900/60">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500/30 to-green-500/30 flex items-center justify-center">
                    <Server size={24} className="text-emerald-300" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white">Compute Engine VM</h3>
                    <p className="text-sm text-gray-400">Provisioned and warmed.</p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 text-xs text-green-400 bg-green-500/10 border border-green-500/30 rounded-full px-2 py-1">
                  <CheckCircle2 size={14} />
                  Ready
                </span>
              </div>
              <ul className="space-y-2 text-sm text-gray-300 pl-1 list-disc list-inside">
                <li>Streaming image baked with health checks passing.</li>
                <li>Ingress locked to studio services for secure testing.</li>
              </ul>
            </div>

            <div className="p-6 rounded-2xl border border-gray-800 bg-dark-900/60">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500/30 to-orange-500/30 flex items-center justify-center">
                    <Database size={24} className="text-amber-300" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white">Database Links</h3>
                    <p className="text-sm text-gray-400">Read/write paths mapped.</p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 text-xs text-green-400 bg-green-500/10 border border-green-500/30 rounded-full px-2 py-1">
                  <CheckCircle2 size={14} />
                  Live
                </span>
              </div>
              <ul className="space-y-2 text-sm text-gray-300 pl-1 list-disc list-inside">
                <li>Backend API and SQL endpoints reachable from the VPC.</li>
                <li>Staging data paths pinned for end-to-end QA runs.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 md:py-32 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-brand-900/30 via-pink-900/30 to-brand-900/30" />

        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-5xl font-bold mb-6">
            Ready to Make Some
            <span className="block bg-gradient-to-r from-brand-400 to-pink-500 bg-clip-text text-transparent">
              Noise?
            </span>
          </h2>
          <p className="text-lg text-gray-300 mb-8 max-w-2xl mx-auto">
            Join thousands of creators using ChatScream to build unforgettable streaming
            experiences. Start free - no credit card required.
          </p>
          <button
            onClick={handleGetStarted}
            className="px-10 py-5 bg-gradient-to-r from-brand-600 to-pink-600 hover:from-brand-500 hover:to-pink-500 rounded-full font-bold text-xl transition-all shadow-2xl shadow-brand-600/30 flex items-center gap-3 mx-auto animate-glow"
          >
            <Megaphone size={24} />
            Start Screaming Now
            <ArrowRight size={24} />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-gray-800 bg-dark-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="bg-gradient-to-br from-brand-500 to-brand-600 p-1.5 rounded-lg">
                  <Megaphone size={18} className="text-white" />
                </div>
                <span className="text-lg font-bold">
                  Chat<span className="text-brand-400">Scream</span>
                </span>
              </div>
              <p className="text-gray-400 text-sm">
                Stream Without Limits. Scream for Attention. Cloud-powered streaming with zero
                bandwidth usage.
              </p>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li>
                  <a href="#cloud-power" className="hover:text-white transition-colors">
                    Cloud Power
                  </a>
                </li>
                <li>
                  <a href="#chat-screamer" className="hover:text-white transition-colors">
                    Chat Screamer
                  </a>
                </li>
                <li>
                  <a href="#leaderboard" className="hover:text-white transition-colors">
                    Leaderboard
                  </a>
                </li>
                <li>
                  <a href="#pricing" className="hover:text-white transition-colors">
                    Pricing
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li>
                  <Link to="/about" className="hover:text-white transition-colors">
                    About
                  </Link>
                </li>
                <li>
                  <Link to="/blog" className="hover:text-white transition-colors">
                    Blog
                  </Link>
                </li>
                <li>
                  <Link to="/careers" className="hover:text-white transition-colors">
                    Careers
                  </Link>
                </li>
                <li>
                  <Link to="/contact" className="hover:text-white transition-colors">
                    Contact
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li>
                  <Link to="/privacy-policy" className="hover:text-white transition-colors">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link to="/terms" className="hover:text-white transition-colors">
                    Terms of Service
                  </Link>
                </li>
                <li>
                  <Link to="/cookie-policy" className="hover:text-white transition-colors">
                    Cookie Policy
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="pt-8 border-t border-gray-800 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-gray-400 text-sm">
              © 2025 ChatScream. Based in Houston, TX. All rights reserved.
            </p>
            <div className="flex items-center gap-4">
              <a
                href="https://www.youtube.com"
                target="_blank"
                rel="noreferrer"
                className="text-gray-400 hover:text-white transition-colors"
              >
                <Youtube size={20} />
              </a>
              <a
                href="https://www.facebook.com"
                target="_blank"
                rel="noreferrer"
                className="text-gray-400 hover:text-white transition-colors"
              >
                <Facebook size={20} />
              </a>
              <a
                href="https://www.twitch.tv"
                target="_blank"
                rel="noreferrer"
                className="text-gray-400 hover:text-white transition-colors"
              >
                <Twitch size={20} />
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
