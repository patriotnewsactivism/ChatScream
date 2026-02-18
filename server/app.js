import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  addChatMessage,
  addReferral,
  applyAccessOverrides,
  createAffiliateCode,
  createUserProfile,
  getAffiliate,
  getCloudUsage,
  getConfig,
  getIdentityStorageMode,
  getPublicProfile,
  getSession,
  getUserByEmail,
  getUserByUid,
  initIdentityStorage,
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
app.set('trust proxy', true);

void initIdentityStorage().catch((error) => {
  console.error('Failed to initialize managed identity storage:', error);
});

const PLAN_HOURS = {
  free: 0,
  pro: 3,
  expert: 10,
  enterprise: 50,
};

const AWS_COST_MODEL = Object.freeze({
  region: 'us-east-1',
  minDestinations: 1,
  maxDestinations: 5,
  instanceRatesPerHour: {
    't3.medium': 0.0416,
    'c7g.large': 0.0725,
    'c6i.xlarge': 0.17,
    'g4dn.xlarge': 0.526,
  },
  publicIpv4PerHour: 0.005,
  dataOutPerGb: 0.09,
  storagePerGbMonth: 0.08,
  bitrateKbpsByQuality: {
    '720p': 4000,
    '1080p': 6000,
  },
});

const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo';
const YOUTUBE_API_BASE_URL = 'https://www.googleapis.com/youtube/v3';
const YOUTUBE_TOKEN_REFRESH_SKEW_MS = 60 * 1000;
const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;

const clampNumber = (value, min, max, fallback = min) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
};

const round = (value, digits = 4) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const normalizeQuality = (value) => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (normalized === '1080p') return '1080p';
  return '720p';
};

const normalizeInstanceProfile = (value) => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (AWS_COST_MODEL.instanceRatesPerHour[normalized]) return normalized;
  return 'c7g.large';
};

const estimateAwsCloudCost = ({
  destinationCount,
  quality,
  bitrateKbps,
  instanceProfile,
  storageGb = 0,
}) => {
  const safeDestinationCount = clampNumber(
    destinationCount,
    AWS_COST_MODEL.minDestinations,
    AWS_COST_MODEL.maxDestinations,
    AWS_COST_MODEL.minDestinations,
  );
  const safeQuality = normalizeQuality(quality);
  const safeInstanceProfile = normalizeInstanceProfile(instanceProfile);
  const defaultBitrate = AWS_COST_MODEL.bitrateKbpsByQuality[safeQuality];
  const safeBitrateKbps = clampNumber(bitrateKbps, 500, 20000, defaultBitrate);
  const safeStorageGb = clampNumber(storageGb, 0, 10000, 0);

  const instancePerHour = AWS_COST_MODEL.instanceRatesPerHour[safeInstanceProfile];
  const ipv4PerHour = AWS_COST_MODEL.publicIpv4PerHour;
  const totalBitrateMbps = (safeBitrateKbps / 1000) * safeDestinationCount;
  const dataOutGbPerHour = totalBitrateMbps * 0.45;
  const dataOutPerHour = dataOutGbPerHour * AWS_COST_MODEL.dataOutPerGb;
  const storagePerHour = (safeStorageGb * AWS_COST_MODEL.storagePerGbMonth) / (30 * 24);
  const basePerHour = instancePerHour + ipv4PerHour;
  const totalPerHour = basePerHour + dataOutPerHour + storagePerHour;

  return {
    region: AWS_COST_MODEL.region,
    destinationCount: safeDestinationCount,
    quality: safeQuality,
    bitrateKbps: safeBitrateKbps,
    instanceProfile: safeInstanceProfile,
    storageGb: safeStorageGb,
    instancePerHour: round(instancePerHour),
    ipv4PerHour: round(ipv4PerHour),
    dataOutPerHour: round(dataOutPerHour),
    storagePerHour: round(storagePerHour),
    basePerHour: round(basePerHour),
    totalPerHour: round(totalPerHour),
    totalPerMonth: round(totalPerHour * 730, 2),
    dataOutGbPerHour: round(dataOutGbPerHour),
    totalBitrateMbps: round(totalBitrateMbps),
    notes:
      'Estimate excludes transcoder overhead, control-plane services, and destination platform fees.',
  };
};

const normalizeEmail = (value = '') => value.trim().toLowerCase();
const normalizeCode = (value = '') => value.trim().toUpperCase();
const nowIso = () => new Date().toISOString();

const createHttpError = (status, message, details) => {
  const error = new Error(message);
  error.status = status;
  if (details !== undefined) {
    error.details = details;
  }
  return error;
};

const getHttpErrorStatus = (error, fallback = 500) => {
  const status = Number(error?.status);
  return Number.isFinite(status) ? status : fallback;
};

const parseJsonResponse = async (response) => {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
};

const base64UrlEncode = (value) => Buffer.from(value, 'utf8').toString('base64url');
const base64UrlDecode = (value) => Buffer.from(value, 'base64url').toString('utf8');

const getServerBaseUrl = (req) => {
  const configured = String(process.env.SERVER_BASE_URL || process.env.API_BASE_URL || '').trim();
  if (configured) {
    return configured.replace(/\/+$/, '');
  }

  const forwardedProto = String(req.headers['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim();
  const forwardedHost = String(req.headers['x-forwarded-host'] || '')
    .split(',')[0]
    .trim();
  const host =
    forwardedHost ||
    String(req.headers.host || 'localhost')
      .split(',')[0]
      .trim();
  const protocol = forwardedProto || req.protocol || 'http';
  return `${protocol}://${host || 'localhost'}`;
};

const getFrontendOAuthCallbackUrl = (req) => {
  const configured = String(
    process.env.AUTH_REDIRECT_URL ||
      process.env.VITE_OAUTH_REDIRECT_URI ||
      process.env.APP_BASE_URL ||
      '',
  ).trim();
  if (configured) {
    if (/^https?:\/\//i.test(configured)) {
      return configured;
    }
    if (configured.startsWith('/')) {
      return `${getServerBaseUrl(req)}${configured}`;
    }
  }
  return new URL('/oauth/callback', getServerBaseUrl(req)).toString();
};

const redirectToFrontendOAuth = (req, res, params = {}) => {
  const target = new URL(getFrontendOAuthCallbackUrl(req));
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    target.searchParams.set(key, String(value));
  });
  res.redirect(302, target.toString());
};

const getGoogleAuthCredentials = () => {
  const oauth = getConfig('oauth') || {};
  return {
    clientId: String(
      process.env.GOOGLE_CLIENT_ID ||
        oauth.googleClientId ||
        process.env.YOUTUBE_CLIENT_ID ||
        oauth.youtubeClientId ||
        '',
    ).trim(),
    clientSecret: String(
      process.env.GOOGLE_CLIENT_SECRET || process.env.YOUTUBE_CLIENT_SECRET || '',
    ).trim(),
  };
};

const getAuthStateSecret = () =>
  String(
    process.env.AUTH_STATE_SECRET ||
      process.env.GOOGLE_CLIENT_SECRET ||
      process.env.YOUTUBE_CLIENT_SECRET ||
      '',
  ).trim();

const signAuthState = (rawState) => {
  const secret = getAuthStateSecret();
  if (!secret) return '';
  return createHmac('sha256', secret).update(rawState).digest('base64url');
};

const createAuthState = (payload) => {
  const rawPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signAuthState(rawPayload);
  if (!signature) return '';
  return `${rawPayload}.${signature}`;
};

const parseAuthState = (encodedState) => {
  const [rawPayload, signature] = String(encodedState || '').split('.', 2);
  if (!rawPayload || !signature) {
    return null;
  }

  const expectedSignature = signAuthState(rawPayload);
  if (!expectedSignature) {
    return null;
  }

  const expectedBuffer = Buffer.from(expectedSignature);
  const actualBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== actualBuffer.length) {
    return null;
  }
  if (!timingSafeEqual(expectedBuffer, actualBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(rawPayload));
    if (!payload || typeof payload !== 'object') {
      return null;
    }
    const issuedAt = Number(payload.ts || 0);
    if (!Number.isFinite(issuedAt) || issuedAt <= 0) {
      return null;
    }
    if (Date.now() - issuedAt > OAUTH_STATE_MAX_AGE_MS) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
};

const getYouTubeOAuthCredentials = () => {
  const oauth = getConfig('oauth') || {};
  return {
    clientId: String(process.env.YOUTUBE_CLIENT_ID || oauth.youtubeClientId || '').trim(),
    clientSecret: String(process.env.YOUTUBE_CLIENT_SECRET || '').trim(),
  };
};

const getExpiryFromSeconds = (seconds, fallbackSeconds = 3600) => {
  const expiresIn = Number(seconds);
  const safeSeconds = Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : fallbackSeconds;
  return new Date(Date.now() + safeSeconds * 1000).toISOString();
};

const isExpiredOrNearExpiry = (expiresAt) => {
  const expiresMs = new Date(String(expiresAt || '')).getTime();
  if (!Number.isFinite(expiresMs)) return true;
  return expiresMs <= Date.now() + YOUTUBE_TOKEN_REFRESH_SKEW_MS;
};

const requestYouTubeTokenExchange = async ({ code, redirectUri }) => {
  const { clientId, clientSecret } = getYouTubeOAuthCredentials();
  if (!clientId || !clientSecret) {
    throw createHttpError(
      500,
      'YouTube OAuth server configuration is incomplete. Add YOUTUBE_CLIENT_SECRET.',
    );
  }
  if (!code) {
    throw createHttpError(400, 'Missing YouTube authorization code.');
  }
  if (!redirectUri) {
    throw createHttpError(400, 'Missing OAuth redirect URI.');
  }

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });

  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const payload = await parseJsonResponse(response);

  if (!response.ok) {
    const message =
      payload?.error_description || payload?.error || 'Failed to exchange YouTube OAuth code.';
    const status = String(payload?.error || '').toLowerCase() === 'invalid_grant' ? 400 : 502;
    throw createHttpError(status, message, payload);
  }

  return payload;
};

const requestYouTubeTokenRefresh = async (refreshToken) => {
  const { clientId, clientSecret } = getYouTubeOAuthCredentials();
  if (!clientId || !clientSecret) {
    throw createHttpError(
      500,
      'YouTube OAuth server configuration is incomplete. Add YOUTUBE_CLIENT_SECRET.',
    );
  }
  if (!refreshToken) {
    throw createHttpError(401, 'YouTube refresh token missing. Reconnect your YouTube account.');
  }

  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
  });

  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const payload = await parseJsonResponse(response);

  if (!response.ok) {
    const message =
      payload?.error_description || payload?.error || 'Failed to refresh YouTube access token.';
    const status = String(payload?.error || '').toLowerCase() === 'invalid_grant' ? 401 : 502;
    throw createHttpError(status, message, payload);
  }

  return payload;
};

const buildYouTubeApiUrl = (pathName, query = {}) => {
  const url = new URL(`${YOUTUBE_API_BASE_URL}/${pathName}`);
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    url.searchParams.set(key, String(value));
  });
  return url.toString();
};

const youtubeApiRequest = async ({ accessToken, pathName, method = 'GET', query, body }) => {
  if (!accessToken) {
    throw createHttpError(401, 'Missing YouTube access token. Reconnect your account.');
  }

  const response = await fetch(buildYouTubeApiUrl(pathName, query), {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await parseJsonResponse(response);

  if (!response.ok) {
    const message =
      payload?.error?.message ||
      payload?.error_description ||
      `YouTube API request failed (${response.status}).`;
    throw createHttpError(response.status, message, payload);
  }

  return payload;
};

const parseYouTubeChannels = (payload) => {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  return items
    .map((channel) => ({
      id: String(channel?.id || '').trim(),
      name: String(channel?.snippet?.title || '').trim(),
      thumbnailUrl:
        String(
          channel?.snippet?.thumbnails?.default?.url ||
            channel?.snippet?.thumbnails?.medium?.url ||
            channel?.snippet?.thumbnails?.high?.url ||
            '',
        ).trim() || undefined,
    }))
    .filter((channel) => channel.id && channel.name);
};

const parseYouTubeIngestionInfo = (stream) => {
  const streamKey = String(stream?.cdn?.ingestionInfo?.streamName || '').trim();
  const ingestUrl = String(stream?.cdn?.ingestionInfo?.ingestionAddress || '').trim();
  return { streamKey, ingestUrl };
};

const listYouTubeStreams = async (accessToken) => {
  const payload = await youtubeApiRequest({
    accessToken,
    pathName: 'liveStreams',
    query: {
      part: 'id,snippet,cdn,status',
      mine: 'true',
      maxResults: '50',
    },
  });
  return Array.isArray(payload?.items) ? payload.items : [];
};

const createYouTubeStream = async (accessToken) => {
  return youtubeApiRequest({
    accessToken,
    pathName: 'liveStreams',
    method: 'POST',
    query: { part: 'id,snippet,cdn,status,contentDetails' },
    body: {
      snippet: { title: `ChatScream Stream ${new Date().toISOString()}` },
      cdn: {
        ingestionType: 'rtmp',
        frameRate: 'variable',
        resolution: 'variable',
      },
      contentDetails: { isReusable: true },
    },
  });
};

const getConnectedYouTubeAccount = async (uid) => {
  const record = await getUserByUid(uid);
  if (!record) {
    throw createHttpError(404, 'User not found.');
  }
  const youtube = record.profile?.connectedPlatforms?.youtube || null;
  if (!youtube) {
    throw createHttpError(400, 'YouTube account is not connected.');
  }
  return { record, youtube };
};

const refreshStoredYouTubeAccessToken = async (uid, youtubeAccount) => {
  const refreshed = await requestYouTubeTokenRefresh(String(youtubeAccount?.refreshToken || ''));
  const accessToken = String(refreshed?.access_token || '').trim();
  if (!accessToken) {
    throw createHttpError(502, 'YouTube refresh response did not include an access token.');
  }

  const nextYoutube = {
    ...youtubeAccount,
    accessToken,
    refreshToken: String(refreshed?.refresh_token || youtubeAccount?.refreshToken || '').trim(),
    expiresAt: getExpiryFromSeconds(refreshed?.expires_in, 3600),
    scope:
      typeof refreshed?.scope === 'string' && refreshed.scope.trim()
        ? refreshed.scope.trim()
        : youtubeAccount?.scope,
  };

  await setConnectedPlatform(uid, 'youtube', nextYoutube);
  return nextYoutube;
};

const executeWithYouTubeAccessToken = async (uid, handler) => {
  const { youtube } = await getConnectedYouTubeAccount(uid);
  let activeAccount = youtube;

  if (isExpiredOrNearExpiry(activeAccount?.expiresAt)) {
    activeAccount = await refreshStoredYouTubeAccessToken(uid, activeAccount);
  }

  try {
    return await handler(activeAccount.accessToken, activeAccount);
  } catch (error) {
    if (getHttpErrorStatus(error, 500) !== 401 || !activeAccount?.refreshToken) {
      throw error;
    }
    const refreshed = await refreshStoredYouTubeAccessToken(uid, activeAccount);
    return handler(refreshed.accessToken, refreshed);
  }
};

const hashPassword = (value = '') => createHash('sha256').update(value).digest('hex');

const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

const issueSession = async (uid) => {
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  await saveSession({ token, uid, expiresAt });
  return { token, expiresAt };
};

const buildSessionPayload = async (uid, existingToken, existingExpiry) => {
  const record = await getUserByUid(uid);
  if (!record) return null;
  const profile = getPublicProfile(record);
  const token = existingToken || (await issueSession(uid)).token;
  const expiresAt = existingExpiry || new Date(Date.now() + 60 * 60 * 1000).toISOString();
  if (!existingToken) {
    await saveSession({ token, uid, expiresAt });
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

const requireAuth = asyncHandler(async (req, res, next) => {
  const token = readBearerToken(req);
  if (!token) {
    res.status(401).json({ message: 'Missing authorization token.' });
    return;
  }
  const session = await getSession(token);
  if (!session) {
    res.status(401).json({ message: 'Session expired. Please sign in again.' });
    return;
  }
  const userRecord = await getUserByUid(session.uid);
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
});

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
  res.json({
    ok: true,
    service: 'chatscream-api',
    timestamp: nowIso(),
    identityStorage: getIdentityStorageMode(),
  });
});

app.post(
  '/api/auth/signup',
  asyncHandler(async (req, res) => {
    const email = normalizeEmail(req.body?.email || '');
    const password = String(req.body?.password || '');
    const displayName = String(req.body?.displayName || '').trim();
    const referralCode = normalizeCode(req.body?.referralCode || '');

    if (!email || !password || password.length < 6) {
      res.status(400).json({ message: 'Valid email and password are required.' });
      return;
    }
    if (await getUserByEmail(email)) {
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

    await putUser({
      uid,
      email,
      passwordHash: hashPassword(password),
      profile,
    });

    const payload = await buildSessionPayload(uid);
    res.status(201).json(payload);
  }),
);

app.post(
  '/api/auth/login',
  asyncHandler(async (req, res) => {
    const email = normalizeEmail(req.body?.email || '');
    const password = String(req.body?.password || '');
    const record = await getUserByEmail(email);

    if (!record || record.passwordHash !== hashPassword(password)) {
      res.status(401).json({ message: 'Invalid email or password.' });
      return;
    }

    const payload = await buildSessionPayload(record.uid);
    res.json(payload);
  }),
);

app.get(
  '/api/auth/session',
  requireAuth,
  asyncHandler(async (req, res) => {
    const payload = await buildSessionPayload(
      req.auth.record.uid,
      req.auth.token,
      req.auth.session.expiresAt,
    );
    res.json(payload);
  }),
);

app.get(
  '/api/auth/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const payload = await buildSessionPayload(
      req.auth.record.uid,
      req.auth.token,
      req.auth.session.expiresAt,
    );
    res.json(payload);
  }),
);

app.post(
  '/api/auth/refresh',
  requireAuth,
  asyncHandler(async (req, res) => {
    await removeSession(req.auth.token);
    const payload = await buildSessionPayload(req.auth.record.uid);
    res.json(payload);
  }),
);

app.post(
  '/api/auth/logout',
  requireAuth,
  asyncHandler(async (req, res) => {
    await removeSession(req.auth.token);
    res.json({ success: true });
  }),
);

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
  if (provider !== 'google') {
    res
      .status(400)
      .json({ message: `${provider} sign-in is not available yet. Use Google sign-in.` });
    return;
  }
  const redirectUrl = `/api/auth/oauth/${provider}${referral ? `?ref=${encodeURIComponent(referral)}` : ''}`;
  res.json({ redirectUrl });
});

app.get(
  '/api/auth/oauth/google/callback',
  asyncHandler(async (req, res) => {
    const queryError = String(req.query.error || '').trim();
    if (queryError) {
      const message = queryError === 'access_denied' ? 'Authorization was denied.' : queryError;
      redirectToFrontendOAuth(req, res, { platform: 'google', error: message });
      return;
    }

    const code = String(req.query.code || '').trim();
    const state = String(req.query.state || '').trim();
    if (!code || !state) {
      redirectToFrontendOAuth(req, res, {
        platform: 'google',
        error: 'Missing authorization code or state.',
      });
      return;
    }

    const parsedState = parseAuthState(state);
    if (!parsedState) {
      redirectToFrontendOAuth(req, res, {
        platform: 'google',
        error: 'Invalid or expired sign-in state. Please try again.',
      });
      return;
    }

    const { clientId, clientSecret } = getGoogleAuthCredentials();
    if (!clientId || !clientSecret) {
      redirectToFrontendOAuth(req, res, {
        platform: 'google',
        error: 'Google sign-in is not configured.',
      });
      return;
    }

    const redirectUri = `${getServerBaseUrl(req)}/api/auth/oauth/google/callback`;
    const tokenBody = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });

    const tokenResponse = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody.toString(),
    });
    const tokenPayload = await parseJsonResponse(tokenResponse);
    if (!tokenResponse.ok) {
      const message =
        tokenPayload?.error_description ||
        tokenPayload?.error ||
        'Failed to complete Google sign-in.';
      redirectToFrontendOAuth(req, res, { platform: 'google', error: message });
      return;
    }

    const accessToken = String(tokenPayload?.access_token || '').trim();
    if (!accessToken) {
      redirectToFrontendOAuth(req, res, {
        platform: 'google',
        error: 'Google sign-in did not return an access token.',
      });
      return;
    }

    const userInfoResponse = await fetch(GOOGLE_USERINFO_ENDPOINT, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const userInfo = await parseJsonResponse(userInfoResponse);
    if (!userInfoResponse.ok) {
      const message =
        userInfo?.error_description || userInfo?.error || 'Failed to fetch Google profile.';
      redirectToFrontendOAuth(req, res, { platform: 'google', error: message });
      return;
    }

    const email = normalizeEmail(userInfo?.email || '');
    if (!email) {
      redirectToFrontendOAuth(req, res, {
        platform: 'google',
        error: 'Google account did not provide an email address.',
      });
      return;
    }

    const displayName =
      String(userInfo?.name || '').trim() ||
      String(userInfo?.given_name || '').trim() ||
      email.split('@')[0];
    const photoURL = String(userInfo?.picture || '').trim();
    const referral = normalizeCode(parsedState?.ref || '');

    let record = await getUserByEmail(email);
    if (!record) {
      const uid = randomUUID();
      const referredAffiliate = referral ? getAffiliate(referral) : null;
      let profile = createUserProfile({
        uid,
        email,
        displayName,
        referredByCode: referredAffiliate?.code || '',
        referredByUserId: referredAffiliate?.ownerId || '',
      });
      profile.photoURL = photoURL;
      profile = ensureAffiliateForProfile(profile);
      profile = applyAccessOverrides(profile);

      await putUser({
        uid,
        email,
        passwordHash: '',
        profile,
      });

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

      record = await getUserByUid(uid);
    } else {
      const nextProfile = applyAccessOverrides({
        ...record.profile,
        email,
        displayName: record.profile?.displayName || displayName,
        photoURL: record.profile?.photoURL || photoURL,
      });
      await putUser({
        ...record,
        email,
        profile: nextProfile,
      });
      record = await getUserByUid(record.uid);
    }

    const issued = await issueSession(record.uid);
    redirectToFrontendOAuth(req, res, {
      platform: 'google',
      token: issued.token,
      uid: record.uid,
      email: record.email,
      displayName: record.profile.displayName || 'User',
      expiresAt: issued.expiresAt,
    });
  }),
);

app.get(
  '/api/auth/oauth/:provider',
  asyncHandler(async (req, res) => {
    const provider = String(req.params.provider || '')
      .trim()
      .toLowerCase();
    if (provider !== 'google') {
      res
        .status(400)
        .json({ message: `${provider} sign-in is not available yet. Use Google sign-in.` });
      return;
    }

    const { clientId, clientSecret } = getGoogleAuthCredentials();
    if (!clientId || !clientSecret) {
      res.status(500).json({
        message: 'Google sign-in is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.',
      });
      return;
    }

    if (!getAuthStateSecret()) {
      res.status(500).json({
        message:
          'Google sign-in state secret is missing. Set AUTH_STATE_SECRET (or GOOGLE_CLIENT_SECRET).',
      });
      return;
    }

    const referral = normalizeCode(req.query.ref || '');
    const state = createAuthState({
      ts: Date.now(),
      nonce: randomUUID(),
      ref: referral,
    });
    if (!state) {
      res.status(500).json({ message: 'Failed to initialize secure sign-in state.' });
      return;
    }

    const redirectUri = `${getServerBaseUrl(req)}/api/auth/oauth/google/callback`;
    const authUrl = new URL(GOOGLE_AUTH_ENDPOINT);
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'openid email profile');
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'select_account');
    authUrl.searchParams.set('state', state);

    res.redirect(302, authUrl.toString());
  }),
);

app.post(
  '/api/access/sync',
  requireAuth,
  asyncHandler(async (req, res) => {
    const record = await getUserByUid(req.auth.record.uid);
    if (!record) {
      res.status(404).json({ message: 'User not found.' });
      return;
    }
    const profile = applyAccessOverrides(record.profile);
    await putUser({ ...record, profile });
    res.json({ success: true, profile });
  }),
);

app.get(
  '/api/users/:uid',
  requireAuth,
  asyncHandler(async (req, res) => {
    const record = await getUserByUid(req.params.uid);
    if (!record) {
      res.status(404).json({ message: 'User not found.' });
      return;
    }
    res.json({ profile: getPublicProfile(record) });
  }),
);

app.patch(
  '/api/users/:uid',
  requireAuth,
  asyncHandler(async (req, res) => {
    const record = await getUserByUid(req.params.uid);
    if (!record) {
      res.status(404).json({ message: 'User not found.' });
      return;
    }
    const profile = deepMerge(record.profile, req.body || {});
    await putUser({ ...record, profile });
    res.json({ profile: getPublicProfile({ ...record, profile }) });
  }),
);

app.get(
  '/api/user/:uid',
  requireAuth,
  asyncHandler(async (req, res) => {
    const record = await getUserByUid(req.params.uid);
    if (!record) {
      res.status(404).json({ message: 'User not found.' });
      return;
    }
    res.json({ profile: getPublicProfile(record) });
  }),
);

app.put(
  '/api/user/:uid',
  requireAuth,
  asyncHandler(async (req, res) => {
    const record = await getUserByUid(req.params.uid);
    if (!record) {
      res.status(404).json({ message: 'User not found.' });
      return;
    }
    const profile = deepMerge(record.profile, req.body || {});
    await putUser({ ...record, profile });
    res.json({ profile: getPublicProfile({ ...record, profile }) });
  }),
);

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

app.post(
  '/api/affiliates',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = String(req.body?.userId || req.auth.profile.uid);
    const record = await getUserByUid(userId);
    if (!record) {
      res.status(404).json({ message: 'User not found.' });
      return;
    }
    const profile = ensureAffiliateForProfile(record.profile);
    await putUser({ ...record, profile });
    res.status(201).json({ code: profile.affiliate.code });
  }),
);

app.post(
  '/api/affiliate/create',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = String(req.body?.userId || req.auth.profile.uid);
    const record = await getUserByUid(userId);
    if (!record) {
      res.status(404).json({ message: 'User not found.' });
      return;
    }
    const profile = ensureAffiliateForProfile(record.profile);
    await putUser({ ...record, profile });
    res.status(201).json({ code: profile.affiliate.code });
  }),
);

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

app.post(
  '/api/affiliates/ensure',
  requireAuth,
  asyncHandler(async (req, res) => {
    const record = await getUserByUid(req.auth.profile.uid);
    if (!record) {
      res.status(404).json({ message: 'User not found.' });
      return;
    }
    const profile = ensureAffiliateForProfile(record.profile);
    await putUser({ ...record, profile });
    res.json({ code: profile.affiliate.code, affiliateCode: profile.affiliate.code });
  }),
);

app.post(
  '/api/users/me/affiliate',
  requireAuth,
  asyncHandler(async (req, res) => {
    const record = await getUserByUid(req.auth.profile.uid);
    if (!record) {
      res.status(404).json({ message: 'User not found.' });
      return;
    }
    const profile = ensureAffiliateForProfile(record.profile);
    await putUser({ ...record, profile });
    res.json({ code: profile.affiliate.code, affiliateCode: profile.affiliate.code });
  }),
);

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

app.get(
  '/api/admin/users',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const email = normalizeEmail(req.query.email || '');
    if (!email) {
      res.json({ users: [] });
      return;
    }
    const users = (await listUsers())
      .filter((record) => normalizeEmail(record.email) === email)
      .map((record) => getPublicProfile(record));
    res.json({ users });
  }),
);

app.get(
  '/api/users/search',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const email = normalizeEmail(req.query.email || '');
    if (!email) {
      res.json({ users: [] });
      return;
    }
    const users = (await listUsers())
      .filter((record) => normalizeEmail(record.email) === email)
      .map((record) => getPublicProfile(record));
    res.json({ users });
  }),
);

app.patch(
  '/api/admin/users/:uid/access',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const record = await getUserByUid(req.params.uid);
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
    await putUser({ ...record, profile });
    res.json({ success: true, profile: getPublicProfile({ ...record, profile }) });
  }),
);

app.post(
  '/api/access/users/:uid',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const record = await getUserByUid(req.params.uid);
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
    await putUser({ ...record, profile });
    res.json({ success: true, profile: getPublicProfile({ ...record, profile }) });
  }),
);

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
  const activeSession = usage.activeCloudSession || null;
  const activeEstimate = activeSession
    ? estimateAwsCloudCost({
        destinationCount: activeSession.destinationCount || 1,
        quality: activeSession.quality || '1080p',
        bitrateKbps:
          activeSession.bitrateKbps ||
          AWS_COST_MODEL.bitrateKbpsByQuality[normalizeQuality(activeSession.quality)],
        instanceProfile: activeSession.instanceProfile || 'c7g.large',
        storageGb: activeSession.storageGb || 0,
      })
    : null;
  const defaultEstimate = estimateAwsCloudCost({
    destinationCount: 1,
    quality: '1080p',
    bitrateKbps: AWS_COST_MODEL.bitrateKbpsByQuality['1080p'],
    instanceProfile: 'c7g.large',
    storageGb: 0,
  });

  res.json({
    canStream,
    hoursUsed,
    hoursRemaining,
    hoursTotal: total,
    percentUsed,
    message,
    resetDate: usage.cloudHoursResetAt || nowIso(),
    activeSession,
    activeEstimate,
    defaultEstimate,
    costModel: AWS_COST_MODEL,
  });
});

app.get('/api/cloud-streaming/cost-model', requireAuth, (_req, res) => {
  res.json({
    costModel: AWS_COST_MODEL,
    instanceProfiles: [
      {
        id: 't3.medium',
        label: 't3.medium (budget control-plane)',
        ratePerHour: AWS_COST_MODEL.instanceRatesPerHour['t3.medium'],
      },
      {
        id: 'c7g.large',
        label: 'c7g.large (recommended)',
        ratePerHour: AWS_COST_MODEL.instanceRatesPerHour['c7g.large'],
      },
      {
        id: 'c6i.xlarge',
        label: 'c6i.xlarge (higher CPU headroom)',
        ratePerHour: AWS_COST_MODEL.instanceRatesPerHour['c6i.xlarge'],
      },
      {
        id: 'g4dn.xlarge',
        label: 'g4dn.xlarge (GPU accelerated)',
        ratePerHour: AWS_COST_MODEL.instanceRatesPerHour['g4dn.xlarge'],
      },
    ],
  });
});

app.post('/api/cloud-streaming/estimate', requireAuth, (req, res) => {
  const quality = normalizeQuality(req.body?.quality || req.body?.resolution || '720p');
  const destinationCount = clampNumber(
    req.body?.destinationCount,
    AWS_COST_MODEL.minDestinations,
    AWS_COST_MODEL.maxDestinations,
    1,
  );
  const bitrateKbps = clampNumber(
    req.body?.bitrateKbps,
    500,
    20000,
    AWS_COST_MODEL.bitrateKbpsByQuality[quality],
  );
  const instanceProfile = normalizeInstanceProfile(req.body?.instanceProfile || 'c7g.large');
  const storageGb = clampNumber(req.body?.storageGb, 0, 10000, 0);

  const estimate = estimateAwsCloudCost({
    destinationCount,
    quality,
    bitrateKbps,
    instanceProfile,
    storageGb,
  });

  res.json({
    success: true,
    estimate,
  });
});

app.post('/api/cloud-streaming/sessions/start', requireAuth, (req, res) => {
  const userId = String(req.body?.userId || req.auth.profile.uid);
  const plan = String(req.body?.userPlan || req.auth.profile.subscription?.plan || 'free');
  const quality = normalizeQuality(req.body?.quality || req.body?.resolution || '720p');
  const destinationCount = clampNumber(
    req.body?.destinationCount,
    AWS_COST_MODEL.minDestinations,
    AWS_COST_MODEL.maxDestinations,
    1,
  );
  const bitrateKbps = clampNumber(
    req.body?.bitrateKbps,
    500,
    20000,
    AWS_COST_MODEL.bitrateKbpsByQuality[quality],
  );
  const instanceProfile = normalizeInstanceProfile(req.body?.instanceProfile || 'c7g.large');
  const storageGb = clampNumber(req.body?.storageGb, 0, 10000, 0);
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
  const estimate = estimateAwsCloudCost({
    destinationCount,
    quality,
    bitrateKbps,
    instanceProfile,
    storageGb,
  });
  setCloudUsage(userId, {
    ...usage,
    activeCloudSession: {
      sessionId,
      startTime: nowIso(),
      destinationCount,
      quality,
      bitrateKbps,
      instanceProfile,
      storageGb,
      estimatedCostPerHour: estimate.totalPerHour,
    },
    lastStreamDate: nowIso(),
  });
  res.json({
    success: true,
    sessionId,
    estimate,
    message: 'Cloud streaming session started',
  });
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
  const estimate = estimateAwsCloudCost({
    destinationCount: active.destinationCount || 1,
    quality: active.quality || '1080p',
    bitrateKbps:
      active.bitrateKbps || AWS_COST_MODEL.bitrateKbpsByQuality[normalizeQuality(active.quality)],
    instanceProfile: active.instanceProfile || 'c7g.large',
    storageGb: active.storageGb || 0,
  });
  const sessionCostUsd = round((minutesUsed / 60) * estimate.totalPerHour, 4);

  setCloudUsage(userId, {
    ...usage,
    cloudHoursUsed: hoursUsed,
    activeCloudSession: null,
    lastStreamDate: nowIso(),
  });
  res.json({
    success: true,
    minutesUsed,
    estimatedCostUsd: sessionCostUsd,
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
  const activeSession = usage.activeCloudSession || null;
  const estimate = activeSession
    ? estimateAwsCloudCost({
        destinationCount: activeSession.destinationCount || 1,
        quality: activeSession.quality || '1080p',
        bitrateKbps:
          activeSession.bitrateKbps ||
          AWS_COST_MODEL.bitrateKbpsByQuality[normalizeQuality(activeSession.quality)],
        instanceProfile: activeSession.instanceProfile || 'c7g.large',
        storageGb: activeSession.storageGb || 0,
      })
    : null;
  res.json({
    active: Boolean(activeSession),
    session: activeSession,
    estimate,
  });
});

app.post(
  '/api/oauth/exchange',
  requireAuth,
  asyncHandler(async (req, res) => {
    const platform = String(req.body?.platform || '')
      .trim()
      .toLowerCase();
    if (!platform) {
      res.status(400).json({ message: 'platform is required.' });
      return;
    }

    const record = await getUserByUid(req.auth.profile.uid);
    if (!record) {
      res.status(404).json({ message: 'User not found.' });
      return;
    }

    if (platform === 'youtube') {
      const code = String(req.body?.code || '').trim();
      const redirectUri = String(req.body?.redirectUri || '').trim();

      try {
        const tokenPayload = await requestYouTubeTokenExchange({ code, redirectUri });
        const accessToken = String(tokenPayload?.access_token || '').trim();
        if (!accessToken) {
          throw createHttpError(502, 'YouTube token exchange did not return an access token.');
        }

        const channelsPayload = await youtubeApiRequest({
          accessToken,
          pathName: 'channels',
          query: {
            part: 'id,snippet',
            mine: 'true',
            maxResults: '50',
          },
        });
        const channels = parseYouTubeChannels(channelsPayload);
        const primaryChannel = channels[0] || null;
        if (!primaryChannel) {
          throw createHttpError(
            400,
            'No YouTube channel found for this account. Create a channel and try again.',
          );
        }

        const existingYouTube = record.profile?.connectedPlatforms?.youtube || {};
        const nextYouTube = {
          ...existingYouTube,
          accessToken,
          refreshToken: String(
            tokenPayload?.refresh_token || existingYouTube?.refreshToken || '',
          ).trim(),
          expiresAt: getExpiryFromSeconds(tokenPayload?.expires_in, 3600),
          channelId: primaryChannel.id,
          channelName: primaryChannel.name,
          thumbnailUrl: primaryChannel.thumbnailUrl,
          scope:
            typeof tokenPayload?.scope === 'string' && tokenPayload.scope.trim()
              ? tokenPayload.scope.trim()
              : existingYouTube?.scope,
        };

        await setConnectedPlatform(record.uid, 'youtube', nextYouTube);
        res.json({
          success: true,
          platform: 'youtube',
          channel: primaryChannel,
        });
      } catch (error) {
        console.error('YouTube OAuth exchange failed:', error);
        const status = getHttpErrorStatus(error, 502);
        res.status(status).json({
          message: error instanceof Error ? error.message : 'Failed to connect YouTube account.',
        });
      }
      return;
    }

    res.status(501).json({
      message: `${platform} destination OAuth is not live yet. Only YouTube is fully implemented right now.`,
    });
  }),
);

app.post(
  '/api/oauth/refresh',
  requireAuth,
  asyncHandler(async (req, res) => {
    const platform = String(req.body?.platform || '')
      .trim()
      .toLowerCase();
    if (!platform) {
      res.status(400).json({ message: 'platform is required.' });
      return;
    }

    if (platform !== 'youtube') {
      res.json({ success: true });
      return;
    }

    try {
      const { youtube } = await getConnectedYouTubeAccount(req.auth.profile.uid);
      await refreshStoredYouTubeAccessToken(req.auth.profile.uid, youtube);
      res.json({ success: true });
    } catch (error) {
      console.error('YouTube token refresh failed:', error);
      const status = getHttpErrorStatus(error, 502);
      res.status(status).json({
        message: error instanceof Error ? error.message : 'Failed to refresh YouTube token.',
      });
    }
  }),
);

app.post(
  '/api/oauth/disconnect',
  requireAuth,
  asyncHandler(async (req, res) => {
    const platform = String(req.body?.platform || '')
      .trim()
      .toLowerCase();
    const userId = String(req.body?.userId || req.auth.profile.uid);
    await setConnectedPlatform(userId, platform, null);
    res.json({ success: true });
  }),
);

app.post('/api/oauth/revoke', requireAuth, (_req, res) => {
  res.json({ success: true });
});

app.get(
  '/api/oauth/platforms',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = String(req.query.userId || req.auth.profile.uid);
    const record = await getUserByUid(userId);
    if (!record) {
      res.json({ platforms: {} });
      return;
    }
    res.json({ platforms: record.profile.connectedPlatforms || {} });
  }),
);

app.post(
  '/api/oauth/stream-key',
  requireAuth,
  asyncHandler(async (req, res) => {
    const platform = String(req.body?.platform || '')
      .trim()
      .toLowerCase();
    if (!platform) {
      res.status(400).json({ message: 'platform is required.' });
      return;
    }

    if (platform === 'youtube') {
      const requestedChannelId = String(req.body?.channelId || '').trim();

      try {
        const streamInfo = await executeWithYouTubeAccessToken(
          req.auth.profile.uid,
          async (accessToken) => {
            const channelsPayload = await youtubeApiRequest({
              accessToken,
              pathName: 'channels',
              query: {
                part: 'id,snippet',
                mine: 'true',
                maxResults: '50',
              },
            });
            const channels = parseYouTubeChannels(channelsPayload);
            if (!channels.length) {
              throw createHttpError(
                400,
                'No YouTube channels found for this account. Reconnect and try again.',
              );
            }

            const selectedChannel = requestedChannelId
              ? channels.find((channel) => channel.id === requestedChannelId)
              : channels[0];
            if (!selectedChannel) {
              throw createHttpError(404, 'Selected YouTube channel is not available.');
            }

            const streams = await listYouTubeStreams(accessToken);
            let selectedStream =
              streams.find((stream) => {
                if (!requestedChannelId) return true;
                const streamChannelId = String(stream?.snippet?.channelId || '').trim();
                return !streamChannelId || streamChannelId === requestedChannelId;
              }) || null;

            if (!selectedStream) {
              selectedStream = await createYouTubeStream(accessToken);
            }

            let ingestionInfo = parseYouTubeIngestionInfo(selectedStream);
            if ((!ingestionInfo.streamKey || !ingestionInfo.ingestUrl) && selectedStream?.id) {
              const lookupPayload = await youtubeApiRequest({
                accessToken,
                pathName: 'liveStreams',
                query: {
                  part: 'id,snippet,cdn,status',
                  id: String(selectedStream.id),
                },
              });
              const lookedUp = Array.isArray(lookupPayload?.items) ? lookupPayload.items[0] : null;
              ingestionInfo = parseYouTubeIngestionInfo(lookedUp || selectedStream);
            }

            if (!ingestionInfo.streamKey || !ingestionInfo.ingestUrl) {
              throw createHttpError(
                400,
                'No reusable YouTube stream key was found. Create one in YouTube Studio and try again.',
              );
            }

            return {
              streamKey: ingestionInfo.streamKey,
              ingestUrl: ingestionInfo.ingestUrl,
              channelId: selectedChannel.id,
              channelName: selectedChannel.name,
            };
          },
        );

        const record = await getUserByUid(req.auth.profile.uid);
        const existingYouTube = record?.profile?.connectedPlatforms?.youtube || {};
        await setConnectedPlatform(req.auth.profile.uid, 'youtube', {
          ...existingYouTube,
          channelId: streamInfo.channelId,
          channelName: streamInfo.channelName,
        });

        res.json(streamInfo);
      } catch (error) {
        console.error('YouTube stream key retrieval failed:', error);
        const status = getHttpErrorStatus(error, 502);
        res.status(status).json({
          message: error instanceof Error ? error.message : 'Failed to get YouTube stream info.',
        });
      }
      return;
    }

    res.status(501).json({
      message: `${platform} stream key retrieval is not live yet. Only YouTube is fully implemented right now.`,
    });
  }),
);

app.post(
  '/api/oauth/channels',
  requireAuth,
  asyncHandler(async (req, res) => {
    const platform = String(req.body?.platform || '')
      .trim()
      .toLowerCase();
    if (!platform) {
      res.status(400).json({ message: 'platform is required.' });
      return;
    }

    if (platform === 'youtube') {
      try {
        const channels = await executeWithYouTubeAccessToken(
          req.auth.profile.uid,
          async (accessToken) => {
            const payload = await youtubeApiRequest({
              accessToken,
              pathName: 'channels',
              query: {
                part: 'id,snippet',
                mine: 'true',
                maxResults: '50',
              },
            });
            return parseYouTubeChannels(payload);
          },
        );
        res.json({ channels });
      } catch (error) {
        console.error('YouTube channel lookup failed:', error);
        const status = getHttpErrorStatus(error, 502);
        res.status(status).json({
          message: error instanceof Error ? error.message : 'Failed to fetch YouTube channels.',
        });
      }
      return;
    }

    res.status(501).json({
      message: `${platform} channel lookup is not live yet. Only YouTube is fully implemented right now.`,
    });
  }),
);

app.get('/api/leaderboard', (_req, res) => {
  seedLeaderboard();
  const state = loadState();
  res.json({ entries: state.leaderboard || [] });
});

app.get(
  '/api/analytics/user',
  requireAuth,
  asyncHandler(async (req, res) => {
    const requestedDays = Number(req.query.days || 30);
    const days = Number.isFinite(requestedDays) ? Math.max(1, Math.min(365, requestedDays)) : 30;
    const userId = String(req.query.userId || req.auth.profile.uid);
    const record = await getUserByUid(userId);

    if (!record) {
      res.status(404).json({ message: 'User not found.' });
      return;
    }

    const usage = getCloudUsage(userId);
    const totalDuration = Math.round(Number(usage.cloudHoursUsed || 0) * 3600);
    const hasRecentStream = Boolean(usage.lastStreamDate);
    const hasActiveSession = Boolean(usage.activeCloudSession);
    const totalStreams = Number(hasRecentStream) + Number(hasActiveSession);
    const avgDuration = totalStreams > 0 ? Math.round(totalDuration / totalStreams) : 0;

    const recentSessions = [];
    if (usage.activeCloudSession) {
      recentSessions.push({
        id: usage.activeCloudSession.sessionId,
        startedAt: usage.activeCloudSession.startTime || nowIso(),
        duration: Math.max(
          60,
          Math.round(
            (Date.now() - new Date(usage.activeCloudSession.startTime || nowIso()).getTime()) /
              1000,
          ),
        ),
        peakViewers: 0,
        platforms: [],
        layout: 'default',
        status: 'active',
      });
    } else if (usage.lastStreamDate) {
      recentSessions.push({
        id: `session_${userId}_${new Date(usage.lastStreamDate).getTime()}`,
        startedAt: usage.lastStreamDate,
        endedAt: usage.lastStreamDate,
        duration: totalDuration,
        peakViewers: 0,
        platforms: [],
        layout: 'default',
        status: 'ended',
      });
    }

    res.json({
      period: `${days}d`,
      stats: {
        totalStreams,
        totalDuration,
        avgDuration,
        peakViewers: 0,
        totalScreams: 0,
        totalRevenue: 0,
      },
      recentSessions,
    });
  }),
);

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

app.use((error, _req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  console.error('API error:', error);
  res.status(500).json({ message: 'Internal server error.' });
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
export default app;
