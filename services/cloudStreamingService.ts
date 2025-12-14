// Cloud Streaming Hours Tracking Service
// Manages cloud VM streaming time allocation per subscription tier

import {
  doc,
  updateDoc,
  getDoc,
  Timestamp,
  serverTimestamp
} from 'firebase/firestore';
import { db } from './firebase';
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

// Get current cloud streaming status for a user
export const getCloudStreamingStatus = async (
  userId: string,
  userPlan: string
): Promise<CloudStreamingStatus> => {
  if (!db) {
    return {
      canStream: false,
      hoursUsed: 0,
      hoursRemaining: 0,
      hoursTotal: 0,
      percentUsed: 0,
      message: 'Database not configured'
    };
  }

  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (!userDoc.exists()) {
      return {
        canStream: false,
        hoursUsed: 0,
        hoursRemaining: 0,
        hoursTotal: 0,
        percentUsed: 0,
        message: 'User not found'
      };
    }

    const userData = userDoc.data();
    const usage = userData.usage || { cloudHoursUsed: 0 };
    const hoursUsed = usage.cloudHoursUsed || 0;

    // Check if user can stream
    const canStream = canUseCloudStreaming(userPlan, hoursUsed);
    const remaining = getRemainingCloudHours(userPlan, hoursUsed);

    // Get reset date from subscription if available
    let resetDate: Date | undefined;
    if (userData.subscription?.currentPeriodEnd) {
      resetDate = userData.subscription.currentPeriodEnd.toDate();
    } else if (usage.cloudHoursResetAt) {
      resetDate = usage.cloudHoursResetAt.toDate();
    }

    return {
      canStream: canStream.allowed,
      hoursUsed,
      hoursRemaining: remaining.remaining,
      hoursTotal: remaining.total,
      percentUsed: remaining.percentUsed,
      message: canStream.message,
      resetDate
    };
  } catch (error) {
    console.error('Error getting cloud streaming status:', error);
    return {
      canStream: false,
      hoursUsed: 0,
      hoursRemaining: 0,
      hoursTotal: 0,
      percentUsed: 0,
      message: 'Error checking streaming status'
    };
  }
};

// Start a cloud streaming session
export const startCloudSession = async (
  userId: string,
  userPlan: string,
  destinationCount: number
): Promise<{ success: boolean; sessionId?: string; message: string }> => {
  if (!db) {
    return { success: false, message: 'Database not configured' };
  }

  try {
    // Check if user can stream
    const status = await getCloudStreamingStatus(userId, userPlan);
    if (!status.canStream) {
      return { success: false, message: status.message };
    }

    // Generate session ID
    const sessionId = `cloud_${userId}_${Date.now()}`;

    // Update user document with active session
    await updateDoc(doc(db, 'users', userId), {
      'usage.activeCloudSession': {
        sessionId,
        startTime: serverTimestamp(),
        destinationCount
      },
      'usage.lastStreamDate': serverTimestamp()
    });

    return { success: true, sessionId, message: 'Cloud streaming session started' };
  } catch (error) {
    console.error('Error starting cloud session:', error);
    return { success: false, message: 'Failed to start cloud streaming session' };
  }
};

// End a cloud streaming session and record usage
export const endCloudSession = async (
  userId: string,
  sessionId: string
): Promise<{ success: boolean; minutesUsed: number; message: string }> => {
  if (!db) {
    return { success: false, minutesUsed: 0, message: 'Database not configured' };
  }

  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (!userDoc.exists()) {
      return { success: false, minutesUsed: 0, message: 'User not found' };
    }

    const userData = userDoc.data();
    const activeSession = userData.usage?.activeCloudSession;

    if (!activeSession || activeSession.sessionId !== sessionId) {
      return { success: false, minutesUsed: 0, message: 'No active session found' };
    }

    // Calculate duration
    const startTime = activeSession.startTime.toDate();
    const endTime = new Date();
    const durationMinutes = Math.ceil((endTime.getTime() - startTime.getTime()) / (1000 * 60));
    const durationHours = durationMinutes / 60;

    // Update usage
    const currentUsage = userData.usage?.cloudHoursUsed || 0;
    const newUsage = Math.round((currentUsage + durationHours) * 100) / 100; // Round to 2 decimal places

    await updateDoc(doc(db, 'users', userId), {
      'usage.cloudHoursUsed': newUsage,
      'usage.activeCloudSession': null,
      'usage.lastStreamDate': serverTimestamp()
    });

    return {
      success: true,
      minutesUsed: durationMinutes,
      message: `Session ended. Used ${durationMinutes} minutes (${durationHours.toFixed(2)} hours)`
    };
  } catch (error) {
    console.error('Error ending cloud session:', error);
    return { success: false, minutesUsed: 0, message: 'Failed to end cloud streaming session' };
  }
};

// Reset cloud hours (called at billing period reset)
export const resetCloudHours = async (userId: string): Promise<boolean> => {
  if (!db) return false;

  try {
    await updateDoc(doc(db, 'users', userId), {
      'usage.cloudHoursUsed': 0,
      'usage.cloudHoursResetAt': serverTimestamp()
    });
    return true;
  } catch (error) {
    console.error('Error resetting cloud hours:', error);
    return false;
  }
};

// Get estimated time remaining based on current usage rate
export const getEstimatedTimeRemaining = (
  hoursRemaining: number,
  sessionStartTime?: Date
): string => {
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

// Format cloud hours for display
export const formatCloudHours = (hours: number): string => {
  if (hours === 0) return '0 hours';
  if (hours < 1) {
    const minutes = Math.round(hours * 60);
    return `${minutes} minutes`;
  }
  return `${hours.toFixed(1)} hours`;
};

// Check if user is currently in a cloud session
export const hasActiveCloudSession = async (userId: string): Promise<boolean> => {
  if (!db) return false;

  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (!userDoc.exists()) return false;

    const userData = userDoc.data();
    return !!userData.usage?.activeCloudSession;
  } catch (error) {
    console.error('Error checking active session:', error);
    return false;
  }
};

// Get cloud streaming tier info for display
export const getCloudTierInfo = (userPlan: string): {
  tierName: string;
  hoursIncluded: number;
  description: string;
} => {
  const plan = getPlanById(userPlan);

  if (!plan) {
    return {
      tierName: 'Free',
      hoursIncluded: 0,
      description: 'Cloud streaming not available. Upgrade to Pro for 3 hours/month.'
    };
  }

  const hours = plan.limits.cloudStreamHours;

  switch (userPlan) {
    case 'free':
      return {
        tierName: 'Free',
        hoursIncluded: 0,
        description: 'Unlimited local device streaming. Upgrade to Pro for cloud VM streaming.'
      };
    case 'pro':
      return {
        tierName: 'Pro',
        hoursIncluded: 3,
        description: '3 hours of cloud VM streaming per month. Perfect for occasional cloud broadcasts.'
      };
    case 'expert':
      return {
        tierName: 'Expert',
        hoursIncluded: 10,
        description: '10 hours of cloud VM streaming per month. Great for regular streamers.'
      };
    case 'enterprise':
      return {
        tierName: 'Enterprise',
        hoursIncluded: 50,
        description: '50 hours of cloud VM streaming per month. Maximum capacity for power users.'
      };
    default:
      return {
        tierName: plan.name,
        hoursIncluded: hours,
        description: `${hours} hours of cloud VM streaming per month.`
      };
  }
};
