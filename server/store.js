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

const postgresUrl = String(process.env.POSTGRES_URL || process.env.DATABASE_URL || '').trim();
const redisUrl = String(process.env.REDIS_URL || '').trim();
const managedIdentityEnabled = Boolean(postgresUrl && redisUrl);

let identityClients = null;
let identityInitPromise = null;

const sessionKey = (token) => `chatscream:session:${token}`;

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

    const db = drizzle(pool, { schema });

    const useRedisTls = parseBoolean(process.env.REDIS_TLS);
    const redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 2,
      ...(useRedisTls ? { tls: { rejectUnauthorized: false } } : {}),
    });
    await redis.ping();

    identityClients = { pool, db, redis };
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

// --- Local File Storage Fallback ---
const baseState = () => ({
  users: {},
  usersByEmail: {},
  sessions: {},
  affiliates: {},
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
  cloud: { sessions: {}, usage: {} },
  media: {},
  leaderboard: [],
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
  const uid = loadState().usersByEmail[norm];
  return uid ? loadState().users[uid] : null;
};

export const listUsers = async () => {
  if (managedIdentityEnabled) {
    const { db } = await getIdentityClients();
    return await db.select().from(schema.users);
  }
  return Object.values(loadState().users);
};

// --- SESSION OPERATIONS ---

export const saveSession = async (session) => {
  if (managedIdentityEnabled) {
    const { redis } = await getIdentityClients();
    const ttl = Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000);
    if (ttl > 0) {
      await redis.set(sessionKey(session.token), JSON.stringify(session), 'EX', ttl);
    }
    return;
  }
  writeState((state) => {
    state.sessions[session.token] = session;
  });
};

export const getSession = async (token) => {
  if (managedIdentityEnabled) {
    const { redis } = await getIdentityClients();
    const data = await redis.get(sessionKey(token));
    return data ? JSON.parse(data) : null;
  }
  return loadState().sessions[token] || null;
};

export const removeSession = async (token) => {
  if (managedIdentityEnabled) {
    const { redis } = await getIdentityClients();
    await redis.del(sessionKey(token));
    return;
  }
  writeState((state) => {
    delete state.sessions[token];
  });
};

// --- CONFIG & APP STATE ---

export const getConfig = (key) => loadState().config[key];
export const setConfig = (key, value) =>
  writeState((state) => {
    state.config[key] = value;
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

export const setConnectedPlatform = async (uid, platform, value) => {
  const user = await getUserByUid(uid);
  if (user) {
    user.profile.connectedPlatforms[platform] = value;
    await putUser(user);
  }
};

export const seedLeaderboard = () => {}; // No-op for now
export const addChatMessage = (msg) =>
  writeState((state) => {
    state.chatMessages.push(msg);
  });
export const listChatMessages = () => loadState().chatMessages;
export const getAffiliate = (code) => loadState().affiliates[code];
export const setAffiliate = (aff) =>
  writeState((state) => {
    state.affiliates[aff.code] = aff;
  });
export const addReferral = (ref) =>
  writeState((state) => {
    state.referrals.push(ref);
  });
export const applyAccessOverrides = () => {};
export const createAffiliateCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();
export const getCloudUsage = (uid) => loadState().cloud.usage[uid] || {};
export const setCloudUsage = (uid, usage) =>
  writeState((state) => {
    state.cloud.usage[uid] = usage;
  });
