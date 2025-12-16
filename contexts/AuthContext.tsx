import React, { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { IdTokenResult, User } from 'firebase/auth';
import {
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
  firebaseConfigError,
} from '../services/firebase';

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  sessionToken: string | null;
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  signUp: (email: string, password: string, displayName: string, referralCode?: string) => Promise<void>;
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
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const tokenRefreshTimeout = useRef<number>();
  const configError = firebaseConfigError;

  const clearScheduledRefresh = () => {
    if (tokenRefreshTimeout.current) {
      window.clearTimeout(tokenRefreshTimeout.current);
      tokenRefreshTimeout.current = undefined;
    }
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

    const scheduleTokenRefresh = (tokenResult: IdTokenResult, firebaseUser: User) => {
      clearScheduledRefresh();
      const expirationMs = new Date(tokenResult.expirationTime).getTime();
      const refreshInMs = Math.max(expirationMs - Date.now() - 5 * 60 * 1000, 5 * 60 * 1000);

      tokenRefreshTimeout.current = window.setTimeout(async () => {
        try {
          const nextToken = await firebaseUser.getIdToken(true);
          if (!isMounted) return;
          setSessionToken(nextToken);
        } catch (err: any) {
          if (!isMounted) return;
          setError('Session expired. Please sign in again.');
          setUser(null);
          setUserProfile(null);
          setSessionToken(null);
        }
      }, refreshInMs);
    };

    (async () => {
      try {
        await completeRedirectSignIn();
      } catch (err: any) {
        const message = getErrorMessage(err?.code);
        setError(message);
      }
    })();

    const unsubscribe = onIdTokenChange(async (firebaseUser) => {
      setLoading(true);
      setUser(firebaseUser);
      setSessionToken(null);
      clearScheduledRefresh();

      if (firebaseUser) {
        try {
          try {
            await syncAccess();
          } catch (err) {
            console.warn('Access sync skipped:', err);
          }

          const tokenResult = await firebaseUser.getIdTokenResult(true);
          if (!isMounted) return;
          setSessionToken(tokenResult.token);

          const profile = await getUserProfile(firebaseUser.uid);
          setUserProfile(applyLocalAccessOverrides(profile, firebaseUser.email));
          ensureAffiliateForSignedInUser().catch(() => {});
          scheduleTokenRefresh(tokenResult, firebaseUser);
        } catch (err: any) {
          if (!isMounted) return;
          const message = getErrorMessage(err?.code);
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
    referralCode?: string
  ): Promise<void> => {
    setError(null);
    setLoading(true);
    guardConfig();
    try {
      await signUpWithEmail(email, password, displayName, referralCode);
    } catch (err: any) {
      const message = getErrorMessage(err.code);
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
      const message = getErrorMessage(err.code);
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
      const message = getErrorMessage(err.code);
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
      const message = getErrorMessage(err.code);
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
      const message = getErrorMessage(err.code);
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
      const message = getErrorMessage(err.code);
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
      const message = getErrorMessage(err.code);
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
      setUserProfile(null);
      setSessionToken(null);
      clearScheduledRefresh();
      setUser(null);
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
      const message = getErrorMessage(err.code);
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
        const message = getErrorMessage(err?.code);
        setError(message);
      }
    }
  };

  const refreshSession = async (): Promise<string | null> => {
    guardConfig();
    if (!user) return null;

    try {
      const token = await user.getIdToken(true);
      setSessionToken(token);
      return token;
    } catch (err: any) {
      const message = getErrorMessage(err?.code);
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

// Helper function to convert Firebase error codes to user-friendly messages
function getErrorMessage(errorCode?: string): string {
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
