import express from 'express';
import { createHash, timingSafeEqual, randomUUID } from 'node:crypto';
import { getUserByEmail, getUserByUid, putUser } from '../store.js';

const ROOT_ADMIN_EMAILS = new Set([
  'mreardon@wtpnews.org',
  'don@donmatthews.live',
  'patriotnewsactivism@gmail.com',
]);

const tokenHash = String(process.env.INTERNAL_STUDIO_BRIDGE_TOKEN_SHA256 || '')
  .trim()
  .toLowerCase();
const defaultTargetEmail = String(process.env.INTERNAL_STUDIO_BRIDGE_TARGET_EMAIL || '')
  .trim()
  .toLowerCase();
const bridgeConfigured = /^[a-f0-9]{64}$/.test(tokenHash);

const text = (value, max = 1000) => String(value || '').trim().slice(0, max);
const normalizeEmail = (value) => text(value, 320).toLowerCase();
const asObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

const safeTokenMatch = (provided) => {
  if (!bridgeConfigured || !provided) return false;
  const digest = createHash('sha256').update(provided).digest('hex');
  const a = Buffer.from(digest, 'utf8');
  const b = Buffer.from(tokenHash, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
};

const readBearer = (req) => {
  const raw = String(req.headers.authorization || '');
  return raw.startsWith('Bearer ') ? raw.slice(7).trim() : '';
};

const isRootAdminEmail = (email) => ROOT_ADMIN_EMAILS.has(normalizeEmail(email));

const sanitizeCommand = (raw) => {
  const command = text(raw?.command, 40).toLowerCase();
  const payload = asObject(raw?.payload);
  if (!['lower-third', 'ticker', 'program-media', 'clear', 'note'].includes(command)) {
    throw new Error('Unsupported studio bridge command.');
  }

  if (command === 'lower-third') {
    return {
      command,
      payload: {
        name: text(payload.name, 80),
        title: text(payload.title, 180),
        bgColor: text(payload.bgColor, 20) || '#0f172a',
        accentColor: text(payload.accentColor, 20) || '#ef4444',
        visible: payload.visible !== false,
      },
    };
  }

  if (command === 'ticker') {
    return {
      command,
      payload: {
        text: text(payload.text, 500),
        visible: payload.visible !== false,
      },
    };
  }

  if (command === 'program-media') {
    const url = text(payload.url, 4096);
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error('program-media requires a valid HTTPS URL.');
    }
    if (parsed.protocol !== 'https:') {
      throw new Error('program-media requires HTTPS.');
    }
    if (parsed.username || parsed.password) {
      throw new Error('Embedded URL credentials are not allowed.');
    }
    return {
      command,
      payload: {
        url: parsed.toString(),
        label: text(payload.label, 120),
        fullscreen: payload.fullscreen === true,
        autoplay: payload.autoplay !== false,
      },
    };
  }

  if (command === 'note') {
    return {
      command,
      payload: {
        text: text(payload.text, 2000),
        category: text(payload.category, 80),
      },
    };
  }

  return {
    command: 'clear',
    payload: {
      lowerThird: payload.lowerThird !== false,
      ticker: payload.ticker !== false,
      programMedia: payload.programMedia !== false,
    },
  };
};

const writeBridgeState = async ({ targetEmail, command, source }) => {
  const email = normalizeEmail(targetEmail || defaultTargetEmail);
  if (!isRootAdminEmail(email)) {
    throw new Error('Target account is not authorized for the private studio bridge.');
  }
  const record = await getUserByEmail(email);
  if (!record) throw new Error('Target account was not found.');

  const state = {
    enabled: true,
    eventId: randomUUID(),
    sequence: Math.max(0, Number(record.profile?.internalStudioBridge?.sequence) || 0) + 1,
    command: command.command,
    payload: command.payload,
    source: text(source, 120) || 'private-bridge',
    updatedAt: new Date().toISOString(),
  };

  await putUser({
    ...record,
    profile: {
      ...record.profile,
      internalStudioBridge: state,
    },
  });
  return state;
};

export const ingressRouter = express.Router();

ingressRouter.get('/health', (req, res) => {
  const authorized = safeTokenMatch(readBearer(req));
  if (!authorized) return res.status(401).json({ message: 'Unauthorized.' });
  return res.json({ ok: true, configured: bridgeConfigured, service: 'studio-bridge' });
});

ingressRouter.post('/event', async (req, res, next) => {
  try {
    if (!safeTokenMatch(readBearer(req))) {
      return res.status(401).json({ message: 'Unauthorized.' });
    }
    const command = sanitizeCommand(req.body);
    const state = await writeBridgeState({
      targetEmail: req.body?.targetEmail,
      command,
      source: req.body?.source,
    });
    return res.status(202).json({
      accepted: true,
      eventId: state.eventId,
      sequence: state.sequence,
      command: state.command,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('Unsupported') ||
        error.message.includes('requires') ||
        error.message.includes('authorized') ||
        error.message.includes('not found'))
    ) {
      return res.status(400).json({ message: error.message });
    }
    return next(error);
  }
});

export const adminRouter = express.Router();

adminRouter.use((req, res, next) => {
  if (!req.auth?.profile || !isRootAdminEmail(req.auth.profile.email)) {
    return res.status(404).json({ message: 'Not found.' });
  }
  return next();
});

adminRouter.get('/state', async (req, res, next) => {
  try {
    if (!bridgeConfigured) {
      return res.status(404).json({ message: 'Not found.' });
    }
    const record = await getUserByUid(req.auth.profile.uid);
    if (!record) return res.status(404).json({ message: 'Not found.' });
    return res.json({ state: record.profile?.internalStudioBridge || null });
  } catch (error) {
    return next(error);
  }
});

adminRouter.post('/clear', async (req, res, next) => {
  try {
    if (!bridgeConfigured) {
      return res.status(404).json({ message: 'Not found.' });
    }
    const record = await getUserByUid(req.auth.profile.uid);
    if (!record) return res.status(404).json({ message: 'Not found.' });
    const current = record.profile?.internalStudioBridge || {};
    const state = {
      ...current,
      enabled: false,
      eventId: randomUUID(),
      sequence: Math.max(0, Number(current.sequence) || 0) + 1,
      command: 'clear',
      payload: { lowerThird: true, ticker: true, programMedia: true },
      updatedAt: new Date().toISOString(),
    };
    await putUser({
      ...record,
      profile: { ...record.profile, internalStudioBridge: state },
    });
    return res.json({ success: true, state });
  } catch (error) {
    return next(error);
  }
});

export const internalStudioBridgeConfigured = () => bridgeConfigured;
