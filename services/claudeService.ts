import {
  requestChatResponse,
  requestModeration,
  requestStreamMetadata,
  requestViralPackage,
} from './aiClient';

interface StreamMetadata {
  title: string;
  description: string;
}

export interface ViralStreamPackage {
  titles: string[];
  descriptions: string[];
  hashtags: string[];
  tags: string[];
}

interface ChatStreamResponse {
  message: string;
  suggestions?: string[];
}

const fallbackViralPackage = (topic: string): ViralStreamPackage => {
  const normalized = topic.trim();
  const slug = normalized.replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, '');
  const baseHashtag = slug ? `#${slug}` : '#Live';

  return {
    titles: [
      `Live: ${normalized}`.slice(0, 60),
      `Let’s talk ${normalized}`.slice(0, 60),
      `${normalized} (Live Q&A)`.slice(0, 60),
    ],
    descriptions: [
      `Going live on ${normalized}. Ask questions, share your takes, and hang out. ${baseHashtag}`.slice(
        0,
        220,
      ),
      `Streaming ${normalized} right now—tips, demos, and chat. Drop in and say hi! ${baseHashtag}`.slice(
        0,
        220,
      ),
    ],
    hashtags: [
      baseHashtag,
      '#Live',
      '#Streaming',
      '#Creator',
      '#Community',
      '#Tutorial',
      '#QandA',
      '#BehindTheScenes',
      '#ContentCreator',
      '#Tech',
      '#Gaming',
      '#Podcast',
    ].slice(0, 12),
    tags: [
      normalized,
      'live stream',
      'streaming',
      'creator',
      'community',
      'how to',
      'tips',
      'tutorial',
      'q&a',
      'behind the scenes',
      'discussion',
      'highlights',
      'chat',
      'studio',
      'multistream',
    ].slice(0, 15),
  };
};

const requireAuthToken = (authToken: string | null): string => {
  if (!authToken) {
    throw new Error('Authentication is required to use AI features.');
  }
  return authToken;
};

export async function generateStreamMetadata(
  topic: string,
  authToken: string | null,
): Promise<StreamMetadata> {
  const token = requireAuthToken(authToken);
  try {
    const response = await requestStreamMetadata(token, topic);
    return {
      title: response.title || `Live: ${topic}`,
      description: response.description || `Join us for an exciting stream about ${topic}!`,
    };
  } catch (error) {
    console.error('Failed to fetch stream metadata from backend:', error);
    return {
      title: `Live: ${topic} Stream`,
      description: `Join us for an amazing live stream about ${topic}! Don't miss out on the excitement.`,
    };
  }
}

export async function generateViralStreamPackage(
  topic: string,
  authToken: string | null,
  platforms: string[] = ['youtube', 'twitch', 'facebook', 'tiktok', 'instagram'],
): Promise<ViralStreamPackage> {
  const token = requireAuthToken(authToken);
  try {
    const response = await requestViralPackage(token, topic, platforms);
    const normalized = fallbackViralPackage(topic);
    return {
      titles: response.titles?.length ? response.titles.slice(0, 3) : normalized.titles,
      descriptions: response.descriptions?.length
        ? response.descriptions.slice(0, 2)
        : normalized.descriptions,
      hashtags: response.hashtags?.length ? response.hashtags.slice(0, 12) : normalized.hashtags,
      tags: response.tags?.length ? response.tags.slice(0, 15) : normalized.tags,
    };
  } catch (error) {
    console.error('Failed to generate viral package via backend:', error);
    return fallbackViralPackage(topic);
  }
}

export async function generateChatResponse(
  viewerMessage: string,
  streamContext: string,
  previousMessages: string[] = [],
  authToken: string | null,
): Promise<ChatStreamResponse> {
  const token = requireAuthToken(authToken);
  try {
    const response = await requestChatResponse(
      token,
      viewerMessage,
      streamContext,
      previousMessages,
    );
    return {
      message:
        response.message ||
        'Thanks for being here! Feel free to ask any questions about the stream.',
      suggestions: response.suggestions,
    };
  } catch (error) {
    console.error('Failed to generate chat response via backend:', error);
    return { message: 'Thanks for being here! Feel free to ask any questions about the stream.' };
  }
}

export async function moderateMessage(
  message: string,
  authToken: string | null,
): Promise<{
  isAppropriate: boolean;
  reason?: string;
}> {
  const token = requireAuthToken(authToken);
  try {
    const result = await requestModeration(token, message);
    return { isAppropriate: result.isAppropriate, reason: result.reason || undefined };
  } catch (error) {
    console.error('Moderation request failed:', error);
    return { isAppropriate: true };
  }
}

export async function generateContentSuggestions(
  topic: string,
  audienceType: string = 'general',
): Promise<string[]> {
  console.warn('generateContentSuggestions fallback used; backend endpoint not implemented.');
  return [
    `Introduction to ${topic}`,
    `Common questions about ${topic}`,
    `Tips and tricks for ${topic}`,
    `Q&A session about ${topic}`,
    `Future of ${topic}`,
  ];
}

export interface AdvancedModerationResult {
  isAllowed: boolean;
  toxicityScore: number;
  categories: ('spam' | 'harassment' | 'hate' | 'nsfw' | 'violence')[];
  suggestedAction: 'allow' | 'warn' | 'delete' | 'timeout';
  reason?: string;
  autoResponse?: string;
}

export interface ContentAnalysis {
  sentiment: 'positive' | 'neutral' | 'negative';
  topics: string[];
  engagementSuggestions: string[];
  warnings: string[];
  audienceMood: string;
}

export interface VoiceConfig {
  voiceId: string;
  rate: number;
  pitch: number;
  volume: number;
}

export async function advancedModerateMessage(
  message: string,
  context?: { streamerName?: string; recentMessages?: string[] },
): Promise<AdvancedModerationResult> {
  console.warn('advancedModerateMessage fallback used; backend endpoint not implemented.');
  return {
    isAllowed: true,
    toxicityScore: 0,
    categories: [],
    suggestedAction: 'allow',
    reason: context?.streamerName ? `No issues detected for ${context.streamerName}` : undefined,
  };
}

export async function analyzeStreamContent(
  recentChat: string[],
  streamTitle: string,
  streamTopic?: string,
): Promise<ContentAnalysis> {
  console.warn('analyzeStreamContent fallback used; backend endpoint not implemented.');
  return {
    sentiment: 'neutral',
    topics: [],
    engagementSuggestions: ['Ask the audience a question', 'Respond to recent comments'],
    warnings: [],
    audienceMood: 'Unable to analyze',
  };
}

export async function generateAutoResponse(
  question: string,
  streamContext: string,
  faqData?: Record<string, string>,
): Promise<string | null> {
  if (faqData) {
    const lowerQuestion = question.toLowerCase();
    for (const [key, value] of Object.entries(faqData)) {
      if (lowerQuestion.includes(key.toLowerCase())) {
        return value;
      }
    }
  }

  return `Thanks for asking about ${streamContext}. We'll cover that soon!`;
}

export function getAvailableVoices(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    return [];
  }
  return speechSynthesis.getVoices().filter((voice) => voice.lang.startsWith('en'));
}

export async function speakDonationMessage(
  message: string,
  config?: Partial<VoiceConfig>,
): Promise<void> {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    console.warn('Speech synthesis not available');
    return;
  }

  return new Promise((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(message);

    utterance.rate = config?.rate ?? 1.0;
    utterance.pitch = config?.pitch ?? 1.0;
    utterance.volume = config?.volume ?? 1.0;

    if (config?.voiceId) {
      const voices = speechSynthesis.getVoices();
      const selectedVoice = voices.find((v) => v.voiceURI === config.voiceId);
      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }
    }

    utterance.onend = () => resolve();
    utterance.onerror = (e) => reject(e);

    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
  });
}

export function preloadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    return Promise.resolve([]);
  }

  return new Promise((resolve) => {
    const voices = speechSynthesis.getVoices();
    if (voices.length > 0) {
      resolve(voices);
      return;
    }

    speechSynthesis.onvoiceschanged = () => {
      resolve(speechSynthesis.getVoices());
    };

    setTimeout(() => resolve(speechSynthesis.getVoices()), 1000);
  });
}

export async function generateEngagementPrompt(
  streamTopic: string,
  streamDurationMinutes: number,
  viewerCount?: number,
): Promise<string> {
  const prompts = [
    'What brought you to the stream today?',
    "Drop a like if you're enjoying the content!",
    "Any questions so far? I'd love to hear them!",
    'Where are you watching from?',
    'What topic should we cover next?',
  ];

  const prefix = streamTopic ? `${streamTopic}: ` : '';
  const audienceHint = viewerCount ? `${viewerCount} viewers` : 'the stream';
  return `${prefix}${prompts[Math.floor(Math.random() * prompts.length)]} (${audienceHint})`;
}
