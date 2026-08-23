import express from 'express';
import { randomUUID } from 'node:crypto';
import { putUser } from '../store.js';
import {
  cloudHoursForPlan,
  destinationsForPlan,
  endDurableCloudSession,
  getDurableCloudUsage,
  OVERAGE_RATES_CENTS_PER_HOUR,
  resetDurableCloudUsage,
  startDurableCloudSession,
} from './cloudUsage.js';
import {
  resolveMediaSource,
  summarizeMediaSource,
  validateRtmpDestination,
} from './mediaSources.js';
import {
  getCloudWorkerHealth,
  isCloudWorkerConfigured,
  startCloudWorkerJob,
  stopCloudWorkerJob,
} from './cloudWorker.js';

const router = express.Router();
const MAX_OVERAGE_JOB_SECONDS = 12 * 60 * 60;

const clamp = (value, min, max, fallback = min) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
};

const normalizeQuality = (value) =>
  String(value || '').toLowerCase() === '1080p' ? '1080p' : '720p';

const defaultBitrate = (quality) => (quality === '1080p' ? 6000 : 4000);

const sanitizeDestinations = (value, maxDestinations) => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === 'object' && item.enabled !== false)
    .slice(0, maxDestinations)
    .map((item) => {
      const ingestUrl = validateRtmpDestination(item.ingestUrl || item.rtmpUrl || item.url || '');
      const streamKey = String(item.streamKey || '').trim().slice(0, 1024);
      if (!streamKey) throw new Error('Each cloud destination requires a stream key.');
      return {
        id: String(item.id || '').slice(0, 120),
        platform: String(item.platform || item.type || 'custom').slice(0, 40),
        ingestUrl,
        streamKey,
        enabled: true,
      };
    });
};

const overagesEnabledForProfile = (profile) => profile?.settings?.cloudOveragesEnabled === true;

router.get('/status', async (req, res, next) => {
  try {
    const userId = req.auth.profile.uid;
    const plan = String(req.auth.profile.subscription?.plan || 'free');
    const usage = (await getDurableCloudUsage(userId)) || {};
    const hoursTotal = cloudHoursForPlan(plan);
    const hoursUsed = Math.max(0, Number(usage.cloudHoursUsed) || 0);
    const hoursRemaining = Math.max(0, hoursTotal - hoursUsed);
    const overagesEnabled = overagesEnabledForProfile(req.auth.profile);

    res.json({
      canStream: hoursTotal > 0 && (hoursRemaining > 0 || overagesEnabled),
      plan,
      hoursUsed,
      hoursRemaining,
      hoursTotal,
      percentUsed: hoursTotal > 0 ? Math.min(100, (hoursUsed / hoursTotal) * 100) : 100,
      includedHoursUsed: Number(usage.includedHoursUsed || 0),
      overageHours: Number(usage.overageHours || 0),
      overageAmountCents: Number(usage.overageAmountCents || 0),
      overagesEnabled,
      overageRatesCentsPerHour: OVERAGE_RATES_CENTS_PER_HOUR,
      resetDate: usage.resetAt || null,
      activeSession: usage.activeCloudSession || null,
      destinationLimit: destinationsForPlan(plan),
      workerConfigured: isCloudWorkerConfigured(),
      message:
        hoursTotal === 0
          ? 'Cloud playback is available on paid plans.'
          : hoursRemaining > 0
            ? `${hoursRemaining.toFixed(2)} included cloud hours remaining`
            : overagesEnabled
              ? 'Included cloud hours are exhausted. Opted-in overage rates apply.'
              : 'Included cloud hours are exhausted. Enable overages or wait for the next billing period.',
    });
  } catch (error) {
    next(error);
  }
});

router.post('/overages', async (req, res, next) => {
  try {
    if (typeof req.body?.enabled !== 'boolean') {
      res.status(400).json({ message: 'enabled must be true or false.' });
      return;
    }

    const record = req.auth.record;
    const profile = {
      ...req.auth.profile,
      settings: {
        ...(req.auth.profile?.settings || {}),
        cloudOveragesEnabled: req.body.enabled,
        cloudOveragesUpdatedAt: new Date().toISOString(),
      },
    };
    await putUser({ ...record, profile });
    res.json({
      success: true,
      overagesEnabled: req.body.enabled,
      overageRatesCentsPerHour: OVERAGE_RATES_CENTS_PER_HOUR,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/worker-health', async (_req, res) => {
  res.json(await getCloudWorkerHealth());
});

router.post('/source/resolve', (req, res) => {
  try {
    const source = resolveMediaSource(req.body?.url);
    res.json({ source });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.post('/sessions/start', async (req, res, next) => {
  try {
    const userId = req.auth.profile.uid;
    const plan = String(req.auth.profile.subscription?.plan || 'free');
    const includedHours = cloudHoursForPlan(plan);
    if (includedHours <= 0) {
      res.status(403).json({ success: false, message: 'Cloud streaming requires a paid plan.' });
      return;
    }

    const usage = (await getDurableCloudUsage(userId)) || {};
    if (usage.activeCloudSession) {
      res.status(409).json({
        success: false,
        message: 'A cloud streaming session is already active.',
        activeSession: usage.activeCloudSession,
      });
      return;
    }

    const hoursUsed = Math.max(0, Number(usage.cloudHoursUsed) || 0);
    const hoursRemaining = Math.max(0, includedHours - hoursUsed);
    const overagesEnabled = overagesEnabledForProfile(req.auth.profile);
    if (hoursRemaining <= 0 && !overagesEnabled) {
      res.status(403).json({
        success: false,
        overagesRequired: true,
        message: 'Included cloud hours are exhausted. Enable overages before starting another job.',
      });
      return;
    }

    const destinationLimit = destinationsForPlan(plan);
    const requestedCount = clamp(req.body?.destinationCount, 1, destinationLimit, 1);
    const quality = normalizeQuality(req.body?.quality || req.body?.resolution);
    const bitrateKbps = clamp(req.body?.bitrateKbps, 1000, 12000, defaultBitrate(quality));

    let source = { provider: 'browser-ingest', supported: true, playableUrl: null };
    if (req.body?.sourceUrl) {
      source = resolveMediaSource(req.body.sourceUrl);
      if (!source.supported || !source.playableUrl) {
        res.status(400).json({ success: false, message: source.reason || 'Unsupported media source.' });
        return;
      }
    }

    if (!isCloudWorkerConfigured()) {
      res.status(503).json({
        success: false,
        comingSoon: true,
        source: summarizeMediaSource(source),
        message: 'Cloud worker capacity is not provisioned yet. No usage has been charged.',
      });
      return;
    }

    let destinations;
    try {
      destinations = sanitizeDestinations(req.body?.destinations, destinationLimit);
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
      return;
    }
    if (destinations.length === 0) {
      res.status(400).json({
        success: false,
        message: 'At least one validated RTMP/RTMPS destination is required for cloud streaming.',
      });
      return;
    }
    if (destinations.length !== requestedCount) {
      res.status(400).json({
        success: false,
        message: `destinationCount (${requestedCount}) must match the ${destinations.length} supplied destination configuration(s).`,
      });
      return;
    }

    const maxDurationSeconds = overagesEnabled
      ? MAX_OVERAGE_JOB_SECONDS
      : Math.max(60, Math.floor(hoursRemaining * 60 * 60));

    const sessionId = `cloud_${randomUUID()}`;
    const worker = await startCloudWorkerJob({
      sessionId,
      userId,
      source,
      destinations,
      quality,
      bitrateKbps,
      maxDurationSeconds,
      recording: { enabled: req.body?.recording !== false },
    });

    const persistedWorker = {
      provider: worker.provider,
      workerId: worker.workerId,
      jobId: worker.jobId,
      state: worker.state,
      startedAt: worker.startedAt,
    };
    const stored = await startDurableCloudSession({
      uid: userId,
      sessionId,
      destinationCount: destinations.length,
      quality,
      bitrateKbps,
      instanceProfile: worker.provider,
      storageGb: 0,
      estimatedCostPerHour: 0,
      source: summarizeMediaSource(source),
      worker: persistedWorker,
      overagesEnabled,
      maxDurationSeconds,
    });

    res.status(201).json({
      success: true,
      sessionId,
      source: summarizeMediaSource(source),
      worker,
      activeSession: stored?.activeCloudSession || null,
      maxDurationSeconds,
      message: 'Cloud stream is starting.',
    });
  } catch (error) {
    next(error);
  }
});

router.post('/sessions/end', async (req, res, next) => {
  try {
    const userId = req.auth.profile.uid;
    const usage = (await getDurableCloudUsage(userId)) || {};
    const active = usage.activeCloudSession;
    const sessionId = String(req.body?.sessionId || active?.sessionId || '').trim();
    if (!active || !sessionId || active.sessionId !== sessionId) {
      res.status(400).json({ success: false, message: 'No matching active cloud session.' });
      return;
    }

    let workerStop = null;
    const jobId = active.worker?.jobId || active.worker?.workerId;
    if (jobId && isCloudWorkerConfigured()) {
      try {
        workerStop = await stopCloudWorkerJob({ jobId, sessionId });
      } catch (error) {
        console.error('Cloud worker stop failed; recording usage anyway:', error?.message || error);
        workerStop = { stopped: false, error: 'Worker stop request failed.' };
      }
    }

    const result = await endDurableCloudSession({ uid: userId, sessionId });
    res.json({
      success: result.ended,
      ...result,
      workerStop,
      estimatedCostUsd: 0,
      message: result.ended
        ? `Session ended. Used ${result.minutesUsed} minute(s).`
        : 'Cloud session could not be ended.',
    });
  } catch (error) {
    next(error);
  }
});

router.get('/sessions/active', async (req, res, next) => {
  try {
    const usage = await getDurableCloudUsage(req.auth.profile.uid);
    res.json({ activeSession: usage?.activeCloudSession || null });
  } catch (error) {
    next(error);
  }
});

router.post('/reset', async (req, res, next) => {
  try {
    if (req.auth.profile.role !== 'admin') {
      res.status(403).json({ message: 'Admin access required.' });
      return;
    }
    const userId = String(req.body?.userId || '').trim();
    if (!userId) {
      res.status(400).json({ message: 'userId is required.' });
      return;
    }
    const usage = await resetDurableCloudUsage(userId);
    if (!usage) {
      res.status(404).json({ message: 'User not found.' });
      return;
    }
    res.json({ success: true, usage });
  } catch (error) {
    next(error);
  }
});

export default router;
