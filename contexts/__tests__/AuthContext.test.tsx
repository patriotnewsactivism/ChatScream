import { renderHook, act, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { AuthProvider, useAuth } from '../AuthContext';
import type { AuthUser } from '../../services/backend';
import { logOut } from '../../services/backend';

const mockUser = {
  uid: 'user-123',
  email: 'user@example.com',
  getIdTokenResult: vi.fn(async () => ({
    token: 'initial-token',
    expirationTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  })),
  getIdToken: vi.fn(async () => 'refreshed-token'),
} as unknown as Partial<AuthUser>;

const mockProfile = {
  uid: 'user-123',
  email: 'user@example.com',
  displayName: 'Test User',
  createdAt: {} as any,
  subscription: { plan: 'free', status: 'trialing' },
  usage: { cloudHoursUsed: 0 },
  settings: { emailNotifications: true, marketingEmails: true },
};

let tokenChangeHandler: ((user: AuthUser | null) => void) | null = null;

vi.mock('../../services/backend', () => ({
  signUpWithEmail: vi.fn(),
  signInWithEmail: vi.fn(),
  signInWithGoogle: vi.fn(),
  signInWithFacebook: vi.fn(),
  signInWithGithub: vi.fn(),
  signInWithTwitter: vi.fn(),
  signInWithApple: vi.fn(),
  completeRedirectSignIn: vi.fn(async () => ({ processed: false })),
  syncAccess: vi.fn(async () => {}),
  logOut: vi.fn(),
  resetPassword: vi.fn(),
  getUserProfile: vi.fn(async () => mockProfile),
  applyLocalAccessOverrides: vi.fn((profile) => profile),
  ensureAffiliateForSignedInUser: vi.fn(async () => {}),
  backendConfigError: null,
  onIdTokenChange: vi.fn((cb: (user: AuthUser | null) => void) => {
    tokenChangeHandler = cb;
    cb(mockUser as AuthUser);
    return () => {
      tokenChangeHandler = null;
    };
  }),
}));

describe('AuthContext', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('initializes user and session token from auth change', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.user?.uid).toBe('user-123');
    expect(result.current.sessionToken).toBe('initial-token');
    expect(result.current.userProfile?.uid).toBe('user-123');
  });

  it('refreshSession forces a new token fetch', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    mockUser.getIdToken = vi.fn(async () => 'manual-refresh-token');

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.refreshSession();
    });

    expect(mockUser.getIdToken).toHaveBeenCalledWith(true);
    expect(result.current.sessionToken).toBe('manual-refresh-token');
  });

  it('logout clears cached session details', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.logout();
      tokenChangeHandler?.(null);
    });

    expect(logOut).toHaveBeenCalled();
    expect(result.current.user).toBeNull();
    expect(result.current.sessionToken).toBeNull();
  });
});
