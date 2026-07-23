import { FC, ReactNode, useEffect, useRef, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import AuthStatusBanner from './AuthStatusBanner';

const AuthLoader: FC = () => (
  <div className="min-h-screen bg-dark-900 flex items-center justify-center">
    <div className="text-center">
      <div className="w-12 h-12 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
      <p className="text-gray-400 text-sm">Loading studio...</p>
    </div>
  </div>
);

interface ProtectedRouteProps {
  children: ReactNode;
}

// Check localStorage for a stored session â if one exists and isn't expired,
// we treat the user as authenticated immediately without waiting for the auth hook.
const hasStoredSession = (): boolean => {
  try {
    const raw = localStorage.getItem('chatscream.auth.session');
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (!parsed?.token || !parsed?.user?.uid) return false;
    if (!parsed.expiresAt) return true; // no expiry = treat as valid
    return new Date(parsed.expiresAt).getTime() > Date.now();
  } catch {
    return false;
  }
};

const ProtectedRoute: FC<ProtectedRouteProps> = ({ children }) => {
  const { user, loading, configError } = useAuth();
  const location = useLocation();

  // If we have a stored session, render immediately â do not wait for auth hook
  const [sessionExists] = useState(() => hasStoredSession());

  // Hard fallback: after 3s, stop blocking no matter what
  const [timedOut, setTimedOut] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!loading || user || sessionExists) return;
    timerRef.current = setTimeout(() => setTimedOut(true), 3000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [loading, user, sessionExists]);

  // Config error â show banner
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

  // User is confirmed authenticated â render immediately
  if (user) return <>{children}</>;

  // We have a stored session â render immediately, auth context will catch up
  if (sessionExists) return <>{children}</>;

  // Still loading and haven't timed out â show spinner briefly
  if (loading && !timedOut) return <AuthLoader />;

  // No user, no stored session, not loading or timed out â redirect to login
  return <Navigate to="/login" replace state={{ from: location }} />;
};

export default ProtectedRoute;
