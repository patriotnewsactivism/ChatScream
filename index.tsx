import "./index.css";
import React, { Suspense, lazy, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import ChunkErrorBoundary from './components/ChunkErrorBoundary';
import ErrorBoundary from './components/ErrorBoundary';
import { setUser as setSentryUser } from './services/sentry';
import LandingPage from './pages/LandingPage';
import AuthPage from './pages/AuthPage';
import ProtectedRoute from './components/ProtectedRoute';
import PWAInstallPrompt from './components/PWAInstallPrompt';

// Lazy load heavy components for code splitting
const Studio = lazy(() => import('./App'));
const CreatorDashboard = lazy(() => import('./pages/CreatorDashboard'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const OAuthCallback = lazy(() => import('./pages/OAuthCallback'));
const GuestPage = lazy(() => import('./pages/GuestPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));
const PrivacyPolicyPage = lazy(() => import('./pages/PrivacyPolicyPage'));
const TermsPage = lazy(() => import('./pages/TermsPage'));
const CookiePolicyPage = lazy(() => import('./pages/CookiePolicyPage'));
const AboutPage = lazy(() => import('./pages/AboutPage'));
const BlogPage = lazy(() => import('./pages/BlogPage'));
const CareersPage = lazy(() => import('./pages/CareersPage'));
const ContactPage = lazy(() => import('./pages/ContactPage'));

// Loading component for Suspense fallback
const PageLoader: React.FC = () => {
  const [slow, setSlow] = React.useState(false);
  React.useEffect(() => {
    const t = setTimeout(() => setSlow(true), 4000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-lg font-bold text-white mb-1">
          Chat<span className="text-brand-400">Scream</span>
        </p>
        {slow ? (
          <p className="text-sm text-gray-500 max-w-xs mx-auto">
            Taking a moment... If this persists,{' '}
            <button
              className="underline text-brand-400"
              onClick={() => window.location.reload()}
            >
              refresh the page
            </button>
            .
          </p>
        ) : (
          <p className="text-gray-500 text-sm">Loading studio...</p>
        )}
      </div>
    </div>
  );
};


// Sentry User Context Provider
const SentryUserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      setSentryUser({
        id: user.uid,
        email: user.email || undefined,
        username: user.displayName || undefined,
      });
    } else {
      setSentryUser({});
    }
  }, [user]);

  return <>{children}</>;
};

// App Router Component with Suspense for lazy-loaded components
const AppRouter: React.FC = () => {
  return (
    <ChunkErrorBoundary>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Public Routes - LandingPage and AuthPage are not lazy for fast initial load */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<AuthPage />} />
          <Route path="/signup" element={<AuthPage />} />
          <Route path="/reset-password" element={<AuthPage />} />
          <Route path="/oauth/callback" element={<OAuthCallback />} />
          <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/cookie-policy" element={<CookiePolicyPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/blog" element={<BlogPage />} />
          <Route path="/careers" element={<CareersPage />} />
          <Route path="/contact" element={<ContactPage />} />

          {/* Protected Routes */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <CreatorDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/studio"
            element={
              <ProtectedRoute>
                <Studio />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <AdminPage />
              </ProtectedRoute>
            }
          />

          {/* Guest camera join page — public, no auth required */}
          <Route path="/guest/:roomId" element={<GuestPage />} />

          {/* Fallback */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </ChunkErrorBoundary>
  );
};

// Main App with Providers and Global Error Boundary
const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <SentryUserProvider>
            <AppRouter />
            <PWAInstallPrompt />
          </SentryUserProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
