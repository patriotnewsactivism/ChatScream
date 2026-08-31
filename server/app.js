import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'node:path';
import fs from 'node:fs';
import multer from 'multer';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
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
  isManagedIdentityStorageRequired,
  getConnectedPlatformsSummary,
  getPublicProfile,
  getOwnProfile,
  getSession,
  getUserByEmail,
  getUserByUid,
  listChatMessages,
  listMediaAssets,
  listUsers,
  loadState,
  flushState,
  putUser,
  removeMediaAsset,
  removeSession,
  consumePasswordResetToken,
  savePasswordResetToken,
  saveSession,
  seedLeaderboard,
  updateLeaderboardEntry,
  resetWeeklyLeaderboard,
  getWeeklyWinners,
  setAffiliate,
  setCloudUsage,
  setConfig,
  setConnectedPlatform,
  addMediaAsset,
  listSchedules,
  getSchedule,
  putSchedule,
  deleteSchedule,
  listScenes,
  getScene,
  putScene,
  deleteScene,
} from './store.js';
import {
  confirmPasswordReset,
  dispatchPasswordResetEmail,
  getGenericResetResponse,
  issuePasswordResetToken,
} from './auth/passwordReset.js';
import {
  analyzeStreamContentWithAi,
  generateChatResponseWithAi,
  generateFreeformContent,
  generateStreamMetadataWithAi,
  generateViralPackageWithAi,
  moderateMessageWithAi,
} from './ai.js';
import commercialRouter from './commercial/router.js';
import publicCommercialRouter from './commercial/publicRouter.js';
import aiModeratorRouter from './aiModerator/router.js';
import {
  ingressRouter as internalStudioIngressRouter,
  adminRouter as internalStudioAdminRouter,
} from './internalBridge/router.js';
import {
  DEFAULT_AFFILIATE_COMMISSION_RATE,
  findAffiliateByCode,
  recordDurableReferral,
} from './commercial/affiliate.js';
import { buildYouTubeDestinationRedirectTarget } from './youtubeDestinationOAuthCallback.js';
import { resolveFrontendOAuthCallbackUrl } from './frontendOAuthRedirect.js';
import {
  FACEBOOK_ACCOUNT_OAUTH_SCOPES,
  getFacebookAuthorizationEndpoint,
  getFacebookGraphBaseUrl,
  normalizeFacebookGraphApiVersion,
} from '../shared/facebookOAuth.js';

const FACEBOOK_GRAPH_API_VERSION = normalizeFacebookGraphApiVersion(
  process.env.FACEBOOK_GRAPH_API_VERSION,
);
const FACEBOOK_AUTHORIZATION_ENDPOINT = getFacebookAuthorizationEndpoint(
  FACEBOOK_GRAPH_API_VERSION,
);
const FACEBOOK_BASE_URL = getFacebookGraphBaseUrl(FACEBOOK_GRAPH_API_VERSION);
const FACEBOOK_TOKEN_ENDPOINT = `${FACEBOOK_BASE_URL}/oauth/access_token`;

const app = express();
app.set('trust proxy', true);

const parseAllowedOrigins = () => {
  const addOriginWithWwwVariants = (accumulator, rawOrigin) => {
    const origin = String(rawOrigin || '').trim();
    if (!origin) return;

    accumulator.add(origin);

    try {
      const parsed = new URL(origin);
      const hostname = parsed.hostname;

      if (hostname.startsWith('www.')) {
        const withoutWww = hostname.replace(/^www\./, '');
        accumulator.add(`${parsed.protocol}//${withoutWww}${parsed.port ? `:${parsed.port}` : ''}`);
      } else if (!hostname.includes('localhost') && !hostname.includes('127.0.0.1')) {
        accumulator.add(
          `${parsed.protocol}//www.${hostname}${parsed.port ? `:${parsed.port}` : ''}`,
        );
      }
    } catch {
      // Ignore malformed origins; they are not valid allowlist entries.
    }
  };

  const configuredOrigins = String(process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const appBaseUrl = String(process.env.APP_BASE_URL || '').trim();
  // Hard-coded fallback origins (dev + production domain).
  // For any Vercel preview or custom domain, set CORS_ORIGINS in the Cloud Run service environment.
  const defaults = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:8787',
    'http://127.0.0.1:8787',
    'https://chatscream.live',
    'https://www.chatscream.live',
  ];
  const allOrigins = new Set();
  [...defaults, ...configuredOrigins, appBaseUrl].forEach((origin) =>
    addOriginWithWwwVariants(allOrigins, origin),
  );
  return allOrigins;
};

const allowedOrigins = parseAllowedOrigins();

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Origin not allowed by CORS'));
    },
    credentials: true,
  }),
);
// ── Security headers ──────────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: false, // CSP handled by Vite in production
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);

// ── Simple in-memory rate limiter (protects against brute-force) ──────────
const rateLimitStore = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_DEFAULT_MAX = 100;
const RATE_LIMIT_AUTH_MAX = 10;

const rateLimiter =
  (maxRequests = RATE_LIMIT_DEFAULT_MAX) =>
  (req, res, next) => {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const key = `${ip}:${req.path}`;
    const now = Date.now();
    const entry = rateLimitStore.get(key);

    if (entry && now - entry.start < RATE_LIMIT_WINDOW_MS) {
      entry.count++;
      if (entry.count > maxRequests) {
        res.status(429).json({ message: 'Too many requests. Please try again later.' });
        return;
      }
    } else {
      rateLimitStore.set(key, { start: now, count: 1 });
    }

    // Cleanup old entries periodically
    if (Math.random() < 0.01) {
      const cutoff = now - RATE_LIMIT_WINDOW_MS;
      rateLimitStore.forEach((v, k) => {
        if (v.start < cutoff) rateLimitStore.delete(k);
      });
    }

    next();
  };

// Apply rate limiting to auth and payment routes
app.use('/api/auth', rateLimiter(RATE_LIMIT_AUTH_MAX));
app.use('/api/scream', rateLimiter(RATE_LIMIT_AUTH_MAX));
app.use('/api/billing', rateLimiter(RATE_LIMIT_AUTH_MAX));
app.use('/api/media/upload', rateLimiter(20));
// ── Stripe Webhook (must be BEFORE express.json to get raw body) ──────────
app.post(
  '/api/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  (() => {
    let handler = null;
    return async (req, res) => {
      if (!handler) {
        try {
          const { createStripeWebhookHandler } = await import('./webhooks/stripe.js');
          handler = createStripeWebhookHandler({ getUserByUid, putUser });
        } catch (err) {
          console.error('Failed to load Stripe webhook handler:', err);
          return res.status(500).json({ error: 'Webhook handler not available' });
        }
      }
      return handler(req, res);
    };
  })(),
);

app.use(express.json({ limit: '2mb' }));

const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

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
    res.status(401).json({ message: 'User not found.' });
    return;
  }

  // Enforce root-admin access on every authenticated request. This closes the
  // gap before the client's background /api/access/sync call completes.
  const enforcedProfile = applyAccessOverrides({
    ...userRecord.profile,
    uid: userRecord.uid,
    email: userRecord.email,
  });
  const accessChanged =
    userRecord.profile?.role !== enforcedProfile.role ||
    Boolean(userRecord.profile?.betaTester) !== Boolean(enforcedProfile.betaTester) ||
    userRecord.profile?.subscription?.plan !== enforcedProfile.subscription?.plan ||
    userRecord.profile?.subscription?.status !== enforcedProfile.subscription?.status ||
    Boolean(userRecord.profile?.subscription?.betaOverride) !==
      Boolean(enforcedProfile.subscription?.betaOverride);

  const enforcedRecord = accessChanged ? { ...userRecord, profile: enforcedProfile } : userRecord;
  if (accessChanged) {
    await putUser(enforcedRecord);
  }

  req.auth = { session, record: enforcedRecord, profile: enforcedProfile, token };
  next();
});

app.use('/api/public/commercial', publicCommercialRouter);
app.use('/api/cloud-v2', requireAuth, commercialRouter);
app.use('/api/ai-moderator', rateLimiter(60), requireAuth, aiModeratorRouter);
app.use('/api/internal-studio/ingress', rateLimiter(60), internalStudioIngressRouter);
app.use('/api/internal-studio/admin', rateLimiter(60), requireAuth, internalStudioAdminRouter);

// Multer Setup
const uploadDir = process.env.VERCEL
  ? path.join('/tmp', 'uploads')
  : path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  },
});

const upload = multer({ storage });
app.use('/uploads', express.static(uploadDir));

app.get(
  '/api/media/list',
  asyncHandler(async (req, res) => {
    const assets = listMediaAssets();
    res.json({ assets });
  }),
);

app.post(
  '/api/media/upload',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      res.status(400).json({ message: 'No file uploaded' });
      return;
    }

    const { originalname, mimetype } = req.file;
    const baseUrl = getServerBaseUrl(req);

    // Use S3-compatible storage if configured, otherwise local fallback
    let url;
    let storageKey;
    try {
      const { uploadFile } = await import('./storage.js');
      const result = await uploadFile(req.file, baseUrl);
      url = result.url;
      storageKey = result.key;
    } catch {
      // Fallback to legacy local path
      url = `${baseUrl}/uploads/${req.file.filename}`;
      storageKey = req.file.filename;
    }

    let type = 'image';
    if (mimetype.startsWith('video/')) type = 'video';
    else if (mimetype.startsWith('audio/')) type = 'audio';

    const asset = {
      id: randomUUID(),
      type,
      url,
      name: originalname,
      filename: req.file.filename || storageKey,
      storageKey,
    };

    addMediaAsset(asset);
    res.status(201).json({ asset });
  }),
);

// Storage info endpoint (for admin/debugging)
app.get(
  '/api/storage/info',
  asyncHandler(async (_req, res) => {
    try {
      const { getStorageInfo } = await import('./storage.js');
      res.json(getStorageInfo());
    } catch {
      res.json({ backend: 'local', warning: 'Storage module not loaded' });
    }
  }),
);

app.post(
  '/api/ai/stream-metadata',
  requireAuth,
  asyncHandler(async (req, res) => {
    const topic = String(req.body?.topic || '').trim();
    if (!topic) {
      res.status(400).json({ message: 'Topic is required.' });
      return;
    }

    const result = await generateStreamMetadataWithAi(topic);
    res.json(result);
  }),
);

app.post(
  '/api/ai/viral-package',
  requireAuth,
  asyncHandler(async (req, res) => {
    const topic = String(req.body?.topic || '').trim();
    const platforms = Array.isArray(req.body?.platforms)
      ? req.body.platforms.map((value) => String(value || '').trim()).filter(Boolean)
      : [];

    if (!topic) {
      res.status(400).json({ message: 'Topic is required.' });
      return;
    }

    const result = await generateViralPackageWithAi(topic, platforms);
    res.json(result);
  }),
);

app.post(
  '/api/ai/moderation',
  requireAuth,
  asyncHandler(async (req, res) => {
    const message = String(req.body?.message || '').trim();
    if (!message) {
      res.status(400).json({ message: 'Message is required.' });
      return;
    }

    const result = await moderateMessageWithAi(message);
    res.json(result);
  }),
);

app.post(
  '/api/ai/chat-response',
  requireAuth,
  asyncHandler(async (req, res) => {
    const viewerMessage = String(req.body?.viewerMessage || '').trim();
    const streamContext = String(req.body?.streamContext || '').trim();
    const previousMessages = Array.isArray(req.body?.previousMessages)
      ? req.body.previousMessages.map((value) => String(value || '').trim()).filter(Boolean)
      : [];

    if (!viewerMessage || !streamContext) {
      res.status(400).json({ message: 'viewerMessage and streamContext are required.' });
      return;
    }

    const result = await generateChatResponseWithAi(viewerMessage, streamContext, previousMessages);
    res.json(result);
  }),
);

app.post(
  '/api/ai/analyze-content',
  requireAuth,
  asyncHandler(async (req, res) => {
    const recentChat = Array.isArray(req.body?.recentChat)
      ? req.body.recentChat.map((value) => String(value || '').trim()).filter(Boolean)
      : [];
    const streamTitle = String(req.body?.streamTitle || '').trim();
    const streamTopic = String(req.body?.streamTopic || '').trim();

    if (!streamTitle) {
      res.status(400).json({ message: 'streamTitle is required.' });
      return;
    }

    const result = await analyzeStreamContentWithAi(recentChat, streamTitle, streamTopic);
    res.json(result);
  }),
);

app.delete(
  '/api/media/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const assets = listMediaAssets();
    const asset = assets.find((a) => a.id === id);
    if (asset && asset.filename) {
      const filePath = path.join(uploadDir, asset.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    removeMediaAsset(id);
    res.json({ success: true });
  }),
);

const PLAN_HOURS = {
  free: 0,
  pro: 2,
  expert: 8,
  enterprise: 20,
  business: 40,
};

const AWS_COST_MODEL = Object.freeze({
  region: 'us-east-1',
  minDestinations: 1,
  maxDestinations: 10,
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

// The API's canonical public origin. OAuth redirect URIs have to match what is
// registered with the provider byte for byte, so they must never be derived
// from the request's Host header: reaching the same service through its
// *.run.app URL (or any other alias) would otherwise build a redirect_uri that
// Google has never seen and fail the whole sign-in with redirect_uri_mismatch.
const CANONICAL_API_BASE_URL = 'https://api.chatscream.live';

const isLocalHostBaseUrl = (value) => {
  try {
    const { hostname } = new URL(value);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  } catch {
    return false;
  }
};

const getOAuthRedirectBaseUrl = (req) => {
  const configured = String(process.env.SERVER_BASE_URL || process.env.API_BASE_URL || '').trim();
  if (configured) return configured.replace(/\/+$/, '');

  // Local development still needs the real origin so the loopback callback works.
  const derived = getServerBaseUrl(req);
  if (isLocalHostBaseUrl(derived)) return derived;

  return CANONICAL_API_BASE_URL;
};

const getFrontendOAuthCallbackUrl = (req) =>
  resolveFrontendOAuthCallbackUrl({
    explicitRedirectUrl: process.env.AUTH_REDIRECT_URL || process.env.VITE_OAUTH_REDIRECT_URI || '',
    appBaseUrl: process.env.APP_BASE_URL || '',
    serverBaseUrl: getServerBaseUrl(req),
  });

const redirectToFrontendOAuth = (req, res, params = {}) => {
  const target = new URL(getFrontendOAuthCallbackUrl(req));
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    target.searchParams.set(key, String(value));
  });
  res.redirect(302, target.toString());
};

// A client ID and its secret are a matched pair belonging to one OAuth client.
// ChatScream runs two Google clients — one for account sign-in, one for the
// YouTube streaming destination — so these must be resolved together. Letting
// the ID and the secret fall back independently can pair an ID from one client
// with a secret from the other, which Google rejects as invalid_client at token
// exchange, after the user has already approved consent.
const getGoogleAuthCredentials = () => {
  const oauth = getConfig('oauth') || {};
  const googleClientId = String(process.env.GOOGLE_CLIENT_ID || oauth.googleClientId || '').trim();
  const googleClientSecret = String(process.env.GOOGLE_CLIENT_SECRET || '').trim();
  if (googleClientId && googleClientSecret) {
    return { clientId: googleClientId, clientSecret: googleClientSecret };
  }

  // Single-client deployments configure only YOUTUBE_*. Adopt that pair whole
  // rather than borrowing half of it.
  const youtube = getYouTubeOAuthCredentials();
  if (youtube.clientId && youtube.clientSecret) {
    return youtube;
  }

  // Nothing complete: report whatever is present so callers surface a precise
  // "not configured" error instead of a confusing rejection from Google.
  return {
    clientId: googleClientId || youtube.clientId,
    clientSecret: googleClientSecret || youtube.clientSecret,
  };
};

const getBackendCapabilities = () => {
  const oauth = getConfig('oauth') || {};
  const { clientId: googleClientId, clientSecret: googleClientSecret } = getGoogleAuthCredentials();
  const authStateSecret = getAuthStateSecret();

  const youtubeClientId = String(
    process.env.YOUTUBE_CLIENT_ID || oauth.youtubeClientId || '',
  ).trim();
  const youtubeClientSecret = String(process.env.YOUTUBE_CLIENT_SECRET || '').trim();
  const facebookAppId = String(process.env.FACEBOOK_APP_ID || oauth.facebookAppId || '').trim();
  const facebookAppSecret = String(process.env.FACEBOOK_APP_SECRET || '').trim();
  const twitchClientId = String(process.env.TWITCH_CLIENT_ID || oauth.twitchClientId || '').trim();
  const twitchClientSecret = String(process.env.TWITCH_CLIENT_SECRET || '').trim();
  const tiktokClientKey = String(
    process.env.TIKTOK_CLIENT_KEY || oauth.tiktokClientKey || '',
  ).trim();
  const tiktokClientSecret = String(process.env.TIKTOK_CLIENT_SECRET || '').trim();

  // NOTE: We check ALL credentials to determine capability. This helps the UI show
  // the correct state. When credentials are missing, OAuth will still appear but
  // will fail with clear error messages when actually attempting to connect.
  const hasFullYouTube = Boolean(youtubeClientId && youtubeClientSecret);
  const hasFullFacebook = Boolean(facebookAppId && facebookAppSecret);
  const hasFullTwitch = Boolean(twitchClientId && twitchClientSecret);
  const hasFullTikTok = Boolean(tiktokClientKey && tiktokClientSecret);

  return {
    authProviders: {
      google: Boolean(googleClientId && googleClientSecret && authStateSecret),
    },
    streamKeyPlatforms: {
      youtube: hasFullYouTube,
      facebook: hasFullFacebook,
      twitch: hasFullTwitch,
      tiktok: hasFullTikTok,
    },
    // Diagnostic info for admin UI - shows what's configured vs what's missing
    oauthDiagnostics:
      {
        youtube: {
          configured: hasFullYouTube,
          missingSecret: !!youtubeClientId && !youtubeClientSecret,
        },
        facebook: {
          configured: hasFullFacebook,
          missingSecret: !!facebookAppId && !facebookAppSecret,
        },
        twitch: { configured: hasFullTwitch, missingSecret: !!twitchClientId && !twitchClientSecret },
        tiktok: {
          configured: hasFullTikTok,
          missingSecret: !!tiktokClientKey && !tiktokClientSecret,
        },
      },
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
    console.error('YouTube token exchange failed:', JSON.stringify(payload));
    const googleError = payload?.error || '';
    const googleDesc = payload?.error_description || '';
    const message = googleDesc || googleError || 'Failed to exchange YouTube OAuth code.';
    const status = String(googleError).toLowerCase() === 'invalid_grant' ? 400 : 502;
    throw createHttpError(status, `${message} (${googleError})`, payload);
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

// YouTube's Live Streaming API (liveStreams/liveBroadcasts) is documented by Google as
// occasionally returning transient 5xx errors (commonly surfaced as a generic
// "Internal error encountered." / status INTERNAL) that succeed on a plain retry.
// Google's own API guidance recommends exponential backoff for these. Only retry
// on 5xx (server-side/transient) -- never on 4xx (auth/permission/bad-request), which
// won't be fixed by retrying and should fail fast.
const YOUTUBE_RETRYABLE_STATUS = new Set([500, 502, 503, 504]);
const YOUTUBE_MAX_ATTEMPTS = 3;
const YOUTUBE_RETRY_BASE_DELAY_MS = 400;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const youtubeApiRequest = async ({ accessToken, pathName, method = 'GET', query, body }) => {
  if (!accessToken) {
    throw createHttpError(401, 'Missing YouTube access token. Reconnect your account.');
  }

  let lastError;
  for (let attempt = 1; attempt <= YOUTUBE_MAX_ATTEMPTS; attempt += 1) {
    const response = await fetch(buildYouTubeApiUrl(pathName, query), {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await parseJsonResponse(response);

    if (response.ok) {
      return payload;
    }

    const message =
      payload?.error?.message ||
      payload?.error_description ||
      `YouTube API request failed (${response.status}).`;
    lastError = createHttpError(response.status, message, payload);

    const isRetryable = YOUTUBE_RETRYABLE_STATUS.has(response.status);
    const hasAttemptsLeft = attempt < YOUTUBE_MAX_ATTEMPTS;
    if (!isRetryable || !hasAttemptsLeft) {
      throw lastError;
    }

    const delayMs = YOUTUBE_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
    console.warn(
      `YouTube API transient ${response.status} on ${pathName} (attempt ${attempt}/${YOUTUBE_MAX_ATTEMPTS}): ${message} -- retrying in ${delayMs}ms`,
    );
    await sleep(delayMs);
  }

  throw lastError;
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

const LEGACY_HASH_ALGORITHM = 'sha256';
const PASSWORD_HASH_ALGORITHM = 'bcrypt';
const BCRYPT_ROUNDS = Math.max(12, Number.parseInt(process.env.BCRYPT_COST || '12', 10) || 12);

const hashLegacyPassword = (value = '') => createHash('sha256').update(value).digest('hex');
const isLegacySha256Hash = (value = '') => /^[a-f0-9]{64}$/i.test(String(value || '').trim());
const isBcryptHash = (value = '') => /^\$2[aby]\$/i.test(String(value || '').trim());
const hashPassword = async (value = '') => bcrypt.hash(value, BCRYPT_ROUNDS);

const verifyPassword = async (value = '', record = null) => {
  const passwordHash = String(record?.passwordHash || '');
  const passwordAlgorithm = String(record?.passwordAlgorithm || '')
    .trim()
    .toLowerCase();

  if (!passwordHash || !value) {
    return { verified: false, needsUpgrade: false };
  }

  if (passwordAlgorithm === PASSWORD_HASH_ALGORITHM || isBcryptHash(passwordHash)) {
    const verified = await bcrypt.compare(value, passwordHash);
    return {
      verified,
      needsUpgrade: verified && passwordAlgorithm !== PASSWORD_HASH_ALGORITHM,
    };
  }

  const legacyMatch = hashLegacyPassword(value) === passwordHash;
  if (
    legacyMatch &&
    (passwordAlgorithm === LEGACY_HASH_ALGORITHM || isLegacySha256Hash(passwordHash))
  ) {
    return {
      verified: true,
      needsUpgrade: true,
      upgradedHash: await hashPassword(value),
    };
  }

  return { verified: false, needsUpgrade: false };
};

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

const isAdmin = (profile) => profile?.role === 'admin';

const requireAdmin = (req, res, next) => {
  if (!isAdmin(req.auth?.profile)) {
    res.status(403).json({ message: 'Admin access required.' });
    return;
  }
  next();
};

const OAUTH_PLATFORMS = new Set(['youtube', 'facebook', 'twitch', 'tiktok']);
const USER_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const parseValidatedUserId = (value) => {
  const userId = String(value || '').trim();
  if (!userId || !USER_ID_PATTERN.test(userId)) {
    return null;
  }
  return userId;
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

const NON_ADMIN_EDITABLE_PROFILE_FIELDS = new Set(['displayName', 'photoURL', 'settings']);
const NON_ADMIN_BLOCKED_PROFILE_FIELDS = new Set([
  'role',
  'subscription',
  'usage',
  'affiliate',
  'connectedPlatforms',
]);

const canEditUserProfile = (authProfile, authUid, targetUid) =>
  isAdmin(authProfile) || authUid === targetUid;

const validateUserProfileWrite = (isAdminCaller, payload = {}) => {
  if (isAdminCaller) {
    return { ok: true };
  }

  const keys = Object.keys(payload || {});
  const blockedKeys = keys.filter((key) => NON_ADMIN_BLOCKED_PROFILE_FIELDS.has(key));
  if (blockedKeys.length) {
    return {
      ok: false,
      status: 403,
      message: `You are not allowed to edit sensitive profile fields: ${blockedKeys.join(', ')}`,
    };
  }

  const disallowedKeys = keys.filter((key) => !NON_ADMIN_EDITABLE_PROFILE_FIELDS.has(key));
  if (disallowedKeys.length) {
    return {
      ok: false,
      status: 403,
      message: `You can only edit these fields: ${Array.from(NON_ADMIN_EDITABLE_PROFILE_FIELDS).join(', ')}`,
    };
  }

  return { ok: true };
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
      commissionRate: DEFAULT_AFFILIATE_COMMISSION_RATE,
      bonusTrialDays: 3,
      totalReferrals: 0,
      totalEarnings: 0,
      createdAt: nowIso(),
      isActive: true,
    });
  }
  return next;
};

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'chatscream-api',
    timestamp: nowIso(),
    identityStorage: getIdentityStorageMode(),
    managedIdentityRequired: isManagedIdentityStorageRequired(),
  });
});

app.get('/api/ready', (_req, res) => {
  const identityStorage = getIdentityStorageMode();
  const managedRequired = isManagedIdentityStorageRequired();
  const ready =
    !managedRequired || identityStorage === 'postgres+redis' || identityStorage === 'postgres';
  res.status(ready ? 200 : 503).json({
    ok: ready,
    service: 'chatscream-api',
    timestamp: nowIso(),
    identityStorage,
    managedIdentityRequired: managedRequired,
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

    const referredAffiliate = referralCode ? await findAffiliateByCode(referralCode) : null;
    const uid = randomUUID();
    const profile = applyAccessOverrides(
      ensureAffiliateForProfile(
        createUserProfile({
          uid,
          email,
          displayName: displayName || email.split('@')[0],
          referredByCode: referredAffiliate?.code || '',
          referredByUserId: referredAffiliate?.ownerId || '',
        }),
      ),
    );

    await putUser({
      uid,
      email,
      passwordHash: await hashPassword(password),
      passwordAlgorithm: PASSWORD_HASH_ALGORITHM,
      profile,
    });

    if (referredAffiliate?.isActive) {
      await recordDurableReferral({
        referredUserId: uid,
        referralCode: referredAffiliate.code,
        referrerId: referredAffiliate.ownerId,
      });
    }

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

    if (!record) {
      res.status(401).json({ message: 'Invalid email or password.' });
      return;
    }

    const verification = await verifyPassword(password, record);
    if (!verification.verified) {
      res.status(401).json({ message: 'Invalid email or password.' });
      return;
    }

    if (verification.needsUpgrade) {
      await putUser({
        ...record,
        email: normalizeEmail(record.email),
        passwordHash: verification.upgradedHash || (await hashPassword(password)),
        passwordAlgorithm: PASSWORD_HASH_ALGORITHM,
      });
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

app.post(
  '/api/auth/reset-password',
  asyncHandler(async (req, res) => {
    const email = normalizeEmail(req.body?.email || '');
    const result = await issuePasswordResetToken({
      email,
      ip: req.ip,
      getUserByEmail,
      savePasswordResetToken,
    });

    if (result.email && result.token) {
      try {
        await dispatchPasswordResetEmail({
          email: result.email,
          token: result.token,
        });
      } catch (error) {
        console.error('Failed to dispatch password reset email:', error);
      }
    }

    const payload = getGenericResetResponse();
    if (
      (process.env.NODE_ENV === 'test' ||
        String(process.env.AUTH_INCLUDE_RESET_TOKEN_IN_RESPONSE || '').toLowerCase() === 'true') &&
      result.token
    ) {
      payload.resetToken = result.token;
      payload.expiresAt = result.expiresAt;
    }
    res.json(payload);
  }),
);

app.post(
  '/api/auth/reset-password/confirm',
  asyncHandler(async (req, res) => {
    const outcome = await confirmPasswordReset({
      token: req.body?.token,
      nextPassword: req.body?.password,
      ip: req.ip,
      consumePasswordResetToken,
      getUserByUid,
      putUser,
    });
    if (!outcome.ok && outcome.status === 429 && outcome.retryAfterSeconds > 0) {
      res.setHeader('Retry-After', String(outcome.retryAfterSeconds));
    }
    res.status(outcome.status).json(outcome.body);
  }),
);

app.post(['/api/auth/oauth/start', '/api/auth/social/start'], (req, res) => {
  const provider = String(req.body?.provider || '')
    .trim()
    .toLowerCase();
  const referral = normalizeCode(req.body?.referralCode || '');
  if (!provider) {
    res.status(400).json({ message: 'Provider is required.' });
    return;
  }
  if (!['google', 'facebook'].includes(provider)) {
    res.status(400).json({ message: `${provider} sign-in is not available yet.` });
    return;
  }
  const redirectUrl = `/api/auth/oauth/${provider}${referral ? `?ref=${encodeURIComponent(referral)}` : ''}`;
  res.json({ redirectUrl });
});

app.get(
  '/api/auth/oauth/google/callback',
  asyncHandler(async (req, res) => {
    // YouTube streaming-destination connects reuse this already-authorized
    // Google callback. Their state is client-generated base64 JSON rather than
    // signed account-login state, so hand the code straight back to Studio
    // instead of failing account-state verification. Handled inside the route
    // so it works no matter which file boots the process.
    const destinationTarget = buildYouTubeDestinationRedirectTarget(req.query);
    if (destinationTarget) {
      res.set('Cache-Control', 'no-store');
      res.redirect(302, destinationTarget);
      return;
    }

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

    const redirectUri = `${getOAuthRedirectBaseUrl(req)}/api/auth/oauth/google/callback`;
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
  '/api/auth/oauth/facebook/callback',
  asyncHandler(async (req, res) => {
    const queryError = String(req.query.error || '').trim();
    if (queryError) {
      const message = queryError === 'access_denied' ? 'Authorization was denied.' : queryError;
      redirectToFrontendOAuth(req, res, { platform: 'facebook', error: message });
      return;
    }

    const code = String(req.query.code || '').trim();
    const state = String(req.query.state || '').trim();
    if (!code || !state) {
      redirectToFrontendOAuth(req, res, {
        platform: 'facebook',
        error: 'Missing authorization code or state.',
      });
      return;
    }

    const parsedState = parseAuthState(state);
    if (!parsedState) {
      redirectToFrontendOAuth(req, res, {
        platform: 'facebook',
        error: 'Invalid or expired sign-in state. Please try again.',
      });
      return;
    }

    const facebookAppId = String(process.env.FACEBOOK_APP_ID || '').trim();
    const facebookAppSecret = String(process.env.FACEBOOK_APP_SECRET || '').trim();
    if (!facebookAppId || !facebookAppSecret) {
      redirectToFrontendOAuth(req, res, {
        platform: 'facebook',
        error: 'Facebook sign-in is not configured.',
      });
      return;
    }

    const redirectUri = `${getOAuthRedirectBaseUrl(req)}/api/auth/oauth/facebook/callback`;
    const tokenRes = await fetch(
      `${FACEBOOK_TOKEN_ENDPOINT}?` +
        new URLSearchParams({
          client_id: facebookAppId,
          client_secret: facebookAppSecret,
          redirect_uri: redirectUri,
          code,
        }),
    );
    const tokenData = await parseJsonResponse(tokenRes);
    if (!tokenRes.ok || !tokenData.access_token) {
      redirectToFrontendOAuth(req, res, {
        platform: 'facebook',
        error: tokenData.error?.message || tokenData.error_description || 'Token exchange failed.',
      });
      return;
    }

    const meRes = await fetch(`${FACEBOOK_BASE_URL}/me?fields=id,name,email,picture.type(large)`, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const me = await parseJsonResponse(meRes);
    if (!meRes.ok) {
      redirectToFrontendOAuth(req, res, {
        platform: 'facebook',
        error: 'Failed to fetch Facebook profile.',
      });
      return;
    }

    const fbEmail = String(me.email || '').trim();
    const fbId = String(me.id || '').trim();
    const fbName = String(me.name || 'Facebook User').trim();
    const fbPhoto = String(me.picture?.data?.url || '').trim();
    // Use a placeholder email for accounts with no email
    const canonicalEmail = normalizeEmail(fbEmail || `fb_${fbId}@chatscream.facebook`);

    let record = fbEmail ? await getUserByEmail(normalizeEmail(fbEmail)) : null;
    if (!record) {
      // Check for existing FB user by canonical placeholder email
      record = await getUserByEmail(canonicalEmail);
    }

    if (!record) {
      const uid = randomUUID();
      const profile = applyAccessOverrides(
        ensureAffiliateForProfile(
          createUserProfile({
            uid,
            email: canonicalEmail,
            displayName: fbName,
            photoURL: fbPhoto,
            referredByCode: normalizeCode(parsedState.ref || ''),
          }),
        ),
      );
      await putUser({ uid, email: canonicalEmail, profile });
      record = await getUserByUid(uid);
    }

    if (!record) {
      redirectToFrontendOAuth(req, res, {
        platform: 'facebook',
        error: 'Failed to create or load user account.',
      });
      return;
    }

    const payload = await buildSessionPayload(record.uid);
    if (!payload) {
      redirectToFrontendOAuth(req, res, {
        platform: 'facebook',
        error: 'Failed to build session.',
      });
      return;
    }

    redirectToFrontendOAuth(req, res, {
      platform: 'facebook',
      token: payload.session?.token,
      expiresAt: payload.session?.expiresAt,
      uid: payload.session?.user?.uid,
      email: payload.session?.user?.email,
      displayName: payload.session?.user?.displayName,
      photoURL: payload.session?.user?.photoURL,
      referral: normalizeCode(parsedState.ref || '') || undefined,
    });
  }),
);

app.get(
  '/api/auth/oauth/:provider',
  asyncHandler(async (req, res) => {
    const provider = String(req.params.provider || '')
      .trim()
      .toLowerCase();
    if (!['google', 'facebook'].includes(provider)) {
      res.status(400).json({ message: `${provider} sign-in is not available yet.` });
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

    if (provider === 'facebook') {
      const facebookAppId = String(process.env.FACEBOOK_APP_ID || '').trim();
      if (!facebookAppId) {
        res
          .status(500)
          .json({ message: 'Facebook sign-in is not configured. Set FACEBOOK_APP_ID.' });
        return;
      }
      const redirectUri = `${getOAuthRedirectBaseUrl(req)}/api/auth/oauth/facebook/callback`;
      const authUrl = new URL(FACEBOOK_AUTHORIZATION_ENDPOINT);
      authUrl.searchParams.set('client_id', facebookAppId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', FACEBOOK_ACCOUNT_OAUTH_SCOPES.join(','));
      authUrl.searchParams.set('state', state);
      return res.redirect(302, authUrl.toString());
    }

    // Google
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

    const redirectUri = `${getOAuthRedirectBaseUrl(req)}/api/auth/oauth/google/callback`;
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
    const isSelfOrAdmin = req.params.uid === req.auth.record.uid || isAdmin(req.auth?.profile);
    res.json({ profile: isSelfOrAdmin ? getOwnProfile(record) : getPublicProfile(record) });
  }),
);

app.patch(
  '/api/users/:uid',
  requireAuth,
  asyncHandler(async (req, res) => {
    const isAdminCaller = isAdmin(req.auth?.profile);
    if (!canEditUserProfile(req.auth?.profile, req.auth?.record?.uid, req.params.uid)) {
      res.status(403).json({ message: 'You can only update your own profile.' });
      return;
    }

    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      res.status(400).json({ message: 'Request body must be a JSON object.' });
      return;
    }

    const validation = validateUserProfileWrite(isAdminCaller, req.body);
    if (!validation.ok) {
      res.status(validation.status).json({ message: validation.message });
      return;
    }

    const record = await getUserByUid(req.params.uid);
    if (!record) {
      res.status(404).json({ message: 'User not found.' });
      return;
    }
    const profile = deepMerge(record.profile, req.body || {});
    await putUser({ ...record, profile });
    res.json({ profile: getOwnProfile({ ...record, profile }) });
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
    const isSelfOrAdmin = req.params.uid === req.auth.record.uid || isAdmin(req.auth?.profile);
    res.json({ profile: isSelfOrAdmin ? getOwnProfile(record) : getPublicProfile(record) });
  }),
);

app.put(
  '/api/user/:uid',
  requireAuth,
  asyncHandler(async (req, res) => {
    const isAdminCaller = isAdmin(req.auth?.profile);
    if (!canEditUserProfile(req.auth?.profile, req.auth?.record?.uid, req.params.uid)) {
      res.status(403).json({ message: 'You can only update your own profile.' });
      return;
    }

    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      res.status(400).json({ message: 'Request body must be a JSON object.' });
      return;
    }

    const validation = validateUserProfileWrite(isAdminCaller, req.body);
    if (!validation.ok) {
      res.status(validation.status).json({ message: validation.message });
      return;
    }

    const record = await getUserByUid(req.params.uid);
    if (!record) {
      res.status(404).json({ message: 'User not found.' });
      return;
    }
    const profile = deepMerge(record.profile, req.body || {});
    await putUser({ ...record, profile });
    res.json({ profile: getOwnProfile({ ...record, profile }) });
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
  const oauth = getConfig('oauth') || {};
  res.json({
    ...oauth,
    youtubeClientId:
      oauth.youtubeClientId || String(process.env.YOUTUBE_CLIENT_ID || '').trim() || undefined,
    facebookAppId:
      oauth.facebookAppId || String(process.env.FACEBOOK_APP_ID || '').trim() || undefined,
    facebookGraphApiVersion: FACEBOOK_GRAPH_API_VERSION,
    twitchClientId:
      oauth.twitchClientId || String(process.env.TWITCH_CLIENT_ID || '').trim() || undefined,
    tiktokClientKey:
      oauth.tiktokClientKey || String(process.env.TIKTOK_CLIENT_KEY || '').trim() || undefined,
    redirectUriBase:
      oauth.redirectUriBase ||
      String(process.env.VITE_OAUTH_REDIRECT_URI || '').trim() ||
      undefined,
  });
});

app.get('/api/public/capabilities', (_req, res) => {
  res.json(getBackendCapabilities());
});

// Diagnostic: non-secret OAuth config for debugging redirect_uri_mismatch.
//
// OAuth client IDs are public by design — they are embedded in the frontend
// bundle and in every authorization URL — so reporting them in full is safe,
// and necessary: truncating to 12 characters showed only the shared project
// number, which made two *different* clients look identical here. Client
// secrets are never included; only whether one is configured.
app.get('/api/public/oauth-debug', (req, res) => {
  const oauth = getConfig('oauth') || {};
  const envRedirectUri = String(process.env.VITE_OAUTH_REDIRECT_URI || '').trim();
  const envYtClientId = String(process.env.YOUTUBE_CLIENT_ID || '').trim();
  const { clientId: googleClientId, clientSecret: googleClientSecret } = getGoogleAuthCredentials();
  const effectiveYoutubeClientId = envYtClientId || oauth.youtubeClientId || '';

  res.json({
    storedRedirectUriBase: oauth.redirectUriBase || null,
    envRedirectUri: envRedirectUri || null,
    effectiveRedirectUri: envRedirectUri || oauth.redirectUriBase || null,
    storedYoutubeClientId: oauth.youtubeClientId || null,
    envYoutubeClientId: envYtClientId || null,
    effectiveYoutubeClientId: effectiveYoutubeClientId || null,
    // The account sign-in flow and the YouTube destination flow can resolve to
    // different OAuth clients. When they do, a redirect URI registered on one
    // is not registered on the other, which surfaces as redirect_uri_mismatch.
    accountSignInClientId: googleClientId || null,
    clientIdsMatch: Boolean(
      googleClientId && effectiveYoutubeClientId && googleClientId === effectiveYoutubeClientId,
    ),
    hasGoogleClientSecret: Boolean(googleClientSecret),
    hasYoutubeClientSecret: Boolean(String(process.env.YOUTUBE_CLIENT_SECRET || '').trim()),
    // The exact redirect URI this deployment sends, to paste into the console.
    oauthRedirectUri: `${getOAuthRedirectBaseUrl(req)}/api/auth/oauth/google/callback`,
    facebookGraphApiVersion: FACEBOOK_GRAPH_API_VERSION,
    facebookDestinationRedirectUri: getFrontendOAuthCallbackUrl(req),
  });
});

app.get('/api/capabilities', requireAuth, (_req, res) => {
  res.json(getBackendCapabilities());
});

app.patch(
  '/api/config/oauth',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    await setConfig('oauth', req.body || {}, req.auth.profile.uid);
    res.json({ success: true, oauth: getConfig('oauth') });
  }),
);

app.get('/api/oauth/config/public', requireAuth, (req, res) => {
  const oauth = getConfig('oauth') || {};
  // Env vars take priority over stored admin config so Vercel env updates
  // are immediately effective without requiring an admin portal change.
  const envRedirectUri = String(
    process.env.VITE_OAUTH_REDIRECT_URI || process.env.AUTH_REDIRECT_URL || '',
  ).trim();
  res.json({
    ...oauth,
    youtubeClientId:
      String(process.env.YOUTUBE_CLIENT_ID || '').trim() || oauth.youtubeClientId || undefined,
    facebookAppId:
      String(process.env.FACEBOOK_APP_ID || '').trim() || oauth.facebookAppId || undefined,
    facebookGraphApiVersion: FACEBOOK_GRAPH_API_VERSION,
    twitchClientId:
      String(process.env.TWITCH_CLIENT_ID || '').trim() || oauth.twitchClientId || undefined,
    tiktokClientKey:
      String(process.env.TIKTOK_CLIENT_KEY || '').trim() || oauth.tiktokClientKey || undefined,
    redirectUriBase: envRedirectUri || oauth.redirectUriBase || undefined,
  });
});

app.put(
  '/api/oauth/config/public',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    await setConfig('oauth', req.body || {}, req.auth.profile.uid);
    res.json({ success: true, oauth: getConfig('oauth') });
  }),
);

app.get('/api/config/access', requireAuth, requireAdmin, (_req, res) => {
  res.json(getConfig('access'));
});

app.put(
  '/api/config/access',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const admins = Array.isArray(req.body?.admins)
      ? req.body.admins.map(normalizeEmail).filter(Boolean)
      : [];
    const betaTesters = Array.isArray(req.body?.betaTesters)
      ? req.body.betaTesters.map(normalizeEmail).filter(Boolean)
      : [];
    const adminUids = Array.isArray(req.body?.adminUids)
      ? req.body.adminUids.map((value) => String(value || '').trim()).filter(Boolean)
      : [];
    const betaTesterUids = Array.isArray(req.body?.betaTesterUids)
      ? req.body.betaTesterUids.map((value) => String(value || '').trim()).filter(Boolean)
      : [];
    await setConfig(
      'access',
      {
        admins: [...new Set(admins)],
        betaTesters: [...new Set(betaTesters)],
        adminUids: [...new Set(adminUids)],
        betaTesterUids: [...new Set(betaTesterUids)],
      },
      req.auth.profile.uid,
    );
    res.json({ success: true, access: getConfig('access') });
  }),
);

app.get('/api/access/list', requireAuth, requireAdmin, (_req, res) => {
  res.json(getConfig('access'));
});

app.post(
  '/api/access/list',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const admins = Array.isArray(req.body?.admins)
      ? req.body.admins.map(normalizeEmail).filter(Boolean)
      : [];
    const betaTesters = Array.isArray(req.body?.betaTesters)
      ? req.body.betaTesters.map(normalizeEmail).filter(Boolean)
      : [];
    const adminUids = Array.isArray(req.body?.adminUids)
      ? req.body.adminUids.map((value) => String(value || '').trim()).filter(Boolean)
      : [];
    const betaTesterUids = Array.isArray(req.body?.betaTesterUids)
      ? req.body.betaTesterUids.map((value) => String(value || '').trim()).filter(Boolean)
      : [];
    await setConfig(
      'access',
      {
        admins: [...new Set(admins)],
        betaTesters: [...new Set(betaTesters)],
        adminUids: [...new Set(adminUids)],
        betaTesterUids: [...new Set(betaTesterUids)],
      },
      req.auth.profile.uid,
    );
    res.json({ success: true, access: getConfig('access') });
  }),
);

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
  '/api/admin/users/:uid/admin',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const targetUid = String(req.params.uid || '').trim();
    if (!targetUid) {
      res.status(400).json({ message: 'User id is required.' });
      return;
    }

    const record = await getUserByUid(targetUid);
    if (!record) {
      res.status(404).json({ message: 'User not found.' });
      return;
    }

    const makeAdmin = req.body?.isAdmin === true;
    const profile = {
      ...record.profile,
      role: makeAdmin ? 'admin' : 'user',
      betaTester: makeAdmin ? true : Boolean(record.profile?.betaTester),
      subscription: {
        ...record.profile.subscription,
        plan: makeAdmin ? 'business' : record.profile.subscription?.plan || 'free',
        status: makeAdmin ? 'active' : record.profile.subscription?.status || 'active',
        betaOverride: makeAdmin ? true : record.profile.subscription?.betaOverride,
      },
    };

    await putUser({ ...record, profile });

    const currentAccessConfig = getConfig('access') || {};
    const nextAdminUids = new Set(
      Array.isArray(currentAccessConfig.adminUids) ? currentAccessConfig.adminUids : [],
    );
    if (makeAdmin) {
      nextAdminUids.add(targetUid);
    } else {
      nextAdminUids.delete(targetUid);
    }

    await setConfig(
      'access',
      {
        ...(currentAccessConfig || {}),
        adminUids: Array.from(nextAdminUids),
      },
      req.auth.profile.uid,
    );

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
  });
});

export default app;
