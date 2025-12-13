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
    streamHours: number;
    chatScreams: number;
    storage: number; // GB
  };
  stripePriceId: string;
  popular?: boolean;
}

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: 'free',
    name: 'Free',
    description: 'Perfect for trying out ChatScream',
    price: 0,
    interval: 'month',
    features: [
      '1 streaming destination',
      '720p streaming quality',
      '2 hours/month streaming',
      'Basic overlays',
      'Watermark on stream',
    ],
    limits: {
      destinations: 1,
      streamHours: 2,
      chatScreams: 0,
      storage: 1,
    },
    stripePriceId: 'price_free',
  },
  {
    id: 'starter',
    name: 'Starter',
    description: 'For creators getting started',
    price: 19,
    interval: 'month',
    features: [
      '3 streaming destinations',
      '1080p streaming quality',
      '20 hours/month streaming',
      'Basic Chat Screamer alerts',
      'Cloud storage integration',
      'No watermark',
      'Email support',
    ],
    limits: {
      destinations: 3,
      streamHours: 20,
      chatScreams: 50,
      storage: 25,
    },
    stripePriceId: import.meta.env.VITE_STRIPE_STARTER_PRICE_ID || 'price_starter',
  },
  {
    id: 'creator',
    name: 'Creator',
    description: 'For growing streamers',
    price: 39,
    interval: 'month',
    features: [
      '5 streaming destinations',
      '1080p/60fps streaming',
      '50 hours/month streaming',
      'Full Chat Screamer tiers',
      'Custom Scream sounds/visuals',
      'Leaderboard participation',
      'Priority support',
      'Google Drive & Dropbox sync',
    ],
    limits: {
      destinations: 5,
      streamHours: 50,
      chatScreams: 200,
      storage: 100,
    },
    stripePriceId: import.meta.env.VITE_STRIPE_CREATOR_PRICE_ID || 'price_creator',
  },
  {
    id: 'pro',
    name: 'Professional',
    description: 'For influencers & power users',
    price: 59,
    interval: 'month',
    features: [
      'Unlimited destinations',
      '4K streaming quality',
      'Unlimited streaming hours',
      'Maximum Scream customization',
      'Custom TTS voices',
      'Leaderboard priority',
      'API access',
      'White-label options',
      '24/7 priority support',
      'All cloud integrations',
    ],
    limits: {
      destinations: 999,
      streamHours: 999,
      chatScreams: 999,
      storage: 500,
    },
    stripePriceId: import.meta.env.VITE_STRIPE_PRO_PRICE_ID || 'price_pro',
    popular: true,
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
  feature: 'chatScreams' | 'destinations' | 'streamHours' | 'storage',
  currentUsage: number
): boolean => {
  const plan = getPlanById(userPlan);
  if (!plan) return false;

  return currentUsage < plan.limits[feature];
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
