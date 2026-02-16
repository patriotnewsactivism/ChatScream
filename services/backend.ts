import { ApiRequestError, apiRequest } from './apiClient';

const MASTER_EMAILS = ['mreardon@wtpnews.org'];
const DEFAULT_BETA_TESTERS = ['leroytruth247@gmail.com'];
const PENDING_AUTH_REFERRAL_KEY = 'pending_auth_referral';
const SESSION_STORAGE_KEY = 'chatscream.auth.session';

const normalizeEmail = (email: string) => email.trim().toLowerCase();
const normalizeCode = (value: string) => value.trim().toUpperCase();

const defaultExpirationTime = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();

const isJsdom = () =>
  typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('jsdom');

export type PlanTier = 'free' | 'pro' | 'expert' | 'enterprise';

export interface AuthTokenResult {
  token: string;
  expirationTime: string;
}

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL?: string | null;
  getIdToken: (forceRefresh?: boolean) => Promise<string>;
  getIdTokenResult: (forceRefresh?: boolean) => Promise<AuthTokenResult>;
}

type StoredUser = Omit<AuthUser, 'getIdToken' | 'getIdTokenResult'>;

interface StoredSession {
  token: string | null;
  expiresAt: string;
  user: StoredUser;
}

type AuthListener = (user: AuthUser | null) => void;

const toStringValue = (value: unknown): string => (typeof value === 'string' ? value : '');
const toNullableStringValue = (value: unknown): string | null => {
  const normalized = toStringValue(value).trim();
  return normalized ? normalized : null;
};

const sanitizeDisplayName = (value: string | null, fallbackEmail: string | null) => {
  if (value && value.trim()) return value.trim();
  if (fallbackEmail && fallbackEmail.trim()) return fallbackEmail.trim();
  return 'User';
};

const isMasterEmail = (email?: string | null): boolean => {
  if (!email) return false;
  const normalized = normalizeEmail(email);
  return MASTER_EMAILS.includes(normalized);
};

const parseSessionStorage = (rawValue: string | null): StoredSession | null => {
  if (!rawValue) return null;
  try {
    const parsed = JSON.parse(rawValue) as Partial<StoredSession>;
    if (!parsed || typeof parsed !== 'object') return null;

    const user = parsed.user;
    const uid = toStringValue(user?.uid).trim();
    if (!uid) return null;

    return {
      token: toNullableStringValue(parsed.token),
      expiresAt: toStringValue(parsed.expiresAt).trim() || defaultExpirationTime(),
      user: {
        uid,
        email: toNullableStringValue(user?.email),
        displayName: toNullableStringValue(user?.displayName),
        photoURL: toNullableStringValue(user?.photoURL),
      },
    };
  } catch {
    return null;
  }
};

const readStoredSession = (): StoredSession | null => {
  if (typeof window === 'undefined') return null;
  try {
    return parseSessionStorage(localStorage.getItem(SESSION_STORAGE_KEY));
  } catch {
    return null;
  }
};

const writeStoredSession = (session: StoredSession | null) => {
  if (typeof window === 'undefined') return;
  try {
    if (!session) {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      return;
    }
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // ignore localStorage write failures
  }
};

let currentSession: StoredSession | null = readStoredSession();
const authListeners = new Set<AuthListener>();

const buildAuthUser = (session: StoredSession): AuthUser => ({
  uid: session.user.uid,
  email: session.user.email,
  displayName: session.user.displayName,
  photoURL: session.user.photoURL,
  getIdToken: async (forceRefresh = false) => {
    if (forceRefresh) {
      await refreshSessionToken();
    }
    if (!currentSession) {
      await hydrateSessionFromServer();
    }
    return currentSession?.token || '';
  },
  getIdTokenResult: async (forceRefresh = false) => {
    if (forceRefresh) {
      await refreshSessionToken();
    }
    if (!currentSession) {
      await hydrateSessionFromServer();
    }
    return {
      token: currentSession?.token || '',
      expirationTime: currentSession?.expiresAt || defaultExpirationTime(),
    };
  },
});

const getCurrentAuthUser = (): AuthUser | null =>
  currentSession ? buildAuthUser(currentSession) : null;

const notifyAuthListeners = () => {
  const user = getCurrentAuthUser();
  authListeners.forEach((listener) => {
    try {
      listener(user);
    } catch (err) {
      console.warn('Auth listener error:', err);
    }
  });
};

const setCurrentSession = (session: StoredSession | null) => {
  currentSession = session;
  writeStoredSession(session);
  notifyAuthListeners();
};

const normalizeUserFromPayload = (payload: unknown): StoredUser | null => {
  if (!payload || typeof payload !== 'object') return null;
  const data = payload as Record<string, unknown>;

  const uid = toStringValue(data.uid || data.userId || data.id || data.sub).trim();
  if (!uid) return null;

  const email = toNullableStringValue(data.email || data.emailAddress);
  const displayName = toNullableStringValue(data.displayName || data.name || data.username);
  const photoURL = toNullableStringValue(
    data.photoURL || data.avatarUrl || data.avatar || data.profileImage,
  );

  return {
    uid,
    email,
    displayName: sanitizeDisplayName(displayName, email),
    photoURL,
  };
};

const extractSession = (payload: unknown): StoredSession | null => {
  if (!payload || typeof payload !== 'object') return null;

  const root = payload as Record<string, unknown>;
  const sessionCandidate =
    root.session && typeof root.session === 'object'
      ? (root.session as Record<string, unknown>)
      : root;

  const token = toNullableStringValue(
    sessionCandidate.token || sessionCandidate.idToken || sessionCandidate.authToken,
  );
  const expiresAt =
    toStringValue(sessionCandidate.expiresAt || sessionCandidate.expirationTime).trim() ||
    defaultExpirationTime();

  const nestedUser = normalizeUserFromPayload(sessionCandidate.user);
  const directUser = normalizeUserFromPayload(sessionCandidate);
  const rootUser = normalizeUserFromPayload(root.user);
  const user = nestedUser || directUser || rootUser || currentSession?.user || null;

  if (!user) return null;

  return {
    token,
    expiresAt,
    user,
  };
};

const withPendingReferral = (referralCode?: string) => {
  if (!referralCode || typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(PENDING_AUTH_REFERRAL_KEY, referralCode);
  } catch {
    // ignore session storage failures
  }
};

const consumePendingReferral = (): string | undefined => {
  if (typeof window === 'undefined') return undefined;
  try {
    const referralCode = sessionStorage.getItem(PENDING_AUTH_REFERRAL_KEY) || '';
    sessionStorage.removeItem(PENDING_AUTH_REFERRAL_KEY);
    return referralCode || undefined;
  } catch {
    return undefined;
  }
};

const applySessionFromResponse = (payload: unknown): StoredSession | null => {
  const nextSession = extractSession(payload);
  if (nextSession) {
    setCurrentSession(nextSession);
  }
  return nextSession;
};

const requestAuthSession = async (
  path: string,
  method: 'GET' | 'POST',
): Promise<StoredSession | null> => {
  try {
    const response = await apiRequest<unknown>(path, {
      method,
      token: currentSession?.token,
    });
    return applySessionFromResponse(response);
  } catch (err) {
    if (err instanceof ApiRequestError && err.status === 404) {
      return null;
    }
    if (err instanceof ApiRequestError && err.status === 401) {
      setCurrentSession(null);
      return null;
    }
    throw err;
  }
};

const hydrateSessionFromServer = async (): Promise<StoredSession | null> => {
  const direct = await requestAuthSession('/api/auth/session', 'GET');
  if (direct) return direct;

  const fallback = await requestAuthSession('/api/auth/me', 'GET');
  if (fallback) return fallback;

  return currentSession;
};

const refreshSessionToken = async (): Promise<StoredSession | null> => {
  const refreshed = await requestAuthSession('/api/auth/refresh', 'POST');
  if (refreshed) return refreshed;
  return hydrateSessionFromServer();
};

const parseSessionFromRedirectUrl = (): StoredSession | null => {
  if (typeof window === 'undefined') return null;

  const params = new URLSearchParams(window.location.search);
  const token = toNullableStringValue(
    params.get('token') ||
      params.get('idToken') ||
      params.get('id_token') ||
      params.get('authToken') ||
      params.get('sessionToken'),
  );
  const uid = toStringValue(params.get('uid') || params.get('userId')).trim();
  const email = toNullableStringValue(params.get('email'));
  const displayName = toNullableStringValue(params.get('displayName') || params.get('name'));
  const photoURL = toNullableStringValue(params.get('photoURL') || params.get('avatarUrl'));
  const expiresAt = toStringValue(params.get('expiresAt') || params.get('expirationTime')).trim();

  if (!uid && !token) return null;
  if (!uid && currentSession?.user.uid) {
    return {
      token,
      expiresAt: expiresAt || defaultExpirationTime(),
      user: currentSession.user,
    };
  }
  if (!uid) return null;

  return {
    token,
    expiresAt: expiresAt || defaultExpirationTime(),
    user: {
      uid,
      email,
      displayName: sanitizeDisplayName(displayName, email),
      photoURL,
    },
  };
};

const clearRedirectSessionParams = () => {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  const keys = [
    'token',
    'idToken',
    'id_token',
    'authToken',
    'sessionToken',
    'uid',
    'userId',
    'email',
    'displayName',
    'name',
    'photoURL',
    'avatarUrl',
    'expiresAt',
    'expirationTime',
  ];
  let changed = false;
  keys.forEach((key) => {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  });
  if (changed) {
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }
};

const getSessionToken = () => currentSession?.token || null;

const tryRequestVariants = async <T>(
  requests: Array<() => Promise<T>>,
  fallback: T,
): Promise<T> => {
  for (const request of requests) {
    try {
      return await request();
    } catch (err) {
      if (err instanceof ApiRequestError && (err.status === 404 || err.status === 405)) {
        continue;
      }
      throw err;
    }
  }
  return fallback;
};

const authRequest = async <T>(
  path: string,
  options: { method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'; body?: unknown } = {},
): Promise<T> => {
  const response = await apiRequest<T>(path, {
    method: options.method || 'GET',
    body: options.body,
    token: getSessionToken(),
  });
  return response;
};

const toAuthUserOrThrow = (session: StoredSession | null): AuthUser => {
  if (!session) {
    throw new Error('Authentication failed. Please sign in again.');
  }
  return buildAuthUser(session);
};

const startProviderSignIn = async (
  provider: 'google' | 'facebook' | 'github' | 'twitter' | 'apple',
  referralCode?: string,
): Promise<{ didRedirect: boolean }> => {
  const payload = { provider, referralCode: referralCode || undefined };

  const response = await tryRequestVariants<unknown>(
    [
      () => apiRequest('/api/auth/oauth/start', { method: 'POST', body: payload }),
      () => apiRequest('/api/auth/social/start', { method: 'POST', body: payload }),
    ],
    {},
  );

  const applied = applySessionFromResponse(response);
  if (applied) return { didRedirect: false };

  const data =
    response && typeof response === 'object' ? (response as Record<string, unknown>) : {};
  const redirectUrl = toStringValue(data.redirectUrl || data.url).trim();

  if (typeof window !== 'undefined' && !isJsdom()) {
    const fallbackPath = `/api/auth/oauth/${provider}${
      referralCode ? `?ref=${encodeURIComponent(referralCode)}` : ''
    }`;
    window.location.assign(redirectUrl || fallbackPath);
  }
  return { didRedirect: true };
};

// Timestamp-like type for backward compatibility with existing UserProfile shape.
type TimestampLike = string | number | Date | Record<string, unknown> | null;

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  createdAt: TimestampLike;
  role?: 'admin' | 'beta_tester' | 'user' | string;
  betaTester?: boolean;
  subscription: {
    plan: PlanTier;
    status: 'trialing' | 'active' | 'canceled' | 'past_due';
    trialEndsAt?: TimestampLike;
    currentPeriodEnd?: TimestampLike;
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    betaOverride?: boolean;
  };
  usage: {
    cloudHoursUsed: number;
    cloudHoursResetAt?: TimestampLike;
    lastStreamDate?: TimestampLike;
    activeCloudSession?: {
      sessionId: string;
      startTime?: TimestampLike;
      destinationCount?: number;
    } | null;
  };
  affiliate?: {
    code: string;
    referredBy?: string;
    referredByUserId?: string;
    referrals: number;
    totalEarnings: number;
    pendingPayout: number;
  };
  settings: {
    emailNotifications: boolean;
    marketingEmails: boolean;
  };
  connectedPlatforms?: {
    youtube?: {
      accessToken: string;
      refreshToken: string;
      expiresAt: TimestampLike;
      channelId: string;
      channelName: string;
    };
    facebook?: {
      accessToken: string;
      refreshToken: string;
      expiresAt: TimestampLike;
      pageId?: string;
      pageName?: string;
    };
    twitch?: {
      accessToken: string;
      refreshToken: string;
      expiresAt: TimestampLike;
      channelId: string;
      channelName: string;
    };
  };
}

export interface AffiliateCode {
  code: string;
  ownerId: string;
  ownerEmail: string;
  ownerName: string;
  commissionRate: number;
  bonusTrialDays: number;
  totalReferrals: number;
  totalEarnings: number;
  createdAt: TimestampLike;
  isActive: boolean;
}

export interface AccessListConfig {
  admins: string[];
  betaTesters: string[];
}

export interface OAuthPublicConfig {
  youtubeClientId: string;
  facebookAppId: string;
  twitchClientId: string;
  redirectUriBase: string;
}

const specialAffiliateCodes: Record<string, AffiliateCode> = {
  MMM: {
    code: 'MMM',
    ownerId: 'mythical-meta',
    ownerEmail: 'contact@mythicalmeta.com',
    ownerName: 'Mythical Meta',
    commissionRate: 0.4,
    bonusTrialDays: 7,
    totalReferrals: 0,
    totalEarnings: 0,
    createdAt: new Date().toISOString(),
    isActive: true,
  },
};

const fallbackProfileFromUser = (user: AuthUser): UserProfile => ({
  uid: user.uid,
  email: user.email || '',
  displayName: sanitizeDisplayName(user.displayName, user.email),
  photoURL: user.photoURL || undefined,
  createdAt: new Date().toISOString(),
  role: 'user',
  betaTester: false,
  subscription: {
    plan: 'free',
    status: 'trialing',
  },
  usage: {
    cloudHoursUsed: 0,
  },
  settings: {
    emailNotifications: true,
    marketingEmails: true,
  },
});

const normalizeProfile = (value: unknown): UserProfile | null => {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<UserProfile> & Record<string, unknown>;
  const uid = toStringValue(raw.uid || raw.userId).trim();
  if (!uid) return null;

  const email = toStringValue(raw.email).trim();
  const displayName = toStringValue(raw.displayName).trim();

  return {
    uid,
    email,
    displayName: displayName || email || 'User',
    photoURL: toStringValue(raw.photoURL).trim() || undefined,
    createdAt: raw.createdAt ?? new Date().toISOString(),
    role: toStringValue(raw.role).trim() || undefined,
    betaTester: Boolean(raw.betaTester),
    subscription: {
      plan: (toStringValue(raw.subscription?.plan) as PlanTier) || 'free',
      status:
        (toStringValue(raw.subscription?.status) as UserProfile['subscription']['status']) ||
        'trialing',
      trialEndsAt: raw.subscription?.trialEndsAt,
      currentPeriodEnd: raw.subscription?.currentPeriodEnd,
      stripeCustomerId: toStringValue(raw.subscription?.stripeCustomerId).trim() || undefined,
      stripeSubscriptionId:
        toStringValue(raw.subscription?.stripeSubscriptionId).trim() || undefined,
      betaOverride:
        typeof raw.subscription?.betaOverride === 'boolean'
          ? raw.subscription.betaOverride
          : undefined,
    },
    usage: {
      cloudHoursUsed: typeof raw.usage?.cloudHoursUsed === 'number' ? raw.usage.cloudHoursUsed : 0,
      cloudHoursResetAt: raw.usage?.cloudHoursResetAt,
      lastStreamDate: raw.usage?.lastStreamDate,
      activeCloudSession: raw.usage?.activeCloudSession || null,
    },
    affiliate:
      raw.affiliate && typeof raw.affiliate === 'object'
        ? {
            code: toStringValue(raw.affiliate.code || '').toUpperCase(),
            referredBy: toStringValue(raw.affiliate.referredBy || '').toUpperCase() || undefined,
            referredByUserId:
              toStringValue(raw.affiliate.referredByUserId || '').trim() || undefined,
            referrals: typeof raw.affiliate.referrals === 'number' ? raw.affiliate.referrals : 0,
            totalEarnings:
              typeof raw.affiliate.totalEarnings === 'number' ? raw.affiliate.totalEarnings : 0,
            pendingPayout:
              typeof raw.affiliate.pendingPayout === 'number' ? raw.affiliate.pendingPayout : 0,
          }
        : undefined,
    settings: {
      emailNotifications:
        typeof raw.settings?.emailNotifications === 'boolean'
          ? raw.settings.emailNotifications
          : true,
      marketingEmails:
        typeof raw.settings?.marketingEmails === 'boolean' ? raw.settings.marketingEmails : true,
    },
    connectedPlatforms:
      raw.connectedPlatforms && typeof raw.connectedPlatforms === 'object'
        ? (raw.connectedPlatforms as UserProfile['connectedPlatforms'])
        : undefined,
  };
};

export const backendConfigError: string | null = null;

export const signUpWithEmail = async (
  email: string,
  password: string,
  displayName: string,
  referralCode?: string,
): Promise<AuthUser> => {
  const response = await apiRequest<unknown>('/api/auth/signup', {
    method: 'POST',
    body: { email, password, displayName, referralCode },
  });
  const session = applySessionFromResponse(response) || (await hydrateSessionFromServer());
  return toAuthUserOrThrow(session);
};

export const signInWithEmail = async (email: string, password: string): Promise<AuthUser> => {
  const response = await apiRequest<unknown>('/api/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  const session = applySessionFromResponse(response) || (await hydrateSessionFromServer());
  return toAuthUserOrThrow(session);
};

export const completeRedirectSignIn = async (): Promise<{ processed: boolean }> => {
  const sessionFromUrl = parseSessionFromRedirectUrl();
  if (sessionFromUrl) {
    setCurrentSession(sessionFromUrl);
    clearRedirectSessionParams();
    consumePendingReferral();
    return { processed: true };
  }

  const hydrated = await hydrateSessionFromServer();
  return { processed: Boolean(hydrated) };
};

export const syncAccess = async (): Promise<void> => {
  await authRequest('/api/access/sync', { method: 'POST', body: {} });
};

export const signInWithGoogle = (referralCode?: string): Promise<{ didRedirect: boolean }> => {
  withPendingReferral(referralCode);
  return startProviderSignIn('google', referralCode);
};

export const signInWithFacebook = (referralCode?: string): Promise<{ didRedirect: boolean }> => {
  withPendingReferral(referralCode);
  return startProviderSignIn('facebook', referralCode);
};

export const signInWithGithub = (referralCode?: string): Promise<{ didRedirect: boolean }> => {
  withPendingReferral(referralCode);
  return startProviderSignIn('github', referralCode);
};

export const signInWithTwitter = (referralCode?: string): Promise<{ didRedirect: boolean }> => {
  withPendingReferral(referralCode);
  return startProviderSignIn('twitter', referralCode);
};

export const signInWithApple = (referralCode?: string): Promise<{ didRedirect: boolean }> => {
  withPendingReferral(referralCode);
  return startProviderSignIn('apple', referralCode);
};

export const logOut = async (): Promise<void> => {
  try {
    await authRequest('/api/auth/logout', { method: 'POST', body: {} });
  } catch {
    // Always clear local session, even if remote logout fails.
  }
  setCurrentSession(null);
};

export const resetPassword = async (email: string): Promise<void> => {
  await apiRequest('/api/auth/reset-password', {
    method: 'POST',
    body: { email },
  });
};

export const getUserProfile = async (uid: string): Promise<UserProfile | null> => {
  try {
    const response = await tryRequestVariants<unknown>(
      [
        () => authRequest(`/api/users/${encodeURIComponent(uid)}`),
        () => authRequest(`/api/user/${encodeURIComponent(uid)}`),
      ],
      null,
    );
    if (!response) return null;
    const body =
      response && typeof response === 'object' && (response as Record<string, unknown>).profile
        ? (response as Record<string, unknown>).profile
        : response;
    const normalized = normalizeProfile(body);
    if (normalized) return normalized;
  } catch (err) {
    if (err instanceof ApiRequestError && err.status === 404) {
      return null;
    }
    throw err;
  }

  const user = getCurrentAuthUser();
  if (user && user.uid === uid) {
    return fallbackProfileFromUser(user);
  }
  return null;
};

export const updateUserProfile = async (uid: string, data: Partial<UserProfile>): Promise<void> => {
  await tryRequestVariants(
    [
      () =>
        authRequest(`/api/users/${encodeURIComponent(uid)}`, {
          method: 'PATCH',
          body: data,
        }),
      () =>
        authRequest(`/api/user/${encodeURIComponent(uid)}`, {
          method: 'PUT',
          body: data,
        }),
    ],
    {},
  );
};

export const getAffiliateByCode = async (code: string): Promise<AffiliateCode | null> => {
  const normalizedCode = normalizeCode(code);
  if (!normalizedCode) return null;
  if (specialAffiliateCodes[normalizedCode]) return specialAffiliateCodes[normalizedCode];

  const response = await tryRequestVariants<unknown>(
    [
      () => authRequest(`/api/affiliates/${encodeURIComponent(normalizedCode)}`),
      () => authRequest(`/api/affiliate/${encodeURIComponent(normalizedCode)}`),
    ],
    null,
  );
  if (!response) return null;

  const data =
    response && typeof response === 'object' && (response as Record<string, unknown>).affiliate
      ? ((response as Record<string, unknown>).affiliate as unknown)
      : response;
  if (!data || typeof data !== 'object') return null;

  const raw = data as Partial<AffiliateCode>;
  const affiliate: AffiliateCode = {
    code: normalizeCode(toStringValue(raw.code)),
    ownerId: toStringValue(raw.ownerId),
    ownerEmail: toStringValue(raw.ownerEmail),
    ownerName: toStringValue(raw.ownerName),
    commissionRate: typeof raw.commissionRate === 'number' ? raw.commissionRate : 0.2,
    bonusTrialDays: typeof raw.bonusTrialDays === 'number' ? raw.bonusTrialDays : 3,
    totalReferrals: typeof raw.totalReferrals === 'number' ? raw.totalReferrals : 0,
    totalEarnings: typeof raw.totalEarnings === 'number' ? raw.totalEarnings : 0,
    createdAt: raw.createdAt ?? new Date().toISOString(),
    isActive: raw.isActive !== false,
  };

  return affiliate.code ? affiliate : null;
};

export const updateAffiliateReferral = async (
  code: string,
  referrerId: string,
  referredUserId: string,
): Promise<void> => {
  const affiliateCode = normalizeCode(code);
  await tryRequestVariants(
    [
      () =>
        authRequest(`/api/affiliates/${encodeURIComponent(affiliateCode)}/referrals`, {
          method: 'POST',
          body: { referrerId, referredUserId },
        }),
      () =>
        authRequest('/api/referrals', {
          method: 'POST',
          body: { affiliateCode, referrerId, referredUserId },
        }),
    ],
    {},
  );
};

export const createAffiliateCode = async (
  userId: string,
  userEmail: string,
  userName: string,
): Promise<string> => {
  const response = await tryRequestVariants<unknown>(
    [
      () =>
        authRequest('/api/affiliates', {
          method: 'POST',
          body: { userId, userEmail, userName },
        }),
      () =>
        authRequest('/api/affiliate/create', {
          method: 'POST',
          body: { userId, userEmail, userName },
        }),
    ],
    null,
  );

  if (response && typeof response === 'object') {
    const data = response as Record<string, unknown>;
    const codeValue = toStringValue(data.code || data.affiliateCode).toUpperCase();
    if (codeValue) return codeValue;
  }
  return '';
};

export const getOAuthPublicConfig = async (): Promise<OAuthPublicConfig> => {
  const response = await tryRequestVariants<unknown>(
    [() => authRequest('/api/config/oauth'), () => authRequest('/api/oauth/config/public')],
    {},
  );

  const data =
    response && typeof response === 'object' && (response as Record<string, unknown>).oauth
      ? ((response as Record<string, unknown>).oauth as Record<string, unknown>)
      : (response as Record<string, unknown>);

  return {
    youtubeClientId: toStringValue(data?.youtubeClientId),
    facebookAppId: toStringValue(data?.facebookAppId),
    twitchClientId: toStringValue(data?.twitchClientId),
    redirectUriBase: toStringValue(data?.redirectUriBase),
  };
};

export const setOAuthPublicConfig = async (patch: Partial<OAuthPublicConfig>): Promise<void> => {
  await tryRequestVariants(
    [
      () =>
        authRequest('/api/config/oauth', {
          method: 'PATCH',
          body: patch,
        }),
      () =>
        authRequest('/api/oauth/config/public', {
          method: 'PUT',
          body: patch,
        }),
    ],
    {},
  );
};

export const getAccessListConfig = async (): Promise<AccessListConfig> => {
  const fallback: AccessListConfig = {
    admins: MASTER_EMAILS.map(normalizeEmail),
    betaTesters: DEFAULT_BETA_TESTERS.map(normalizeEmail),
  };

  const response = await tryRequestVariants<unknown>(
    [() => authRequest('/api/config/access'), () => authRequest('/api/access/list')],
    fallback,
  );

  const data =
    response && typeof response === 'object' && (response as Record<string, unknown>).access
      ? ((response as Record<string, unknown>).access as Record<string, unknown>)
      : (response as Record<string, unknown>);

  const admins = Array.isArray(data?.admins)
    ? data.admins.map((value) => normalizeEmail(toStringValue(value))).filter(Boolean)
    : fallback.admins;
  const betaTesters = Array.isArray(data?.betaTesters)
    ? data.betaTesters.map((value) => normalizeEmail(toStringValue(value))).filter(Boolean)
    : fallback.betaTesters;

  return {
    admins: Array.from(new Set(admins.length ? admins : fallback.admins)),
    betaTesters: Array.from(new Set(betaTesters.length ? betaTesters : fallback.betaTesters)),
  };
};

export const setAccessListConfig = async (
  admins: string[],
  betaTesters: string[],
): Promise<void> => {
  const payload = {
    admins: Array.from(new Set(admins.map(normalizeEmail).filter(Boolean))),
    betaTesters: Array.from(new Set(betaTesters.map(normalizeEmail).filter(Boolean))),
  };

  await tryRequestVariants(
    [
      () =>
        authRequest('/api/config/access', {
          method: 'PUT',
          body: payload,
        }),
      () =>
        authRequest('/api/access/list', {
          method: 'POST',
          body: payload,
        }),
    ],
    {},
  );
};

export const findUsersByEmail = async (email: string): Promise<UserProfile[]> => {
  const normalized = normalizeEmail(email);
  if (!normalized) return [];

  const response = await tryRequestVariants<unknown>(
    [
      () => authRequest(`/api/admin/users?email=${encodeURIComponent(normalized)}`),
      () => authRequest(`/api/users/search?email=${encodeURIComponent(normalized)}`),
    ],
    [],
  );

  const data = Array.isArray(response)
    ? response
    : response &&
        typeof response === 'object' &&
        Array.isArray((response as Record<string, unknown>).users)
      ? ((response as Record<string, unknown>).users as unknown[])
      : [];

  return data
    .map((entry) => normalizeProfile(entry))
    .filter((entry): entry is UserProfile => Boolean(entry));
};

export const setUserAccessOverrides = async (
  uid: string,
  patch: {
    role: 'admin' | 'beta_tester';
    betaTester: boolean;
    plan: PlanTier;
    status: UserProfile['subscription']['status'];
  },
): Promise<void> => {
  await tryRequestVariants(
    [
      () =>
        authRequest(`/api/admin/users/${encodeURIComponent(uid)}/access`, {
          method: 'PATCH',
          body: patch,
        }),
      () =>
        authRequest(`/api/access/users/${encodeURIComponent(uid)}`, {
          method: 'POST',
          body: patch,
        }),
    ],
    {},
  );
};

export const ensureAffiliateForSignedInUser = async (): Promise<string> => {
  const currentUser = getCurrentAuthUser();
  if (!currentUser) return '';

  const response = await tryRequestVariants<unknown>(
    [
      () => authRequest('/api/affiliates/ensure', { method: 'POST', body: {} }),
      () => authRequest('/api/users/me/affiliate', { method: 'POST', body: {} }),
    ],
    null,
  );

  if (response && typeof response === 'object') {
    const data = response as Record<string, unknown>;
    const code = normalizeCode(toStringValue(data.code || data.affiliateCode));
    if (code) return code;
  }

  const profile = await getUserProfile(currentUser.uid);
  return normalizeCode(profile?.affiliate?.code || '');
};

export const applyLocalAccessOverrides = (
  profile: UserProfile | null,
  email?: string | null,
): UserProfile | null => {
  if (!profile) return profile;
  if (!isMasterEmail(email)) return profile;

  return {
    ...profile,
    role: 'admin',
    betaTester: true,
    subscription: {
      ...profile.subscription,
      plan: 'enterprise',
      status: 'active',
      betaOverride: true,
    },
  };
};

export const onAuthChange = (callback: AuthListener) => {
  authListeners.add(callback);
  callback(getCurrentAuthUser());
  return () => {
    authListeners.delete(callback);
  };
};

export const onIdTokenChange = onAuthChange;

export const getCurrentSessionToken = (): string | null => getSessionToken();
