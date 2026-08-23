import { getUserByUid, putUser } from '../store.js';

export const PLAN_CLOUD_HOURS = Object.freeze({
  free: 0,
  pro: 2,
  expert: 8,
  enterprise: 20,
  business: 40,
});

export const PLAN_DESTINATION_LIMITS = Object.freeze({
  free: 2,
  pro: 3,
  expert: 5,
  enterprise: 8,
  business: 10,
});

export const OVERAGE_RATES_CENTS_PER_HOUR = Object.freeze({
  upTo5: 199,
  upTo8: 299,
  upTo10: 349,
});

const nowIso = () => new Date().toISOString();
const roundHours = (value) => Math.round((Number(value) || 0) * 10000) / 10000;

export const cloudHoursForPlan = (plan) => PLAN_CLOUD_HOURS[String(plan || 'free')] ?? 0;
export const destinationsForPlan = (plan) =>
  PLAN_DESTINATION_LIMITS[String(plan || 'free')] ?? PLAN_DESTINATION_LIMITS.free;

export const overageRateCentsPerHour = (destinationCount) => {
  const count = Math.max(1, Number(destinationCount) || 1);
  if (count <= 5) return OVERAGE_RATES_CENTS_PER_HOUR.upTo5;
  if (count <= 8) return OVERAGE_RATES_CENTS_PER_HOUR.upTo8;
  return OVERAGE_RATES_CENTS_PER_HOUR.upTo10;
};

const getPeriodKey = (record) => {
  const periodEnd = String(record?.profile?.subscription?.currentPeriodEnd || '').trim();
  if (periodEnd) return `stripe:${periodEnd}`;
  const now = new Date();
  return `calendar:${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
};

const freshUsage = (periodKey) => ({
  periodKey,
  cloudHoursUsed: 0,
  includedHoursUsed: 0,
  overageHours: 0,
  overageAmountCents: 0,
  activeCloudSession: null,
  sessions: [],
  resetAt: nowIso(),
});

const normalizeUsage = (record) => {
  const cloud = record?.profile?.usage?.cloud || {};
  const periodKey = getPeriodKey(record);
  if (cloud.periodKey && cloud.periodKey !== periodKey) {
    return freshUsage(periodKey);
  }

  return {
    periodKey,
    cloudHoursUsed: roundHours(cloud.cloudHoursUsed),
    includedHoursUsed: roundHours(cloud.includedHoursUsed),
    overageHours: roundHours(cloud.overageHours),
    overageAmountCents: Math.max(0, Math.round(Number(cloud.overageAmountCents) || 0)),
    activeCloudSession: cloud.activeCloudSession || null,
    sessions: Array.isArray(cloud.sessions) ? cloud.sessions.slice(-500) : [],
    resetAt: cloud.resetAt || nowIso(),
  };
};

const saveUsage = async (record, usage) => {
  const profile = {
    ...record.profile,
    usage: {
      ...(record.profile?.usage || {}),
      cloud: usage,
    },
  };
  await putUser({ ...record, profile });
  return usage;
};

export const getDurableCloudUsage = async (uid) => {
  const record = await getUserByUid(uid);
  if (!record) return null;
  const usage = normalizeUsage(record);
  const storedPeriodKey = record.profile?.usage?.cloud?.periodKey;
  if (storedPeriodKey !== usage.periodKey) await saveUsage(record, usage);
  return usage;
};

export const startDurableCloudSession = async ({
  uid,
  sessionId,
  destinationCount,
  quality,
  bitrateKbps,
  instanceProfile,
  storageGb,
  estimatedCostPerHour,
  source,
  worker,
  overagesEnabled = false,
  maxDurationSeconds = null,
}) => {
  const record = await getUserByUid(uid);
  if (!record) return null;
  const usage = normalizeUsage(record);
  if (usage.activeCloudSession) return { usage, alreadyActive: true };

  const activeCloudSession = {
    sessionId,
    startTime: nowIso(),
    destinationCount: Math.max(1, Number(destinationCount) || 1),
    quality,
    bitrateKbps: Number(bitrateKbps) || 0,
    instanceProfile,
    storageGb: Number(storageGb) || 0,
    estimatedCostPerHour: Number(estimatedCostPerHour) || 0,
    source: source || null,
    worker: worker || null,
    overagesEnabled: overagesEnabled === true,
    maxDurationSeconds:
      maxDurationSeconds == null ? null : Math.max(1, Math.floor(Number(maxDurationSeconds) || 1)),
  };

  const next = {
    ...usage,
    activeCloudSession,
    lastStreamDate: nowIso(),
  };
  await saveUsage(record, next);
  return { usage: next, activeCloudSession, alreadyActive: false };
};

export const endDurableCloudSession = async ({ uid, sessionId, endedAt = Date.now() }) => {
  const record = await getUserByUid(uid);
  if (!record) return { ended: false, reason: 'user_not_found' };
  const usage = normalizeUsage(record);
  const active = usage.activeCloudSession;
  if (!active || active.sessionId !== sessionId) {
    return { ended: false, reason: 'session_not_found', usage };
  }

  const startMs = new Date(active.startTime || endedAt).getTime();
  const minutesUsed = Math.max(1, Math.ceil((endedAt - startMs) / 60000));
  const sessionHours = minutesUsed / 60;
  const plan = String(record.profile?.subscription?.plan || 'free');
  const includedLimit = cloudHoursForPlan(plan);
  const priorHours = Math.max(0, Number(usage.cloudHoursUsed) || 0);
  const includedRemaining = Math.max(0, includedLimit - priorHours);
  const includedSessionHours = Math.min(sessionHours, includedRemaining);
  const rawOverageHours = Math.max(0, sessionHours - includedSessionHours);
  const overagesEnabled = active.overagesEnabled === true;
  const overageSessionHours = overagesEnabled ? rawOverageHours : 0;
  const unbilledGraceHours = overagesEnabled ? 0 : rawOverageHours;
  const rate = overageRateCentsPerHour(active.destinationCount);
  const overageAmountCents = overagesEnabled
    ? Math.max(0, Math.ceil(overageSessionHours * rate))
    : 0;

  const session = {
    ...active,
    endTime: new Date(endedAt).toISOString(),
    minutesUsed,
    hoursUsed: roundHours(sessionHours),
    includedHours: roundHours(includedSessionHours),
    overageHours: roundHours(overageSessionHours),
    unbilledGraceHours: roundHours(unbilledGraceHours),
    overageRateCentsPerHour: rate,
    overageAmountCents,
    meteringStatus:
      overageAmountCents > 0 ? 'pending' : unbilledGraceHours > 0 ? 'capped_unbilled' : 'included',
  };

  const next = {
    ...usage,
    cloudHoursUsed: roundHours(priorHours + sessionHours),
    includedHoursUsed: roundHours(
      Math.min(includedLimit, Number(usage.includedHoursUsed || 0) + includedSessionHours),
    ),
    overageHours: roundHours(Number(usage.overageHours || 0) + overageSessionHours),
    overageAmountCents: Math.max(
      0,
      Math.round(Number(usage.overageAmountCents || 0) + overageAmountCents),
    ),
    activeCloudSession: null,
    lastStreamDate: nowIso(),
    sessions: [...usage.sessions, session].slice(-500),
  };
  await saveUsage(record, next);

  return {
    ended: true,
    minutesUsed,
    sessionHours: roundHours(sessionHours),
    includedHours: roundHours(includedSessionHours),
    overageHours: roundHours(overageSessionHours),
    unbilledGraceHours: roundHours(unbilledGraceHours),
    overageAmountCents,
    overageRateCentsPerHour: rate,
    usage: next,
    session,
  };
};

export const resetDurableCloudUsage = async (uid) => {
  const record = await getUserByUid(uid);
  if (!record) return null;
  const next = freshUsage(getPeriodKey(record));
  await saveUsage(record, next);
  return next;
};
