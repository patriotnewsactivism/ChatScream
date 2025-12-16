import { initializeApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  FacebookAuthProvider,
  GithubAuthProvider,
  TwitterAuthProvider,
  OAuthProvider,
  AuthProvider as FirebaseAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  sendPasswordResetEmail,
  User,
  onIdTokenChanged
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';

const MASTER_EMAILS = ['mreardon@wtpnews.org'];
const DEFAULT_BETA_TESTERS = ['leroytruth247@gmail.com'];

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const isMasterEmail = (email?: string | null): boolean => {
  if (!email) return false;
  const normalized = normalizeEmail(email);
  return MASTER_EMAILS.includes(normalized);
};

// Validate required Firebase environment variables safely so the app can still render
const requiredEnvVars = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID'
] as const;

const missingVars = requiredEnvVars.filter(key => !import.meta.env[key]);
export const firebaseConfigError =
  missingVars.length > 0
    ? `Missing Firebase config: ${missingVars.join(', ')}. Check your .env file.`
    : null;

// Firebase configuration from environment (null when misconfigured)
const firebaseConfig = firebaseConfigError
  ? null
  : {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID
    };

// Initialize Firebase only when we have a valid configuration
const app = firebaseConfig ? initializeApp(firebaseConfig) : null;
const authInstance = app ? getAuth(app) : null;
const dbInstance = app ? getFirestore(app) : null;
export const auth = authInstance;
export const db = dbInstance;

const ensureInitialized = () => {
  if (!app || !authInstance || !dbInstance) {
    const error = firebaseConfigError ?? 'Firebase failed to initialize. Check your configuration.';
    console.error(error);
    throw new Error(error);
  }
};

const googleProvider = new GoogleAuthProvider();
const facebookProvider = new FacebookAuthProvider();
const githubProvider = new GithubAuthProvider();
const twitterProvider = new TwitterAuthProvider();
const appleProvider = new OAuthProvider('apple.com');

const PENDING_AUTH_REFERRAL_KEY = 'pending_auth_referral';

const storePendingReferralCode = (referralCode?: string) => {
  if (!referralCode) return;
  try {
    sessionStorage.setItem(PENDING_AUTH_REFERRAL_KEY, referralCode);
  } catch {
    // ignore
  }
};

const consumePendingReferralCode = (): string | undefined => {
  try {
    const referralCode = sessionStorage.getItem(PENDING_AUTH_REFERRAL_KEY) || '';
    sessionStorage.removeItem(PENDING_AUTH_REFERRAL_KEY);
    return referralCode || undefined;
  } catch {
    return undefined;
  }
};

const getAuthInstance = () => {
  ensureInitialized();
  return authInstance!;
};

const getDbInstanceSafe = () => {
  ensureInitialized();
  return dbInstance!;
};

// Plan tier types
export type PlanTier = 'free' | 'pro' | 'expert' | 'enterprise';

// User Profile Interface
export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  createdAt: Timestamp;
  role?: 'admin' | 'beta_tester' | 'user' | string;
  betaTester?: boolean;
  subscription: {
    plan: PlanTier;
    status: 'trialing' | 'active' | 'canceled' | 'past_due';
    trialEndsAt?: Timestamp;
    currentPeriodEnd?: Timestamp;
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    betaOverride?: boolean;
  };
  usage: {
    cloudHoursUsed: number; // Cloud VM streaming hours used this billing period
    cloudHoursResetAt?: Timestamp; // When cloud hours reset (next billing date)
    lastStreamDate?: Timestamp; // When user last streamed
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
  // OAuth tokens for connected platforms (encrypted at rest)
  connectedPlatforms?: {
    youtube?: {
      accessToken: string;
      refreshToken: string;
      expiresAt: Timestamp;
      channelId: string;
      channelName: string;
    };
    facebook?: {
      accessToken: string;
      refreshToken: string;
      expiresAt: Timestamp;
      pageId?: string;
      pageName?: string;
    };
    twitch?: {
      accessToken: string;
      refreshToken: string;
      expiresAt: Timestamp;
      channelId: string;
      channelName: string;
    };
  };
}

// Affiliate Code Interface
export interface AffiliateCode {
  code: string;
  ownerId: string;
  ownerEmail: string;
  ownerName: string;
  commissionRate: number; // 0.40 = 40%
  bonusTrialDays: number; // Extra days added to trial
  totalReferrals: number;
  totalEarnings: number;
  createdAt: Timestamp;
  isActive: boolean;
}

// Authentication Functions
export const signUpWithEmail = async (
  email: string,
  password: string,
  displayName: string,
  referralCode?: string
): Promise<User> => {
  const authClient = getAuthInstance();
  const db = getDbInstanceSafe();
  const normalizedEmail = normalizeEmail(email);
  const userCredential = await createUserWithEmailAndPassword(authClient, email, password);
  const user = userCredential.user;

  // Calculate trial days (7 default, 14 with referral)
  let trialDays = 7;
  let referredBy: { code: string; ownerId: string } | undefined;

  if (referralCode) {
    const affiliateData = await getAffiliateByCode(referralCode);
    if (affiliateData && affiliateData.isActive) {
      trialDays = 7 + affiliateData.bonusTrialDays; // 7 + 7 = 14 for MMM code
      referredBy = { code: affiliateData.code, ownerId: affiliateData.ownerId };
    }
  }

  const trialEndsAt = Timestamp.fromDate(
    new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000)
  );

  const personalAffiliateCode = await createUniqueAffiliateCode();

  // Create user profile in Firestore
  const userProfile: UserProfile = {
    uid: user.uid,
    email: normalizedEmail,
    displayName: displayName,
    createdAt: serverTimestamp() as Timestamp,
    subscription: {
      plan: 'free',
      status: 'trialing',
      trialEndsAt: trialEndsAt,
    },
    usage: {
      cloudHoursUsed: 0,
    },
    affiliate: referredBy ? {
      code: personalAffiliateCode,
      referredBy: referredBy.code,
      referredByUserId: referredBy.ownerId,
      referrals: 0,
      totalEarnings: 0,
      pendingPayout: 0,
    } : {
      code: personalAffiliateCode,
      referrals: 0,
      totalEarnings: 0,
      pendingPayout: 0,
    },
    settings: {
      emailNotifications: true,
      marketingEmails: true,
    },
  };

  await setDoc(doc(db, 'users', user.uid), userProfile);

  await ensureAffiliateDocForUser({
    code: personalAffiliateCode,
    ownerId: user.uid,
    ownerEmail: normalizedEmail,
    ownerName: displayName,
  });

  if (referredBy) {
    await updateAffiliateReferral(referredBy.code, referredBy.ownerId, user.uid);
  }

  return user;
};

export const signInWithEmail = async (email: string, password: string): Promise<User> => {
  const authClient = getAuthInstance();
  const userCredential = await signInWithEmailAndPassword(authClient, email, password);
  return userCredential.user;
};

const ensureUserProfileForOAuthUser = async (user: User, referralCode?: string): Promise<void> => {
  const db = getDbInstanceSafe();

  const userDoc = await getDoc(doc(db, 'users', user.uid));
  if (userDoc.exists()) return;

  let trialDays = 7;
  let referredBy: { code: string; ownerId: string } | undefined;

  if (referralCode) {
    const affiliateData = await getAffiliateByCode(referralCode);
    if (affiliateData && affiliateData.isActive) {
      trialDays = 7 + affiliateData.bonusTrialDays;
      referredBy = { code: affiliateData.code, ownerId: affiliateData.ownerId };
    }
  }

  const trialEndsAt = Timestamp.fromDate(
    new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000)
  );

  const normalizedEmail = normalizeEmail(user.email || '');
  const personalAffiliateCode = await createUniqueAffiliateCode();

  const userProfile: UserProfile = {
    uid: user.uid,
    email: normalizedEmail,
    displayName: user.displayName || 'User',
    photoURL: user.photoURL || undefined,
    createdAt: serverTimestamp() as Timestamp,
    subscription: {
      plan: 'free',
      status: 'trialing',
      trialEndsAt: trialEndsAt,
    },
    usage: {
      cloudHoursUsed: 0,
    },
    affiliate: referredBy ? {
      code: personalAffiliateCode,
      referredBy: referredBy.code,
      referredByUserId: referredBy.ownerId,
      referrals: 0,
      totalEarnings: 0,
      pendingPayout: 0,
    } : {
      code: personalAffiliateCode,
      referrals: 0,
      totalEarnings: 0,
      pendingPayout: 0,
    },
    settings: {
      emailNotifications: true,
      marketingEmails: true,
    },
  };

  await setDoc(doc(db, 'users', user.uid), userProfile);

  await ensureAffiliateDocForUser({
    code: personalAffiliateCode,
    ownerId: user.uid,
    ownerEmail: normalizedEmail,
    ownerName: userProfile.displayName,
  });

  if (referredBy) {
    await updateAffiliateReferral(referredBy.code, referredBy.ownerId, user.uid);
  }
};

const shouldPreferRedirect = (): boolean => {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua);
  return isIOS || window.innerWidth < 768;
};

const signInWithPopupOrRedirect = async (
  provider: FirebaseAuthProvider,
  referralCode?: string
): Promise<{ user?: User; didRedirect: boolean }> => {
  const authClient = getAuthInstance();

  if (shouldPreferRedirect()) {
    storePendingReferralCode(referralCode);
    await signInWithRedirect(authClient, provider);
    return { didRedirect: true };
  }

  try {
    const userCredential = await signInWithPopup(authClient, provider);
    return { user: userCredential.user, didRedirect: false };
  } catch (err: any) {
    if (err?.code === 'auth/popup-blocked' || err?.code === 'auth/operation-not-supported-in-this-environment') {
      storePendingReferralCode(referralCode);
      await signInWithRedirect(authClient, provider);
      return { didRedirect: true };
    }
    throw err;
  }
};

export const completeRedirectSignIn = async (): Promise<{ processed: boolean }> => {
  const authClient = getAuthInstance();

  const result = await getRedirectResult(authClient);
  if (!result?.user) return { processed: false };

  const referralCode = consumePendingReferralCode();
  await ensureUserProfileForOAuthUser(result.user, referralCode);
  return { processed: true };
};

export const syncAccess = async (): Promise<void> => {
  const authClient = getAuthInstance();
  const user = authClient.currentUser;
  if (!user) return;

  const idToken = await user.getIdToken();
  await fetch('/api/access/sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({}),
  });
};

export const signInWithGoogle = async (referralCode?: string): Promise<{ didRedirect: boolean }> => {
  const { user, didRedirect } = await signInWithPopupOrRedirect(googleProvider, referralCode);
  if (didRedirect) return { didRedirect: true };
  await ensureUserProfileForOAuthUser(user!, referralCode);
  return { didRedirect: false };
};

export const signInWithFacebook = async (referralCode?: string): Promise<{ didRedirect: boolean }> => {
  const { user, didRedirect } = await signInWithPopupOrRedirect(facebookProvider, referralCode);
  if (didRedirect) return { didRedirect: true };
  await ensureUserProfileForOAuthUser(user!, referralCode);
  return { didRedirect: false };
};

export const signInWithGithub = async (referralCode?: string): Promise<{ didRedirect: boolean }> => {
  const { user, didRedirect } = await signInWithPopupOrRedirect(githubProvider, referralCode);
  if (didRedirect) return { didRedirect: true };
  await ensureUserProfileForOAuthUser(user!, referralCode);
  return { didRedirect: false };
};

export const signInWithTwitter = async (referralCode?: string): Promise<{ didRedirect: boolean }> => {
  const { user, didRedirect } = await signInWithPopupOrRedirect(twitterProvider, referralCode);
  if (didRedirect) return { didRedirect: true };
  await ensureUserProfileForOAuthUser(user!, referralCode);
  return { didRedirect: false };
};

export const signInWithApple = async (referralCode?: string): Promise<{ didRedirect: boolean }> => {
  const { user, didRedirect } = await signInWithPopupOrRedirect(appleProvider, referralCode);
  if (didRedirect) return { didRedirect: true };
  await ensureUserProfileForOAuthUser(user!, referralCode);
  return { didRedirect: false };
};

export const logOut = async (): Promise<void> => {
  const authClient = getAuthInstance();
  await signOut(authClient);
};

export const resetPassword = async (email: string): Promise<void> => {
  const authClient = getAuthInstance();
  await sendPasswordResetEmail(authClient, email);
};

// User Profile Functions
export const getUserProfile = async (uid: string): Promise<UserProfile | null> => {
  const db = getDbInstanceSafe();
  const userDoc = await getDoc(doc(db, 'users', uid));
  if (userDoc.exists()) {
    return userDoc.data() as UserProfile;
  }
  return null;
};

export const updateUserProfile = async (uid: string, data: Partial<UserProfile>): Promise<void> => {
  const db = getDbInstanceSafe();
  await updateDoc(doc(db, 'users', uid), data);
};

// Affiliate Functions
const generateAffiliateCode = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

export const getAffiliateByCode = async (code: string): Promise<AffiliateCode | null> => {
  const db = getDbInstanceSafe();
  const normalizedCode = code.trim().toUpperCase();
  if (!normalizedCode) return null;
  // Check for special codes first (like MMM)
  const specialCodes: Record<string, AffiliateCode> = {
    'MMM': {
      code: 'MMM',
      ownerId: 'mythical-meta',
      ownerEmail: 'contact@mythicalmeta.com',
      ownerName: 'Mythical Meta',
      commissionRate: 0.40, // 40%
      bonusTrialDays: 7, // +7 days = 14 total
      totalReferrals: 0,
      totalEarnings: 0,
      createdAt: Timestamp.now(),
      isActive: true,
    }
  };

  if (specialCodes[normalizedCode]) {
    return specialCodes[normalizedCode];
  }

  // Prefer direct doc lookup (affiliates/{CODE})
  const direct = await getDoc(doc(db, 'affiliates', normalizedCode));
  if (direct.exists()) {
    return direct.data() as AffiliateCode;
  }

  // Check Firestore for user-created affiliate codes
  const affiliatesRef = collection(db, 'affiliates');
  const q = query(affiliatesRef, where('code', '==', normalizedCode));
  const querySnapshot = await getDocs(q);

  if (!querySnapshot.empty) {
    return querySnapshot.docs[0].data() as AffiliateCode;
  }

  return null;
};

const createUniqueAffiliateCode = async (): Promise<string> => {
  const db = getDbInstanceSafe();
  for (let attempt = 0; attempt < 12; attempt++) {
    const candidate = generateAffiliateCode().toUpperCase();
    if (candidate === 'MMM') continue;
    const snap = await getDoc(doc(db, 'affiliates', candidate));
    if (!snap.exists()) return candidate;
  }
  throw new Error('Failed to generate a unique affiliate code');
};

const ensureAffiliateDocForUser = async (input: { code: string; ownerId: string; ownerEmail: string; ownerName: string }): Promise<void> => {
  const db = getDbInstanceSafe();
  const code = input.code.trim().toUpperCase();
  if (!code) return;
  const affiliateDocRef = doc(db, 'affiliates', code);
  const existing = await getDoc(affiliateDocRef);
  if (existing.exists()) return;

  await setDoc(affiliateDocRef, {
    code,
    ownerId: input.ownerId,
    ownerEmail: normalizeEmail(input.ownerEmail),
    ownerName: input.ownerName || 'User',
    commissionRate: 0.20,
    bonusTrialDays: 3,
    totalReferrals: 0,
    totalEarnings: 0,
    createdAt: serverTimestamp(),
    isActive: true,
  } satisfies AffiliateCode as any);
};

export const updateAffiliateReferral = async (code: string, referrerId: string, referredUserId: string): Promise<void> => {
  const db = getDbInstanceSafe();
  const normalizedCode = code.trim().toUpperCase();
  // Skip for special codes - they're tracked differently
  if (normalizedCode === 'MMM') {
    const referralDoc = doc(collection(db, 'referrals'));
    await setDoc(referralDoc, {
      affiliateCode: 'MMM',
      referrerId: referrerId || 'mythical-meta',
      referredUserId,
      createdAt: serverTimestamp(),
    });
    return;
  }

  const affiliateDocRef = doc(db, 'affiliates', normalizedCode);
  const affiliateDoc = await getDoc(affiliateDocRef);

  if (affiliateDoc.exists()) {
    const existingCount = (affiliateDoc.data() as any).totalReferrals || 0;
    await updateDoc(affiliateDocRef, {
      totalReferrals: existingCount + 1,
    });
  }

  const referralDoc = doc(collection(db, 'referrals'));
  await setDoc(referralDoc, {
    affiliateCode: normalizedCode,
    referrerId,
    referredUserId,
    createdAt: serverTimestamp(),
  });
};

export const createAffiliateCode = async (
  userId: string,
  userEmail: string,
  userName: string
): Promise<string> => {
  const db = getDbInstanceSafe();
  const code = await createUniqueAffiliateCode();

  const affiliateData: AffiliateCode = {
    code: code,
    ownerId: userId,
    ownerEmail: userEmail,
    ownerName: userName,
    commissionRate: 0.20, // 20% default for regular affiliates
    bonusTrialDays: 3, // +3 days for referrals
    totalReferrals: 0,
    totalEarnings: 0,
    createdAt: serverTimestamp() as Timestamp,
    isActive: true,
  };

  await setDoc(doc(db, 'affiliates', code), affiliateData);

  return code;
};

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

export const getOAuthPublicConfig = async (): Promise<OAuthPublicConfig> => {
  const db = getDbInstanceSafe();
  try {
    const snap = await getDoc(doc(db, 'config', 'oauth'));
    const data = (snap.exists() ? snap.data() : {}) as any;
    return {
      youtubeClientId: typeof data?.youtubeClientId === 'string' ? data.youtubeClientId : '',
      facebookAppId: typeof data?.facebookAppId === 'string' ? data.facebookAppId : '',
      twitchClientId: typeof data?.twitchClientId === 'string' ? data.twitchClientId : '',
      redirectUriBase: typeof data?.redirectUriBase === 'string' ? data.redirectUriBase : '',
    };
  } catch {
    return { youtubeClientId: '', facebookAppId: '', twitchClientId: '', redirectUriBase: '' };
  }
};

export const setOAuthPublicConfig = async (patch: Partial<OAuthPublicConfig>): Promise<void> => {
  const authClient = getAuthInstance();
  const db = getDbInstanceSafe();
  if (!authClient.currentUser) throw new Error('Not signed in');

  const safe = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
  const next: Partial<OAuthPublicConfig> = {};
  if (patch.youtubeClientId !== undefined) next.youtubeClientId = safe(patch.youtubeClientId);
  if (patch.facebookAppId !== undefined) next.facebookAppId = safe(patch.facebookAppId);
  if (patch.twitchClientId !== undefined) next.twitchClientId = safe(patch.twitchClientId);
  if (patch.redirectUriBase !== undefined) next.redirectUriBase = safe(patch.redirectUriBase);

  await setDoc(
    doc(db, 'config', 'oauth'),
    {
      ...next,
      updatedAt: serverTimestamp(),
      updatedBy: authClient.currentUser.uid,
    },
    { merge: true }
  );
};

export const getAccessListConfig = async (): Promise<AccessListConfig> => {
  const db = getDbInstanceSafe();
  try {
    const snap = await getDoc(doc(db, 'config', 'access'));
    if (!snap.exists()) {
      return {
        admins: MASTER_EMAILS.map(normalizeEmail),
        betaTesters: DEFAULT_BETA_TESTERS.map(normalizeEmail),
      };
    }
    const data = snap.data() as any;
    const admins = Array.isArray(data?.admins) ? data.admins.filter((e: any) => typeof e === 'string').map(normalizeEmail) : [];
    const betaTesters = Array.isArray(data?.betaTesters) ? data.betaTesters.filter((e: any) => typeof e === 'string').map(normalizeEmail) : [];
    return {
      admins: Array.from(new Set((admins.length ? admins : MASTER_EMAILS).map(normalizeEmail))),
      betaTesters: Array.from(new Set((betaTesters.length ? betaTesters : DEFAULT_BETA_TESTERS).map(normalizeEmail))),
    };
  } catch (err) {
    return {
      admins: MASTER_EMAILS.map(normalizeEmail),
      betaTesters: DEFAULT_BETA_TESTERS.map(normalizeEmail),
    };
  }
};

export const setAccessListConfig = async (admins: string[], betaTesters: string[]): Promise<void> => {
  const authClient = getAuthInstance();
  const db = getDbInstanceSafe();
  if (!authClient.currentUser) throw new Error('Not signed in');

  const unique = (emails: string[]) => Array.from(new Set(emails.map(normalizeEmail).filter(Boolean)));
  await setDoc(
    doc(db, 'config', 'access'),
    {
      admins: unique(admins),
      betaTesters: unique(betaTesters),
      updatedAt: serverTimestamp(),
      updatedBy: authClient.currentUser.uid,
    },
    { merge: true }
  );
};

export const findUsersByEmail = async (email: string): Promise<UserProfile[]> => {
  const db = getDbInstanceSafe();
  const normalized = normalizeEmail(email);
  const usersRef = collection(db, 'users');
  const results: UserProfile[] = [];

  const snapNormalized = await getDocs(query(usersRef, where('email', '==', normalized)));
  results.push(...snapNormalized.docs.map((d) => d.data() as UserProfile));

  const raw = email.trim();
  if (raw && raw !== normalized) {
    const snapRaw = await getDocs(query(usersRef, where('email', '==', raw)));
    results.push(...snapRaw.docs.map((d) => d.data() as UserProfile));
  }

  const byUid = new Map<string, UserProfile>();
  results.forEach((u) => byUid.set(u.uid, u));
  return Array.from(byUid.values());
};

export const setUserAccessOverrides = async (
  uid: string,
  patch: { role: 'admin' | 'beta_tester'; betaTester: boolean; plan: PlanTier; status: UserProfile['subscription']['status'] }
): Promise<void> => {
  const db = getDbInstanceSafe();
  const userRef = doc(db, 'users', uid);
  await updateDoc(userRef, {
    role: patch.role,
    betaTester: patch.betaTester,
    'subscription.plan': patch.plan,
    'subscription.status': patch.status,
    'subscription.betaOverride': true,
  } as any);
};

export const ensureAffiliateForSignedInUser = async (): Promise<string> => {
  const authClient = getAuthInstance();
  const db = getDbInstanceSafe();
  const currentUser = authClient.currentUser;
  if (!currentUser) return '';

  const snap = await getDoc(doc(db, 'users', currentUser.uid));
  if (!snap.exists()) return '';
  const profile = snap.data() as UserProfile;
  const code = profile?.affiliate?.code?.toUpperCase() || '';
  if (!code) return '';

  const affiliateDocRef = doc(db, 'affiliates', code);
  const existing = await getDoc(affiliateDocRef);
  if (!existing.exists()) {
    await setDoc(affiliateDocRef, {
      code,
      ownerId: currentUser.uid,
      ownerEmail: normalizeEmail(currentUser.email || profile.email || ''),
      ownerName: profile.displayName || currentUser.displayName || 'User',
      commissionRate: 0.2,
      bonusTrialDays: 3,
      totalReferrals: 0,
      totalEarnings: 0,
      createdAt: serverTimestamp(),
      isActive: true,
    } satisfies AffiliateCode as any);
  }

  return code;
};

export const applyLocalAccessOverrides = (profile: UserProfile | null, email?: string | null): UserProfile | null => {
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

// Auth State Observer
export const onAuthChange = (callback: (user: User | null) => void) => {
  if (!authInstance) {
    console.error(firebaseConfigError ?? 'Firebase auth is not initialized.');
    callback(null);
    return () => {};
  }

  return onAuthStateChanged(authInstance, callback);
};

export const onIdTokenChange = (callback: (user: User | null) => void) => {
  if (!authInstance) {
    console.error(firebaseConfigError ?? 'Firebase auth is not initialized.');
    callback(null);
    return () => {};
  }

  return onIdTokenChanged(authInstance, callback);
};
