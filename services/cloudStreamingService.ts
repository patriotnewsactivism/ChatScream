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

const token = () => getCurrentSessionToken();

const asNumber = (value: unknown, fallback = 0) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const asDate = (value: unknown): Date | undefined => {
  if (!value) return undefined;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
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

    const data =
      response && typeof response === 'object' ? (response as Record<string, unknown>) : {};
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
): Promise<{ success: boolean; sessionId?: string; message: string }> => {
  try {
    const response = await apiRequest<unknown>('/api/cloud-streaming/sessions/start', {
      method: 'POST',
      token: token(),
      body: { userId, userPlan, destinationCount },
    });
    const data =
      response && typeof response === 'object' ? (response as Record<string, unknown>) : {};
    return {
      success: data.success !== false,
      sessionId: typeof data.sessionId === 'string' ? data.sessionId : undefined,
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
): Promise<{ success: boolean; minutesUsed: number; message: string }> => {
  try {
    const response = await apiRequest<unknown>('/api/cloud-streaming/sessions/end', {
      method: 'POST',
      token: token(),
      body: { userId, sessionId },
    });
    const data =
      response && typeof response === 'object' ? (response as Record<string, unknown>) : {};
    return {
      success: data.success !== false,
      minutesUsed: asNumber(data.minutesUsed),
      message: typeof data.message === 'string' ? data.message : 'Session ended',
    };
  } catch (err) {
    console.error('Error ending cloud session:', err);
    return { success: false, minutesUsed: 0, message: 'Failed to end cloud streaming session' };
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
    const data =
      response && typeof response === 'object' ? (response as Record<string, unknown>) : {};
    return Boolean(data.active || data.hasActiveSession);
  } catch (err) {
    if (err instanceof ApiRequestError && (err.status === 404 || err.status === 405)) {
      return false;
    }
    console.error('Error checking active session:', err);
    return false;
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
