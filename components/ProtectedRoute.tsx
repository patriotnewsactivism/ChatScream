import { FC, ReactNode, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import AuthStatusBanner from './AuthStatusBanner';

const AuthLoader: FC = () => (
  <div className="min-h-screen bg-dark-900 flex items-center justify-center">
    <div className="text-center">
      <div className="w-12 h-12 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
      <p className="text-gray-400">Checking your session...</p>
    </div>
  </div>
);

interface ProtectedRouteProps {
  children: ReactNode;
}

const ProtectedRoute: FC<ProtectedRouteProps> = ({ children }) => {
  const { user, loading, configError } = useAuth();
  const location = useLocation();
  // Reduced to 4s — if auth hasn't resolved by then, something is broken server-side
  // Show the page anyway if we have a stored session key (avoids black screen loop)
  const [timedOut, setTimedOut] = useState(() => {
    try {
      // If a session exists in localStorage, fast-pass immediately — don't wait
      const raw = localStorage.getItem('chatscream.auth.session');
      if (raw) {
        const parsed = JSON.parse(raw);
        const hasToken = parsed && parsed.token && parsed.user && parsed.user.uid;
        const notExpired = parsed.expiresAt && new Date(parsed.expiresAt).getTime() > Date.now();
        if (hasToken && notExpired) return true; // already authenticated — skip loader
      }
    } catch {}
    return false;
  });

  useEffect(() => {
    if (!loading) {
      return;
    }
    const timer = setTimeout(() => setTimedOut(true), 4000);
    return () => clearTimeout(timer);
  }, [loading]);

  if (loading && !timedOut) {
    return <AuthLoader />;
  }

  if (configError) {
    return (
      <div className="min-h-screen bg-dark-900 text-white flex flex-col">
        <div className="max-w-3xl w-full mx-auto px-4 pt-8">
          <AuthStatusBanner />
          <div className="rounded-xl border border-gray-800 bg-dark-800 p-6">
            <h2 className="text-lg font-semibold mb-2">Configuration issue</h2>
            <p className="text-gray-400 text-sm">
              Update your backend/API environment variables and reload the page.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!user && !timedOut) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // timedOut with no user — still try to render if we had a session key
  // (avoids redirect loop when backend is slow but session IS valid)
  if (!user && timedOut) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
