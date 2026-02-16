import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import {
  addChatMessage,
  addReferral,
  applyAccessOverrides,
  createAffiliateCode,
  createUserProfile,
  flushState,
  getAffiliate,
  getCloudUsage,
  getConfig,
  getPublicProfile,
  getSession,
  getUserByEmail,
  getUserByUid,
  listChatMessages,
  listUsers,
  loadState,
  putUser,
  removeSession,
  saveSession,
  seedLeaderboard,
  setAffiliate,
  setCloudUsage,
  setConfig,
  setConnectedPlatform,
} from './store.js';

const app = express();
const port = Number(process.env.PORT || 8787);

const PLAN_HOURS = {
  free: 0,
  pro: 3,
  expert: 10,
  enterprise: 50,
};

const normalizeEmail = (value = '') => value.trim().toLowerCase();
const normalizeCode = (value = '') => value.trim().toUpperCase();
const nowIso = () => new Date().toISOString();

const hashPassword = (value = '') => createHash('sha256').update(value).digest('hex');

const issueSession = (uid) => {
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  saveSession({ token, uid, expiresAt });
  return { token, expiresAt };
};

const buildSessionPayload = (uid, existingToken, existingExpiry) => {
  const record = getUserByUid(uid);
  if (!record) return null;
  const profile = getPublicProfile(record);
  const token = existingToken || issueSession(uid).token;
  const expiresAt = existingExpiry || new Date(Date.now() + 60 * 60 * 1000).toISOString();
  if (!existingToken) {
    saveSession({ token, uid, expiresAt });
  }
  return {
    session: {
      token,
      expiresAt,
      user: {
        uid: profile.uid,
        email: profile.email,
        displayName: profile.displayName,
        photoURL: profile.photoURL || '',
      },
    },
  };
};

const readBearerToken = (req) => {
  const raw = req.headers.authorization || '';
  if (!raw.startsWith('Bearer ')) return '';
  return raw.slice('Bearer '.length).trim();
};

const requireAuth = (req, res, next) => {
  const token = readBearerToken(req);
  if (!token) {
    res.status(401).json({ message: 'Missing authorization token.' });
    return;
  }
  const session = getSession(token);
  if (!session) {
    res.status(401).json({ message: 'Session expired. Please sign in again.' });
    return;
  }
  const userRecord = getUserByUid(session.uid);
  if (!userRecord) {
    res.status(401).json({ message: 'User not found for this session.' });
    return;
  }
  req.auth = {
    token,
    session,
    record: userRecord,
    profile: getPublicProfile(userRecord),
  };
  next();
};

const isAdmin = (profile) =>
  profile?.role === 'admin' || normalizeEmail(profile?.email || '') === 'mreardon@wtpnews.org';

const requireAdmin = (req, res, next) => {
  if (!isAdmin(req.auth?.profile)) {
    res.status(403).json({ message: 'Admin access required.' });
    return;
  }
  next();
};

const deepMerge = (target, patch) => {
  if (!patch || typeof patch !== 'object') return target;
  const next = Array.isArray(target) ? [...target] : { ...(target || {}) };
  Object.entries(patch).forEach(([key, value]) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      next[key] = deepMerge(next[key], value);
    } else {
      next[key] = value;
    }
  });
  return next;
};

const ensureAffiliateForProfile = (profile) => {
  const next = { ...profile };
  if (!next.affiliate) {
    next.affiliate = {
      code: createAffiliateCode(),
      referredBy: '',
      referredByUserId: '',
      referrals: 0,
      totalEarnings: 0,
      pendingPayout: 0,
    };
  }
  const code = normalizeCode(next.affiliate.code || createAffiliateCode());
  next.affiliate.code = code;

  const existing = getAffiliate(code);
  if (!existing) {
    setAffiliate({
      code,
      ownerId: next.uid,
      ownerEmail: next.email,
      ownerName: next.displayName,
      commissionRate: 0.2,
      bonusTrialDays: 3,
      totalReferrals: 0,
      totalEarnings: 0,
      createdAt: nowIso(),
      isActive: true,
    });
  }
  return next;
};

app.use(
  cors({
    origin: (origin, callback) => callback(null, origin || true),
    credentials: true,
  }),
);
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'chatscream-api', timestamp: nowIso() });
});

app.post('/api/auth/signup', (req, res) => {
  const email = normalizeEmail(req.body?.email || '');
  const password = String(req.body?.password || '');
  const displayName = String(req.body?.displayName || '').trim();
  const referralCode = normalizeCode(req.body?.referralCode || '');

  if (!email || !password || password.length < 6) {
    res.status(400).json({ message: 'Valid email and password are required.' });
    return;
  }
  if (getUserByEmail(email)) {
    res.status(409).json({ message: 'This email is already registered.' });
    return;
  }

  const referredAffiliate = referralCode ? getAffiliate(referralCode) : null;
  const uid = randomUUID();
  const profile = ensureAffiliateForProfile(
    createUserProfile({
      uid,
      email,
      displayName: displayName || email.split('@')[0],
      referredByCode: referredAffiliate?.code || '',
      referredByUserId: referredAffiliate?.ownerId || '',
    }),
  );

  if (referredAffiliate?.isActive) {
    setAffiliate({
      ...referredAffiliate,
      totalReferrals: Number(referredAffiliate.totalReferrals || 0) + 1,
    });
    addReferral({
      id: randomUUID(),
      affiliateCode: referredAffiliate.code,
      referrerId: referredAffiliate.ownerId,
      referredUserId: uid,
      createdAt: nowIso(),
    });
  }

  putUser({
    uid,
    email,
    passwordHash: hashPassword(password),
    profile,
  });

  const payload = buildSessionPayload(uid);
  res.status(201).json(payload);
});

app.post('/api/auth/login', (req, res) => {
  const email = normalizeEmail(req.body?.email || '');
  const password = String(req.body?.password || '');
  const record = getUserByEmail(email);

  if (!record || record.passwordHash !== hashPassword(password)) {
    res.status(401).json({ message: 'Invalid email or password.' });
    return;
  }

  const payload = buildSessionPayload(record.uid);
  res.json(payload);
});

app.get('/api/auth/session', requireAuth, (req, res) => {
  const payload = buildSessionPayload(
    req.auth.record.uid,
    req.auth.token,
    req.auth.session.expiresAt,
  );
  res.json(payload);
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  const payload = buildSessionPayload(
    req.auth.record.uid,
    req.auth.token,
    req.auth.session.expiresAt,
  );
  res.json(payload);
});

app.post('/api/auth/refresh', requireAuth, (req, res) => {
  removeSession(req.auth.token);
  const payload = buildSessionPayload(req.auth.record.uid);
  res.json(payload);
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
  removeSession(req.auth.token);
  res.json({ success: true });
});

app.post('/api/auth/reset-password', (_req, res) => {
  res.json({ success: true });
});

app.post(['/api/auth/oauth/start', '/api/auth/social/start'], (req, res) => {
  const provider = String(req.body?.provider || '')
    .trim()
    .toLowerCase();
  const referral = normalizeCode(req.body?.referralCode || '');
  if (!provider) {
    res.status(400).json({ message: 'Provider is required.' });
    return;
  }
  const redirectUrl = `/api/auth/oauth/${provider}${referral ? `?ref=${encodeURIComponent(referral)}` : ''}`;
  res.json({ redirectUrl });
});

app.get('/api/auth/oauth/:provider', (req, res) => {
  const provider = String(req.params.provider || '')
    .trim()
    .toLowerCase();
  const referral = normalizeCode(req.query.ref || '');
  const email = normalizeEmail(`demo-${provider}@chatscream.local`);

  let record = getUserByEmail(email);
  if (!record) {
    const uid = randomUUID();
    const referredAffiliate = referral ? getAffiliate(referral) : null;
    let profile = createUserProfile({
      uid,
      email,
      displayName: `${provider[0]?.toUpperCase() || 'O'}${provider.slice(1)} User`,
      referredByCode: referredAffiliate?.code || '',
      referredByUserId: referredAffiliate?.ownerId || '',
    });
    profile = ensureAffiliateForProfile(profile);

    putUser({
      uid,
      email,
      passwordHash: '',
      profile,
    });
    record = getUserByUid(uid);
  }

  const issued = issueSession(record.uid);
  const redirect = new URL('/oauth/callback', `http://${req.headers.host || 'localhost'}`);
  redirect.searchParams.set('platform', provider);
  redirect.searchParams.set('token', issued.token);
  redirect.searchParams.set('uid', record.uid);
  redirect.searchParams.set('email', record.email);
  redirect.searchParams.set('displayName', record.profile.displayName || 'User');
  redirect.searchParams.set('expiresAt', issued.expiresAt);
  res.redirect(302, `${redirect.pathname}${redirect.search}`);
});

app.post('/api/access/sync', requireAuth, (req, res) => {
  const record = getUserByUid(req.auth.record.uid);
  if (!record) {
    res.status(404).json({ message: 'User not found.' });
    return;
  }
  const profile = applyAccessOverrides(record.profile);
  putUser({ ...record, profile });
  res.json({ success: true, profile });
});

app.get('/api/users/:uid', requireAuth, (req, res) => {
  const record = getUserByUid(req.params.uid);
  if (!record) {
    res.status(404).json({ message: 'User not found.' });
    return;
  }
  res.json({ profile: getPublicProfile(record) });
});

app.patch('/api/users/:uid', requireAuth, (req, res) => {
  const record = getUserByUid(req.params.uid);
  if (!record) {
    res.status(404).json({ message: 'User not found.' });
    return;
  }
  const profile = deepMerge(record.profile, req.body || {});
  putUser({ ...record, profile });
  res.json({ profile: getPublicProfile({ ...record, profile }) });
});

app.get('/api/user/:uid', requireAuth, (req, res) => {
  const record = getUserByUid(req.params.uid);
  if (!record) {
    res.status(404).json({ message: 'User not found.' });
    return;
  }
  res.json({ profile: getPublicProfile(record) });
});

app.put('/api/user/:uid', requireAuth, (req, res) => {
  const record = getUserByUid(req.params.uid);
  if (!record) {
    res.status(404).json({ message: 'User not found.' });
    return;
  }
  const profile = deepMerge(record.profile, req.body || {});
  putUser({ ...record, profile });
  res.json({ profile: getPublicProfile({ ...record, profile }) });
});

app.get('/api/affiliates/:code', requireAuth, (req, res) => {
  const affiliate = getAffiliate(req.params.code);
  if (!affiliate) {
    res.status(404).json({ message: 'Affiliate not found.' });
    return;
  }
  res.json({ affiliate });
});

app.get('/api/affiliate/:code', requireAuth, (req, res) => {
  const affiliate = getAffiliate(req.params.code);
  if (!affiliate) {
    res.status(404).json({ message: 'Affiliate not found.' });
    return;
  }
  res.json({ affiliate });
});

app.post('/api/affiliates', requireAuth, (req, res) => {
  const userId = String(req.body?.userId || req.auth.profile.uid);
  const record = getUserByUid(userId);
  if (!record) {
    res.status(404).json({ message: 'User not found.' });
    return;
  }
  let profile = ensureAffiliateForProfile(record.profile);
  putUser({ ...record, profile });
  res.status(201).json({ code: profile.affiliate.code });
});

app.post('/api/affiliate/create', requireAuth, (req, res) => {
  const userId = String(req.body?.userId || req.auth.profile.uid);
  const record = getUserByUid(userId);
  if (!record) {
    res.status(404).json({ message: 'User not found.' });
    return;
  }
  let profile = ensureAffiliateForProfile(record.profile);
  putUser({ ...record, profile });
  res.status(201).json({ code: profile.affiliate.code });
});

app.post('/api/affiliates/:code/referrals', requireAuth, (req, res) => {
  const code = normalizeCode(req.params.code);
  const affiliate = getAffiliate(code);
  if (!affiliate) {
    res.status(404).json({ message: 'Affiliate not found.' });
    return;
  }
  const entry = {
    id: randomUUID(),
    affiliateCode: code,
    referrerId: String(req.body?.referrerId || affiliate.ownerId || ''),
    referredUserId: String(req.body?.referredUserId || ''),
    createdAt: nowIso(),
  };
  addReferral(entry);
  setAffiliate({
    ...affiliate,
    totalReferrals: Number(affiliate.totalReferrals || 0) + 1,
  });
  res.status(201).json({ success: true });
});

app.post('/api/referrals', requireAuth, (req, res) => {
  const code = normalizeCode(req.body?.affiliateCode || '');
  const affiliate = getAffiliate(code);
  const entry = {
    id: randomUUID(),
    affiliateCode: code,
    referrerId: String(req.body?.referrerId || affiliate?.ownerId || ''),
    referredUserId: String(req.body?.referredUserId || ''),
    createdAt: nowIso(),
  };
  addReferral(entry);
  if (affiliate) {
    setAffiliate({
      ...affiliate,
      totalReferrals: Number(affiliate.totalReferrals || 0) + 1,
    });
  }
  res.status(201).json({ success: true });
});

app.post('/api/affiliates/ensure', requireAuth, (req, res) => {
  const record = getUserByUid(req.auth.profile.uid);
  if (!record) {
    res.status(404).json({ message: 'User not found.' });
    return;
  }
  const profile = ensureAffiliateForProfile(record.profile);
  putUser({ ...record, profile });
  res.json({ code: profile.affiliate.code, affiliateCode: profile.affiliate.code });
});

app.post('/api/users/me/affiliate', requireAuth, (req, res) => {
  const record = getUserByUid(req.auth.profile.uid);
  if (!record) {
    res.status(404).json({ message: 'User not found.' });
    return;
  }
  const profile = ensureAffiliateForProfile(record.profile);
  putUser({ ...record, profile });
  res.json({ code: profile.affiliate.code, affiliateCode: profile.affiliate.code });
});

app.get('/api/config/oauth', requireAuth, (_req, res) => {
  const oauth = getConfig('oauth');
  res.json(oauth);
});

app.patch('/api/config/oauth', requireAuth, requireAdmin, (req, res) => {
  setConfig('oauth', req.body || {}, req.auth.profile.uid);
  res.json({ success: true, oauth: getConfig('oauth') });
});

app.get('/api/oauth/config/public', requireAuth, (_req, res) => {
  const oauth = getConfig('oauth');
  res.json(oauth);
});

app.put('/api/oauth/config/public', requireAuth, requireAdmin, (req, res) => {
  setConfig('oauth', req.body || {}, req.auth.profile.uid);
  res.json({ success: true, oauth: getConfig('oauth') });
});

app.get('/api/config/access', requireAuth, requireAdmin, (_req, res) => {
  res.json(getConfig('access'));
});

app.put('/api/config/access', requireAuth, requireAdmin, (req, res) => {
  const admins = Array.isArray(req.body?.admins)
    ? req.body.admins.map(normalizeEmail).filter(Boolean)
    : [];
  const betaTesters = Array.isArray(req.body?.betaTesters)
    ? req.body.betaTesters.map(normalizeEmail).filter(Boolean)
    : [];
  setConfig(
    'access',
    {
      admins: [...new Set(admins)],
      betaTesters: [...new Set(betaTesters)],
    },
    req.auth.profile.uid,
  );
  res.json({ success: true, access: getConfig('access') });
});

app.get('/api/access/list', requireAuth, requireAdmin, (_req, res) => {
  res.json(getConfig('access'));
});

app.post('/api/access/list', requireAuth, requireAdmin, (req, res) => {
  const admins = Array.isArray(req.body?.admins)
    ? req.body.admins.map(normalizeEmail).filter(Boolean)
    : [];
  const betaTesters = Array.isArray(req.body?.betaTesters)
    ? req.body.betaTesters.map(normalizeEmail).filter(Boolean)
    : [];
  setConfig(
    'access',
    {
      admins: [...new Set(admins)],
      betaTesters: [...new Set(betaTesters)],
    },
    req.auth.profile.uid,
  );
  res.json({ success: true, access: getConfig('access') });
});

app.get('/api/admin/users', requireAuth, requireAdmin, (req, res) => {
  const email = normalizeEmail(req.query.email || '');
  if (!email) {
    res.json({ users: [] });
    return;
  }
  const users = listUsers()
    .filter((record) => normalizeEmail(record.email) === email)
    .map((record) => getPublicProfile(record));
  res.json({ users });
});

app.get('/api/users/search', requireAuth, requireAdmin, (req, res) => {
  const email = normalizeEmail(req.query.email || '');
  if (!email) {
    res.json({ users: [] });
    return;
  }
  const users = listUsers()
    .filter((record) => normalizeEmail(record.email) === email)
    .map((record) => getPublicProfile(record));
  res.json({ users });
});

app.patch('/api/admin/users/:uid/access', requireAuth, requireAdmin, (req, res) => {
  const record = getUserByUid(req.params.uid);
  if (!record) {
    res.status(404).json({ message: 'User not found.' });
    return;
  }
  const patch = req.body || {};
  const profile = {
    ...record.profile,
    role: patch.role || record.profile.role,
    betaTester:
      typeof patch.betaTester === 'boolean' ? patch.betaTester : record.profile.betaTester,
    subscription: {
      ...record.profile.subscription,
      plan: patch.plan || record.profile.subscription.plan,
      status: patch.status || record.profile.subscription.status,
      betaOverride: true,
    },
  };
  putUser({ ...record, profile });
  res.json({ success: true, profile: getPublicProfile({ ...record, profile }) });
});

app.post('/api/access/users/:uid', requireAuth, requireAdmin, (req, res) => {
  const record = getUserByUid(req.params.uid);
  if (!record) {
    res.status(404).json({ message: 'User not found.' });
    return;
  }
  const patch = req.body || {};
  const profile = {
    ...record.profile,
    role: patch.role || record.profile.role,
    betaTester:
      typeof patch.betaTester === 'boolean' ? patch.betaTester : record.profile.betaTester,
    subscription: {
      ...record.profile.subscription,
      plan: patch.plan || record.profile.subscription.plan,
      status: patch.status || record.profile.subscription.status,
      betaOverride: true,
    },
  };
  putUser({ ...record, profile });
  res.json({ success: true, profile: getPublicProfile({ ...record, profile }) });
});

app.get('/api/chat/messages', requireAuth, (req, res) => {
  const streamId = String(req.query.streamId || '');
  const limit = Number(req.query.limit || 100);
  if (!streamId) {
    res.json({ messages: [] });
    return;
  }
  const messages = listChatMessages(streamId, limit);
  res.json({ messages });
});

app.post('/api/chat/messages', requireAuth, (req, res) => {
  const streamId = String(req.body?.streamId || '').trim();
  const userId = String(req.body?.userId || req.auth.profile.uid).trim();
  const displayName = String(
    req.body?.displayName || req.auth.profile.displayName || 'Viewer',
  ).trim();
  const content = String(req.body?.content || '')
    .trim()
    .slice(0, 500);
  if (!streamId || !content) {
    res.status(400).json({ message: 'streamId and content are required.' });
    return;
  }
  const message = {
    id: randomUUID(),
    streamId,
    userId,
    displayName,
    content,
    createdAt: nowIso(),
    isModerated: false,
  };
  addChatMessage(message);
  res.status(201).json({ id: message.id, message });
});

const cloudLimitForPlan = (plan) => PLAN_HOURS[plan] ?? 0;

app.get('/api/cloud-streaming/status', requireAuth, (req, res) => {
  const userId = String(req.query.userId || req.auth.profile.uid);
  const plan = String(req.query.plan || req.auth.profile.subscription?.plan || 'free');
  const usage = getCloudUsage(userId);
  const total = cloudLimitForPlan(plan);
  const hoursUsed = Number(usage.cloudHoursUsed || 0);
  const hoursRemaining = Math.max(0, total - hoursUsed);
  const percentUsed = total > 0 ? Math.min(100, (hoursUsed / total) * 100) : 100;
  const canStream = total > 0 && hoursRemaining > 0;
  const message =
    total === 0
      ? 'Cloud streaming is not available on the Free plan.'
      : canStream
        ? `${hoursRemaining.toFixed(1)} cloud hours remaining`
        : `You've used all ${total} cloud streaming hours this month.`;

  res.json({
    canStream,
    hoursUsed,
    hoursRemaining,
    hoursTotal: total,
    percentUsed,
    message,
    resetDate: usage.cloudHoursResetAt || nowIso(),
  });
});

app.post('/api/cloud-streaming/sessions/start', requireAuth, (req, res) => {
  const userId = String(req.body?.userId || req.auth.profile.uid);
  const plan = String(req.body?.userPlan || req.auth.profile.subscription?.plan || 'free');
  const destinationCount = Number(req.body?.destinationCount || 1);
  const usage = getCloudUsage(userId);
  const total = cloudLimitForPlan(plan);
  const hoursUsed = Number(usage.cloudHoursUsed || 0);
  const remaining = Math.max(0, total - hoursUsed);
  if (total === 0 || remaining <= 0) {
    res.status(400).json({
      success: false,
      message:
        total === 0
          ? 'Cloud streaming is not available for this plan.'
          : 'No cloud hours remaining.',
    });
    return;
  }

  const sessionId = `cloud_${userId}_${Date.now()}`;
  setCloudUsage(userId, {
    ...usage,
    activeCloudSession: {
      sessionId,
      startTime: nowIso(),
      destinationCount,
    },
    lastStreamDate: nowIso(),
  });
  res.json({ success: true, sessionId, message: 'Cloud streaming session started' });
});

app.post('/api/cloud-streaming/sessions/end', requireAuth, (req, res) => {
  const userId = String(req.body?.userId || req.auth.profile.uid);
  const sessionId = String(req.body?.sessionId || '');
  const usage = getCloudUsage(userId);
  const active = usage.activeCloudSession;

  if (!active || active.sessionId !== sessionId) {
    res.status(400).json({ success: false, minutesUsed: 0, message: 'No active session found.' });
    return;
  }

  const start = new Date(active.startTime || Date.now()).getTime();
  const end = Date.now();
  const minutesUsed = Math.max(1, Math.ceil((end - start) / 60000));
  const hoursUsed = Math.round((Number(usage.cloudHoursUsed || 0) + minutesUsed / 60) * 100) / 100;

  setCloudUsage(userId, {
    ...usage,
    cloudHoursUsed: hoursUsed,
    activeCloudSession: null,
    lastStreamDate: nowIso(),
  });
  res.json({
    success: true,
    minutesUsed,
    message: `Session ended. Used ${minutesUsed} minutes.`,
  });
});

app.post('/api/cloud-streaming/reset', requireAuth, requireAdmin, (req, res) => {
  const userId = String(req.body?.userId || '');
  if (!userId) {
    res.status(400).json({ success: false, message: 'userId is required.' });
    return;
  }
  setCloudUsage(userId, {
    cloudHoursUsed: 0,
    cloudHoursResetAt: nowIso(),
    activeCloudSession: null,
  });
  res.json({ success: true });
});

app.get('/api/cloud-streaming/sessions/active', requireAuth, (req, res) => {
  const userId = String(req.query.userId || req.auth.profile.uid);
  const usage = getCloudUsage(userId);
  res.json({
    active: Boolean(usage.activeCloudSession),
    session: usage.activeCloudSession || null,
  });
});

app.post('/api/oauth/exchange', requireAuth, (req, res) => {
  const platform = String(req.body?.platform || '')
    .trim()
    .toLowerCase();
  if (!platform) {
    res.status(400).json({ message: 'platform is required.' });
    return;
  }

  const record = getUserByUid(req.auth.profile.uid);
  if (!record) {
    res.status(404).json({ message: 'User not found.' });
    return;
  }

  const platformInfo = {
    youtube: {
      accessToken: `yt_access_${randomUUID().slice(0, 8)}`,
      refreshToken: `yt_refresh_${randomUUID().slice(0, 8)}`,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      channelId: `yt_${record.uid.slice(0, 8)}`,
      channelName: `${record.profile.displayName} YouTube`,
    },
    facebook: {
      accessToken: `fb_access_${randomUUID().slice(0, 8)}`,
      refreshToken: `fb_refresh_${randomUUID().slice(0, 8)}`,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      pageId: `fb_${record.uid.slice(0, 8)}`,
      pageName: `${record.profile.displayName} Facebook`,
    },
    twitch: {
      accessToken: `tw_access_${randomUUID().slice(0, 8)}`,
      refreshToken: `tw_refresh_${randomUUID().slice(0, 8)}`,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      channelId: `tw_${record.uid.slice(0, 8)}`,
      channelName: `${record.profile.displayName} Twitch`,
    },
  };

  if (!platformInfo[platform]) {
    res.status(400).json({ message: `Unsupported platform: ${platform}` });
    return;
  }

  setConnectedPlatform(record.uid, platform, platformInfo[platform]);
  res.json({ success: true });
});

app.post('/api/oauth/refresh', requireAuth, (_req, res) => {
  res.json({ success: true });
});

app.post('/api/oauth/disconnect', requireAuth, (req, res) => {
  const platform = String(req.body?.platform || '')
    .trim()
    .toLowerCase();
  const userId = String(req.body?.userId || req.auth.profile.uid);
  setConnectedPlatform(userId, platform, null);
  res.json({ success: true });
});

app.post('/api/oauth/revoke', requireAuth, (_req, res) => {
  res.json({ success: true });
});

app.get('/api/oauth/platforms', requireAuth, (req, res) => {
  const userId = String(req.query.userId || req.auth.profile.uid);
  const record = getUserByUid(userId);
  if (!record) {
    res.json({ platforms: {} });
    return;
  }
  res.json({ platforms: record.profile.connectedPlatforms || {} });
});

app.post('/api/oauth/stream-key', requireAuth, (req, res) => {
  const platform = String(req.body?.platform || '')
    .trim()
    .toLowerCase();
  if (!platform) {
    res.status(400).json({ message: 'platform is required.' });
    return;
  }
  res.json({
    streamKey: `${platform}_${req.auth.profile.uid.slice(0, 8)}_${Date.now().toString(36)}`,
    ingestUrl:
      platform === 'youtube'
        ? 'rtmps://a.rtmps.youtube.com/live2'
        : platform === 'facebook'
          ? 'rtmps://live-api-s.facebook.com:443/rtmp/'
          : 'rtmp://live.twitch.tv/app',
  });
});

app.post('/api/oauth/channels', requireAuth, (req, res) => {
  const platform = String(req.body?.platform || '')
    .trim()
    .toLowerCase();
  const uid = req.auth.profile.uid.slice(0, 8);
  const channels =
    platform === 'facebook'
      ? [
          { id: `fb_page_${uid}`, name: `${req.auth.profile.displayName} Page` },
          { id: `fb_group_${uid}`, name: `${req.auth.profile.displayName} Group` },
        ]
      : [
          { id: `${platform}_main_${uid}`, name: `${req.auth.profile.displayName} Main` },
          { id: `${platform}_secondary_${uid}`, name: `${req.auth.profile.displayName} Alt` },
        ];
  res.json({ channels });
});

app.get('/api/leaderboard', (_req, res) => {
  seedLeaderboard();
  const state = loadState();
  res.json({ entries: state.leaderboard || [] });
});

app.post('/api/create-checkout-session', requireAuth, (req, res) => {
  const successUrl = String(req.body?.successUrl || '');
  const fallback = '/dashboard?checkout=success';
  res.json({
    url: successUrl || fallback,
  });
});

app.post('/api/create-portal-session', requireAuth, (req, res) => {
  const returnUrl = String(req.body?.returnUrl || '');
  res.json({
    url: returnUrl || '/dashboard?portal=opened',
  });
});

app.use('/api', (_req, res) => {
  res.status(404).json({ message: 'API route not found.' });
});

const distDir = path.join(process.cwd(), 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
      res.status(404).json({ message: 'API route not found.' });
      return;
    }
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

const server = app.listen(port, () => {
  console.log(`ChatScream API listening on http://localhost:${port}`);
});

const shutdown = () => {
  flushState();
  server.close(() => process.exit(0));
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
