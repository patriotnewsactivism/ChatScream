import { clientEnv } from './env';

// Claude AI Service - Replacing Gemini/Amazon
// Uses Anthropic's Claude API for AI features

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

// Claude API configuration
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_API_KEY = clientEnv.VITE_CLAUDE_API_KEY || '';

// Helper function to call Claude API
async function callClaude(
  systemPrompt: string,
  userMessage: string,
  maxTokens: number = 500
): Promise<string> {
  // If no API key, use fallback responses
  if (!CLAUDE_API_KEY) {
    console.warn('Claude API key not configured, using fallback');
    return '';
  }

  try {
    const response = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: userMessage,
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Claude API error: ${response.status}`);
    }

    const data = await response.json();
    return data.content[0].text;
  } catch (error) {
    console.error('Claude API call failed:', error);
    return '';
  }
}

// Generate stream metadata (title and description)
export async function generateStreamMetadata(topic: string): Promise<StreamMetadata> {
  const systemPrompt = `You are a professional streaming assistant. Generate engaging, SEO-optimized stream titles and descriptions.
Return your response in JSON format with "title" and "description" fields.
Keep titles under 60 characters. Descriptions should be 100-150 characters, engaging, and include relevant keywords.`;

  const userMessage = `Generate a catchy stream title and description for a stream about: ${topic}`;

  try {
    const response = await callClaude(systemPrompt, userMessage);

    if (response) {
      // Try to parse JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          title: parsed.title || `Live: ${topic}`,
          description: parsed.description || `Join us for an exciting stream about ${topic}!`,
        };
      }
    }
  } catch (error) {
    console.error('Failed to generate metadata:', error);
  }

  // Fallback response
  return {
    title: `Live: ${topic} Stream`,
    description: `Join us for an amazing live stream about ${topic}! Don't miss out on the excitement.`,
  };
}

export async function generateViralStreamPackage(
  topic: string,
  platforms: string[] = ['youtube', 'twitch', 'facebook', 'tiktok', 'instagram']
): Promise<ViralStreamPackage> {
  const systemPrompt = `You are a growth-focused live streaming strategist.
Generate viral, platform-aware stream copy and tags.
Return ONLY valid JSON with keys: "titles" (string[]), "descriptions" (string[]), "hashtags" (string[]), "tags" (string[]).
Constraints:
- titles: 3 options, max 60 chars each, punchy and curiosity-driven
- descriptions: 2 options, 120-220 chars each, include 1-2 keywords naturally
- hashtags: 12 items, no duplicates, include the leading #, avoid banned/violent/NSFW terms
- tags: 15 items, no hashtags, concise, SEO-friendly
Target platforms: ${platforms.join(', ')}.`;

  const userMessage = `Topic: ${topic}\nGenerate the JSON package.`;

  try {
    const response = await callClaude(systemPrompt, userMessage, 700);

    if (response) {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          titles: Array.isArray(parsed.titles) ? parsed.titles.filter(Boolean) : [`Live: ${topic}`],
          descriptions: Array.isArray(parsed.descriptions) ? parsed.descriptions.filter(Boolean) : [`Going live about ${topic}. Jump in and say hi!`],
          hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags.filter(Boolean) : [`#${topic.replace(/\s+/g, '')}`],
          tags: Array.isArray(parsed.tags) ? parsed.tags.filter(Boolean) : [topic],
        };
      }
    }
  } catch (error) {
    console.error('Failed to generate viral package:', error);
  }

  const normalized = topic.trim();
  const slug = normalized.replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, '');
  const baseHashtag = slug ? `#${slug}` : '#Live';

  return {
    titles: [
      `Live: ${normalized}`.slice(0, 60),
      `Let’s talk ${normalized}`.slice(0, 60),
      `${normalized} (Live Q&A)` .slice(0, 60),
    ],
    descriptions: [
      `Going live on ${normalized}. Ask questions, share your takes, and hang out. ${baseHashtag}`.slice(0, 220),
      `Streaming ${normalized} right now—tips, demos, and chat. Drop in and say hi! ${baseHashtag}`.slice(0, 220),
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
}

// Generate chat response for Chat Stream feature
export async function generateChatResponse(
  viewerMessage: string,
  streamContext: string,
  previousMessages: string[] = []
): Promise<ChatStreamResponse> {
  const systemPrompt = `You are a friendly, engaging live stream assistant helping interact with viewers.
The stream is about: ${streamContext}
Keep responses concise (under 100 words), friendly, and engaging.
If appropriate, suggest follow-up questions or topics.
Return JSON with "message" and optional "suggestions" array.`;

  const contextMessages = previousMessages.slice(-5).join('\n');
  const userMessage = `Previous chat context:\n${contextMessages}\n\nViewer asks: ${viewerMessage}`;

  try {
    const response = await callClaude(systemPrompt, userMessage, 300);

    if (response) {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          message: parsed.message || "Thanks for your message!",
          suggestions: parsed.suggestions,
        };
      }
    }
  } catch (error) {
    console.error('Failed to generate chat response:', error);
  }

  return {
    message: "Thanks for being here! Feel free to ask any questions about the stream.",
  };
}

// Generate content suggestions for streamers
export async function generateContentSuggestions(
  topic: string,
  audienceType: string = 'general'
): Promise<string[]> {
  const systemPrompt = `You are a content strategist for live streamers.
Generate 5 engaging talking points or content ideas.
Return as a JSON array of strings.`;

  const userMessage = `Topic: ${topic}\nAudience: ${audienceType}\nGenerate 5 content ideas.`;

  try {
    const response = await callClaude(systemPrompt, userMessage, 400);

    if (response) {
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    }
  } catch (error) {
    console.error('Failed to generate suggestions:', error);
  }

  return [
    `Introduction to ${topic}`,
    `Common questions about ${topic}`,
    `Tips and tricks for ${topic}`,
    `Q&A session about ${topic}`,
    `Future of ${topic}`,
  ];
}

// Moderate chat messages (for Chat Stream feature)
export async function moderateMessage(message: string): Promise<{
  isAppropriate: boolean;
  reason?: string;
}> {
  const systemPrompt = `You are a content moderator. Analyze if the message is appropriate for a family-friendly live stream.
Return JSON with "isAppropriate" (boolean) and "reason" (string if inappropriate).
Be lenient but flag obvious violations (hate speech, explicit content, spam).`;

  try {
    const response = await callClaude(systemPrompt, `Analyze: ${message}`, 100);

    if (response) {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    }
  } catch (error) {
    console.error('Moderation failed:', error);
  }

  // Default to allowing message if moderation fails
  return { isAppropriate: true };
}

// Generate stream summary
export async function generateStreamSummary(
  streamTopic: string,
  duration: number,
  highlights: string[]
): Promise<string> {
  const systemPrompt = `Generate a brief, engaging summary of a live stream for social media sharing.
Keep it under 280 characters for Twitter compatibility.`;

  const userMessage = `Topic: ${streamTopic}
Duration: ${Math.floor(duration / 60)} minutes
Highlights: ${highlights.join(', ')}`;

  try {
    const response = await callClaude(systemPrompt, userMessage, 100);
    if (response) return response.trim();
  } catch (error) {
    console.error('Failed to generate summary:', error);
  }

  return `Just finished an amazing ${Math.floor(duration / 60)}-minute stream about ${streamTopic}! Thanks to everyone who joined!`;
}

// ============================================================
// ENHANCED AI FEATURES - Moderation, Content Analysis, Voice
// ============================================================

// Advanced moderation result with detailed categories
export interface AdvancedModerationResult {
  isAllowed: boolean;
  toxicityScore: number;
  categories: ('spam' | 'harassment' | 'hate' | 'nsfw' | 'violence')[];
  suggestedAction: 'allow' | 'warn' | 'delete' | 'timeout';
  reason?: string;
  autoResponse?: string;
}

// Content analysis result
export interface ContentAnalysis {
  sentiment: 'positive' | 'neutral' | 'negative';
  topics: string[];
  engagementSuggestions: string[];
  warnings: string[];
  audienceMood: string;
}

// Voice configuration for TTS
export interface VoiceConfig {
  voiceId: string;
  rate: number;
  pitch: number;
  volume: number;
}

// Advanced chat moderation with detailed analysis
export async function advancedModerateMessage(
  message: string,
  context?: { streamerName?: string; recentMessages?: string[] }
): Promise<AdvancedModerationResult> {
  const systemPrompt = `You are an advanced content moderator for live streams.
Analyze the message for toxicity and appropriateness.
Return ONLY valid JSON with these exact keys:
{
  "isAllowed": boolean,
  "toxicityScore": number (0-1, where 0 is clean and 1 is highly toxic),
  "categories": array of strings from ["spam", "harassment", "hate", "nsfw", "violence"] (empty if clean),
  "suggestedAction": "allow" | "warn" | "delete" | "timeout",
  "reason": string (only if not allowed),
  "autoResponse": string (optional friendly redirect if borderline)
}
Be lenient with mild language but firm on hate speech, explicit content, and harassment.`;

  const contextStr = context?.recentMessages?.slice(-3).join('\n') || '';
  const userMessage = `Stream context: ${context?.streamerName || 'General stream'}
Recent chat:\n${contextStr}
\nMessage to analyze: "${message}"`;

  try {
    const response = await callClaude(systemPrompt, userMessage, 300);

    if (response) {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          isAllowed: parsed.isAllowed !== false,
          toxicityScore: typeof parsed.toxicityScore === 'number' ? parsed.toxicityScore : 0,
          categories: Array.isArray(parsed.categories) ? parsed.categories : [],
          suggestedAction: parsed.suggestedAction || 'allow',
          reason: parsed.reason,
          autoResponse: parsed.autoResponse,
        };
      }
    }
  } catch (error) {
    console.error('Advanced moderation failed:', error);
  }

  // Default: allow message if moderation fails
  return {
    isAllowed: true,
    toxicityScore: 0,
    categories: [],
    suggestedAction: 'allow',
  };
}

// Analyze stream content and chat for insights
export async function analyzeStreamContent(
  recentChat: string[],
  streamTitle: string,
  streamTopic?: string
): Promise<ContentAnalysis> {
  const systemPrompt = `You are a stream analytics AI. Analyze the chat messages and stream context.
Return ONLY valid JSON with:
{
  "sentiment": "positive" | "neutral" | "negative",
  "topics": array of 3-5 trending topics being discussed,
  "engagementSuggestions": array of 2-3 suggestions to boost engagement,
  "warnings": array of any content warnings or issues noticed,
  "audienceMood": brief description of audience mood
}`;

  const chatSample = recentChat.slice(-30).join('\n');
  const userMessage = `Stream: "${streamTitle}"
Topic: ${streamTopic || 'General'}
Recent chat messages (last 30):
${chatSample}

Analyze the stream's content and audience.`;

  try {
    const response = await callClaude(systemPrompt, userMessage, 400);

    if (response) {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          sentiment: parsed.sentiment || 'neutral',
          topics: Array.isArray(parsed.topics) ? parsed.topics.slice(0, 5) : [],
          engagementSuggestions: Array.isArray(parsed.engagementSuggestions)
            ? parsed.engagementSuggestions.slice(0, 3)
            : [],
          warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
          audienceMood: parsed.audienceMood || 'Unknown',
        };
      }
    }
  } catch (error) {
    console.error('Content analysis failed:', error);
  }

  return {
    sentiment: 'neutral',
    topics: [],
    engagementSuggestions: ['Ask the audience a question', 'Respond to recent comments'],
    warnings: [],
    audienceMood: 'Unable to analyze',
  };
}

// Generate AI-powered auto-response for common questions
export async function generateAutoResponse(
  question: string,
  streamContext: string,
  faqData?: Record<string, string>
): Promise<string | null> {
  // Check FAQ first
  if (faqData) {
    const lowerQuestion = question.toLowerCase();
    for (const [key, value] of Object.entries(faqData)) {
      if (lowerQuestion.includes(key.toLowerCase())) {
        return value;
      }
    }
  }

  const systemPrompt = `You are a helpful stream assistant. Answer common viewer questions briefly (under 50 words).
If you can't confidently answer, return null.
The stream is about: ${streamContext}`;

  try {
    const response = await callClaude(systemPrompt, `Question: ${question}`, 100);
    if (response && response.trim() && !response.includes('null')) {
      return response.trim();
    }
  } catch (error) {
    console.error('Auto-response generation failed:', error);
  }

  return null;
}

// Get available browser voices for TTS
export function getAvailableVoices(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    return [];
  }
  return speechSynthesis.getVoices().filter(voice =>
    voice.lang.startsWith('en') // English voices only
  );
}

// Speak donation message with enhanced TTS
export async function speakDonationMessage(
  message: string,
  config?: Partial<VoiceConfig>
): Promise<void> {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    console.warn('Speech synthesis not available');
    return;
  }

  return new Promise((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(message);

    // Apply configuration
    utterance.rate = config?.rate ?? 1.0;
    utterance.pitch = config?.pitch ?? 1.0;
    utterance.volume = config?.volume ?? 1.0;

    // Find voice by ID or use default
    if (config?.voiceId) {
      const voices = speechSynthesis.getVoices();
      const selectedVoice = voices.find(v => v.voiceURI === config.voiceId);
      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }
    }

    utterance.onend = () => resolve();
    utterance.onerror = (e) => reject(e);

    // Cancel any ongoing speech
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
  });
}

// Preload voices (call on app init)
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

    // Timeout fallback
    setTimeout(() => resolve(speechSynthesis.getVoices()), 1000);
  });
}

// Generate engagement prompts based on stream progress
export async function generateEngagementPrompt(
  streamTopic: string,
  streamDurationMinutes: number,
  viewerCount?: number
): Promise<string> {
  const systemPrompt = `You are a stream engagement expert. Generate a single, brief engagement prompt
(poll question, discussion starter, or call-to-action) appropriate for the stream's current state.
Keep it under 100 characters. Be creative and relevant to the topic.`;

  const userMessage = `Topic: ${streamTopic}
Stream duration: ${streamDurationMinutes} minutes
Viewers: ${viewerCount || 'unknown'}
Generate one engagement prompt.`;

  try {
    const response = await callClaude(systemPrompt, userMessage, 50);
    if (response) return response.trim().slice(0, 150);
  } catch (error) {
    console.error('Failed to generate engagement prompt:', error);
  }

  // Fallback prompts based on duration
  const prompts = [
    "What brought you to the stream today?",
    "Drop a like if you're enjoying the content!",
    "Any questions so far? I'd love to hear them!",
    "Where are you watching from?",
    "What topic should we cover next?",
  ];
  return prompts[Math.floor(Math.random() * prompts.length)];
}
