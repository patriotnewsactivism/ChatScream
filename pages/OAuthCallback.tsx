import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { handleOAuthCallback } from '../services/oauthService';
import { Megaphone, AlertCircle, CheckCircle2, Loader2, ArrowRight } from 'lucide-react';
import AuthStatusBanner from '../components/AuthStatusBanner';

const OAuthCallback: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading, refreshProfile } = useAuth();

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState<string>('Completing connection...');

  const platformLabel = useMemo(() => {
    const platform = searchParams.get('platform') || '';
    return platform ? platform : 'platform';
  }, [searchParams]);

  useEffect(() => {
    const run = async () => {
      if (loading) return;
      if (!user) {
        setStatus('error');
        setMessage('You must be signed in to connect this account. Please sign in and try again.');
        return;
      }

      setStatus('loading');
      setMessage(`Connecting ${platformLabel}...`);

      const result = await handleOAuthCallback(searchParams);
      if (!result.success) {
        setStatus('error');
        setMessage(result.error || 'Failed to connect account.');
        return;
      }

      try {
        await refreshProfile();
      } catch (err) {
        console.warn('Failed to refresh profile after OAuth:', err);
      }

      setStatus('success');
      setMessage(`Connected ${result.platform || platformLabel}. You can close this window.`);

      try {
        if (window.opener && window.opener !== window) {
          window.opener.postMessage({ type: 'oauth:connected', platform: result.platform }, window.location.origin);
          window.setTimeout(() => window.close(), 800);
        } else {
          window.setTimeout(() => navigate('/studio'), 800);
        }
      } catch (err) {
        // ignore
      }
    };

    run();
  }, [loading, user, platformLabel, searchParams, navigate, refreshProfile]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-dark-900 via-dark-900 to-black text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-dark-800/80 border border-gray-700 rounded-2xl shadow-2xl p-6">
        <AuthStatusBanner />
        <div className="flex items-center gap-2 mb-4">
          <div className="bg-gradient-to-br from-brand-500 to-brand-600 p-2 rounded-xl shadow-lg shadow-brand-500/30">
            <Megaphone size={20} className="text-white" />
          </div>
          <div className="font-bold text-lg">
            Chat<span className="text-brand-400">Scream</span>
          </div>
        </div>

        <div className="flex items-start gap-3">
          {status === 'loading' && <Loader2 className="animate-spin text-brand-400 mt-0.5" size={18} />}
          {status === 'success' && <CheckCircle2 className="text-emerald-400 mt-0.5" size={18} />}
          {status === 'error' && <AlertCircle className="text-red-400 mt-0.5" size={18} />}
          <div className="flex-1">
            <h1 className="text-base font-semibold mb-1">Connection status</h1>
            <p className="text-sm text-gray-300">{message}</p>
          </div>
        </div>

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={() => navigate('/studio')}
            className="flex-1 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 font-semibold flex items-center justify-center gap-2"
          >
            Back to Studio <ArrowRight size={16} />
          </button>
        </div>

        <p className="mt-3 text-xs text-gray-500">
          If this is a popup window, it should close automatically after connecting.
        </p>
      </div>
    </div>
  );
};

export default OAuthCallback;
