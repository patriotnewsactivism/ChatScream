/**
 * AI service — DeepSeek V4 Flash (primary) with Gemini fallback.
 *
 * DeepSeek V4 Flash: $0.14/M input tokens, $0.28/M output tokens
 * OpenAI-compatible API at https://api.deepseek.com
 *
 * Env vars:
 *   DEEPSEEK_API_KEY   — DeepSeek API key (primary)
 *   GEMINI_API_KEY     — fallback if DeepSeek not configured
 *   GEMINI_MODEL       — override Gemini model (default: gemini-2.5-flash)
 */

import { GoogleGenAI, Type } from '@google/genai';

const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash';
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

// ── Client factories ───────────────────────────────────────────────────────────

const getDeepSeekKey = () => String(process.env.DEEPSEEK_API_KEY || '').trim();
const getGeminiKey  = () => String(process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '').trim();

const hasDeepSeek = () => getDeepSeekKey().length > 10;
const hasGemini   = () => getGeminiKey().length > 10;

const createGeminiClient = () => {
  const apiKey = getGeminiKey();
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
};

// ── DeepSeek fetch helper (OpenAI-compatible) ─────────────────────────────────

const deepSeekChat = async (messages, { temperature = 0.7, jsonMode = false } = {}) => {
  const key = getDeepSeekKey();
  if (!key) throw new Error('DEEPSEEK_API_KEY not set');

  const body = {
    model: DEEPSEEK_MODEL,
    messages,
    temperature,
    max_tokens: 4096,
    ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
  };

  const res = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`DeepSeek API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
};

// ── Generic text generation (DeepSeek first, Gemini fallback) ─────────────────

const generateText = async (prompt, opts = {}) => {
  if (hasDeepSeek()) {
    try {
      return await deepSeekChat([{ role: 'user', content: prompt }], opts);
    } catch (err) {
      console.warn('[AI] DeepSeek failed, falling back to Gemini:', err.message);
    }
  }
  if (hasGemini()) {
    const client = createGeminiClient();
    const response = await client.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
    });
    return response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }
  throw new Error('No AI provider configured. Set DEEPSEEK_API_KEY or GEMINI_API_KEY.');
};

// ── JSON generation helper ────────────────────────────────────────────────────

const generateJson = async (schema, prompt) => {
  // Try DeepSeek JSON mode first
  if (hasDeepSeek()) {
    try {
      const systemPrompt = `You are a JSON-only assistant. Respond ONLY with valid JSON matching this schema: ${JSON.stringify(schema)}. No markdown, no explanation.`;
      const text = await deepSeekChat(
        [{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }],
        { temperature: 0.4, jsonMode: true },
      );
      return JSON.parse(text);
    } catch (err) {
      console.warn('[AI] DeepSeek JSON failed, falling back to Gemini:', err.message);
    }
  }
  // Gemini fallback
  if (hasGemini()) {
    const client = createGeminiClient();
    const response = await client.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: schema,
        temperature: 0.4,
      },
    });
    const text = (response.text || '').trim();
    return text ? JSON.parse(text) : null;
  }
  return null;
};

// ── Utility helpers ───────────────────────────────────────────────────────────

const normalizeText = (value, fallback = '') => {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
};

const dedupe = (items, limit) => {
  const seen = new Set();
  return items.filter((item) => {
    const normalized = normalizeText(item).toLowerCase();
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  }).slice(0, limit);
};

const STOP_WORDS = new Set([
  'the','and','for','that','with','this','from','have','your','about','just','into','been','they','them','their','there','what','when','where','will','would','could','should','here','also','than','then','were','because','while','after','before','over','under','more','some','such','only','very','much','many','like','really','still','getting','using','used','into','onto','across','between','without','within','case','stream','chat','title','topic'
]);

export const extractTopics = (messages, fallbackTopic = '') => {
  const counts = new Map();
  const seed = normalizeText(fallbackTopic).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  [...messages.flatMap((m) => normalizeText(m).toLowerCase().split(/[^\p{L}\p{N}]+/u)), ...seed]
    .filter((w) => w.length > 3 && !STOP_WORDS.has(w))
    .forEach((w) => counts.set(w, (counts.get(w) || 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 6).map(([w]) => w);
};

const scoreSentiment = (messages) => {
  const pos = ['great','love','helpful','amazing','good','thanks','awesome','excellent'];
  const neg = ['bad','hate','broken','confusing','slow','terrible','angry','awful'];
  let score = 0;
  for (const m of messages) {
    const l = normalizeText(m).toLowerCase();
    pos.forEach((w) => { if (l.includes(w)) score += 1; });
    neg.forEach((w) => { if (l.includes(w)) score -= 1; });
  }
  if (score >= 2) return 'positive';
  if (score <= -2) return 'negative';
  return 'neutral';
};

// ── Fallback builders (no AI needed) ─────────────────────────────────────────

export const buildFallbackMetadata = (topic) => ({
  title: normalizeText(topic, 'New Live Stream').slice(0, 90),
  description: `Join the live stream for focused coverage of ${normalizeText(topic, "today's topic")}.`.slice(0, 220),
});

export const buildFallbackViralPackage = (topic, platforms = []) => {
  const t = normalizeText(topic, 'Live update');
  const tag = `#${t.replace(/[^\p{L}\p{N}]+/gu, '') || 'LiveUpdate'}`;
  const hint = platforms.length ? `Optimized for ${platforms.join(', ')}` : 'Optimized for multistream';
  return {
    titles: dedupe([`${t}: what matters most today`, `${t} explained live`, `Live breakdown: ${t}`], 3),
    descriptions: dedupe([`${hint}. Join the live breakdown on ${t}.`, `Live now: context and receipts on ${t}.`], 2),
    hashtags: dedupe([tag, '#Live', '#Analysis', '#BreakingDownTheFacts', '#Community'], 12),
    tags: dedupe([t, 'live analysis', 'commentary', 'community q&a', 'breaking news'], 15),
  };
};

export const buildFallbackModeration = (message) => {
  const lower = normalizeText(message).toLowerCase();
  const blocked = [/(kill|murder|shoot)\s+(you|them|him|her)/, /buy followers/, /free money/];
  return {
    isAppropriate: !blocked.find((p) => p.test(lower)),
    reason: blocked.find((p) => p.test(lower)) ? 'Message appears unsafe or spammy.' : null,
  };
};

export const buildFallbackChatResponse = (viewerMessage, streamContext, previousMessages = []) => {
  const ctx = normalizeText(streamContext, 'the current topic');
  const last = normalizeText(previousMessages.at(-1));
  return {
    message: [`Thanks for the question about ${ctx}.`, last ? `Building on chat: ${last}.` : '', `Short answer: ${normalizeText(viewerMessage, 'that point')} matters in context.`].filter(Boolean).join(' '),
    suggestions: ['Ask for the source document', 'Request a short timeline recap', 'Drop your biggest follow-up question'],
  };
};

export const buildFallbackContentAnalysis = (recentChat, streamTitle, streamTopic = '') => {
  const messages = recentChat.map((m) => normalizeText(m)).filter(Boolean);
  const topics = extractTopics(messages, `${streamTitle} ${streamTopic}`);
  const sentiment = scoreSentiment(messages);
  const qCount = messages.filter((m) => m.includes('?')).length;
  const warnings = [];
  if (messages.length < 3) warnings.push('Not enough recent chat volume for a confident read.');
  if (qCount >= Math.ceil(Math.max(messages.length, 1) / 2)) warnings.push('Audience is asking many questions; answer them before introducing a new topic.');
  const mood = sentiment === 'positive' ? 'Engaged and receptive' : sentiment === 'negative' ? 'Skeptical or frustrated' : 'Curious and waiting for more context';
  return { sentiment, topics, engagementSuggestions: dedupe([qCount > 0 ? 'Answer the strongest audience question on-screen next.' : '', topics[0] ? `Give a 30-second recap focused on ${topics[0]}.` : 'Offer a short recap before moving on.', 'Summarize the evidence, then invite one concrete follow-up from chat.'], 3), warnings, audienceMood: mood };
};

// ── Exported AI functions ─────────────────────────────────────────────────────

export const generateStreamMetadataWithAi = async (topic) => {
  const fallback = buildFallbackMetadata(topic);
  const schema = { type: Type.OBJECT, properties: { title: { type: Type.STRING }, description: { type: Type.STRING } }, required: ['title', 'description'] };
  try {
    const result = await generateJson(schema, `Generate a compelling livestream title (max 90 chars) and description (max 220 chars) for: ${normalizeText(topic)}. Be accurate, not hypey.`);
    return { title: normalizeText(result?.title, fallback.title).slice(0, 90), description: normalizeText(result?.description, fallback.description).slice(0, 220) };
  } catch { return fallback; }
};

export const generateViralPackageWithAi = async (topic, platforms = []) => {
  const fallback = buildFallbackViralPackage(topic, platforms);
  const schema = { type: Type.OBJECT, properties: { titles: { type: Type.ARRAY, items: { type: Type.STRING } }, descriptions: { type: Type.ARRAY, items: { type: Type.STRING } }, hashtags: { type: Type.ARRAY, items: { type: Type.STRING } }, tags: { type: Type.ARRAY, items: { type: Type.STRING } } }, required: ['titles','descriptions','hashtags','tags'] };
  try {
    const result = await generateJson(schema, `Create social-ready livestream packaging for topic: ${normalizeText(topic)}. Platforms: ${platforms.join(', ') || 'multistream'}. Prioritize clarity over clickbait.`);
    return { titles: dedupe(result?.titles || fallback.titles, 3), descriptions: dedupe(result?.descriptions || fallback.descriptions, 2), hashtags: dedupe(result?.hashtags || fallback.hashtags, 12), tags: dedupe(result?.tags || fallback.tags, 15) };
  } catch { return fallback; }
};

export const moderateMessageWithAi = async (message) => {
  const fallback = buildFallbackModeration(message);
  const schema = { type: Type.OBJECT, properties: { isAppropriate: { type: Type.BOOLEAN }, reason: { type: Type.STRING } }, required: ['isAppropriate', 'reason'] };
  try {
    const result = await generateJson(schema, `Moderate this livestream chat message. Mark unsafe if threats, harassment, hate, CSAM, or spam. Message: ${normalizeText(message)}`);
    return { isAppropriate: Boolean(result?.isAppropriate), reason: normalizeText(result?.reason, fallback.reason) };
  } catch { return fallback; }
};

export const generateChatResponseWithAi = async (viewerMessage, streamContext, previousMessages = []) => {
  const fallback = buildFallbackChatResponse(viewerMessage, streamContext, previousMessages);
  const schema = { type: Type.OBJECT, properties: { message: { type: Type.STRING }, suggestions: { type: Type.ARRAY, items: { type: Type.STRING } } }, required: ['message', 'suggestions'] };
  try {
    const result = await generateJson(schema, `You assist a livestream host. Viewer: ${normalizeText(viewerMessage)}. Context: ${normalizeText(streamContext)}. Recent chat: ${previousMessages.join(' | ')}. Respond in 2-4 sentences, grounded and useful.`);
    return { message: normalizeText(result?.message, fallback.message), suggestions: dedupe(result?.suggestions || fallback.suggestions, 3) };
  } catch { return fallback; }
};

export const analyzeStreamContentWithAi = async (recentChat, streamTitle, streamTopic = '') => {
  const fallback = buildFallbackContentAnalysis(recentChat, streamTitle, streamTopic);
  const schema = { type: Type.OBJECT, properties: { sentiment: { type: Type.STRING }, topics: { type: Type.ARRAY, items: { type: Type.STRING } }, engagementSuggestions: { type: Type.ARRAY, items: { type: Type.STRING } }, warnings: { type: Type.ARRAY, items: { type: Type.STRING } }, audienceMood: { type: Type.STRING } }, required: ['sentiment','topics','engagementSuggestions','warnings','audienceMood'] };
  try {
    const result = await generateJson(schema, `Analyze this livestream audience. Title: ${normalizeText(streamTitle)}. Topic: ${normalizeText(streamTopic)}. Chat: ${recentChat.map((m) => normalizeText(m)).filter(Boolean).join(' | ')}. Give a producer-oriented assessment.`);
    const sentiment = ['positive','neutral','negative'].includes(result?.sentiment) ? result.sentiment : fallback.sentiment;
    return { sentiment, topics: dedupe(result?.topics || fallback.topics, 6), engagementSuggestions: dedupe(result?.engagementSuggestions || fallback.engagementSuggestions, 3), warnings: dedupe(result?.warnings || fallback.warnings, 3), audienceMood: normalizeText(result?.audienceMood, fallback.audienceMood) };
  } catch { return fallback; }
};

export const generateFreeformContent = async (prompt) => {
  try {
    const content = await generateText(prompt);
    return { content, error: null };
  } catch (err) {
    return { error: err.message, content: null };
  }
};
