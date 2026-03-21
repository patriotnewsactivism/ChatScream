import { GoogleGenAI, Type } from '@google/genai';

const MODEL_NAME = process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash';

const getApiKey = () =>
  String(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();

const getClient = () => {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('AI server configuration is incomplete. Add GEMINI_API_KEY or GOOGLE_API_KEY.');
  }
  return new GoogleGenAI({ apiKey });
};

const safeString = (value, fallback = '') => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || fallback;
};

const sanitizeList = (value, maxItems, fallback = []) => {
  if (!Array.isArray(value)) return fallback;
  const items = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
  return items.slice(0, maxItems);
};

const parseJsonText = (text) => {
  if (!text) {
    throw new Error('AI provider returned an empty response.');
  }
  return JSON.parse(text);
};

const generateStructuredContent = async ({ instruction, schema }) => {
  const client = getClient();
  const response = await client.models.generateContent({
    model: MODEL_NAME,
    contents: instruction,
    config: {
      responseMimeType: 'application/json',
      responseSchema: schema,
      temperature: 0.4,
    },
  });

  return parseJsonText(response.text);
};

export const generateStreamMetadataWithAi = async (topic) => {
  const safeTopic = safeString(topic, 'live stream');
  const payload = await generateStructuredContent({
    instruction:
      `You are an expert livestream producer. Generate a strong livestream title and description for this topic: ${safeTopic}. ` +
      'Keep the title under 90 characters, the description under 220 characters, avoid clickbait that could violate platform policies, and make it specific and useful.',
    schema: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        description: { type: Type.STRING },
      },
      required: ['title', 'description'],
    },
  });

  return {
    title: safeString(payload?.title, `Live: ${safeTopic}`).slice(0, 90),
    description: safeString(payload?.description, `Join us live for ${safeTopic}.`).slice(0, 220),
  };
};

export const generateViralPackageWithAi = async (topic, platforms = []) => {
  const safeTopic = safeString(topic, 'live stream');
  const safePlatforms = sanitizeList(platforms, 8, ['youtube', 'twitch']);
  const payload = await generateStructuredContent({
    instruction:
      `You are a growth strategist for livestream creators. Build a launch package for this topic: ${safeTopic}. ` +
      `Optimize for these platforms: ${safePlatforms.join(', ') || 'youtube, twitch'}. ` +
      'Return 3 titles, 2 descriptions, up to 12 hashtags, and up to 15 tags. Be concrete, compelling, and platform-safe.',
    schema: {
      type: Type.OBJECT,
      properties: {
        titles: { type: Type.ARRAY, items: { type: Type.STRING } },
        descriptions: { type: Type.ARRAY, items: { type: Type.STRING } },
        hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
        tags: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: ['titles', 'descriptions', 'hashtags', 'tags'],
    },
  });

  return {
    titles: sanitizeList(payload?.titles, 3),
    descriptions: sanitizeList(payload?.descriptions, 2),
    hashtags: sanitizeList(payload?.hashtags, 12),
    tags: sanitizeList(payload?.tags, 15),
  };
};

export const moderateChatMessageWithAi = async (message) => {
  const safeMessage = safeString(message);
  const payload = await generateStructuredContent({
    instruction:
      `Classify this livestream chat message for moderation: ${safeMessage}. ` +
      'Detect harassment, hate, threats, sexual content, self-harm, spam, or doxxing. Return whether it is appropriate and a brief reason.',
    schema: {
      type: Type.OBJECT,
      properties: {
        isAppropriate: { type: Type.BOOLEAN },
        reason: { type: Type.STRING },
      },
      required: ['isAppropriate', 'reason'],
    },
  });

  return {
    isAppropriate: Boolean(payload?.isAppropriate),
    reason: safeString(payload?.reason),
  };
};

export const generateChatResponseWithAi = async ({ viewerMessage, streamContext, previousMessages = [] }) => {
  const safeViewerMessage = safeString(viewerMessage);
  const safeStreamContext = safeString(streamContext, 'the current livestream');
  const safePreviousMessages = sanitizeList(previousMessages, 8);

  const payload = await generateStructuredContent({
    instruction:
      `You are a streamer assistant. Reply to the viewer message in a warm, concise, audience-friendly tone. ` +
      `Stream context: ${safeStreamContext}. Viewer message: ${safeViewerMessage}. ` +
      `Recent messages: ${safePreviousMessages.join(' | ') || 'none'}. ` +
      'Return one short response and 3 follow-up suggestion prompts for the streamer.',
    schema: {
      type: Type.OBJECT,
      properties: {
        message: { type: Type.STRING },
        suggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: ['message', 'suggestions'],
    },
  });

  return {
    message: safeString(payload?.message, 'Thanks for being here!'),
    suggestions: sanitizeList(payload?.suggestions, 3),
  };
};

export const analyzeStreamContentWithAi = async ({ recentChat = [], streamTitle = '', streamTopic = '' }) => {
  const safeRecentChat = sanitizeList(recentChat, 20);
  const payload = await generateStructuredContent({
    instruction:
      'You are analyzing livestream audience feedback. ' +
      `Stream title: ${safeString(streamTitle, 'Untitled stream')}. ` +
      `Stream topic: ${safeString(streamTopic, 'general')}. ` +
      `Recent chat: ${safeRecentChat.join(' | ') || 'none'}. ` +
      'Return sentiment, top topics, engagement suggestions, any warnings, and a concise audience mood summary. Focus on actionable recommendations.',
    schema: {
      type: Type.OBJECT,
      properties: {
        sentiment: { type: Type.STRING, enum: ['positive', 'neutral', 'negative'] },
        topics: { type: Type.ARRAY, items: { type: Type.STRING } },
        engagementSuggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
        warnings: { type: Type.ARRAY, items: { type: Type.STRING } },
        audienceMood: { type: Type.STRING },
      },
      required: ['sentiment', 'topics', 'engagementSuggestions', 'warnings', 'audienceMood'],
    },
  });

  return {
    sentiment: ['positive', 'neutral', 'negative'].includes(payload?.sentiment)
      ? payload.sentiment
      : 'neutral',
    topics: sanitizeList(payload?.topics, 8),
    engagementSuggestions: sanitizeList(payload?.engagementSuggestions, 5),
    warnings: sanitizeList(payload?.warnings, 5),
    audienceMood: safeString(payload?.audienceMood, 'Mixed audience response.'),
  };
};

export const __testUtils = { safeString, sanitizeList, parseJsonText };
