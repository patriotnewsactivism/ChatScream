import express from 'express';
import { getUserByUid, putUser } from '../store.js';
import {
  generateChatResponseWithAi,
  generateFreeformContent,
  moderateMessageWithAi,
} from '../ai.js';

const router = express.Router();

const PLAN_DECISION_LIMITS = Object.freeze({
  free: 0,
  pro: 500,
  expert: 3000,
  enterprise: 12000,
  business: 50000,
});

const DEFAULT_CONFIG = Object.freeze({
  enabled: false,
  mode: 'assist',
  tone: 'friendly',
  answerScope: 'stream-and-stable-general',
  autoReplyQuestions: true,
  respondToMentions: true,
  engageQuietChat: true,
  publicReplies: true,
  quietAfterSeconds: 180,
  cooldownSeconds: 20,
  maxRepliesPerMinute: 2,
  knowledgeBase: '',
  hostInstructions: '',
});

const nowIso = () => new Date().toISOString();
const clamp = (value, min, max, fallback) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
};
const text = (value, max = 4000) => String(value || '').trim().slice(0, max);
const normalizeMode = (value) =>
  ['suggest', 'assist', 'autopilot'].includes(String(value || '').toLowerCase())
    ? String(value).toLowerCase()
    : DEFAULT_CONFIG.mode;
const normalizeTone = (value) =>
  ['friendly', 'witty', 'professional', 'energetic', 'calm'].includes(
    String(value || '').toLowerCase(),
  )
    ? String(value).toLowerCase()
    : DEFAULT_CONFIG.tone;

const sanitizeConfig = (raw = {}) => ({
  enabled: raw.enabled === true,
  mode: normalizeMode(raw.mode),
  tone: normalizeTone(raw.tone),
  answerScope:
    String(raw.answerScope || '') === 'stream-only'
      ? 'stream-only'
      : 'stream-and-stable-general',
  autoReplyQuestions: raw.autoReplyQuestions !== false,
  respondToMentions: raw.respondToMentions !== false,
  engageQuietChat: raw.engageQuietChat !== false,
  publicReplies: raw.publicReplies !== false,
  quietAfterSeconds: Math.round(
    clamp(raw.quietAfterSeconds, 60, 900, DEFAULT_CONFIG.quietAfterSeconds),
  ),
  cooldownSeconds: Math.round(
    clamp(raw.cooldownSeconds, 8, 300, DEFAULT_CONFIG.cooldownSeconds),
  ),
  maxRepliesPerMinute: Math.round(
    clamp(raw.maxRepliesPerMinute, 1, 6, DEFAULT_CONFIG.maxRepliesPerMinute),
  ),
  knowledgeBase: text(raw.knowledgeBase, 12000),
  hostInstructions: text(raw.hostInstructions, 4000),
});

const planLimit = (plan) => PLAN_DECISION_LIMITS[String(plan || 'free')] ?? 0;

const periodKeyFor = (record) => {
  const periodEnd = text(record?.profile?.subscription?.currentPeriodEnd, 100);
  if (periodEnd) return `stripe:${periodEnd}`;
  const now = new Date();
  return `calendar:${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
};

const normalizeUsage = (record) => {
  const periodKey = periodKeyFor(record);
  const existing = record?.profile?.aiModeratorUsage || {};
  if (existing.periodKey !== periodKey) {
    return { periodKey, decisions: 0, replies: 0, resetAt: nowIso() };
  }
  return {
    periodKey,
    decisions: Math.max(0, Number(existing.decisions) || 0),
    replies: Math.max(0, Number(existing.replies) || 0),
    resetAt: existing.resetAt || nowIso(),
  };
};

const saveCommercialProfile = async (record, patch) => {
  const next = {
    ...record,
    profile: {
      ...record.profile,
      ...patch,
    },
  };
  await putUser(next);
  return next;
};

const parseJsonObject = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    const parsed = JSON.parse(stripped);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    const start = stripped.indexOf('{');
    const end = stripped.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        const parsed = JSON.parse(stripped.slice(start, end + 1));
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
      } catch {
        return null;
      }
    }
    return null;
  }
};

const compactRecentChat = (value) =>
  (Array.isArray(value) ? value : [])
    .slice(-12)
    .map((item) => {
      if (item && typeof item === 'object') {
        return `${text(item.displayName, 80)}: ${text(item.content, 500)}`;
      }
      return text(item, 500);
    })
    .filter(Boolean);

const buildModeratorPrompt = ({ config, viewerName, platform, message, streamContext, recentChat, transcript }) => `
You are ChatScream AI Co-Host, an intelligent live-stream audience moderator and engagement assistant.

Your job is to keep the conversation useful and lively without dominating it.
Creator mode: ${config.mode}
Tone: ${config.tone}
Answer scope: ${config.answerScope}
Creator instructions: ${config.hostInstructions || '(none)'}
Creator-pinned facts / show knowledge: ${config.knowledgeBase || '(none)'}
Stream context: ${streamContext || '(not supplied)'}
Recent spoken transcript: ${transcript || '(not supplied)'}
Recent audience chat: ${recentChat.join(' | ') || '(none)'}
Viewer: ${viewerName || 'Viewer'} on ${platform || 'live chat'}
Viewer message: ${message}

Rules:
- Return ONLY valid JSON.
- Never invent a quote, source, event, statistic, or claim that is not supported by the supplied show context or by stable general knowledge.
- If the answer depends on current, disputed, private, or show-specific facts not in context, say you cannot verify that from the available stream context and invite the host to answer.
- Do not pretend to be the human host. Identify yourself naturally as the AI co-host only when needed.
- Keep public replies concise: usually one or two sentences, max 300 characters.
- Profanity by itself is not a reason to suppress a viewer. Distinguish criticism from targeted harassment, threats, hate, sexual exploitation, scams, and spam.
- Prefer answering direct questions, clarifying confusion, welcoming useful participation, or asking a relevant follow-up.
- Ignore low-value chatter rather than replying to everything.
- Never pressure viewers to donate or make purchases.

JSON schema:
{
  "action": "reply" | "suggest" | "ignore" | "flag",
  "reply": string | null,
  "confidence": number,
  "reason": string,
  "category": "question" | "engagement" | "moderation" | "other"
}
`;

const makeFallbackDecision = async ({ message, streamContext, recentChat, config }) => {
  const question = /\?|^(who|what|when|where|why|how|can|could|is|are|do|does|did|will|would)\b/i.test(
    message,
  );
  if (!question || !config.autoReplyQuestions) {
    return {
      action: 'ignore',
      reply: null,
      confidence: 0.55,
      reason: 'No strong reason to interrupt the conversation.',
      category: 'other',
    };
  }
  const fallback = await generateChatResponseWithAi(message, streamContext, recentChat);
  return {
    action: config.mode === 'suggest' ? 'suggest' : 'reply',
    reply: text(fallback?.message, 300),
    confidence: 0.65,
    reason: 'Direct viewer question.',
    category: 'question',
  };
};

const normalizeDecision = (raw, config) => {
  const action = ['reply', 'suggest', 'ignore', 'flag'].includes(String(raw?.action || ''))
    ? String(raw.action)
    : 'ignore';
  const reply = raw?.reply == null ? null : text(raw.reply, 300);
  const confidence = clamp(raw?.confidence, 0, 1, 0.5);
  return {
    action: action === 'reply' && config.mode === 'suggest' ? 'suggest' : action,
    reply: reply || null,
    confidence,
    reason: text(raw?.reason, 300),
    category: ['question', 'engagement', 'moderation', 'other'].includes(String(raw?.category || ''))
      ? String(raw.category)
      : 'other',
  };
};

router.get('/config', async (req, res, next) => {
  try {
    const record = await getUserByUid(req.auth.profile.uid);
    if (!record) return res.status(404).json({ message: 'User not found.' });
    const config = sanitizeConfig({ ...DEFAULT_CONFIG, ...(record.profile?.aiModerator || {}) });
    const usage = normalizeUsage(record);
    const limit = planLimit(record.profile?.subscription?.plan);
    res.json({
      config,
      usage: { ...usage, limit, remaining: Math.max(0, limit - usage.decisions) },
      available: limit > 0,
    });
  } catch (error) {
    next(error);
  }
});

router.put('/config', async (req, res, next) => {
  try {
    const record = await getUserByUid(req.auth.profile.uid);
    if (!record) return res.status(404).json({ message: 'User not found.' });
    const limit = planLimit(record.profile?.subscription?.plan);
    if (limit <= 0 && req.body?.enabled === true) {
      return res.status(403).json({ message: 'AI Co-Host is available on paid plans.' });
    }
    const config = sanitizeConfig({ ...DEFAULT_CONFIG, ...(record.profile?.aiModerator || {}), ...req.body });
    await saveCommercialProfile(record, { aiModerator: config });
    res.json({ config, available: limit > 0 });
  } catch (error) {
    next(error);
  }
});

router.post('/evaluate', async (req, res, next) => {
  try {
    const record = await getUserByUid(req.auth.profile.uid);
    if (!record) return res.status(404).json({ message: 'User not found.' });
    const config = sanitizeConfig({ ...DEFAULT_CONFIG, ...(record.profile?.aiModerator || {}) });
    const limit = planLimit(record.profile?.subscription?.plan);
    const usage = normalizeUsage(record);

    if (!config.enabled) {
      return res.json({ action: 'ignore', reply: null, confidence: 1, reason: 'AI Co-Host disabled.', category: 'other', usage: { ...usage, limit } });
    }
    if (limit <= 0) {
      return res.status(403).json({ message: 'AI Co-Host is available on paid plans.' });
    }
    if (usage.decisions >= limit) {
      return res.status(429).json({ message: 'AI Co-Host allowance reached for this billing period.', usage: { ...usage, limit } });
    }

    const message = text(req.body?.message, 1200);
    if (!message) return res.status(400).json({ message: 'message is required.' });

    const moderation = await moderateMessageWithAi(message);
    let decision;
    if (!moderation.isAppropriate) {
      decision = {
        action: 'flag',
        reply: null,
        confidence: 0.98,
        reason: text(moderation.reason, 300) || 'Message appears unsafe or spammy.',
        category: 'moderation',
      };
    } else {
      const viewerName = text(req.body?.viewerName, 80);
      const platform = text(req.body?.platform, 40);
      const streamContext = text(req.body?.streamContext, 5000);
      const transcript = text(req.body?.transcript, 5000);
      const recentChat = compactRecentChat(req.body?.recentChat);
      const prompt = buildModeratorPrompt({
        config,
        viewerName,
        platform,
        message,
        streamContext,
        recentChat,
        transcript,
      });
      const generated = await generateFreeformContent(prompt);
      const parsed = parseJsonObject(generated?.content);
      decision = parsed
        ? normalizeDecision(parsed, config)
        : await makeFallbackDecision({ message, streamContext, recentChat, config });
    }

    const nextUsage = {
      ...usage,
      decisions: usage.decisions + 1,
      replies: usage.replies + (decision.action === 'reply' || decision.action === 'suggest' ? 1 : 0),
    };
    await saveCommercialProfile(record, { aiModeratorUsage: nextUsage });

    res.json({
      ...decision,
      usage: { ...nextUsage, limit, remaining: Math.max(0, limit - nextUsage.decisions) },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/engage', async (req, res, next) => {
  try {
    const record = await getUserByUid(req.auth.profile.uid);
    if (!record) return res.status(404).json({ message: 'User not found.' });
    const config = sanitizeConfig({ ...DEFAULT_CONFIG, ...(record.profile?.aiModerator || {}) });
    const limit = planLimit(record.profile?.subscription?.plan);
    const usage = normalizeUsage(record);
    if (!config.enabled || !config.engageQuietChat) {
      return res.json({ message: null, reason: 'Proactive engagement disabled.' });
    }
    if (limit <= 0 || usage.decisions >= limit) {
      return res.status(429).json({ message: 'AI Co-Host allowance reached.' });
    }

    const streamContext = text(req.body?.streamContext, 5000);
    const recentChat = compactRecentChat(req.body?.recentChat);
    const transcript = text(req.body?.transcript, 5000);
    const prompt = `You are ChatScream AI Co-Host. Write ONE natural, useful audience engagement prompt for a quiet livestream chat. Tone: ${config.tone}. Stream context: ${streamContext}. Recent transcript: ${transcript}. Recent chat: ${recentChat.join(' | ') || '(none)'}. Creator instructions: ${config.hostInstructions || '(none)'}. Do not ask for money, likes, follows, or subscriptions. Ask a relevant question or invite a concrete reaction. Max 180 characters. Return only the message.`;
    const generated = await generateFreeformContent(prompt);
    const message = text(generated?.content, 180).replace(/^['"]|['"]$/g, '');
    const nextUsage = { ...usage, decisions: usage.decisions + 1, replies: usage.replies + (message ? 1 : 0) };
    await saveCommercialProfile(record, { aiModeratorUsage: nextUsage });
    res.json({ message: message || null, usage: { ...nextUsage, limit, remaining: Math.max(0, limit - nextUsage.decisions) } });
  } catch (error) {
    next(error);
  }
});

export { DEFAULT_CONFIG, PLAN_DECISION_LIMITS, sanitizeConfig };
export default router;
