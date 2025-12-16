import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import AuthStatusBanner from './AuthStatusBanner';

const AuthLoader: React.FC = () => (
  <div className="min-h-screen bg-dark-900 flex items-center justify-center">
    <div className="text-center">
      <div className="w-12 h-12 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
      <p className="text-gray-400">Checking your session...</p>
    </div>
  </div>
);

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, loading, configError } = useAuth();
  const location = useLocation();

  if (loading) {
    return <AuthLoader />;
  }

  if (configError) {
    return (
      <div className="min-h-screen bg-dark-900 text-white flex flex-col">
        <div className="max-w-3xl w-full mx-auto px-4 pt-8">
          <AuthStatusBanner />
          <div className="rounded-xl border border-gray-800 bg-dark-800 p-6">
            <h2 className="text-lg font-semibold mb-2">Configuration issue</h2>
            <p className="text-gray-400 text-sm">Update your Firebase environment variables and reload the page.</p>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
