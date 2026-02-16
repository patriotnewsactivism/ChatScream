// Cloud Streaming Hours Tracking Service
// Manages cloud VM streaming time allocation per subscription tier.

import { ApiRequestError, apiRequest } from './apiClient';
import { getCurrentSessionToken } from './backend';
import { canUseCloudStreaming, getRemainingCloudHours, getPlanById } from './stripe';

export interface CloudStreamingStatus {
  canStream: boolean;
  hoursUsed: number;
  hoursRemaining: number;
  hoursTotal: number;
  percentUsed: number;
  message: string;
  resetDate?: Date;
  activeSession?: ActiveCloudSession | null;
  activeEstimate?: CloudCostEstimate | null;
  defaultEstimate?: CloudCostEstimate | null;
  costModel?: CloudCostModel;
}

export interface StreamSession {
  sessionId: string;
  userId: string;
  startTime: Date;
  endTime?: Date;
  durationMinutes: number;
  streamType: 'local' | 'cloud';
  destinationCount: number;
}

export type CloudStreamQuality = '720p' | '1080p';
export type CloudInstanceProfile = 't3.medium' | 'c7g.large' | 'c6i.xlarge' | 'g4dn.xlarge';

export interface CloudCostModel {
  region: string;
  minDestinations: number;
  maxDestinations: number;
  instanceRatesPerHour: Record<string, number>;
  publicIpv4PerHour: number;
  dataOutPerGb: number;
  storagePerGbMonth: number;
  bitrateKbpsByQuality: Record<CloudStreamQuality, number>;
}

export interface CloudCostEstimate {
  region: string;
  destinationCount: number;
  quality: CloudStreamQuality;
  bitrateKbps: number;
  instanceProfile: CloudInstanceProfile;
  storageGb: number;
  instancePerHour: number;
  ipv4PerHour: number;
  dataOutPerHour: number;
  storagePerHour: number;
  basePerHour: number;
  totalPerHour: number;
  totalPerMonth: number;
  dataOutGbPerHour: number;
  totalBitrateMbps: number;
  notes?: string;
}

export interface ActiveCloudSession {
  sessionId: string;
  startTime: Date;
  destinationCount: number;
  quality: CloudStreamQuality;
  bitrateKbps: number;
  instanceProfile: CloudInstanceProfile;
  storageGb: number;
  estimatedCostPerHour?: number;
}

export interface CloudSessionStartOptions {
  quality?: CloudStreamQuality;
  resolution?: CloudStreamQuality;
  bitrateKbps?: number;
  instanceProfile?: CloudInstanceProfile;
  storageGb?: number;
}

const token = () => getCurrentSessionToken();

const asNumber = (value: unknown, fallback = 0) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const asDate = (value: unknown): Date | undefined => {
  if (!value) return undefined;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const normalizeQuality = (value: unknown): CloudStreamQuality =>
  String(value || '').toLowerCase() === '1080p' ? '1080p' : '720p';

const normalizeInstanceProfile = (value: unknown): CloudInstanceProfile => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (normalized === 't3.medium') return 't3.medium';
  if (normalized === 'c7g.large') return 'c7g.large';
  if (normalized === 'c6i.xlarge') return 'c6i.xlarge';
  if (normalized === 'g4dn.xlarge') return 'g4dn.xlarge';
  return 'c7g.large';
};

const parseCloudEstimate = (value: unknown): CloudCostEstimate | null => {
  const data = asRecord(value);
  if (!data.region) return null;
  return {
    region: String(data.region || 'us-east-1'),
    destinationCount: asNumber(data.destinationCount, 1),
    quality: normalizeQuality(data.quality),
    bitrateKbps: asNumber(data.bitrateKbps),
    instanceProfile: normalizeInstanceProfile(data.instanceProfile),
    storageGb: asNumber(data.storageGb),
    instancePerHour: asNumber(data.instancePerHour),
    ipv4PerHour: asNumber(data.ipv4PerHour),
    dataOutPerHour: asNumber(data.dataOutPerHour),
    storagePerHour: asNumber(data.storagePerHour),
    basePerHour: asNumber(data.basePerHour),
    totalPerHour: asNumber(data.totalPerHour),
    totalPerMonth: asNumber(data.totalPerMonth),
    dataOutGbPerHour: asNumber(data.dataOutGbPerHour),
    totalBitrateMbps: asNumber(data.totalBitrateMbps),
    notes: typeof data.notes === 'string' ? data.notes : undefined,
  };
};

const parseActiveSession = (value: unknown): ActiveCloudSession | null => {
  const data = asRecord(value);
  if (!data.sessionId) return null;
  const startTime = asDate(data.startTime);
  if (!startTime) return null;

  return {
    sessionId: String(data.sessionId),
    startTime,
    destinationCount: asNumber(data.destinationCount, 1),
    quality: normalizeQuality(data.quality),
    bitrateKbps: asNumber(data.bitrateKbps),
    instanceProfile: normalizeInstanceProfile(data.instanceProfile),
    storageGb: asNumber(data.storageGb),
    estimatedCostPerHour: asNumber(data.estimatedCostPerHour),
  };
};

const parseCloudCostModel = (value: unknown): CloudCostModel | undefined => {
  const data = asRecord(value);
  if (!data.region) return undefined;

  const instanceRatesPerHour = Object.entries(asRecord(data.instanceRatesPerHour)).reduce<
    Record<string, number>
  >((acc, [key, rate]) => {
    acc[key] = asNumber(rate);
    return acc;
  }, {});

  const bitrates = asRecord(data.bitrateKbpsByQuality);
  const bitrateKbpsByQuality = {
    '720p': asNumber(bitrates['720p'], 4000),
    '1080p': asNumber(bitrates['1080p'], 6000),
  };

  return {
    region: String(data.region || 'us-east-1'),
    minDestinations: asNumber(data.minDestinations, 1),
    maxDestinations: asNumber(data.maxDestinations, 5),
    instanceRatesPerHour,
    publicIpv4PerHour: asNumber(data.publicIpv4PerHour, 0.005),
    dataOutPerGb: asNumber(data.dataOutPerGb, 0.09),
    storagePerGbMonth: asNumber(data.storagePerGbMonth, 0.08),
    bitrateKbpsByQuality,
  };
};

// Get current cloud streaming status for a user.
export const getCloudStreamingStatus = async (
  userId: string,
  userPlan: string,
): Promise<CloudStreamingStatus> => {
  const remainingFromPlan = getRemainingCloudHours(userPlan, 0);
  const fallbackCanUse = canUseCloudStreaming(userPlan, 0);

  const fallback: CloudStreamingStatus = {
    canStream: fallbackCanUse.allowed,
    hoursUsed: 0,
    hoursRemaining: remainingFromPlan.remaining,
    hoursTotal: remainingFromPlan.total,
    percentUsed: remainingFromPlan.percentUsed,
    message: fallbackCanUse.message,
  };

  try {
    const response = await apiRequest<unknown>(
      `/api/cloud-streaming/status?userId=${encodeURIComponent(userId)}&plan=${encodeURIComponent(userPlan)}`,
      {
        method: 'GET',
        token: token(),
      },
    );

    const data = asRecord(response);
    const canStream = typeof data.canStream === 'boolean' ? data.canStream : fallback.canStream;
    const hoursUsed = asNumber(data.hoursUsed);
    const hoursTotal = asNumber(data.hoursTotal, fallback.hoursTotal);
    const hoursRemaining = asNumber(data.hoursRemaining, Math.max(0, hoursTotal - hoursUsed));
    const percentUsed = asNumber(
      data.percentUsed,
      hoursTotal > 0 ? Math.min(100, (hoursUsed / hoursTotal) * 100) : 100,
    );

    return {
      canStream,
      hoursUsed,
      hoursRemaining,
      hoursTotal,
      percentUsed,
      message: String(data.message || fallback.message),
      resetDate: asDate(data.resetDate),
      activeSession: parseActiveSession(data.activeSession),
      activeEstimate: parseCloudEstimate(data.activeEstimate),
      defaultEstimate: parseCloudEstimate(data.defaultEstimate),
      costModel: parseCloudCostModel(data.costModel),
    };
  } catch (err) {
    if (err instanceof ApiRequestError && (err.status === 404 || err.status === 405)) {
      return fallback;
    }
    console.error('Error getting cloud streaming status:', err);
    return {
      ...fallback,
      canStream: false,
      message: 'Error checking streaming status',
    };
  }
};

// Start a cloud streaming session.
export const startCloudSession = async (
  userId: string,
  userPlan: string,
  destinationCount: number,
  options: CloudSessionStartOptions = {},
): Promise<{
  success: boolean;
  sessionId?: string;
  estimate?: CloudCostEstimate;
  message: string;
}> => {
  try {
    const response = await apiRequest<unknown>('/api/cloud-streaming/sessions/start', {
      method: 'POST',
      token: token(),
      body: { userId, userPlan, destinationCount, ...options },
    });
    const data = asRecord(response);
    return {
      success: data.success !== false,
      sessionId: typeof data.sessionId === 'string' ? data.sessionId : undefined,
      estimate: parseCloudEstimate(data.estimate) || undefined,
      message: typeof data.message === 'string' ? data.message : 'Cloud streaming session started',
    };
  } catch (err) {
    if (err instanceof ApiRequestError && (err.status === 404 || err.status === 405)) {
      const status = await getCloudStreamingStatus(userId, userPlan);
      return {
        success: false,
        message: status.canStream
          ? 'Cloud streaming API endpoint is not available yet.'
          : status.message,
      };
    }
    console.error('Error starting cloud session:', err);
    return { success: false, message: 'Failed to start cloud streaming session' };
  }
};

// End a cloud streaming session and record usage.
export const endCloudSession = async (
  userId: string,
  sessionId: string,
): Promise<{
  success: boolean;
  minutesUsed: number;
  estimatedCostUsd: number;
  message: string;
}> => {
  try {
    const response = await apiRequest<unknown>('/api/cloud-streaming/sessions/end', {
      method: 'POST',
      token: token(),
      body: { userId, sessionId },
    });
    const data = asRecord(response);
    return {
      success: data.success !== false,
      minutesUsed: asNumber(data.minutesUsed),
      estimatedCostUsd: asNumber(data.estimatedCostUsd),
      message: typeof data.message === 'string' ? data.message : 'Session ended',
    };
  } catch (err) {
    console.error('Error ending cloud session:', err);
    return {
      success: false,
      minutesUsed: 0,
      estimatedCostUsd: 0,
      message: 'Failed to end cloud streaming session',
    };
  }
};

// Reset cloud hours (called at billing period reset).
export const resetCloudHours = async (userId: string): Promise<boolean> => {
  try {
    const response = await apiRequest<unknown>('/api/cloud-streaming/reset', {
      method: 'POST',
      token: token(),
      body: { userId },
    });
    const data =
      response && typeof response === 'object' ? (response as Record<string, unknown>) : {};
    return data.success !== false;
  } catch (err) {
    console.error('Error resetting cloud hours:', err);
    return false;
  }
};

// Get estimated time remaining based on current usage rate.
export const getEstimatedTimeRemaining = (
  hoursRemaining: number,
  sessionStartTime?: Date,
): string => {
  if (sessionStartTime) {
    // Reserved for future enhancement where we project burnout based on active session pace.
  }
  if (hoursRemaining <= 0) {
    return 'No time remaining';
  }

  const hours = Math.floor(hoursRemaining);
  const minutes = Math.round((hoursRemaining - hours) * 60);

  if (hours === 0) {
    return `${minutes} minutes remaining`;
  }

  return `${hours}h ${minutes}m remaining`;
};

// Format cloud hours for display.
export const formatCloudHours = (hours: number): string => {
  if (hours === 0) return '0 hours';
  if (hours < 1) {
    const minutes = Math.round(hours * 60);
    return `${minutes} minutes`;
  }
  return `${hours.toFixed(1)} hours`;
};

// Check if user is currently in a cloud session.
export const hasActiveCloudSession = async (userId: string): Promise<boolean> => {
  try {
    const response = await apiRequest<unknown>(
      `/api/cloud-streaming/sessions/active?userId=${encodeURIComponent(userId)}`,
      {
        method: 'GET',
        token: token(),
      },
    );
    const data = asRecord(response);
    return Boolean(data.active || data.hasActiveSession);
  } catch (err) {
    if (err instanceof ApiRequestError && (err.status === 404 || err.status === 405)) {
      return false;
    }
    console.error('Error checking active session:', err);
    return false;
  }
};

// Fetch detailed active cloud session state.
export const getActiveCloudSession = async (
  userId: string,
): Promise<{
  active: boolean;
  session: ActiveCloudSession | null;
  estimate: CloudCostEstimate | null;
}> => {
  try {
    const response = await apiRequest<unknown>(
      `/api/cloud-streaming/sessions/active?userId=${encodeURIComponent(userId)}`,
      {
        method: 'GET',
        token: token(),
      },
    );

    const data = asRecord(response);
    return {
      active: Boolean(data.active || data.hasActiveSession),
      session: parseActiveSession(data.session),
      estimate: parseCloudEstimate(data.estimate),
    };
  } catch (err) {
    if (err instanceof ApiRequestError && (err.status === 404 || err.status === 405)) {
      return { active: false, session: null, estimate: null };
    }
    console.error('Error getting active cloud session:', err);
    return { active: false, session: null, estimate: null };
  }
};

// Get cloud streaming estimate using server pricing model.
export const estimateCloudStreamingCost = async (params: {
  destinationCount: number;
  quality?: CloudStreamQuality;
  resolution?: CloudStreamQuality;
  bitrateKbps?: number;
  instanceProfile?: CloudInstanceProfile;
  storageGb?: number;
}): Promise<{ success: boolean; estimate?: CloudCostEstimate; message: string }> => {
  try {
    const response = await apiRequest<unknown>('/api/cloud-streaming/estimate', {
      method: 'POST',
      token: token(),
      body: params,
    });
    const data = asRecord(response);
    const estimate = parseCloudEstimate(data.estimate);
    return {
      success: data.success !== false && Boolean(estimate),
      estimate: estimate || undefined,
      message: typeof data.message === 'string' ? data.message : 'Estimate calculated',
    };
  } catch (err) {
    if (err instanceof ApiRequestError && (err.status === 404 || err.status === 405)) {
      return {
        success: false,
        message: 'Cloud estimate API endpoint is not available yet.',
      };
    }
    console.error('Error estimating cloud streaming cost:', err);
    return { success: false, message: 'Failed to estimate cloud streaming cost' };
  }
};

// Get cloud streaming cost model and available instance profiles.
export const getCloudCostModel = async (): Promise<{
  success: boolean;
  costModel?: CloudCostModel;
  instanceProfiles?: Array<{ id: CloudInstanceProfile; label: string; ratePerHour: number }>;
  message: string;
}> => {
  try {
    const response = await apiRequest<unknown>('/api/cloud-streaming/cost-model', {
      method: 'GET',
      token: token(),
    });
    const data = asRecord(response);
    const rawProfiles = Array.isArray(data.instanceProfiles) ? data.instanceProfiles : [];
    const instanceProfiles = rawProfiles
      .map((entry) => {
        const profile = asRecord(entry);
        const id = normalizeInstanceProfile(profile.id);
        const label = typeof profile.label === 'string' ? profile.label : id;
        const ratePerHour = asNumber(profile.ratePerHour);
        return { id, label, ratePerHour };
      })
      .filter((profile) => profile.ratePerHour > 0);

    return {
      success: true,
      costModel: parseCloudCostModel(data.costModel),
      instanceProfiles,
      message: typeof data.message === 'string' ? data.message : 'Cost model loaded',
    };
  } catch (err) {
    if (err instanceof ApiRequestError && (err.status === 404 || err.status === 405)) {
      return {
        success: false,
        message: 'Cloud cost model API endpoint is not available yet.',
      };
    }
    console.error('Error loading cloud cost model:', err);
    return { success: false, message: 'Failed to load cloud cost model' };
  }
};

// Get cloud streaming tier info for display.
export const getCloudTierInfo = (
  userPlan: string,
): {
  tierName: string;
  hoursIncluded: number;
  description: string;
} => {
  const plan = getPlanById(userPlan);

  if (!plan) {
    return {
      tierName: 'Free',
      hoursIncluded: 0,
      description: 'Cloud streaming not available. Upgrade to Pro for 3 hours/month.',
    };
  }

  const hours = plan.limits.cloudStreamHours;

  switch (userPlan) {
    case 'free':
      return {
        tierName: 'Free',
        hoursIncluded: 0,
        description: 'Unlimited local device streaming. Upgrade to Pro for cloud VM streaming.',
      };
    case 'pro':
      return {
        tierName: 'Pro',
        hoursIncluded: 3,
        description:
          '3 hours of cloud VM streaming per month. Perfect for occasional cloud broadcasts.',
      };
    case 'expert':
      return {
        tierName: 'Expert',
        hoursIncluded: 10,
        description: '10 hours of cloud VM streaming per month. Great for regular streamers.',
      };
    case 'enterprise':
      return {
        tierName: 'Enterprise',
        hoursIncluded: 50,
        description: '50 hours of cloud VM streaming per month. Maximum capacity for power users.',
      };
    default:
      return {
        tierName: plan.name,
        hoursIncluded: hours,
        description: `${hours} hours of cloud VM streaming per month.`,
      };
  }
};
