import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const DATA_DIR = path.join(process.cwd(), 'server', 'data');
const DATA_FILE = path.join(DATA_DIR, 'runtime.json');

const MASTER_EMAILS = ['mreardon@wtpnews.org'];
const DEFAULT_BETA_TESTERS = ['leroytruth247@gmail.com'];

const nowIso = () => new Date().toISOString();
const normalizeEmail = (value = '') => value.trim().toLowerCase();
const normalizeCode = (value = '') => value.trim().toUpperCase();

const clone = (value) => JSON.parse(JSON.stringify(value));

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

const ensureDataDir = () => {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
};

const readStateFromDisk = () => {
  ensureDataDir();
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
  } catch {
    return baseState();
  }
};

const saveStateToDisk = () => {
  if (!stateCache) return;
  ensureDataDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(stateCache, null, 2), 'utf8');
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

export const putUser = (record) =>
  writeState((state) => {
    state.users[record.uid] = record;
    state.usersByEmail[normalizeEmail(record.email)] = record.uid;
  });

export const getUserByUid = (uid) => {
  const state = loadState();
  return state.users[uid] || null;
};

export const getUserByEmail = (email) => {
  const state = loadState();
  const uid = state.usersByEmail[normalizeEmail(email)];
  return uid ? state.users[uid] || null : null;
};

export const listUsers = () => {
  const state = loadState();
  return Object.values(state.users);
};

export const getPublicProfile = (record) => {
  if (!record) return null;
  return applyAccessOverrides(clone(record.profile));
};

export const saveSession = ({ token, uid, expiresAt }) =>
  writeState((state) => {
    state.sessions[token] = {
      token,
      uid,
      expiresAt,
      createdAt: nowIso(),
    };
  });

export const getSession = (token) => {
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

export const removeSession = (token) =>
  writeState((state) => {
    delete state.sessions[token];
  });

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

export const setConnectedPlatform = (uid, platform, value) =>
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

export const seedLeaderboard = () =>
  writeState((state) => {
    if ((state.leaderboard || []).length > 0) return;
    state.leaderboard = [
      { streamerId: 'demo-1', streamerName: 'StreamerKing', screamCount: 247, rank: 1 },
      { streamerId: 'demo-2', streamerName: 'GamerGirl99', screamCount: 189, rank: 2 },
      { streamerId: 'demo-3', streamerName: 'ProPlayer', screamCount: 156, rank: 3 },
    ];
  });
