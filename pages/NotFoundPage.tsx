import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, LayoutDashboard, Radio, ShieldCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const NotFoundPage: React.FC = () => {
  const location = useLocation();
  const { user } = useAuth();
  const isMaster = (user?.email || '').trim().toLowerCase() === 'mreardon@wtpnews.org';

  return (
    <div className="min-h-screen bg-dark-900 text-white flex items-center justify-center p-6">
      <div className="max-w-lg w-full bg-dark-800 border border-gray-800 rounded-2xl p-6 space-y-4">
        <div>
          <div className="text-xs text-gray-400">404</div>
          <h1 className="text-2xl font-bold">Page not found</h1>
          <p className="text-sm text-gray-400 mt-1 break-all">
            {location.pathname}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Link
            to="/"
            className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 hover:border-brand-500 font-semibold"
          >
            <Home size={18} /> Home
          </Link>
          <Link
            to={user ? '/dashboard' : '/login'}
            className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-brand-600 hover:bg-brand-500 font-semibold"
          >
            <LayoutDashboard size={18} /> Dashboard
          </Link>
          <Link
            to={user ? '/studio' : '/login'}
            className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 hover:border-brand-500 font-semibold"
          >
            <Radio size={18} /> Studio
          </Link>
          {isMaster && (
            <Link
              to="/admin"
              className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 hover:border-brand-500 font-semibold"
            >
              <ShieldCheck size={18} /> Admin
            </Link>
          )}
        </div>

        <p className="text-xs text-gray-500">
          If you just deployed, hard refresh (Ctrl+Shift+R) to clear cached bundles.
        </p>
      </div>
    </div>
  );
};

export default NotFoundPage;

