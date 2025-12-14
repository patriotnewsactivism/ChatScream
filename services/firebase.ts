import { initializeApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail,
  User
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
  subscription: {
    plan: PlanTier;
    status: 'trialing' | 'active' | 'canceled' | 'past_due';
    trialEndsAt?: Timestamp;
    currentPeriodEnd?: Timestamp;
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
  };
  usage: {
    cloudHoursUsed: number; // Cloud VM streaming hours used this billing period
    cloudHoursResetAt?: Timestamp; // When cloud hours reset (next billing date)
    lastStreamDate?: Timestamp; // When user last streamed
  };
  affiliate?: {
    code: string;
    referredBy?: string;
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
  const userCredential = await createUserWithEmailAndPassword(authClient, email, password);
  const user = userCredential.user;

  // Calculate trial days (7 default, 14 with referral)
  let trialDays = 7;
  let referredBy: string | undefined;

  if (referralCode) {
    const affiliateData = await getAffiliateByCode(referralCode);
    if (affiliateData && affiliateData.isActive) {
      trialDays = 7 + affiliateData.bonusTrialDays; // 7 + 7 = 14 for MMM code
      referredBy = affiliateData.code;

      // Update referral count
      await updateAffiliateReferral(referralCode);
    }
  }

  const trialEndsAt = Timestamp.fromDate(
    new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000)
  );

  // Create user profile in Firestore
  const userProfile: UserProfile = {
    uid: user.uid,
    email: email,
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
      code: generateAffiliateCode(user.uid),
      referredBy: referredBy,
      referrals: 0,
      totalEarnings: 0,
      pendingPayout: 0,
    } : {
      code: generateAffiliateCode(user.uid),
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

  return user;
};

export const signInWithEmail = async (email: string, password: string): Promise<User> => {
  const authClient = getAuthInstance();
  const userCredential = await signInWithEmailAndPassword(authClient, email, password);
  return userCredential.user;
};

export const signInWithGoogle = async (referralCode?: string): Promise<User> => {
  const authClient = getAuthInstance();
  const db = getDbInstanceSafe();
  const userCredential = await signInWithPopup(authClient, googleProvider);
  const user = userCredential.user;

  // Check if user profile exists
  const userDoc = await getDoc(doc(db, 'users', user.uid));

  if (!userDoc.exists()) {
    // New user - create profile
    let trialDays = 7;
    let referredBy: string | undefined;

    if (referralCode) {
      const affiliateData = await getAffiliateByCode(referralCode);
      if (affiliateData && affiliateData.isActive) {
        trialDays = 7 + affiliateData.bonusTrialDays;
        referredBy = affiliateData.code;
        await updateAffiliateReferral(referralCode);
      }
    }

    const trialEndsAt = Timestamp.fromDate(
      new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000)
    );

    const userProfile: UserProfile = {
      uid: user.uid,
      email: user.email || '',
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
        code: generateAffiliateCode(user.uid),
        referredBy: referredBy,
        referrals: 0,
        totalEarnings: 0,
        pendingPayout: 0,
      } : {
        code: generateAffiliateCode(user.uid),
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
  }

  return user;
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
const generateAffiliateCode = (uid: string): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

export const getAffiliateByCode = async (code: string): Promise<AffiliateCode | null> => {
  const db = getDbInstanceSafe();
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

  if (specialCodes[code.toUpperCase()]) {
    return specialCodes[code.toUpperCase()];
  }

  // Check Firestore for user-created affiliate codes
  const affiliatesRef = collection(db, 'affiliates');
  const q = query(affiliatesRef, where('code', '==', code.toUpperCase()));
  const querySnapshot = await getDocs(q);

  if (!querySnapshot.empty) {
    return querySnapshot.docs[0].data() as AffiliateCode;
  }

  return null;
};

export const updateAffiliateReferral = async (code: string): Promise<void> => {
  const db = getDbInstanceSafe();
  // Skip for special codes - they're tracked differently
  if (code.toUpperCase() === 'MMM') {
    // Log referral for Mythical Meta
    const referralDoc = doc(collection(db, 'referrals'));
    await setDoc(referralDoc, {
      affiliateCode: 'MMM',
      createdAt: serverTimestamp(),
    });
    return;
  }

  const affiliatesRef = collection(db, 'affiliates');
  const q = query(affiliatesRef, where('code', '==', code.toUpperCase()));
  const querySnapshot = await getDocs(q);

  if (!querySnapshot.empty) {
    const affiliateDoc = querySnapshot.docs[0];
    await updateDoc(affiliateDoc.ref, {
      totalReferrals: (affiliateDoc.data().totalReferrals || 0) + 1,
    });
  }
};

export const createAffiliateCode = async (
  userId: string,
  userEmail: string,
  userName: string
): Promise<string> => {
  const db = getDbInstanceSafe();
  const code = generateAffiliateCode(userId);

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

// Auth State Observer
export const onAuthChange = (callback: (user: User | null) => void) => {
  if (!authInstance) {
    console.error(firebaseConfigError ?? 'Firebase auth is not initialized.');
    callback(null);
    return () => {};
  }

  return onAuthStateChanged(authInstance, callback);
};
