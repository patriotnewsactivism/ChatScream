// ChatScream Billing Service
// This handles subscription management and checkout
import { buildApiUrl } from './apiClient';

export interface PricingPlan {
  id: string;
  name: string;
  description: string;
  price: number;
  interval: 'month' | 'year';
  features: string[];
  limits: {
    destinations: number;
    localStreamHours: number; // Unlimited for all plans (device streaming)
    cloudStreamHours: number; // Browser-independent cloud broadcast hours
    chatScreams: number;
    storage: number; // GB
  };
  stripePriceId: string;
  popular?: boolean;
  hasWatermark: boolean;
}

// Internal IDs preserve backward compatibility with existing subscriptions.
export type PlanTier = 'free' | 'pro' | 'expert' | 'enterprise' | 'business';

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: 'free',
    name: 'Free',
    description: 'Try ChatScream with essential live streaming',
    price: 0,
    interval: 'month',
    features: [
      '2 streaming destinations',
      'Unlimited local device streaming',
      '0 cloud broadcast hours',
      '720p streaming quality',
      'Basic overlays',
      'ChatScream watermark on stream',
      '1 GB DVR storage',
    ],
    limits: {
      destinations: 2,
      localStreamHours: -1,
      cloudStreamHours: 0,
      chatScreams: 0,
      storage: 1,
    },
    stripePriceId: 'price_free',
    hasWatermark: true,
  },
  {
    id: 'pro',
    name: 'Starter',
    description: 'Affordable multi-streaming with cloud broadcast access',
    price: 19,
    interval: 'month',
    features: [
      '3 simultaneous destinations',
      'Unlimited local device streaming',
      '2 cloud broadcast hours',
      '1080p streaming quality',
      'No watermark',
      'Basic Chat Screamer alerts',
      '25 GB DVR storage',
      'Email support',
    ],
    limits: {
      destinations: 3,
      localStreamHours: -1,
      cloudStreamHours: 2,
      chatScreams: 50,
      storage: 25,
    },
    stripePriceId:
      import.meta.env.VITE_STRIPE_STARTER_PRICE_ID ||
      'price_1U4uH8Q38lVRBBaogRLIp28w',
    hasWatermark: false,
  },
  {
    id: 'expert',
    name: 'Creator',
    description: 'Serious creator capacity with more cloud hours and storage',
    price: 39,
    interval: 'month',
    features: [
      '5 simultaneous destinations',
      'Unlimited local device streaming',
      '8 cloud broadcast hours',
      '1080p/60fps streaming',
      'No watermark',
      'Full Chat Screamer tiers',
      'Custom Scream sounds/visuals',
      '100 GB DVR storage',
      'Priority support',
    ],
    limits: {
      destinations: 5,
      localStreamHours: -1,
      cloudStreamHours: 8,
      chatScreams: 200,
      storage: 100,
    },
    stripePriceId:
      import.meta.env.VITE_STRIPE_CREATOR_PRICE_ID ||
      'price_1U7PZkQ38lVRBBao8s6AHo1O',
    hasWatermark: false,
  },
  {
    id: 'enterprise',
    name: 'Pro',
    description: 'High-capacity professional streaming with API access',
    price: 79,
    interval: 'month',
    features: [
      '8 simultaneous destinations',
      'Unlimited local device streaming',
      '20 cloud broadcast hours',
      '1080p/60fps streaming',
      'No watermark',
      'Maximum Scream customization',
      'Custom TTS voices',
      '250 GB DVR storage',
      'API access',
      'Priority support',
    ],
    limits: {
      destinations: 8,
      localStreamHours: -1,
      cloudStreamHours: 20,
      chatScreams: 999,
      storage: 250,
    },
    stripePriceId:
      import.meta.env.VITE_STRIPE_PRO_PRICE_ID ||
      'price_1U7PZpQ38lVRBBao4VjArshi',
    popular: true,
    hasWatermark: false,
  },
  {
    id: 'business',
    name: 'Business',
    description: 'Cloud-first capacity for teams, agencies, and scheduled channels',
    price: 149,
    interval: 'month',
    features: [
      '10 simultaneous destinations',
      'Unlimited local device streaming',
      '40 cloud broadcast hours',
      'Browser-independent cloud playback',
      'No watermark',
      'Maximum Scream customization',
      'Custom TTS voices',
      '500 GB DVR storage',
      'API access',
      'White-label options',
      '24/7 priority support',
    ],
    limits: {
      destinations: 10,
      localStreamHours: -1,
      cloudStreamHours: 40,
      chatScreams: 999,
      storage: 500,
    },
    stripePriceId:
      import.meta.env.VITE_STRIPE_BUSINESS_PRICE_ID ||
      'price_1U7PZuQ38lVRBBaoUb0prwoJ',
    hasWatermark: false,
  },
];

// Create Checkout Session
export const createCheckoutSession = async (
  priceId: string,
  userId: string,
  userEmail: string,
  successUrl: string,
  cancelUrl: string,
  referralCode?: string,
  token?: string | null,
): Promise<string> => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(buildApiUrl('/api/billing/create-checkout'), {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify({
      priceId,
      userId,
      userEmail,
      successUrl,
      cancelUrl,
      referralCode,
    }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error((data as { message?: string }).message || 'Failed to create checkout session');
  }

  const data = await response.json();
  return data.url;
};

// Create Customer Portal Session
export const createPortalSession = async (
  customerId: string,
  returnUrl: string,
  token?: string | null,
): Promise<string> => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(buildApiUrl('/api/billing/portal'), {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify({
      customerId,
      returnUrl,
    }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error((data as { message?: string }).message || 'Failed to create portal session');
  }

  const data = await response.json();
  return data.url;
};

// Get Plan by ID
export const getPlanById = (planId: string): PricingPlan | undefined => {
  return PRICING_PLANS.find((plan) => plan.id === planId);
};

// Calculate discounted price with affiliate code
export const calculateDiscountedPrice = (
  basePrice: number,
  affiliateDiscount: number = 0,
): number => {
  return basePrice * (1 - affiliateDiscount);
};

// Format price for display
export const formatPrice = (price: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
};

// Check if user has access to feature based on plan
export const hasFeatureAccess = (
  userPlan: string,
  feature: 'chatScreams' | 'destinations' | 'cloudStreamHours' | 'storage',
  currentUsage: number,
): boolean => {
  const plan = getPlanById(userPlan);
  if (!plan) return false;

  const limit = plan.limits[feature];
  if (limit === -1) return true;
  return currentUsage < limit;
};

// Master admin emails — full access, no plan limits
export const ADMIN_EMAILS: string[] = [
  'don@donmatthews.live',
  'mreardon@wtpnews.org',
  'patriotnewsactivism@gmail.com',
];

export const isAdminEmail = (email?: string | null): boolean =>
  !!email && ADMIN_EMAILS.includes(email.trim().toLowerCase());

export const canAddDestination = (
  userPlan: string,
  currentDestinations: number,
  userEmail?: string | null,
): { allowed: boolean; maxDestinations: number; message: string } => {
  if (isAdminEmail(userEmail)) {
    return {
      allowed: true,
      maxDestinations: -1,
      message: 'Admin — unlimited destinations',
    };
  }

  const plan = getPlanById(userPlan);
  if (!plan) {
    return {
      allowed: false,
      maxDestinations: 1,
      message: 'Invalid plan',
    };
  }

  const maxDest = plan.limits.destinations;
  if (maxDest === -1) {
    return {
      allowed: true,
      maxDestinations: -1,
      message: 'Unlimited destinations',
    };
  }

  if (currentDestinations >= maxDest) {
    return {
      allowed: false,
      maxDestinations: maxDest,
      message: `Your ${plan.name} plan allows ${maxDest} destination${maxDest > 1 ? 's' : ''}. Upgrade to add more.`,
    };
  }

  return {
    allowed: true,
    maxDestinations: maxDest,
    message: `${currentDestinations}/${maxDest} destinations used`,
  };
};

export const planHasWatermark = (userPlan: string): boolean => {
  const plan = getPlanById(userPlan);
  return plan?.hasWatermark ?? true;
};

export const getRemainingCloudHours = (
  userPlan: string,
  usedHours: number,
): { remaining: number; total: number; percentUsed: number } => {
  const plan = getPlanById(userPlan);
  if (!plan) {
    return { remaining: 0, total: 0, percentUsed: 100 };
  }

  const total = plan.limits.cloudStreamHours;
  const remaining = Math.max(0, total - usedHours);
  const percentUsed = total > 0 ? Math.min(100, (usedHours / total) * 100) : 100;

  return { remaining, total, percentUsed };
};

export const canUseCloudStreaming = (
  userPlan: string,
  usedHours: number,
): { allowed: boolean; message: string } => {
  const plan = getPlanById(userPlan);
  if (!plan) {
    return { allowed: false, message: 'Invalid plan' };
  }

  const total = plan.limits.cloudStreamHours;
  if (total === 0) {
    return {
      allowed: false,
      message:
        'Cloud broadcasting is not available on the Free plan. Upgrade to Starter for 2 included cloud hours.',
    };
  }

  if (usedHours >= total) {
    return {
      allowed: false,
      message: `You've used all ${total} cloud broadcast hours this month. Upgrade your plan or add cloud hours.`,
    };
  }

  return {
    allowed: true,
    message: `${(total - usedHours).toFixed(1)} cloud hours remaining`,
  };
};

// Chat Screamer tier configuration
export interface ScreamTier {
  id: string;
  name: string;
  label: string;
  emoji: string;
  color: string;
  glowColor: string;
  minAmount: number;
  maxAmount: number | null;
  effects: {
    overlay: 'small' | 'medium' | 'large' | 'fullscreen';
    tts: boolean;
    volume: number; // 0-100
    animation: 'fade' | 'bounce' | 'shake' | 'explode';
    duration: number; // seconds
    customizable: boolean;
  };
}

export const SCREAM_TIERS: ScreamTier[] = [
  {
    id: 'standard',
    name: 'Standard Scream',
    label: 'Scream',
    emoji: '📢',
    color: '#3b82f6',
    glowColor: '#06b6d4',
    minAmount: 5,
    maxAmount: 9.99,
    effects: {
      overlay: 'small',
      tts: true,
      volume: 50,
      animation: 'fade',
      duration: 5,
      customizable: false,
    },
  },
  {
    id: 'loud',
    name: 'Loud Scream',
    label: 'Loud Scream',
    emoji: '🔊',
    color: '#f97316',
    glowColor: '#fbbf24',
    minAmount: 10,
    maxAmount: 49.99,
    effects: {
      overlay: 'medium',
      tts: true,
      volume: 75,
      animation: 'bounce',
      duration: 8,
      customizable: true,
    },
  },
  {
    id: 'maximum',
    name: 'MAXIMUM SCREAM',
    label: 'MAXIMUM SCREAM',
    emoji: '🔥',
    color: '#ef4444',
    glowColor: '#f97316',
    minAmount: 50,
    maxAmount: null,
    effects: {
      overlay: 'fullscreen',
      tts: true,
      volume: 100,
      animation: 'explode',
      duration: 15,
      customizable: true,
    },
  },
];

export const getScreamTier = (amount: number): ScreamTier | null => {
  if (amount < 5) return null;

  for (const tier of [...SCREAM_TIERS].reverse()) {
    if (amount >= tier.minAmount) {
      return tier;
    }
  }

  return SCREAM_TIERS[0];
};