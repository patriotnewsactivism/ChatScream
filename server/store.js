import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import * as schema from './db/schema.js';

const envDataDir = String(process.env.CHATSCREAM_DATA_DIR || '').trim();
const defaultDataDir = process.env.VERCEL
  ? path.join('/tmp', 'chatscream')
  : path.join(process.cwd(), 'server', 'data');

const DATA_DIR = envDataDir || defaultDataDir;
const DATA_FILE = path.join(DATA_DIR, 'runtime.json');

const nowIso = () => new Date().toISOString();
const normalizeEmail = (value = '') => value.trim().toLowerCase();
const normalizeCode = (value = '') => value.trim().toUpperCase();

// Root admins — always treated as admin regardless of what's persisted in
// the `access` config (which lives in a local file/tmp dir, not the durable
// Postgres store, and can be wiped or start fresh on a new deployment).
const ROOT_ADMIN_EMAILS = [
  'mreardon@wtpnews.org',
  'don@donmatthews.live',
  'patriotnewsactivism@gmail.com',
];
const parseBoolean = (value) =>
  ['1', 'true', 'yes', 'on'].includes(
    String(value || '')
      .trim()
      .toLowerCase(),
  );

const postgresUrl = String(process.env.POSTGRES_URL || process.env.DATABASE_URL || '').trim();
const redisUrl = String(process.env.REDIS_URL || '').trim();
const identityStorageMode = String(process.env.IDENTITY_STORAGE_MODE || 'managed')
  .trim()
  .toLowerCase();
const managedIdentityRequired = identityStorageMode !== 'local';
const managedIdentityConfigured = Boolean(postgresUrl);
const redisConfigured = Boolean(redisUrl);
let managedIdentityEnabled = managedIdentityConfigured && managedIdentityRequired;

let identityClients = null;
let identityInitPromise = null;

const sessionKey = (token) => `chatscream:session:${token}`;
const passwordResetTokenKey = (tokenHash) => `chatscream:password_reset:${tokenHash}`;
const ensureManagedIdentityAvailable = () => {
  if (managedIdentityRequired && !managedIdentityEnabled) {
    throw new Error(
      'Managed identity storage is required but unavailable. Configure POSTGRES_URL (and optionally REDIS_URL) or set IDENTITY_STORAGE_MODE=local for local development.',
    );
  }
};

const getIdentityClients = async () => {
  ensureManagedIdentityAvailable();
  if (!managedIdentityEnabled) return null;
  if (identityClients) return identityClients;
  if (identityInitPromise) return identityInitPromise;

  identityInitPromise = (async () => {
    const usePostgresTls = parseBoolean(process.env.POSTGRES_SSL);
    const pool = new Pool({
      connectionString: postgresUrl,
      ...(usePostgresTls ? { ssl: { rejectUnauthorized: false } } : {}),
    });

    const db = drizzle(pool, { schema });

    let redis = null;
    if (redisConfigured) {
      try {
        const useRedisTls = parseBoolean(process.env.REDIS_TLS);
        redis = new Redis(redisUrl, {
          maxRetriesPerRequest: 2,
          ...(useRedisTls ? { tls: { rejectUnauthorized: false } } : {}),
        });
        await redis.ping();
      } catch (err) {
        console.warn('Redis connection failed, using Postgres for sessions:', err.message);
        redis = null;
      }
    }

    // Ensure Postgres session tables exist when Redis is unavailable
    if (!redis) {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS chatscream_sessions (
          token TEXT PRIMARY KEY,
          data JSONB NOT NULL,
          expires_at TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS chatscream_reset_tokens (
          token_hash TEXT PRIMARY KEY,
          data JSONB NOT NULL,
          expires_at TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
    }

    identityClients = { pool, db, redis };
    return identityClients;
  })().catch((error) => {
    console.error('Managed identity storage unavailable.', error);
    managedIdentityEnabled = false;
    identityClients = null;
    identityInitPromise = null;
    if (managedIdentityRequired) {
      throw error;
    }
    return null;
  });

  return identityInitPromise;
};

export const isManagedIdentityStorageEnabled = () => managedIdentityEnabled;
export const isManagedIdentityStorageRequired = () => managedIdentityRequired;
export const getIdentityStorageMode = () => {
  if (!managedIdentityEnabled) return 'local';
  if (identityClients?.redis) return 'postgres+redis';
  return 'postgres';
};

export const initIdentityStorage = async () => {
  if (managedIdentityRequired && !managedIdentityConfigured) {
    throw new Error(
      'Missing managed identity storage configuration. Set POSTGRES_URL and REDIS_URL (and optional TLS flags).',
    );
  }
  if (!managedIdentityEnabled) return 'local';
  const clients = await getIdentityClients();
  if (managedIdentityRequired && !clients) {
    throw new Error('Managed identity storage failed to initialize.');
  }
  if (!clients) return 'local';
  return clients.redis ? 'postgres+redis' : 'postgres';
};

export const closeIdentityStorage = async () => {
  if (!identityClients) return;
  const { pool, redis } = identityClients;
  identityClients = null;
  identityInitPromise = null;
  try {
    await pool.end();
  } finally {
    if (redis) redis.disconnect();
  }
};

// --- Local File Storage Fallback ---
const baseState = () => ({
  users: {},
  usersByEmail: {},
  sessions: {},
  affiliates: {},
  referrals: [],
  config: {
    access: {
      admins: [...ROOT_ADMIN_EMAILS],
      betaTesters: [],
      adminUids: [],
      betaTesterUids: [],
      updatedAt: nowIso(),
      updatedBy: 'system',
    },
    oauth: {
      youtubeClientId: '',
      facebookAppId: '',
      twitchClientId: '',
      redirectUriBase: '',
      updatedAt: nowIso(),
      updatedBy: 'system',
    },
  },
  chatMessages: [],
  cloud: { sessions: {}, usage: {} },
  media: {},
  leaderboard: [],
  schedules: {},
  scenes: {},
  passwordResetTokens: {},
});

let stateCache = null;
let saveTimer = null;
let persistenceEnabled = true;

export const loadState = () => {
  if (!stateCache) {
    if (fs.existsSync(DATA_FILE)) {
      try {
        stateCache = { ...baseState(), ...JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) };
      } catch (e) {
        stateCache = baseState();
      }
    } else {
      stateCache = baseState();
    }
  }
  return stateCache;
};

const writeState = (updater) => {
  const current = loadState();
  updater(current);
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(current, null, 2));
};

export const flushState = () => {
  if (stateCache) fs.writeFileSync(DATA_FILE, JSON.stringify(stateCache, null, 2));
};

// --- USER OPERATIONS ---

export const putUser = async (record) => {
  if (managedIdentityEnabled) {
    const { db } = await getIdentityClients();
    await db
      .insert(schema.users)
      .values({
        uid: record.uid,
        email: normalizeEmail(record.email),
        passwordHash: record.passwordHash,
        profile: record.profile || {},
      })
      .onConflictDoUpdate({
        target: schema.users.uid,
        set: {
          email: normalizeEmail(record.email),
          passwordHash: record.passwordHash,
          profile: record.profile || {},
          updatedAt: new Date(),
        },
      });
    return;
  }
  ensureManagedIdentityAvailable();

  writeState((state) => {
    state.users[record.uid] = record;
    state.usersByEmail[normalizeEmail(record.email)] = record.uid;
  });
};

export const getUserByUid = async (uid) => {
  if (!uid) return null;
  if (managedIdentityEnabled) {
    const { db } = await getIdentityClients();
    const result = await db.query.users.findFirst({
      where: eq(schema.users.uid, uid),
    });
    if (!result) return null;
    return { ...result, passwordHash: result.passwordHash }; // normalize naming
  }
  ensureManagedIdentityAvailable();
  return loadState().users[uid] || null;
};

export const getUserByEmail = async (email) => {
  const norm = normalizeEmail(email);
  if (managedIdentityEnabled) {
    const { db } = await getIdentityClients();
    const result = await db.query.users.findFirst({
      where: eq(schema.users.email, norm),
    });
    return result || null;
  }
  ensureManagedIdentityAvailable();
  const uid = loadState().usersByEmail[norm];
  return uid ? loadState().users[uid] : null;
};

export const listUsers = async () => {
  if (managedIdentityEnabled) {
    const { db } = await getIdentityClients();
    return await db.select().from(schema.users);
  }
  ensureManagedIdentityAvailable();
  return Object.values(loadState().users);
};

// --- SESSION OPERATIONS ---

export const saveSession = async (session) => {
  if (managedIdentityEnabled) {
    const { redis, pool } = await getIdentityClients();
    const ttl = Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000);
    if (ttl > 0) {
      if (redis) {
        await redis.set(sessionKey(session.token), JSON.stringify(session), 'EX', ttl);
      } else {
        await pool.query(
          `INSERT INTO chatscream_sessions (token, data, expires_at) VALUES ($1, $2, $3)
           ON CONFLICT (token) DO UPDATE SET data = $2, expires_at = $3`,
          [session.token, JSON.stringify(session), session.expiresAt],
        );
      }
    }
    return;
  }
  ensureManagedIdentityAvailable();
  writeState((state) => {
    state.sessions[session.token] = session;
  });
};

export const getSession = async (token) => {
  if (managedIdentityEnabled) {
    const { redis, pool } = await getIdentityClients();
    if (redis) {
      const data = await redis.get(sessionKey(token));
      return data ? JSON.parse(data) : null;
    } else {
      const result = await pool.query(
        'SELECT data FROM chatscream_sessions WHERE token = $1 AND expires_at > NOW()',
        [token],
      );
      return result.rows[0]?.data || null;
    }
  }
  ensureManagedIdentityAvailable();
  return loadState().sessions[token] || null;
};

export const removeSession = async (token) => {
  if (managedIdentityEnabled) {
    const { redis, pool } = await getIdentityClients();
    if (redis) {
      await redis.del(sessionKey(token));
    } else {
      await pool.query('DELETE FROM chatscream_sessions WHERE token = $1', [token]);
    }
    return;
  }
  ensureManagedIdentityAvailable();
  writeState((state) => {
    delete state.sessions[token];
  });
};

// --- PASSWORD RESET TOKEN OPERATIONS ---

export const savePasswordResetToken = async (tokenRecord) => {
  if (managedIdentityEnabled) {
    const { redis, pool } = await getIdentityClients();
    const ttl = Math.floor((new Date(tokenRecord.expiresAt).getTime() - Date.now()) / 1000);
    if (ttl > 0) {
      if (redis) {
        await redis.set(
          passwordResetTokenKey(tokenRecord.tokenHash),
          JSON.stringify(tokenRecord),
          'EX',
          ttl,
        );
      } else {
        await pool.query(
          `INSERT INTO chatscream_reset_tokens (token_hash, data, expires_at) VALUES ($1, $2, $3)
           ON CONFLICT (token_hash) DO UPDATE SET data = $2, expires_at = $3`,
          [tokenRecord.tokenHash, JSON.stringify(tokenRecord), tokenRecord.expiresAt],
        );
      }
    }
    return;
  }
  ensureManagedIdentityAvailable();
  writeState((state) => {
    state.passwordResetTokens[tokenRecord.tokenHash] = tokenRecord;
  });
};

export const consumePasswordResetToken = async (tokenHash) => {
  if (!tokenHash) return null;
  if (managedIdentityEnabled) {
    const { redis, pool } = await getIdentityClients();
    let tokenRecord;
    if (redis) {
      const key = passwordResetTokenKey(tokenHash);
      const [raw] = await redis.multi().get(key).del(key).exec();
      const data = Array.isArray(raw) && raw.length > 1 ? raw[1] : null;
      if (!data) return null;
      tokenRecord = JSON.parse(data);
    } else {
      const result = await pool.query(
        'DELETE FROM chatscream_reset_tokens WHERE token_hash = $1 AND expires_at > NOW() RETURNING data',
        [tokenHash],
      );
      if (!result.rows[0]) return null;
      tokenRecord = result.rows[0].data;
    }
    const expiresAt = new Date(tokenRecord.expiresAt).getTime();
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      return null;
    }
    return tokenRecord;
  }
  ensureManagedIdentityAvailable();
  const existing = loadState().passwordResetTokens[tokenHash];
  if (!existing) return null;
  writeState((state) => {
    delete state.passwordResetTokens[tokenHash];
  });
  const expiresAt = new Date(existing.expiresAt).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return null;
  }
  return existing;
};

// --- CONFIG & APP STATE ---

export const getConfig = (key) => loadState().config[key];
export const setConfig = (key, value, updatedBy) =>
  writeState((state) => {
    state.config[key] = {
      ...value,
      updatedAt: new Date().toISOString(),
      updatedBy: updatedBy || 'system',
    };
  });

export const listMediaAssets = () => Object.values(loadState().media || {});
export const addMediaAsset = (asset) =>
  writeState((state) => {
    state.media[asset.id] = asset;
  });
export const removeMediaAsset = (id) =>
  writeState((state) => {
    delete state.media[id];
  });

export const createUserProfile = (data) => ({
  ...data,
  subscription: { plan: 'free', status: 'active' },
  connectedPlatforms: {},
});

export const getPublicProfile = (record) => ({
  uid: record.uid,
  email: record.email,
  displayName: record.profile?.displayName || record.email.split('@')[0],
  photoURL: record.profile?.photoURL || '',
});

// Full profile — only for the record owner (or admin) to see, never for
// cross-user lookups. Includes billing, connected destinations, and
// affiliate data that getPublicProfile intentionally omits.
export const getOwnProfile = (record) => ({
  ...getPublicProfile(record),
  createdAt: record.profile?.createdAt,
  role: record.profile?.role,
  betaTester: Boolean(record.profile?.betaTester),
  subscription: record.profile?.subscription,
  usage: record.profile?.usage,
  affiliate: record.profile?.affiliate,
  settings: record.profile?.settings,
  connectedPlatforms: record.profile?.connectedPlatforms,
});

export const setConnectedPlatform = async (uid, platform, value) => {
  const user = await getUserByUid(uid);
  if (user) {
    if (!user.profile.connectedPlatforms) user.profile.connectedPlatforms = {};
    user.profile.connectedPlatforms[platform] = value;
    await putUser(user);
  }
};

// --- SCHEDULE OPERATIONS ---

export const listSchedules = (userId) => {
  const all = loadState().schedules || {};
  return Object.values(all).filter((s) => s.userId === userId);
};

export const getSchedule = (id) => (loadState().schedules || {})[id] || null;

export const putSchedule = (schedule) =>
  writeState((state) => {
    if (!state.schedules) state.schedules = {};
    state.schedules[schedule.id] = schedule;
  });

export const deleteSchedule = (id) =>
  writeState((state) => {
    if (state.schedules) delete state.schedules[id];
  });

// ── Scenes ──────────────────────────────────────────────────────────────────

export const listScenes = (userId) => {
  const all = loadState().scenes || {};
  return Object.values(all).filter((s) => s.userId === userId);
};

export const getScene = (id) => (loadState().scenes || {})[id] || null;

export const putScene = (scene) =>
  writeState((state) => {
    if (!state.scenes) state.scenes = {};
    state.scenes[scene.id] = scene;
  });

export const deleteScene = (id) =>
  writeState((state) => {
    if (state.scenes) delete state.scenes[id];
  });

export const seedLeaderboard = () =>
  writeState((state) => {
    if (state.leaderboard && state.leaderboard.length > 0) return;
    state.leaderboard = [
      { rank: 1, username: 'StreamKingXL', screams: 847, donated: 1240, weeklyGain: 12 },
      { rank: 2, username: 'NovaBlastLive', screams: 634, donated: 890, weeklyGain: 8 },
      { rank: 3, username: 'VortexCaster', screams: 521, donated: 730, weeklyGain: 5 },
      { rank: 4, username: 'PixelHeroTV', screams: 418, donated: 610, weeklyGain: 3 },
      { rank: 5, username: 'ChaosCrafter', screams: 379, donated: 560, weeklyGain: 2 },
      { rank: 6, username: 'ZeroCoolGaming', screams: 312, donated: 445, weeklyGain: 1 },
      { rank: 7, username: 'LunaticStreamer', screams: 271, donated: 390, weeklyGain: 0 },
      { rank: 8, username: 'SurgeWave99', screams: 234, donated: 320, weeklyGain: -1 },
      { rank: 9, username: 'EchoBlitz', screams: 198, donated: 285, weeklyGain: -2 },
      { rank: 10, username: 'TurboHostPro', screams: 156, donated: 210, weeklyGain: -3 },
    ];
  });
// ── Leaderboard ─────────────────────────────────────────────────────────────

/**
 * Update (or create) a leaderboard entry when a scream donation is received.
 * Tracks scream count and total donated per streamer, re-ranks after each update.
 */
export const updateLeaderboardEntry = (streamerUid, amount) =>
  writeState((state) => {
    if (!state.leaderboard) state.leaderboard = [];
    if (!state.screamHistory) state.screamHistory = [];

    // Find or create entry for this streamer
    let entry = state.leaderboard.find((e) => e.uid === streamerUid || e.username === streamerUid);

    if (entry) {
      entry.screams = (entry.screams || 0) + 1;
      entry.donated = (entry.donated || 0) + amount;
    } else {
      entry = {
        uid: streamerUid,
        username: streamerUid,
        screams: 1,
        donated: amount,
        weeklyGain: 0,
      };
      state.leaderboard.push(entry);
    }

    // Re-rank by scream count (descending)
    state.leaderboard.sort((a, b) => (b.screams || 0) - (a.screams || 0));
    state.leaderboard.forEach((e, i) => {
      const oldRank = e.rank || i + 1;
      e.rank = i + 1;
      e.weeklyGain = oldRank - e.rank; // positive = climbed
    });
  });

/**
 * Weekly leaderboard reset. Clears scream counts but preserves usernames.
 * The #1 streamer gets flagged for a free Pro month.
 */
export const resetWeeklyLeaderboard = () =>
  writeState((state) => {
    if (!state.leaderboard || state.leaderboard.length === 0) return;

    // Record the winner
    const winner = state.leaderboard[0];
    if (!state.weeklyWinners) state.weeklyWinners = [];
    if (winner) {
      state.weeklyWinners.push({
        username: winner.username,
        uid: winner.uid,
        screams: winner.screams,
        donated: winner.donated,
        weekEnding: new Date().toISOString(),
        prizeAwarded: false,
      });
    }

    // Reset counts
    state.leaderboard.forEach((e) => {
      e.screams = 0;
      e.donated = 0;
      e.weeklyGain = 0;
    });
  });

export const getWeeklyWinners = () => loadState().weeklyWinners || [];

// ── Scream broadcast bridge ──────────────────────────────────────────────
// Set by server/index.js at startup so the Stripe webhook can push
// real-time scream alerts to connected streamer WebSocket clients.
let _screamBroadcaster = null;

export const setScreamBroadcaster = (fn) => {
  _screamBroadcaster = fn;
};

export const broadcastScreamAlert = (streamerUid, alert) => {
  if (_screamBroadcaster) _screamBroadcaster(streamerUid, alert);
};

export const addChatMessage = (msg) =>
  writeState((state) => {
    state.chatMessages.push(msg);
  });
export const listChatMessages = (streamId, limit) => {
  const all = loadState().chatMessages || [];
  const filtered = streamId ? all.filter((m) => m.streamId === streamId) : all;
  return limit && limit > 0 ? filtered.slice(-limit) : filtered;
};
export const getAffiliate = (code) => loadState().affiliates[code];
export const setAffiliate = (aff) =>
  writeState((state) => {
    state.affiliates[aff.code] = aff;
  });
export const addReferral = (ref) =>
  writeState((state) => {
    state.referrals.push(ref);
  });
export const applyAccessOverrides = (profile) => {
  if (!profile || typeof profile !== 'object') return profile;

  const accessConfig = getConfig('access') || {};
  const configuredAdminEmails = Array.isArray(accessConfig.admins)
    ? accessConfig.admins.map((value) => normalizeEmail(value)).filter(Boolean)
    : [];
  const adminEmails = [
    ...new Set([...configuredAdminEmails, ...ROOT_ADMIN_EMAILS.map(normalizeEmail)]),
  ];
  const betaEmails = Array.isArray(accessConfig.betaTesters)
    ? accessConfig.betaTesters.map((value) => normalizeEmail(value)).filter(Boolean)
    : [];
  const adminUids = Array.isArray(accessConfig.adminUids)
    ? accessConfig.adminUids.map((value) => String(value || '').trim()).filter(Boolean)
    : [];
  const betaUids = Array.isArray(accessConfig.betaTesterUids)
    ? accessConfig.betaTesterUids.map((value) => String(value || '').trim()).filter(Boolean)
    : [];

  const email = normalizeEmail(profile.email || '');
  const uid = String(profile.uid || '').trim();

  const isAdmin = adminUids.includes(uid) || adminEmails.includes(email);
  const isBetaTester = betaUids.includes(uid) || betaEmails.includes(email) || isAdmin;

  const nextRole = isAdmin ? 'admin' : isBetaTester ? 'beta_tester' : profile.role || 'user';
  const nextPlan = isBetaTester ? 'enterprise' : profile.subscription?.plan || 'free';
  const nextStatus = isBetaTester ? 'active' : profile.subscription?.status || 'active';

  return {
    ...profile,
    role: nextRole,
    betaTester: isBetaTester,
    subscription: {
      ...(profile.subscription || {}),
      plan: nextPlan,
      status: nextStatus,
      betaOverride: isBetaTester ? true : profile.subscription?.betaOverride,
    },
  };
};
export const createAffiliateCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();
export const getCloudUsage = (uid) => loadState().cloud.usage[uid] || {};
export const setCloudUsage = (uid, usage) =>
  writeState((state) => {
    state.cloud.usage[uid] = usage;
  });
