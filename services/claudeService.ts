// Claude AI Service - Replacing Gemini/Amazon
// Uses Anthropic's Claude API for AI features

interface StreamMetadata {
  title: string;
  description: string;
}

interface ChatStreamResponse {
  message: string;
  suggestions?: string[];
}

// Claude API configuration
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_API_KEY = import.meta.env.VITE_CLAUDE_API_KEY || '';

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
