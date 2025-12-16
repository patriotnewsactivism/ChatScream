// ChatScream Billing Service
// This handles subscription management and checkout

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
    cloudStreamHours: number; // VM-based streaming hours
    chatScreams: number;
    storage: number; // GB
  };
  stripePriceId: string;
  popular?: boolean;
  hasWatermark: boolean;
}

// Plan tier type for easy reference
export type PlanTier = 'free' | 'pro' | 'expert' | 'enterprise';

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: 'free',
    name: 'Free',
    description: 'Perfect for trying out ChatScream',
    price: 0,
    interval: 'month',
    features: [
      '1 streaming destination',
      'Unlimited local device streaming',
      '0 cloud VM streaming hours',
      '720p streaming quality',
      'Basic overlays',
      'ChatScream watermark on stream',
    ],
    limits: {
      destinations: 1,
      localStreamHours: -1, // -1 = unlimited
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
    description: 'Multi-streaming basics + no watermark',
    price: 19,
    interval: 'month',
    features: [
      '3 simultaneous destinations',
      'Unlimited local device streaming',
      '3 hours cloud VM streaming',
      '1080p streaming quality',
      'No watermark',
      'Basic Chat Screamer alerts',
      'Email support',
    ],
    limits: {
      destinations: 3,
      localStreamHours: -1, // -1 = unlimited
      cloudStreamHours: 3,
      chatScreams: 50,
      storage: 25,
    },
    stripePriceId: import.meta.env.VITE_STRIPE_STARTER_PRICE_ID || import.meta.env.VITE_STRIPE_PRO_PRICE_ID || 'price_pro',
    hasWatermark: false,
  },
  {
    id: 'expert',
    name: 'Creator',
    description: 'More destinations + higher cloud hours',
    price: 29,
    interval: 'month',
    features: [
      '5 simultaneous destinations',
      'Unlimited local device streaming',
      '10 hours cloud VM streaming',
      '1080p/60fps streaming',
      'No watermark',
      'Full Chat Screamer tiers',
      'Custom Scream sounds/visuals',
      'Priority support',
    ],
    limits: {
      destinations: 5,
      localStreamHours: -1, // -1 = unlimited
      cloudStreamHours: 10,
      chatScreams: 200,
      storage: 100,
    },
    stripePriceId: import.meta.env.VITE_STRIPE_CREATOR_PRICE_ID || import.meta.env.VITE_STRIPE_EXPERT_PRICE_ID || 'price_expert',
    hasWatermark: false,
  },
  {
    id: 'enterprise',
    name: 'Pro',
    description: 'Unlimited destinations + maximum cloud hours',
    price: 59,
    interval: 'month',
    features: [
      'Unlimited simultaneous destinations',
      'Unlimited local device streaming',
      '50 hours cloud VM streaming',
      '4K streaming quality',
      'No watermark',
      'Maximum Scream customization',
      'Custom TTS voices',
      'API access',
      'White-label options',
      '24/7 priority support',
    ],
    limits: {
      destinations: -1, // -1 = unlimited
      localStreamHours: -1, // -1 = unlimited
      cloudStreamHours: 50,
      chatScreams: 999,
      storage: 500,
    },
    stripePriceId: import.meta.env.VITE_STRIPE_PRO_PRICE_ID || import.meta.env.VITE_STRIPE_ENTERPRISE_PRICE_ID || 'price_enterprise',
    popular: true,
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
  referralCode?: string
): Promise<string> => {
  // In production, this would call your Cloud Function
  const response = await fetch('/api/create-checkout-session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
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
    throw new Error('Failed to create checkout session');
  }

  const data = await response.json();
  return data.url;
};

// Create Customer Portal Session
export const createPortalSession = async (
  customerId: string,
  returnUrl: string
): Promise<string> => {
  const response = await fetch('/api/create-portal-session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      customerId,
      returnUrl,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to create portal session');
  }

  const data = await response.json();
  return data.url;
};

// Get Plan by ID
export const getPlanById = (planId: string): PricingPlan | undefined => {
  return PRICING_PLANS.find(plan => plan.id === planId);
};

// Calculate discounted price with affiliate code
export const calculateDiscountedPrice = (
  basePrice: number,
  affiliateDiscount: number = 0
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
  currentUsage: number
): boolean => {
  const plan = getPlanById(userPlan);
  if (!plan) return false;

  const limit = plan.limits[feature];
  // -1 means unlimited
  if (limit === -1) return true;
  return currentUsage < limit;
};

// Check if user can add more destinations
export const canAddDestination = (
  userPlan: string,
  currentDestinations: number
): { allowed: boolean; maxDestinations: number; message: string } => {
  const plan = getPlanById(userPlan);
  if (!plan) {
    return {
      allowed: false,
      maxDestinations: 1,
      message: 'Invalid plan'
    };
  }

  const maxDest = plan.limits.destinations;
  // -1 means unlimited
  if (maxDest === -1) {
    return {
      allowed: true,
      maxDestinations: -1,
      message: 'Unlimited destinations'
    };
  }

  if (currentDestinations >= maxDest) {
    return {
      allowed: false,
      maxDestinations: maxDest,
      message: `Your ${plan.name} plan allows ${maxDest} destination${maxDest > 1 ? 's' : ''}. Upgrade to add more.`
    };
  }

  return {
    allowed: true,
    maxDestinations: maxDest,
    message: `${currentDestinations}/${maxDest} destinations used`
  };
};

// Check if plan has watermark requirement
export const planHasWatermark = (userPlan: string): boolean => {
  const plan = getPlanById(userPlan);
  return plan?.hasWatermark ?? true;
};

// Get remaining cloud hours
export const getRemainingCloudHours = (
  userPlan: string,
  usedHours: number
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

// Check if cloud streaming is available
export const canUseCloudStreaming = (
  userPlan: string,
  usedHours: number
): { allowed: boolean; message: string } => {
  const plan = getPlanById(userPlan);
  if (!plan) {
    return { allowed: false, message: 'Invalid plan' };
  }

  const total = plan.limits.cloudStreamHours;
  if (total === 0) {
    return {
      allowed: false,
      message: 'Cloud streaming is not available on the Free plan. Upgrade to Pro for 3 hours of cloud streaming.'
    };
  }

  if (usedHours >= total) {
    return {
      allowed: false,
      message: `You've used all ${total} cloud streaming hours this month. Upgrade your plan for more hours.`
    };
  }

  return {
    allowed: true,
    message: `${(total - usedHours).toFixed(1)} cloud hours remaining`
  };
};

// Chat Screamer tier configuration
export interface ScreamTier {
  id: string;
  name: string;
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

// Get scream tier based on donation amount
export const getScreamTier = (amount: number): ScreamTier | null => {
  if (amount < 5) return null;

  for (const tier of [...SCREAM_TIERS].reverse()) {
    if (amount >= tier.minAmount) {
      return tier;
    }
  }

  return SCREAM_TIERS[0];
};
