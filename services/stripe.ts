// Stripe Billing Service
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
    chatStreams: number;
    storage: number; // GB
  };
  stripePriceId: string;
  popular?: boolean;
}

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: 'free',
    name: 'Free',
    description: 'Perfect for trying out StreamHub Pro',
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
      chatStreams: 0,
      storage: 1,
    },
    stripePriceId: 'price_free',
  },
  {
    id: 'starter',
    name: 'Starter',
    description: 'For content creators getting started',
    price: 9.99,
    interval: 'month',
    features: [
      '3 streaming destinations',
      '1080p streaming quality',
      '20 hours/month streaming',
      'Custom overlays & branding',
      'Chat Stream feature',
      'No watermark',
      'Priority support',
    ],
    limits: {
      destinations: 3,
      streamHours: 20,
      chatStreams: 5,
      storage: 10,
    },
    stripePriceId: import.meta.env.VITE_STRIPE_STARTER_PRICE_ID || 'price_starter',
    popular: true,
  },
  {
    id: 'pro',
    name: 'Pro',
    description: 'For serious streamers and businesses',
    price: 29.99,
    interval: 'month',
    features: [
      'Unlimited destinations',
      '4K streaming quality',
      'Unlimited streaming hours',
      'Advanced AI features',
      'Unlimited Chat Streams',
      'Cloud recording storage',
      'Analytics dashboard',
      'Custom RTMP endpoints',
      'API access',
      '24/7 priority support',
    ],
    limits: {
      destinations: 999,
      streamHours: 999,
      chatStreams: 999,
      storage: 100,
    },
    stripePriceId: import.meta.env.VITE_STRIPE_PRO_PRICE_ID || 'price_pro',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'Custom solutions for large organizations',
    price: 99.99,
    interval: 'month',
    features: [
      'Everything in Pro',
      'Dedicated infrastructure',
      'Custom integrations',
      'SLA guarantee',
      'Dedicated account manager',
      'White-label options',
      'Team management',
      'Advanced analytics',
    ],
    limits: {
      destinations: 999,
      streamHours: 999,
      chatStreams: 999,
      storage: 1000,
    },
    stripePriceId: import.meta.env.VITE_STRIPE_ENTERPRISE_PRICE_ID || 'price_enterprise',
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
  }).format(price);
};

// Check if user has access to feature based on plan
export const hasFeatureAccess = (
  userPlan: string,
  feature: 'chatStreams' | 'destinations' | 'streamHours' | 'storage',
  currentUsage: number
): boolean => {
  const plan = getPlanById(userPlan);
  if (!plan) return false;

  return currentUsage < plan.limits[feature];
};
