/**
 * Stream Enforcement Service
 *
 * Centralized enforcement and accountability for streaming operations:
 * 1. Real-time destination counter enforcement
 * 2. Cloud streaming hours tracking and cutoff
 * 3. Watermark enforcement for Free tier
 * 4. Constitutional validation of all streaming operations
 *
 * This service ensures compliance with subscription tier limits
 * and provides audit trails for all enforcement actions.
 */

import { Destination } from '../types';
import {
  canAddDestination,
  canUseCloudStreaming,
  getRemainingCloudHours,
  planHasWatermark,
  getPlanById,
  type PlanTier,
} from './stripe';

export interface EnforcementContext {
  userId: string;
  userPlan: PlanTier;
  currentDestinations: number;
  cloudHoursUsed: number;
  requestedDestinations: number;
  streamingMode: 'local' | 'cloud';
}

export interface EnforcementResult {
  allowed: boolean;
  reason: string;
  enforcement: {
    destinationsAllowed: number;
    destinationsRejected: number;
    watermarkRequired: boolean;
    cloudStreamingAllowed: boolean;
    remainingCloudHours: number;
  };
  recommendations?: string[];
}

export interface EnforcementAuditLog {
  timestamp: number;
  userId: string;
  action: 'stream_start' | 'destination_add' | 'cloud_cutoff' | 'validation';
  result: 'allowed' | 'rejected' | 'warning';
  reason: string;
  context: EnforcementContext;
}

export class StreamEnforcementService {
  private auditLogs: EnforcementAuditLog[] = [];
  private activeEnforcements: Map<string, EnforcementContext> = new Map();

  /**
   * Validate streaming request against all constitutional requirements
   */
  public validateStreamRequest(context: EnforcementContext): EnforcementResult {
    console.log('🔒 Validating stream request:', context);

    const violations: string[] = [];
    const recommendations: string[] = [];
    let destinationsAllowed = 0;
    let destinationsRejected = 0;

    // 1. Validate destination count
    const destCheck = canAddDestination(context.userPlan, context.requestedDestinations);
    if (!destCheck.allowed) {
      violations.push(destCheck.message);
      destinationsAllowed =
        destCheck.maxDestinations === -1
          ? context.requestedDestinations
          : destCheck.maxDestinations;
      destinationsRejected = context.requestedDestinations - destinationsAllowed;

      if (destinationsRejected > 0) {
        recommendations.push(this.getUpgradeRecommendation(context.userPlan, 'destinations'));
      }
    } else {
      destinationsAllowed = context.requestedDestinations;
    }

    // 2. Validate cloud streaming availability
    let cloudStreamingAllowed = true;
    let remainingCloudHours = 0;

    if (context.streamingMode === 'cloud') {
      const cloudCheck = canUseCloudStreaming(context.userPlan, context.cloudHoursUsed);
      cloudStreamingAllowed = cloudCheck.allowed;

      if (!cloudCheck.allowed) {
        violations.push(cloudCheck.message);
        recommendations.push(this.getUpgradeRecommendation(context.userPlan, 'cloudHours'));
      }

      const hoursInfo = getRemainingCloudHours(context.userPlan, context.cloudHoursUsed);
      remainingCloudHours = hoursInfo.remaining;

      // Warning if less than 1 hour remaining
      if (hoursInfo.remaining < 1 && hoursInfo.remaining > 0) {
        recommendations.push(
          `⚠️ Less than ${hoursInfo.remaining.toFixed(1)} hours of cloud streaming remaining`,
        );
      }
    }

    // 3. Check watermark requirement
    const watermarkRequired = planHasWatermark(context.userPlan);

    // Determine final result
    const allowed =
      violations.length === 0 || (destinationsAllowed > 0 && context.streamingMode === 'local');

    const result: EnforcementResult = {
      allowed,
      reason: violations.length > 0 ? violations.join('; ') : 'Request approved',
      enforcement: {
        destinationsAllowed,
        destinationsRejected,
        watermarkRequired,
        cloudStreamingAllowed,
        remainingCloudHours,
      },
      recommendations: recommendations.length > 0 ? recommendations : undefined,
    };

    // Log enforcement decision
    this.logEnforcement({
      timestamp: Date.now(),
      userId: context.userId,
      action: 'stream_start',
      result: allowed ? 'allowed' : 'rejected',
      reason: result.reason,
      context,
    });

    console.log('🔒 Enforcement result:', result);
    return result;
  }

  /**
   * Enforce real-time destination counter limits
   * Called when user attempts to add a new destination during active stream
   */
  public enforceDestinationAdd(
    userId: string,
    userPlan: PlanTier,
    currentDestinations: number,
  ): EnforcementResult {
    console.log('🔒 Enforcing destination add:', { userId, userPlan, currentDestinations });

    const destCheck = canAddDestination(userPlan, currentDestinations + 1);

    const result: EnforcementResult = {
      allowed: destCheck.allowed,
      reason: destCheck.message,
      enforcement: {
        destinationsAllowed: destCheck.allowed ? currentDestinations + 1 : currentDestinations,
        destinationsRejected: destCheck.allowed ? 0 : 1,
        watermarkRequired: planHasWatermark(userPlan),
        cloudStreamingAllowed: true,
        remainingCloudHours: 0,
      },
    };

    if (!destCheck.allowed) {
      result.recommendations = [this.getUpgradeRecommendation(userPlan, 'destinations')];
    }

    this.logEnforcement({
      timestamp: Date.now(),
      userId,
      action: 'destination_add',
      result: destCheck.allowed ? 'allowed' : 'rejected',
      reason: destCheck.message,
      context: {
        userId,
        userPlan,
        currentDestinations,
        cloudHoursUsed: 0,
        requestedDestinations: currentDestinations + 1,
        streamingMode: 'local',
      },
    });

    return result;
  }

  /**
   * Monitor cloud streaming hours and enforce cutoff
   * Returns true if stream should be terminated
   */
  public checkCloudHoursCutoff(
    userId: string,
    userPlan: PlanTier,
    sessionStartTime: number,
    totalHoursUsed: number,
  ): { shouldCutoff: boolean; reason: string; timeRemaining: number } {
    const plan = getPlanById(userPlan);
    if (!plan) {
      return { shouldCutoff: true, reason: 'Invalid plan', timeRemaining: 0 };
    }

    const sessionHours = (Date.now() - sessionStartTime) / 1000 / 60 / 60;
    const totalProjected = totalHoursUsed + sessionHours;
    const limit = plan.limits.cloudStreamHours;

    // Unlimited cloud hours
    if (limit === -1) {
      return { shouldCutoff: false, reason: 'Unlimited', timeRemaining: -1 };
    }

    const remaining = limit - totalProjected;

    // Cutoff if hours exhausted
    if (remaining <= 0) {
      console.log('🚨 CLOUD HOURS EXHAUSTED - ENFORCING CUTOFF');

      this.logEnforcement({
        timestamp: Date.now(),
        userId,
        action: 'cloud_cutoff',
        result: 'warning',
        reason: `Cloud hours limit reached: ${totalProjected.toFixed(2)}/${limit} hours`,
        context: {
          userId,
          userPlan,
          currentDestinations: 0,
          cloudHoursUsed: totalProjected,
          requestedDestinations: 0,
          streamingMode: 'cloud',
        },
      });

      return {
        shouldCutoff: true,
        reason: `Cloud streaming hours exhausted (${limit} hours). Upgrade for more hours.`,
        timeRemaining: 0,
      };
    }

    // Warning if less than 15 minutes remaining
    if (remaining < 0.25) {
      console.log(`⚠️ Cloud hours warning: ${(remaining * 60).toFixed(0)} minutes remaining`);
    }

    return {
      shouldCutoff: false,
      reason: 'Within limits',
      timeRemaining: remaining,
    };
  }

  /**
   * Get upgrade recommendation based on what user needs
   */
  private getUpgradeRecommendation(
    currentPlan: PlanTier,
    limitType: 'destinations' | 'cloudHours',
  ): string {
    const upgradePath: { [key in PlanTier]: string } = {
      free: 'Upgrade to Pro ($19/mo) for 3 destinations and 3 cloud hours',
      pro: 'Upgrade to Expert ($29/mo) for 5 destinations and 10 cloud hours',
      expert: 'Upgrade to Enterprise ($59/mo) for unlimited destinations and 50 cloud hours',
      enterprise: 'You are on the highest plan',
    };

    return upgradePath[currentPlan] || 'Upgrade your plan for more capacity';
  }

  /**
   * Log enforcement action for audit trail
   */
  private logEnforcement(log: EnforcementAuditLog): void {
    this.auditLogs.push(log);

    // Keep last 1000 logs in memory
    if (this.auditLogs.length > 1000) {
      this.auditLogs.shift();
    }

    // In production, this would also write to Firestore for permanent audit trail
    console.log('📝 Enforcement logged:', {
      action: log.action,
      result: log.result,
      reason: log.reason,
    });
  }

  /**
   * Get enforcement audit logs for user
   */
  public getAuditLogs(userId: string, limit: number = 50): EnforcementAuditLog[] {
    return this.auditLogs
      .filter((log) => log.userId === userId)
      .slice(-limit)
      .reverse();
  }

  /**
   * Get enforcement statistics
   */
  public getEnforcementStats(): {
    totalEnforcements: number;
    allowed: number;
    rejected: number;
    warnings: number;
    byAction: Record<string, number>;
  } {
    const stats = {
      totalEnforcements: this.auditLogs.length,
      allowed: 0,
      rejected: 0,
      warnings: 0,
      byAction: {} as Record<string, number>,
    };

    this.auditLogs.forEach((log) => {
      if (log.result === 'allowed') stats.allowed++;
      if (log.result === 'rejected') stats.rejected++;
      if (log.result === 'warning') stats.warnings++;

      stats.byAction[log.action] = (stats.byAction[log.action] || 0) + 1;
    });

    return stats;
  }

  /**
   * Register active enforcement context
   */
  public registerActiveStream(userId: string, context: EnforcementContext): void {
    this.activeEnforcements.set(userId, context);
  }

  /**
   * Unregister active enforcement context
   */
  public unregisterActiveStream(userId: string): void {
    this.activeEnforcements.delete(userId);
  }

  /**
   * Get active enforcement context for user
   */
  public getActiveEnforcement(userId: string): EnforcementContext | null {
    return this.activeEnforcements.get(userId) || null;
  }

  /**
   * Validate destinations array and return allowed/rejected split
   */
  public splitDestinationsByEnforcement(
    userPlan: PlanTier,
    destinations: Destination[],
  ): {
    allowed: Destination[];
    rejected: Destination[];
    enforcement: EnforcementResult;
  } {
    const enabled = destinations.filter((d) => d.isEnabled);
    const destCheck = canAddDestination(userPlan, enabled.length);

    const maxAllowed =
      destCheck.maxDestinations === -1 ? enabled.length : destCheck.maxDestinations;

    return {
      allowed: enabled.slice(0, maxAllowed),
      rejected: enabled.slice(maxAllowed),
      enforcement: {
        allowed: destCheck.allowed,
        reason: destCheck.message,
        enforcement: {
          destinationsAllowed: maxAllowed,
          destinationsRejected: enabled.length - maxAllowed,
          watermarkRequired: planHasWatermark(userPlan),
          cloudStreamingAllowed: true,
          remainingCloudHours: 0,
        },
      },
    };
  }
}

// Singleton instance
export const streamEnforcement = new StreamEnforcementService();
