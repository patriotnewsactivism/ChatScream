import express from 'express';
import { randomUUID } from 'node:crypto';
import {
  cloudHoursForPlan,
  destinationsForPlan,
  endDurableCloudSession,
  getDurableCloudUsage,
  resetDurableCloudUsage,
  startDurableCloudSession,
} from './cloudUsage.js';
import { resolveMediaSource } from './mediaSources.js';
import {
  getCloudWorkerHealth,
  isCloudWorkerConfigured,
  startCloudWorkerJob,
  stopCloudWorkerJob,
} from './cloudWorker.js';

const router = express.Router();

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
    .filter((item) => item && typeof item === 'object')
    .slice(0, maxDestinations)
    .map((item) => ({
      id: String(item.id || '').slice(0, 120),
      platform: String(item.platform || item.type || 'custom').slice(0, 40),
      ingestUrl: String(item.ingestUrl || item.rtmpUrl || item.url || '').slice(0, 2048),
      streamKey: String(item.streamKey || '').slice(0, 1024),
      enabled: item.enabled !== false,
    }))
    .filter((item) => item.enabled && item.ingestUrl && item.streamKey);
};

router.get('/status', async (req, res, next) => {
  try {
    const userId = req.auth.profile.uid;
    const plan = String(req.auth.profile.subscription?.plan || 'free');
    const usage = (await getDurableCloudUsage(userId)) || {};
    const hoursTotal = cloudHoursForPlan(plan);
    const hoursUsed = Math.max(0, Number(usage.cloudHoursUsed) || 0);
    const hoursRemaining = Math.max(0, hoursTotal - hoursUsed);

    res.json({
      canStream: hoursTotal > 0 && (hoursRemaining > 0 || plan !== 'free'),
      plan,
      hoursUsed,
      hoursRemaining,
      hoursTotal,
      percentUsed: hoursTotal > 0 ? Math.min(100, (hoursUsed / hoursTotal) * 100) : 100,
      includedHoursUsed: Number(usage.includedHoursUsed || 0),
      overageHours: Number(usage.overageHours || 0),
      overageAmountCents: Number(usage.overageAmountCents || 0),
      activeSession: usage.activeCloudSession || null,
      destinationLimit: destinationsForPlan(plan),
      workerConfigured: isCloudWorkerConfigured(),
      message:
        hoursTotal === 0
          ? 'Cloud playback is available on paid plans.'
          : `${hoursRemaining.toFixed(2)} included cloud hours remaining`,
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
    res.json({ source: resolveMediaSource(req.body?.url) });
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

    const destinationLimit = destinationsForPlan(plan);
    const requestedCount = clamp(req.body?.destinationCount, 1, destinationLimit, 1);
    const destinations = sanitizeDestinations(req.body?.destinations, destinationLimit);
    const destinationCount = destinations.length || requestedCount;
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
        source,
        message: 'Cloud worker capacity is not provisioned yet. No usage has been charged.',
      });
      return;
    }

    const sessionId = `cloud_${randomUUID()}`;
    const worker = await startCloudWorkerJob({
      sessionId,
      userId,
      source,
      destinations,
      quality,
      bitrateKbps,
      recording: { enabled: req.body?.recording !== false },
    });

    const stored = await startDurableCloudSession({
      uid: userId,
      sessionId,
      destinationCount,
      quality,
      bitrateKbps,
      instanceProfile: worker.provider,
      storageGb: 0,
      estimatedCostPerHour: 0,
      source,
      worker,
    });

    res.status(201).json({
      success: true,
      sessionId,
      source,
      worker,
      activeSession: stored?.activeCloudSession || null,
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
        console.error('Cloud worker stop failed; recording usage anyway:', error);
        workerStop = { stopped: false, error: error.message };
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
