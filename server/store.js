import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import Redis from 'ioredis';

const envDataDir = String(process.env.CHATSCREAM_DATA_DIR || '').trim();
const defaultDataDir = process.env.VERCEL
  ? path.join('/tmp', 'chatscream')
  : path.join(process.cwd(), 'server', 'data');

const DATA_DIR = envDataDir || defaultDataDir;
const DATA_FILE = path.join(DATA_DIR, 'runtime.json');

const MASTER_EMAILS = ['mreardon@wtpnews.org'];
const DEFAULT_BETA_TESTERS = ['leroytruth247@gmail.com'];

const nowIso = () => new Date().toISOString();
const normalizeEmail = (value = '') => value.trim().toLowerCase();
const normalizeCode = (value = '') => value.trim().toUpperCase();
const parseBoolean = (value) =>
  ['1', 'true', 'yes', 'on'].includes(
    String(value || '')
      .trim()
      .toLowerCase(),
  );

const clone = (value) => JSON.parse(JSON.stringify(value));

const postgresUrl = String(process.env.POSTGRES_URL || process.env.DATABASE_URL || '').trim();
const redisUrl = String(process.env.REDIS_URL || '').trim();
const managedIdentityEnabled = Boolean(postgresUrl && redisUrl);

let identityClients = null;
let identityInitPromise = null;

const sessionKey = (token) => `chatscream:session:${token}`;

const normalizeUserRecord = (row) => {
  if (!row) return null;
  return {
    uid: String(row.uid),
    email: normalizeEmail(row.email || ''),
    passwordHash: String(row.password_hash || ''),
    profile: typeof row.profile === 'string' ? JSON.parse(row.profile) : row.profile || {},
  };
};

const getIdentityClients = async () => {
  if (!managedIdentityEnabled) return null;
  if (identityClients) return identityClients;
  if (identityInitPromise) return identityInitPromise;

  identityInitPromise = (async () => {
    const usePostgresTls = parseBoolean(process.env.POSTGRES_SSL);
    const pool = new Pool({
      connectionString: postgresUrl,
      ...(usePostgresTls ? { ssl: { rejectUnauthorized: false } } : {}),
    });

    await pool.query(`
      CREATE TABLE IF NOT EXISTS chatscream_users (
        uid TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL DEFAULT '',
        profile JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_chatscream_users_email ON chatscream_users (email);
    `);

    const useRedisTls = parseBoolean(process.env.REDIS_TLS);
    const redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 2,
      ...(useRedisTls ? { tls: { rejectUnauthorized: false } } : {}),
    });
    await redis.ping();

    identityClients = { pool, redis };
    return identityClients;
  })().catch((error) => {
    identityInitPromise = null;
    throw error;
  });

  return identityInitPromise;
};

export const isManagedIdentityStorageEnabled = () => managedIdentityEnabled;

export const getIdentityStorageMode = () => (managedIdentityEnabled ? 'postgres+redis' : 'local');

export const initIdentityStorage = async () => {
  if (!managedIdentityEnabled) return 'local';
  await getIdentityClients();
  return 'postgres+redis';
};

export const closeIdentityStorage = async () => {
  if (!identityClients) return;
  const { pool, redis } = identityClients;
  identityClients = null;
  identityInitPromise = null;
  try {
    await pool.end();
  } finally {
    redis.disconnect();
  }
};

const baseState = () => ({
  users: {},
  usersByEmail: {},
  sessions: {},
  affiliates: {
    MMM: {
      code: 'MMM',
      ownerId: 'mythical-meta',
      ownerEmail: 'contact@mythicalmeta.com',
      ownerName: 'Mythical Meta',
      commissionRate: 0.4,
      bonusTrialDays: 7,
      totalReferrals: 0,
      totalEarnings: 0,
      createdAt: nowIso(),
      isActive: true,
    },
  },
  referrals: [],
  config: {
    access: {
      admins: [...MASTER_EMAILS],
      betaTesters: [...DEFAULT_BETA_TESTERS],
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
  cloud: {
    sessions: {},
    usage: {},
  },
  leaderboard: [],
});

let stateCache = null;
let saveTimer = null;
let persistenceEnabled = true;

const markPersistenceUnavailable = (error) => {
  if (!persistenceEnabled) return;
  persistenceEnabled = false;
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : 'unknown error';
  console.warn(`State persistence disabled (${message}). Using in-memory storage only.`);
};

const ensureDataDir = () => {
  if (!persistenceEnabled) return false;
  if (!fs.existsSync(DATA_DIR)) {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    } catch (error) {
      markPersistenceUnavailable(error);
      return false;
    }
  }
  return true;
};

const readStateFromDisk = () => {
  if (!ensureDataDir()) {
    return baseState();
  }
  if (!fs.existsSync(DATA_FILE)) {
    return baseState();
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return {
      ...baseState(),
      ...parsed,
      config: {
        ...baseState().config,
        ...(parsed.config || {}),
      },
      cloud: {
        ...baseState().cloud,
        ...(parsed.cloud || {}),
      },
    };
  } catch (error) {
    markPersistenceUnavailable(error);
    return baseState();
  }
};

const saveStateToDisk = () => {
  if (!stateCache || !persistenceEnabled) return;
  if (!ensureDataDir()) return;
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(stateCache, null, 2), 'utf8');
  } catch (error) {
    markPersistenceUnavailable(error);
  }
};

const scheduleSave = () => {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveStateToDisk();
  }, 100);
};

export const loadState = () => {
  if (!stateCache) {
    stateCache = readStateFromDisk();
  }
  return stateCache;
};

export const flushState = () => {
  saveStateToDisk();
};

export const writeState = (updater) => {
  const current = loadState();
  updater(current);
  scheduleSave();
  return current;
};

const randomAffiliateCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
};

export const createAffiliateCode = () => {
  const state = loadState();
  let attempts = 0;
  while (attempts < 20) {
    const candidate = randomAffiliateCode();
    if (!state.affiliates[candidate]) return candidate;
    attempts += 1;
  }
  return randomUUID().slice(0, 6).toUpperCase();
};

export const createUserProfile = ({
  uid,
  email,
  displayName,
  referredByCode,
  referredByUserId,
}) => {
  const affiliateCode = createAffiliateCode();
  const trialDays = referredByCode ? 14 : 7;
  const trialEndsAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000).toISOString();
  const normalizedEmail = normalizeEmail(email);

  return {
    uid,
    email: normalizedEmail,
    displayName: displayName || normalizedEmail || 'User',
    photoURL: '',
    createdAt: nowIso(),
    role: 'user',
    betaTester: false,
    subscription: {
      plan: 'free',
      status: 'trialing',
      trialEndsAt,
      currentPeriodEnd: '',
      stripeCustomerId: '',
      stripeSubscriptionId: '',
      betaOverride: false,
    },
    usage: {
      cloudHoursUsed: 0,
      cloudHoursResetAt: nowIso(),
      lastStreamDate: '',
      activeCloudSession: null,
    },
    affiliate: {
      code: affiliateCode,
      referredBy: referredByCode || '',
      referredByUserId: referredByUserId || '',
      referrals: 0,
      totalEarnings: 0,
      pendingPayout: 0,
    },
    settings: {
      emailNotifications: true,
      marketingEmails: true,
    },
    connectedPlatforms: {},
  };
};

export const applyAccessOverrides = (profile) => {
  const state = loadState();
  const email = normalizeEmail(profile.email || '');
  const admins = new Set((state.config.access.admins || []).map(normalizeEmail));
  const betaSet = new Set((state.config.access.betaTesters || []).map(normalizeEmail));
  const isMaster = MASTER_EMAILS.includes(email);
  const isAdmin = isMaster || admins.has(email);
  const isBeta = isAdmin || betaSet.has(email);

  const next = clone(profile);
  if (isAdmin) {
    next.role = 'admin';
    next.betaTester = true;
    next.subscription.plan = 'enterprise';
    next.subscription.status = 'active';
    next.subscription.betaOverride = true;
  } else if (isBeta) {
    next.role = 'beta_tester';
    next.betaTester = true;
    next.subscription.plan = 'enterprise';
    next.subscription.status = 'active';
    next.subscription.betaOverride = true;
  }

  return next;
};

export const putUser = async (record) => {
  const normalizedRecord = {
    ...record,
    email: normalizeEmail(record.email),
    passwordHash: String(record.passwordHash || ''),
  };

  if (managedIdentityEnabled) {
    const { pool } = await getIdentityClients();
    await pool.query(
      `
        INSERT INTO chatscream_users (uid, email, password_hash, profile, updated_at)
        VALUES ($1, $2, $3, $4::jsonb, NOW())
        ON CONFLICT (uid)
        DO UPDATE SET
          email = EXCLUDED.email,
          password_hash = EXCLUDED.password_hash,
          profile = EXCLUDED.profile,
          updated_at = NOW()
      `,
      [
        normalizedRecord.uid,
        normalizedRecord.email,
        normalizedRecord.passwordHash,
        JSON.stringify(normalizedRecord.profile || {}),
      ],
    );
    return;
  }

  writeState((state) => {
    state.users[normalizedRecord.uid] = normalizedRecord;
    state.usersByEmail[normalizedRecord.email] = normalizedRecord.uid;
  });
};

export const getUserByUid = async (uid) => {
  if (!uid) return null;

  if (managedIdentityEnabled) {
    const { pool } = await getIdentityClients();
    const result = await pool.query(
      `SELECT uid, email, password_hash, profile FROM chatscream_users WHERE uid = $1 LIMIT 1`,
      [uid],
    );
    return normalizeUserRecord(result.rows[0] || null);
  }

  const state = loadState();
  return state.users[uid] || null;
};

export const getUserByEmail = async (email) => {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  if (managedIdentityEnabled) {
    const { pool } = await getIdentityClients();
    const result = await pool.query(
      `SELECT uid, email, password_hash, profile FROM chatscream_users WHERE email = $1 LIMIT 1`,
      [normalized],
    );
    return normalizeUserRecord(result.rows[0] || null);
  }

  const state = loadState();
  const uid = state.usersByEmail[normalized];
  return uid ? state.users[uid] || null : null;
};

export const listUsers = async () => {
  if (managedIdentityEnabled) {
    const { pool } = await getIdentityClients();
    const result = await pool.query(
      `SELECT uid, email, password_hash, profile FROM chatscream_users ORDER BY created_at ASC`,
    );
    return result.rows.map((row) => normalizeUserRecord(row)).filter(Boolean);
  }

  const state = loadState();
  return Object.values(state.users);
};

export const getPublicProfile = (record) => {
  if (!record) return null;
  return applyAccessOverrides(clone(record.profile));
};

export const saveSession = async ({ token, uid, expiresAt }) => {
  if (managedIdentityEnabled) {
    const { redis } = await getIdentityClients();
    const ttlMs = Math.max(0, new Date(expiresAt).getTime() - Date.now());
    if (ttlMs <= 0) return;
    const payload = JSON.stringify({
      token,
      uid,
      expiresAt,
      createdAt: nowIso(),
    });
    await redis.set(sessionKey(token), payload, 'PX', ttlMs);
    return;
  }

  writeState((state) => {
    state.sessions[token] = {
      token,
      uid,
      expiresAt,
      createdAt: nowIso(),
    };
  });
};

export const getSession = async (token) => {
  if (!token) return null;

  if (managedIdentityEnabled) {
    const { redis } = await getIdentityClients();
    const raw = await redis.get(sessionKey(token));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (new Date(parsed.expiresAt).getTime() <= Date.now()) {
      await redis.del(sessionKey(token));
      return null;
    }
    return parsed;
  }

  const state = loadState();
  const session = state.sessions[token];
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    delete state.sessions[token];
    scheduleSave();
    return null;
  }
  return session;
};

export const removeSession = async (token) => {
  if (!token) return;

  if (managedIdentityEnabled) {
    const { redis } = await getIdentityClients();
    await redis.del(sessionKey(token));
    return;
  }

  writeState((state) => {
    delete state.sessions[token];
  });
};

export const setAffiliate = (affiliate) =>
  writeState((state) => {
    state.affiliates[normalizeCode(affiliate.code)] = affiliate;
  });

export const getAffiliate = (code) => {
  const state = loadState();
  return state.affiliates[normalizeCode(code)] || null;
};

export const addReferral = (entry) =>
  writeState((state) => {
    state.referrals.push(entry);
  });

export const getConfig = (key) => {
  const state = loadState();
  return clone(state.config[key] || {});
};

export const setConfig = (key, patch, updatedBy = 'system') =>
  writeState((state) => {
    state.config[key] = {
      ...(state.config[key] || {}),
      ...patch,
      updatedAt: nowIso(),
      updatedBy,
    };
  });

export const addChatMessage = (message) =>
  writeState((state) => {
    state.chatMessages.push(message);
    if (state.chatMessages.length > 5000) {
      state.chatMessages.splice(0, state.chatMessages.length - 5000);
    }
  });

export const listChatMessages = (streamId, limit = 100) => {
  const state = loadState();
  return state.chatMessages
    .filter((message) => message.streamId === streamId)
    .slice(-Math.max(1, Math.min(500, Number(limit) || 100)));
};

export const setCloudUsage = (uid, usagePatch) =>
  writeState((state) => {
    const current = state.cloud.usage[uid] || {
      cloudHoursUsed: 0,
      cloudHoursResetAt: nowIso(),
      lastStreamDate: '',
      activeCloudSession: null,
    };
    state.cloud.usage[uid] = {
      ...current,
      ...usagePatch,
    };
  });

export const getCloudUsage = (uid) => {
  const state = loadState();
  return (
    state.cloud.usage[uid] || {
      cloudHoursUsed: 0,
      cloudHoursResetAt: nowIso(),
      lastStreamDate: '',
      activeCloudSession: null,
    }
  );
};

export const setConnectedPlatform = async (uid, platform, value) => {
  if (managedIdentityEnabled) {
    const record = await getUserByUid(uid);
    if (!record) return;
    const profile = clone(record.profile || {});
    if (!profile.connectedPlatforms) {
      profile.connectedPlatforms = {};
    }
    if (value === null) {
      delete profile.connectedPlatforms[platform];
    } else {
      profile.connectedPlatforms[platform] = value;
    }
    await putUser({ ...record, profile });
    return;
  }

  writeState((state) => {
    const user = state.users[uid];
    if (!user) return;
    if (!user.profile.connectedPlatforms) {
      user.profile.connectedPlatforms = {};
    }
    if (value === null) {
      delete user.profile.connectedPlatforms[platform];
    } else {
      user.profile.connectedPlatforms[platform] = value;
    }
  });
};

export const seedLeaderboard = () =>
  writeState((state) => {
    if ((state.leaderboard || []).length > 0) return;
    state.leaderboard = [
      { streamerId: 'demo-1', streamerName: 'StreamerKing', screamCount: 247, rank: 1 },
      { streamerId: 'demo-2', streamerName: 'GamerGirl99', screamCount: 189, rank: 2 },
      { streamerId: 'demo-3', streamerName: 'ProPlayer', screamCount: 156, rank: 3 },
    ];
  });
