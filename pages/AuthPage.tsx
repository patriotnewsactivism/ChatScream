import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getAffiliateByCode } from '../services/firebase';
import {
  Megaphone, Mail, Lock, User, Eye, EyeOff, ArrowRight,
  AlertCircle, Check, Gift, Loader2
} from 'lucide-react';

type AuthMode = 'login' | 'signup' | 'reset';

const AuthPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user, signIn, signUp, signInGoogle, sendResetEmail, loading, error, clearError } = useAuth();

  // Determine mode from URL path
  const getInitialMode = (): AuthMode => {
    if (location.pathname === '/signup') return 'signup';
    if (location.pathname === '/reset-password') return 'reset';
    return 'login';
  };

  const [mode, setMode] = useState<AuthMode>(getInitialMode());
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [referralCode, setReferralCode] = useState(searchParams.get('ref') || '');
  const [referralValid, setReferralValid] = useState<boolean | null>(null);
  const [referralInfo, setReferralInfo] = useState<string>('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Redirect if already logged in
  useEffect(() => {
    if (user && !loading) {
      navigate('/studio');
    }
  }, [user, loading, navigate]);

  // Clear errors when switching modes
  useEffect(() => {
    clearError();
    setSuccess('');
  }, [mode]);

  // Validate referral code
  useEffect(() => {
    const validateReferral = async () => {
      if (referralCode.length >= 3) {
        const affiliate = await getAffiliateByCode(referralCode);
        if (affiliate && affiliate.isActive) {
          setReferralValid(true);
          const bonusDays = 7 + affiliate.bonusTrialDays;
          setReferralInfo(`${affiliate.ownerName} - ${bonusDays} day free trial!`);
        } else {
          setReferralValid(false);
          setReferralInfo('Invalid referral code');
        }
      } else {
        setReferralValid(null);
        setReferralInfo('');
      }
    };

    const debounce = setTimeout(validateReferral, 500);
    return () => clearTimeout(debounce);
  }, [referralCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSuccess('');

    try {
      if (mode === 'login') {
        await signIn(email, password);
        navigate('/studio');
      } else if (mode === 'signup') {
        await signUp(email, password, displayName, referralValid ? referralCode : undefined);
        navigate('/studio');
      } else if (mode === 'reset') {
        await sendResetEmail(email);
        setSuccess('Password reset email sent! Check your inbox.');
        setEmail('');
      }
    } catch (err) {
      // Error is handled by AuthContext
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsSubmitting(true);
    try {
      await signInGoogle(referralValid ? referralCode : undefined);
      navigate('/studio');
    } catch (err) {
      // Error is handled by AuthContext
    } finally {
      setIsSubmitting(false);
    }
  };

  const switchMode = (newMode: AuthMode) => {
    setMode(newMode);
    const path = newMode === 'signup' ? '/signup' : newMode === 'reset' ? '/reset-password' : '/login';
    navigate(path + (referralCode ? `?ref=${referralCode}` : ''));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-dark-900 via-dark-900 to-black flex items-center justify-center p-4">
      {/* Background Effects */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-brand-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center gap-2 cursor-pointer"
            onClick={() => navigate('/')}
          >
            <div className="bg-gradient-to-br from-brand-500 to-brand-600 p-2.5 rounded-xl shadow-lg shadow-brand-500/30">
              <Megaphone size={28} className="text-white" />
            </div>
            <span className="text-2xl font-bold">
              Chat<span className="text-brand-400">Scream</span>
            </span>
          </div>
        </div>

        {/* Auth Card */}
        <div className="bg-dark-800/80 backdrop-blur-xl border border-gray-800 rounded-2xl p-8 shadow-2xl">
          {/* Header */}
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold mb-2">
              {mode === 'login' && 'Welcome Back'}
              {mode === 'signup' && 'Create Account'}
              {mode === 'reset' && 'Reset Password'}
            </h1>
            <p className="text-gray-400 text-sm">
              {mode === 'login' && 'Sign in to access your streaming studio'}
              {mode === 'signup' && 'Start your free trial today'}
              {mode === 'reset' && 'We\'ll send you a reset link'}
            </p>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start gap-3 animate-fade-in">
              <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={18} />
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Success Alert */}
          {success && (
            <div className="mb-6 p-4 bg-green-500/10 border border-green-500/30 rounded-xl flex items-start gap-3 animate-fade-in">
              <Check className="text-green-500 flex-shrink-0 mt-0.5" size={18} />
              <p className="text-green-400 text-sm">{success}</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name Field (Signup Only) */}
            {mode === 'signup' && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Full Name
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="John Doe"
                    required
                    className="w-full bg-dark-900/50 border border-gray-700 rounded-xl py-3 pl-10 pr-4 text-white placeholder-gray-500 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition-all"
                  />
                </div>
              </div>
            )}

            {/* Email Field */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="w-full bg-dark-900/50 border border-gray-700 rounded-xl py-3 pl-10 pr-4 text-white placeholder-gray-500 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition-all"
                />
              </div>
            </div>

            {/* Password Field (Login & Signup) */}
            {mode !== 'reset' && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={6}
                    className="w-full bg-dark-900/50 border border-gray-700 rounded-xl py-3 pl-10 pr-12 text-white placeholder-gray-500 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            )}

            {/* Referral Code (Signup Only) */}
            {mode === 'signup' && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Referral Code <span className="text-gray-500">(optional)</span>
                </label>
                <div className="relative">
                  <Gift className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                  <input
                    type="text"
                    value={referralCode}
                    onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                    placeholder="Enter code for bonus trial"
                    maxLength={10}
                    className={`w-full bg-dark-900/50 border rounded-xl py-3 pl-10 pr-10 text-white placeholder-gray-500 focus:ring-1 outline-none transition-all uppercase ${
                      referralValid === true
                        ? 'border-green-500 focus:border-green-500 focus:ring-green-500'
                        : referralValid === false
                        ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                        : 'border-gray-700 focus:border-brand-500 focus:ring-brand-500'
                    }`}
                  />
                  {referralValid !== null && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {referralValid ? (
                        <Check className="text-green-500" size={18} />
                      ) : (
                        <AlertCircle className="text-red-500" size={18} />
                      )}
                    </div>
                  )}
                </div>
                {referralInfo && (
                  <p className={`mt-1 text-xs ${referralValid ? 'text-green-400' : 'text-red-400'}`}>
                    {referralInfo}
                  </p>
                )}
              </div>
            )}

            {/* Forgot Password Link */}
            {mode === 'login' && (
              <div className="text-right">
                <button
                  type="button"
                  onClick={() => switchMode('reset')}
                  className="text-sm text-brand-400 hover:text-brand-300 transition-colors"
                >
                  Forgot password?
                </button>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting || loading}
              className="w-full py-3.5 bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 rounded-xl font-bold transition-all shadow-lg shadow-brand-600/30 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting || loading ? (
                <>
                  <Loader2 className="animate-spin" size={20} />
                  Processing...
                </>
              ) : (
                <>
                  {mode === 'login' && 'Sign In'}
                  {mode === 'signup' && 'Create Account'}
                  {mode === 'reset' && 'Send Reset Link'}
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          {mode !== 'reset' && (
            <>
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-700" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-4 bg-dark-800 text-gray-400">or continue with</span>
                </div>
              </div>

              {/* Google Sign In */}
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isSubmitting || loading}
                className="w-full py-3 bg-white hover:bg-gray-100 text-gray-900 rounded-xl font-semibold transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Continue with Google
              </button>
            </>
          )}

          {/* Mode Switch */}
          <div className="mt-6 text-center text-sm">
            {mode === 'login' && (
              <p className="text-gray-400">
                Don't have an account?{' '}
                <button
                  onClick={() => switchMode('signup')}
                  className="text-brand-400 hover:text-brand-300 font-medium transition-colors"
                >
                  Sign up free
                </button>
              </p>
            )}
            {mode === 'signup' && (
              <p className="text-gray-400">
                Already have an account?{' '}
                <button
                  onClick={() => switchMode('login')}
                  className="text-brand-400 hover:text-brand-300 font-medium transition-colors"
                >
                  Sign in
                </button>
              </p>
            )}
            {mode === 'reset' && (
              <p className="text-gray-400">
                Remember your password?{' '}
                <button
                  onClick={() => switchMode('login')}
                  className="text-brand-400 hover:text-brand-300 font-medium transition-colors"
                >
                  Sign in
                </button>
              </p>
            )}
          </div>
        </div>

        {/* Terms */}
        {mode === 'signup' && (
          <p className="mt-6 text-center text-xs text-gray-500">
            By creating an account, you agree to our{' '}
            <a href="#" className="text-brand-400 hover:underline">Terms of Service</a>
            {' '}and{' '}
            <a href="#" className="text-brand-400 hover:underline">Privacy Policy</a>
          </p>
        )}
      </div>
    </div>
  );
};

export default AuthPage;
