import { GoogleGenAI, Type } from '@google/genai';

const MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const createGeminiClient = () => {
  const apiKey = String(process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '').trim();
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
};

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
  const seed = normalizeText(fallbackTopic)
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

  [...messages.flatMap((message) => normalizeText(message).toLowerCase().split(/[^\p{L}\p{N}]+/u)), ...seed]
    .filter((word) => word.length > 3 && !STOP_WORDS.has(word))
    .forEach((word) => counts.set(word, (counts.get(word) || 0) + 1));

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 6)
    .map(([word]) => word);
};

const scoreSentiment = (messages) => {
  const positiveWords = ['great', 'love', 'helpful', 'amazing', 'good', 'thanks', 'awesome', 'excellent'];
  const negativeWords = ['bad', 'hate', 'broken', 'confusing', 'slow', 'terrible', 'angry', 'awful'];

  let score = 0;
  for (const message of messages) {
    const lower = normalizeText(message).toLowerCase();
    positiveWords.forEach((word) => {
      if (lower.includes(word)) score += 1;
    });
    negativeWords.forEach((word) => {
      if (lower.includes(word)) score -= 1;
    });
  }

  if (score >= 2) return 'positive';
  if (score <= -2) return 'negative';
  return 'neutral';
};

export const buildFallbackMetadata = (topic) => ({
  title: normalizeText(topic, 'New Live Stream').slice(0, 90),
  description: `Join the live stream for focused coverage of ${normalizeText(topic, 'today\'s topic')}.`.slice(0, 220),
});

export const buildFallbackViralPackage = (topic, platforms = []) => {
  const normalizedTopic = normalizeText(topic, 'Live update');
  const baseTag = `#${normalizedTopic.replace(/[^\p{L}\p{N}]+/gu, '') || 'LiveUpdate'}`;
  const platformHint = platforms.length ? `Optimized for ${platforms.join(', ')}` : 'Optimized for multistream';

  return {
    titles: dedupe([
      `${normalizedTopic}: what matters most today`,
      `${normalizedTopic} explained live`,
      `Live breakdown: ${normalizedTopic}`,
    ], 3),
    descriptions: dedupe([
      `${platformHint}. Join the live breakdown, key takeaways, and audience Q&A on ${normalizedTopic}.`,
      `Live now: context, receipts, and next steps on ${normalizedTopic}. Bring your questions.`,
    ], 2),
    hashtags: dedupe([baseTag, '#Live', '#Analysis', '#BreakingDownTheFacts', '#Community'], 12),
    tags: dedupe([normalizedTopic, 'live analysis', 'commentary', 'community q&a', 'breaking news'], 15),
  };
};

export const buildFallbackModeration = (message) => {
  const lower = normalizeText(message).toLowerCase();
  const blockedPatterns = [/(kill|murder|shoot)\s+(you|them|him|her)/, /slur/, /buy followers/, /free money/];
  const matched = blockedPatterns.find((pattern) => pattern.test(lower));

  if (matched) {
    return {
      isAppropriate: false,
      reason: 'Message appears unsafe, abusive, or spammy.',
    };
  }

  return {
    isAppropriate: true,
    reason: null,
  };
};

export const buildFallbackChatResponse = (viewerMessage, streamContext, previousMessages = []) => {
  const trimmedContext = normalizeText(streamContext, 'the current topic');
  const lastPoint = normalizeText(previousMessages.at(-1));
  const responseParts = [
    `Thanks for the question about ${trimmedContext}.`,
    lastPoint ? `Building on chat: ${lastPoint}.` : '',
    `Short answer: ${normalizeText(viewerMessage, 'that point')} matters because it affects the bigger picture we're tracking live.`,
  ].filter(Boolean);

  return {
    message: responseParts.join(' '),
    suggestions: dedupe([
      'Ask for the source document',
      'Request a short timeline recap',
      'Drop your biggest follow-up question',
    ], 3),
  };
};

export const buildFallbackContentAnalysis = (recentChat, streamTitle, streamTopic = '') => {
  const messages = recentChat.map((message) => normalizeText(message)).filter(Boolean);
  const topics = extractTopics(messages, `${streamTitle} ${streamTopic}`);
  const sentiment = scoreSentiment(messages);
  const questionCount = messages.filter((message) => message.includes('?')).length;
  const warnings = [];

  if (messages.length < 3) warnings.push('Not enough recent chat volume for a confident read.');
  if (questionCount >= Math.ceil(Math.max(messages.length, 1) / 2)) {
    warnings.push('Audience is asking many questions; answer them before introducing a new topic.');
  }

  const audienceMood =
    sentiment === 'positive'
      ? 'Engaged and receptive'
      : sentiment === 'negative'
        ? 'Skeptical or frustrated'
        : 'Curious and waiting for more context';

  return {
    sentiment,
    topics,
    engagementSuggestions: dedupe([
      questionCount > 0 ? 'Answer the strongest audience question on-screen next.' : '',
      topics[0] ? `Give a 30-second recap focused on ${topics[0]}.` : 'Offer a short recap before moving on.',
      'Summarize the evidence, then invite one concrete follow-up from chat.',
    ], 3),
    warnings,
    audienceMood,
  };
};

const generateStructuredJson = async (schema, prompt) => {
  const client = createGeminiClient();
  if (!client) return null;

  const response = await client.models.generateContent({
    model: MODEL_NAME,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: schema,
      temperature: 0.4,
    },
  });

  const text = normalizeText(response.text);
  return text ? JSON.parse(text) : null;
};

export const generateStreamMetadataWithAi = async (topic) => {
  const fallback = buildFallbackMetadata(topic);
  const schema = {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING },
      description: { type: Type.STRING },
    },
    required: ['title', 'description'],
  };

  try {
    const result = await generateStructuredJson(
      schema,
      `Generate an accurate, compelling livestream title and description for the topic: ${normalizeText(topic)}. Avoid hype without substance. Keep the title under 90 characters and the description under 220 characters.`,
    );
    return {
      title: normalizeText(result?.title, fallback.title).slice(0, 90),
      description: normalizeText(result?.description, fallback.description).slice(0, 220),
    };
  } catch {
    return fallback;
  }
};

export const generateViralPackageWithAi = async (topic, platforms = []) => {
  const fallback = buildFallbackViralPackage(topic, platforms);
  const schema = {
    type: Type.OBJECT,
    properties: {
      titles: { type: Type.ARRAY, items: { type: Type.STRING } },
      descriptions: { type: Type.ARRAY, items: { type: Type.STRING } },
      hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
      tags: { type: Type.ARRAY, items: { type: Type.STRING } },
    },
    required: ['titles', 'descriptions', 'hashtags', 'tags'],
  };

  try {
    const result = await generateStructuredJson(
      schema,
      `Create social-ready livestream packaging for topic ${normalizeText(topic)}. Platforms: ${platforms.join(', ') || 'multistream'}. Prioritize clarity, retention, and truthful positioning over clickbait.`,
    );
    return {
      titles: dedupe(result?.titles || fallback.titles, 3),
      descriptions: dedupe(result?.descriptions || fallback.descriptions, 2),
      hashtags: dedupe(result?.hashtags || fallback.hashtags, 12),
      tags: dedupe(result?.tags || fallback.tags, 15),
    };
  } catch {
    return fallback;
  }
};

export const moderateMessageWithAi = async (message) => {
  const fallback = buildFallbackModeration(message);
  const schema = {
    type: Type.OBJECT,
    properties: {
      isAppropriate: { type: Type.BOOLEAN },
      reason: { type: Type.STRING },
    },
    required: ['isAppropriate', 'reason'],
  };

  try {
    const result = await generateStructuredJson(
      schema,
      `Moderate this livestream chat message for safety. Message: ${normalizeText(message)}. Mark unsafe if it contains threats, targeted harassment, hate, sexual content involving minors, or spam.`,
    );
    return {
      isAppropriate: Boolean(result?.isAppropriate),
      reason: normalizeText(result?.reason, fallback.reason),
    };
  } catch {
    return fallback;
  }
};

export const generateChatResponseWithAi = async (viewerMessage, streamContext, previousMessages = []) => {
  const fallback = buildFallbackChatResponse(viewerMessage, streamContext, previousMessages);
  const schema = {
    type: Type.OBJECT,
    properties: {
      message: { type: Type.STRING },
      suggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
    },
    required: ['message', 'suggestions'],
  };

  try {
    const result = await generateStructuredJson(
      schema,
      `You are assisting a livestream host. Viewer message: ${normalizeText(viewerMessage)}. Stream context: ${normalizeText(streamContext)}. Recent messages: ${previousMessages.join(' | ')}. Respond in 2-4 sentences, grounded and useful.`,
    );
    return {
      message: normalizeText(result?.message, fallback.message),
      suggestions: dedupe(result?.suggestions || fallback.suggestions, 3),
    };
  } catch {
    return fallback;
  }
};

export const analyzeStreamContentWithAi = async (recentChat, streamTitle, streamTopic = '') => {
  const fallback = buildFallbackContentAnalysis(recentChat, streamTitle, streamTopic);
  const schema = {
    type: Type.OBJECT,
    properties: {
      sentiment: { type: Type.STRING },
      topics: { type: Type.ARRAY, items: { type: Type.STRING } },
      engagementSuggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
      warnings: { type: Type.ARRAY, items: { type: Type.STRING } },
      audienceMood: { type: Type.STRING },
    },
    required: ['sentiment', 'topics', 'engagementSuggestions', 'warnings', 'audienceMood'],
  };

  try {
    const result = await generateStructuredJson(
      schema,
      `Analyze this livestream audience. Title: ${normalizeText(streamTitle)}. Topic: ${normalizeText(streamTopic)}. Recent chat: ${recentChat.map((item) => normalizeText(item)).filter(Boolean).join(' | ')}. Return a concise producer-oriented assessment that helps improve retention and responsiveness.`,
    );
    const normalizedSentiment = ['positive', 'neutral', 'negative'].includes(result?.sentiment)
      ? result.sentiment
      : fallback.sentiment;
    return {
      sentiment: normalizedSentiment,
      topics: dedupe(result?.topics || fallback.topics, 6),
      engagementSuggestions: dedupe(result?.engagementSuggestions || fallback.engagementSuggestions, 3),
      warnings: dedupe(result?.warnings || fallback.warnings, 3),
      audienceMood: normalizeText(result?.audienceMood, fallback.audienceMood),
    };
  } catch {
    return fallback;
  }
};
