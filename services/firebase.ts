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

// Firebase configuration - Replace with your actual config
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "demo-api-key",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "streamhub-pro.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "streamhub-pro",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "streamhub-pro.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "123456789",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:123456789:web:abc123"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

const googleProvider = new GoogleAuthProvider();

// User Profile Interface
export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  createdAt: Timestamp;
  subscription: {
    plan: 'free' | 'starter' | 'pro' | 'enterprise';
    status: 'trialing' | 'active' | 'canceled' | 'past_due';
    trialEndsAt?: Timestamp;
    currentPeriodEnd?: Timestamp;
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
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
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
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
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  return userCredential.user;
};

export const signInWithGoogle = async (referralCode?: string): Promise<User> => {
  const userCredential = await signInWithPopup(auth, googleProvider);
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
  await signOut(auth);
};

export const resetPassword = async (email: string): Promise<void> => {
  await sendPasswordResetEmail(auth, email);
};

// User Profile Functions
export const getUserProfile = async (uid: string): Promise<UserProfile | null> => {
  const userDoc = await getDoc(doc(db, 'users', uid));
  if (userDoc.exists()) {
    return userDoc.data() as UserProfile;
  }
  return null;
};

export const updateUserProfile = async (uid: string, data: Partial<UserProfile>): Promise<void> => {
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
  return onAuthStateChanged(auth, callback);
};
