import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { PRICING_PLANS, formatPrice } from '../services/stripe';
import {
  Monitor, Play, Zap, Globe, MessageSquare, Shield, ChevronRight,
  Check, Star, Users, Video, Sparkles, ArrowRight, Menu, X,
  Youtube, Facebook, Twitch, Radio, Clock, Cloud, BarChart3
} from 'lucide-react';

const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const referralCode = searchParams.get('ref') || '';

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleGetStarted = () => {
    if (user) {
      navigate('/studio');
    } else {
      navigate(referralCode ? `/signup?ref=${referralCode}` : '/signup');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-dark-900 via-dark-900 to-black text-white">
      {/* SEO Meta Tags are in index.html */}

      {/* Navigation */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? 'bg-dark-900/95 backdrop-blur-lg shadow-xl' : 'bg-transparent'
      }`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 md:h-20">
            {/* Logo */}
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
              <div className="bg-gradient-to-br from-brand-500 to-brand-600 p-2 rounded-xl shadow-lg shadow-brand-500/30">
                <Monitor size={24} className="text-white" />
              </div>
              <span className="text-xl font-bold">
                StreamHub<span className="text-brand-400">Pro</span>
              </span>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-gray-300 hover:text-white transition-colors">Features</a>
              <a href="#chat-stream" className="text-gray-300 hover:text-white transition-colors">Chat Stream</a>
              <a href="#pricing" className="text-gray-300 hover:text-white transition-colors">Pricing</a>
              <a href="#testimonials" className="text-gray-300 hover:text-white transition-colors">Reviews</a>
            </div>

            {/* CTA Buttons */}
            <div className="hidden md:flex items-center gap-4">
              {user ? (
                <button
                  onClick={() => navigate('/studio')}
                  className="px-6 py-2.5 bg-brand-600 hover:bg-brand-500 rounded-full font-semibold transition-all shadow-lg shadow-brand-600/30 flex items-center gap-2"
                >
                  Open Studio <ArrowRight size={18} />
                </button>
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
                    Start Free Trial <ArrowRight size={18} />
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
              <a href="#features" className="block text-gray-300 hover:text-white py-2" onClick={() => setMobileMenuOpen(false)}>Features</a>
              <a href="#chat-stream" className="block text-gray-300 hover:text-white py-2" onClick={() => setMobileMenuOpen(false)}>Chat Stream</a>
              <a href="#pricing" className="block text-gray-300 hover:text-white py-2" onClick={() => setMobileMenuOpen(false)}>Pricing</a>
              <a href="#testimonials" className="block text-gray-300 hover:text-white py-2" onClick={() => setMobileMenuOpen(false)}>Reviews</a>
              <div className="pt-4 border-t border-gray-700 space-y-3">
                {user ? (
                  <button
                    onClick={() => { navigate('/studio'); setMobileMenuOpen(false); }}
                    className="w-full px-6 py-3 bg-brand-600 rounded-full font-semibold"
                  >
                    Open Studio
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => { navigate('/login'); setMobileMenuOpen(false); }}
                      className="w-full px-6 py-3 border border-gray-600 rounded-full font-medium"
                    >
                      Sign In
                    </button>
                    <button
                      onClick={() => { handleGetStarted(); setMobileMenuOpen(false); }}
                      className="w-full px-6 py-3 bg-brand-600 rounded-full font-semibold"
                    >
                      Start Free Trial
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 md:pt-40 md:pb-32 overflow-hidden">
        {/* Background Effects */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-brand-600/20 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl animate-pulse delay-1000" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-4xl mx-auto">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600/20 border border-brand-500/30 rounded-full text-brand-400 text-sm font-medium mb-6 animate-fade-in">
              <Sparkles size={16} />
              <span>Now in Beta - Get 7 Days Free!</span>
            </div>

            {/* Headline */}
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold leading-tight mb-6">
              Professional Streaming
              <span className="block bg-gradient-to-r from-brand-400 via-brand-500 to-purple-500 bg-clip-text text-transparent">
                Made Simple
              </span>
            </h1>

            {/* Subheadline */}
            <p className="text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto mb-8">
              Stream to YouTube, Facebook, Twitch and more simultaneously.
              With our revolutionary <strong className="text-white">Chat Stream</strong> feature,
              send live messages directly to your viewers' screens!
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
              <button
                onClick={handleGetStarted}
                className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 rounded-full font-bold text-lg transition-all shadow-xl shadow-brand-600/30 flex items-center justify-center gap-2 group"
              >
                <Play size={20} fill="currentColor" />
                Start Streaming Free
                <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform" />
              </button>
              <button
                onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
                className="w-full sm:w-auto px-8 py-4 border border-gray-600 hover:border-gray-500 rounded-full font-semibold text-gray-300 hover:text-white transition-all flex items-center justify-center gap-2"
              >
                <Video size={20} />
                Watch Demo
              </button>
            </div>

            {/* Social Proof */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-6 text-gray-400 text-sm">
              <div className="flex items-center gap-2">
                <div className="flex -space-x-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-600 to-gray-700 border-2 border-dark-900" />
                  ))}
                </div>
                <span>2,500+ Streamers</span>
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

      {/* Features Section */}
      <section id="features" className="py-20 md:py-32 bg-dark-800/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Everything You Need to
              <span className="text-brand-400"> Stream Like a Pro</span>
            </h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              Professional streaming tools without the complexity. Set up in minutes, not hours.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                icon: Globe,
                title: 'Multi-Platform Streaming',
                description: 'Stream to YouTube, Facebook, Twitch, and any custom RTMP destination simultaneously.',
                color: 'from-blue-500 to-cyan-500'
              },
              {
                icon: MessageSquare,
                title: 'Chat Stream',
                description: 'Send live text messages that appear directly on your viewers\' screens. A game-changer for engagement!',
                color: 'from-purple-500 to-pink-500',
                highlight: true
              },
              {
                icon: Sparkles,
                title: 'AI-Powered Tools',
                description: 'Generate stream titles, descriptions, and chat responses with Claude AI assistance.',
                color: 'from-amber-500 to-orange-500'
              },
              {
                icon: Video,
                title: 'Professional Layouts',
                description: '5 studio layouts including Picture-in-Picture, Split Screen, and Newsroom style.',
                color: 'from-green-500 to-emerald-500'
              },
              {
                icon: Shield,
                title: 'Brand Customization',
                description: 'Lower thirds, scrolling tickers, custom colors, and studio backgrounds.',
                color: 'from-red-500 to-rose-500'
              },
              {
                icon: Cloud,
                title: 'Cloud Recording',
                description: 'Record your streams and access them from anywhere. Never lose content again.',
                color: 'from-indigo-500 to-violet-500'
              }
            ].map((feature, index) => (
              <div
                key={index}
                className={`relative p-6 rounded-2xl border transition-all hover:scale-105 ${
                  feature.highlight
                    ? 'bg-gradient-to-br from-purple-900/50 to-pink-900/30 border-purple-500/50 shadow-xl shadow-purple-500/10'
                    : 'bg-dark-800/50 border-gray-800 hover:border-gray-700'
                }`}
              >
                {feature.highlight && (
                  <div className="absolute -top-3 left-4 px-3 py-1 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full text-xs font-bold">
                    UNIQUE FEATURE
                  </div>
                )}
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-4 shadow-lg`}>
                  <feature.icon size={24} className="text-white" />
                </div>
                <h3 className="text-xl font-bold mb-2">{feature.title}</h3>
                <p className="text-gray-400">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Chat Stream Feature Highlight */}
      <section id="chat-stream" className="py-20 md:py-32 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-purple-900/20 via-transparent to-pink-900/20" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600/20 border border-purple-500/30 rounded-full text-purple-400 text-sm font-medium mb-6">
                <MessageSquare size={16} />
                <span>Revolutionary Feature</span>
              </div>

              <h2 className="text-3xl md:text-5xl font-bold mb-6">
                Introducing
                <span className="block bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">
                  Chat Stream
                </span>
              </h2>

              <p className="text-lg text-gray-300 mb-8">
                Send live text messages that appear directly on your viewers' screens!
                Perfect for announcements, shoutouts, Q&A sessions, and real-time engagement.
              </p>

              <ul className="space-y-4 mb-8">
                {[
                  'Messages appear as beautiful overlays on the stream',
                  'AI-powered auto-responses for viewer questions',
                  'Customizable styles and animations',
                  'Moderation tools to keep chat clean',
                  'Works on all platforms simultaneously'
                ].map((item, index) => (
                  <li key={index} className="flex items-center gap-3 text-gray-300">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0">
                      <Check size={14} className="text-white" />
                    </div>
                    {item}
                  </li>
                ))}
              </ul>

              <button
                onClick={handleGetStarted}
                className="px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 rounded-full font-bold text-lg transition-all shadow-xl shadow-purple-600/30 flex items-center gap-2"
              >
                Try Chat Stream Free
                <ArrowRight size={20} />
              </button>
            </div>

            {/* Chat Stream Demo Visual */}
            <div className="relative">
              <div className="aspect-video bg-gradient-to-br from-dark-800 to-dark-900 rounded-2xl border border-gray-800 shadow-2xl overflow-hidden">
                {/* Simulated Stream Preview */}
                <div className="absolute inset-0 bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-24 h-24 rounded-full bg-gray-700 mx-auto mb-4" />
                    <div className="text-gray-500 text-sm">Live Stream Preview</div>
                  </div>
                </div>

                {/* Chat Stream Message */}
                <div className="absolute bottom-8 left-4 right-4 animate-slide-up">
                  <div className="bg-gradient-to-r from-purple-600/90 to-pink-600/90 backdrop-blur-sm px-6 py-4 rounded-xl shadow-2xl">
                    <div className="flex items-center gap-2 mb-1">
                      <MessageSquare size={16} className="text-purple-200" />
                      <span className="text-purple-200 text-xs font-medium">CHAT STREAM</span>
                    </div>
                    <p className="text-white font-semibold text-lg">
                      Welcome to the stream! Drop a 🔥 if you're excited!
                    </p>
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
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 md:py-32 bg-dark-800/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Simple, Transparent
              <span className="text-brand-400"> Pricing</span>
            </h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              Start free, upgrade when you're ready. No hidden fees, cancel anytime.
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
                  plan.popular
                    ? 'bg-gradient-to-br from-brand-900/50 to-brand-800/30 border-brand-500/50 shadow-xl shadow-brand-500/10 scale-105 z-10'
                    : 'bg-dark-800/50 border-gray-800 hover:border-gray-700'
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-brand-500 to-brand-600 rounded-full text-xs font-bold whitespace-nowrap">
                    MOST POPULAR
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
                    plan.popular
                      ? 'bg-brand-600 hover:bg-brand-500 text-white shadow-lg shadow-brand-600/30'
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
      <section id="testimonials" className="py-20 md:py-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Loved by
              <span className="text-brand-400"> Streamers</span>
            </h2>
            <p className="text-gray-400 text-lg">
              Join thousands of content creators who've upgraded their streaming game.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                name: 'Alex Gaming',
                role: 'Twitch Partner',
                quote: 'Chat Stream is a game-changer! My viewers love seeing messages pop up on screen. Engagement is through the roof!',
                rating: 5
              },
              {
                name: 'Sarah Creates',
                role: 'YouTube Creator',
                quote: 'Finally, a streaming tool that\'s powerful but not overwhelming. Set up in 5 minutes and I\'m live on 3 platforms!',
                rating: 5
              },
              {
                name: 'Mike Productions',
                role: 'Event Streamer',
                quote: 'The professional layouts and branding options make my corporate streams look amazing. Worth every penny.',
                rating: 5
              }
            ].map((testimonial, index) => (
              <div
                key={index}
                className="p-6 rounded-2xl bg-dark-800/50 border border-gray-800"
              >
                <div className="flex items-center gap-1 mb-4">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star key={i} size={16} fill="#f59e0b" className="text-amber-500" />
                  ))}
                </div>
                <p className="text-gray-300 mb-6 italic">"{testimonial.quote}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-500 to-brand-600" />
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

      {/* CTA Section */}
      <section className="py-20 md:py-32 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-brand-900/30 via-purple-900/30 to-brand-900/30" />

        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-5xl font-bold mb-6">
            Ready to Level Up Your
            <span className="block text-brand-400">Streaming Game?</span>
          </h2>
          <p className="text-lg text-gray-300 mb-8 max-w-2xl mx-auto">
            Join thousands of creators who've discovered the easiest way to stream professionally.
            Start your free trial today - no credit card required.
          </p>
          <button
            onClick={handleGetStarted}
            className="px-10 py-5 bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 rounded-full font-bold text-xl transition-all shadow-2xl shadow-brand-600/30 flex items-center gap-3 mx-auto"
          >
            <Play size={24} fill="currentColor" />
            Start Streaming Now
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
                <div className="bg-brand-600 p-1.5 rounded-lg">
                  <Monitor size={18} className="text-white" />
                </div>
                <span className="text-lg font-bold">StreamHub<span className="text-brand-400">Pro</span></span>
              </div>
              <p className="text-gray-400 text-sm">
                Professional streaming made simple. Stream to multiple platforms with ease.
              </p>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li><a href="#features" className="hover:text-white transition-colors">Features</a></li>
                <li><a href="#pricing" className="hover:text-white transition-colors">Pricing</a></li>
                <li><a href="#chat-stream" className="hover:text-white transition-colors">Chat Stream</a></li>
                <li><a href="#" className="hover:text-white transition-colors">API</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li><a href="#" className="hover:text-white transition-colors">About</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Blog</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Careers</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Contact</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li><a href="#" className="hover:text-white transition-colors">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Terms of Service</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Cookie Policy</a></li>
              </ul>
            </div>
          </div>

          <div className="pt-8 border-t border-gray-800 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-gray-400 text-sm">
              © 2024 StreamHub Pro. All rights reserved.
            </p>
            <div className="flex items-center gap-4">
              <a href="#" className="text-gray-400 hover:text-white transition-colors">
                <Youtube size={20} />
              </a>
              <a href="#" className="text-gray-400 hover:text-white transition-colors">
                <Facebook size={20} />
              </a>
              <a href="#" className="text-gray-400 hover:text-white transition-colors">
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
