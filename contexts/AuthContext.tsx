import React, { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { ApiRequestError } from '../services/apiClient';
import {
  AuthTokenResult,
  AuthUser,
  onIdTokenChange,
  signUpWithEmail,
  signInWithEmail,
  signInWithGoogle,
  signInWithFacebook,
  signInWithGithub,
  signInWithTwitter,
  signInWithApple,
  completeRedirectSignIn,
  syncAccess,
  logOut,
  resetPassword,
  getUserProfile,
  UserProfile,
  applyLocalAccessOverrides,
  ensureAffiliateForSignedInUser,
  backendConfigError,
  clearLocalSession,
} from '../services/backend';

interface AuthContextType {
  user: AuthUser | null;
  userProfile: UserProfile | null;
  sessionToken: string | null;
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  signUp: (
    email: string,
    password: string,
    displayName: string,
    referralCode?: string,
  ) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInGoogle: (referralCode?: string) => Promise<{ didRedirect: boolean }>;
  signInFacebook: (referralCode?: string) => Promise<{ didRedirect: boolean }>;
  signInGithub: (referralCode?: string) => Promise<{ didRedirect: boolean }>;
  signInTwitter: (referralCode?: string) => Promise<{ didRedirect: boolean }>;
  signInApple: (referralCode?: string) => Promise<{ didRedirect: boolean }>;
  logout: () => Promise<void>;
  sendResetEmail: (email: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshSession: () => Promise<string | null>;
  clearError: () => void;
  configError: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const tokenRefreshTimeout = useRef<number | undefined>(undefined);
  const configError = backendConfigError;

  const clearScheduledRefresh = () => {
    if (tokenRefreshTimeout.current) {
      window.clearTimeout(tokenRefreshTimeout.current);
      tokenRefreshTimeout.current = undefined;
    }
  };

  const clearAuthState = () => {
    clearScheduledRefresh();
    clearLocalSession();
    setUser(null);
    setUserProfile(null);
    setSessionToken(null);
  };

  const guardConfig = () => {
    if (configError) {
      setError(configError);
      throw new Error(configError);
    }
  };

  useEffect(() => {
    if (configError) {
      setLoading(false);
      setError(configError);
      return;
    }

    let isMounted = true;

    const scheduleTokenRefresh = (tokenResult: AuthTokenResult, backendUser: AuthUser) => {
      clearScheduledRefresh();
      const expirationMs = new Date(tokenResult.expirationTime).getTime();
      const refreshInMs = Math.max(expirationMs - Date.now() - 5 * 60 * 1000, 5 * 60 * 1000);

      tokenRefreshTimeout.current = window.setTimeout(async () => {
        try {
          const nextToken = await backendUser.getIdToken(false);
          if (!isMounted) return;
          setSessionToken(nextToken);
        } catch (err: any) {
          if (!isMounted) return;
          setError('Session expired. Please sign in again.');
          clearAuthState();
        }
      }, refreshInMs);
    };

    (async () => {
      try {
        await completeRedirectSignIn();
      } catch (err: any) {
        const message = getErrorMessage(err);
        clearAuthState();
        setError(message);
      }
    })();

    const unsubscribe = onIdTokenChange(async (backendUser) => {
      setLoading(true);
      setUser(backendUser);
      setSessionToken(null);
      clearScheduledRefresh();

      if (backendUser) {
        try {
          try {
            await syncAccess();
          } catch (err) {
            console.warn('Access sync skipped:', err);
          }

          const tokenResult = await backendUser.getIdTokenResult(false);
          if (!isMounted) return;
          setSessionToken(tokenResult.token);

          const profile = await getUserProfile(backendUser.uid);
          setUserProfile(applyLocalAccessOverrides(profile, backendUser.email));
          ensureAffiliateForSignedInUser().catch(() => {});
          scheduleTokenRefresh(tokenResult, backendUser);
        } catch (err: any) {
          if (!isMounted) return;
          if (err instanceof ApiRequestError && err.status === 401) {
            clearAuthState();
          }
          const message = getErrorMessage(err);
          setError(message);
        }
      } else {
        setUserProfile(null);
      }

      if (isMounted) {
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      clearScheduledRefresh();
      unsubscribe();
    };
  }, []);

  const signUp = async (
    email: string,
    password: string,
    displayName: string,
    referralCode?: string,
  ): Promise<void> => {
    setError(null);
    setLoading(true);
    guardConfig();
    try {
      await signUpWithEmail(email, password, displayName, referralCode);
    } catch (err: any) {
      const message = getErrorMessage(err);
      clearAuthState();
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  };

  const signIn = async (email: string, password: string): Promise<void> => {
    setError(null);
    setLoading(true);
    guardConfig();
    try {
      await signInWithEmail(email, password);
    } catch (err: any) {
      const message = getErrorMessage(err);
      clearAuthState();
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  };

  const signInGoogle = async (referralCode?: string): Promise<{ didRedirect: boolean }> => {
    setError(null);
    setLoading(true);
    guardConfig();
    try {
      return await signInWithGoogle(referralCode);
    } catch (err: any) {
      const message = getErrorMessage(err);
      clearAuthState();
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  };

  const signInFacebook = async (referralCode?: string): Promise<{ didRedirect: boolean }> => {
    setError(null);
    setLoading(true);
    guardConfig();
    try {
      return await signInWithFacebook(referralCode);
    } catch (err: any) {
      const message = getErrorMessage(err);
      clearAuthState();
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  };

  const signInGithub = async (referralCode?: string): Promise<{ didRedirect: boolean }> => {
    setError(null);
    setLoading(true);
    guardConfig();
    try {
      return await signInWithGithub(referralCode);
    } catch (err: any) {
      const message = getErrorMessage(err);
      clearAuthState();
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  };

  const signInTwitter = async (referralCode?: string): Promise<{ didRedirect: boolean }> => {
    setError(null);
    setLoading(true);
    guardConfig();
    try {
      return await signInWithTwitter(referralCode);
    } catch (err: any) {
      const message = getErrorMessage(err);
      clearAuthState();
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  };

  const signInApple = async (referralCode?: string): Promise<{ didRedirect: boolean }> => {
    setError(null);
    setLoading(true);
    guardConfig();
    try {
      return await signInWithApple(referralCode);
    } catch (err: any) {
      const message = getErrorMessage(err);
      clearAuthState();
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    setError(null);
    guardConfig();
    try {
      await logOut();
      clearAuthState();
    } catch (err: any) {
      setError('Failed to log out. Please try again.');
      throw err;
    }
  };

  const sendResetEmail = async (email: string): Promise<void> => {
    setError(null);
    guardConfig();
    try {
      await resetPassword(email);
    } catch (err: any) {
      const message = getErrorMessage(err);
      setError(message);
      throw new Error(message);
    }
  };

  const refreshProfile = async (): Promise<void> => {
    guardConfig();
    if (user) {
      try {
        const profile = await getUserProfile(user.uid);
        setUserProfile(applyLocalAccessOverrides(profile, user.email));
      } catch (err: any) {
        const message = getErrorMessage(err);
        setError(message);
      }
    }
  };

  const refreshSession = async (): Promise<string | null> => {
    guardConfig();
    if (!user) return null;

    try {
      const token = await user.getIdToken(false);
      setSessionToken(token);
      return token;
    } catch (err: any) {
      const message = getErrorMessage(err);
      setError(message);
      throw new Error(message);
    }
  };

  const clearError = (): void => {
    setError(null);
  };

  const value: AuthContextType = {
    user,
    userProfile,
    sessionToken,
    loading,
    error,
    isAuthenticated: !!user,
    signUp,
    signIn,
    signInGoogle,
    signInFacebook,
    signInGithub,
    signInTwitter,
    signInApple,
    logout,
    sendResetEmail,
    refreshProfile,
    refreshSession,
    clearError,
    configError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Helper function to convert auth errors to user-friendly messages.
function getErrorMessage(error?: unknown): string {
  if (error instanceof ApiRequestError) {
    const message = String(error.message || '').trim();
    const isNotFoundEdge = /NOT_FOUND/i.test(message) || error.status === 404;
    if (isNotFoundEdge) {
      return 'Auth API route not found. Set VITE_API_BASE_URL to your backend API domain (or deploy the Node API at the same origin).';
    }
    if (error.status === 401 && /missing authorization token/i.test(message)) {
      return 'Session not established yet. Please try signing in again.';
    }
    if (error.status >= 500) {
      return 'Backend API is currently unavailable. Please try again in a moment.';
    }
    return error.message || 'Request failed. Please try again.';
  }
  if (error instanceof Error) {
    const normalized = error.message.trim();
    if (/failed to fetch|network\s*error|network request/i.test(normalized)) {
      return 'Cannot reach the backend API. Start the API server and try again.';
    }
    if (normalized) {
      return normalized;
    }
  }

  const errorCode =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: unknown }).code || '')
      : '';

  switch (errorCode) {
    case 'auth/email-already-in-use':
      return 'This email is already registered. Please sign in instead.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/operation-not-allowed':
      return 'This sign-in method is not enabled. Please contact support.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters long.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Please contact support.';
    case 'auth/user-not-found':
      return 'No account found with this email. Please sign up.';
    case 'auth/wrong-password':
      return 'Incorrect password. Please try again.';
    case 'auth/invalid-credential':
      return 'Invalid email or password. Please check and try again.';
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please try again later.';
    case 'auth/popup-closed-by-user':
      return 'Sign-in cancelled. Please try again.';
    case 'auth/network-request-failed':
      return 'Network error. Please check your connection.';
    default:
      return 'An error occurred. Please try again.';
  }
}

export default AuthProvider;
