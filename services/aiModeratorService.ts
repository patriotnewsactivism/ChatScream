import { apiRequest } from './apiClient';
import type { AggregatedMessage, ChatPlatform } from './chatAggregator';

export type AIModeratorMode = 'suggest' | 'assist' | 'autopilot';
export type AIModeratorTone = 'friendly' | 'witty' | 'professional' | 'energetic' | 'calm';

export interface AIModeratorConfig {
  enabled: boolean;
  mode: AIModeratorMode;
  tone: AIModeratorTone;
  answerScope: 'stream-only' | 'stream-and-stable-general';
  autoReplyQuestions: boolean;
  respondToMentions: boolean;
  engageQuietChat: boolean;
  publicReplies: boolean;
  quietAfterSeconds: number;
  cooldownSeconds: number;
  maxRepliesPerMinute: number;
  knowledgeBase: string;
  hostInstructions: string;
}

export interface AIModeratorUsage {
  periodKey: string;
  decisions: number;
  replies: number;
  resetAt: string;
  limit: number;
  remaining: number;
}

export interface AIModeratorConfigResponse {
  config: AIModeratorConfig;
  usage: AIModeratorUsage;
  available: boolean;
}

export interface AIModeratorDecision {
  action: 'reply' | 'suggest' | 'ignore' | 'flag';
  reply: string | null;
  confidence: number;
  reason: string;
  category: 'question' | 'engagement' | 'moderation' | 'other';
  usage?: AIModeratorUsage;
}

export interface AIModeratorEvaluateInput {
  message: string;
  viewerName?: string;
  platform?: ChatPlatform | string;
  streamContext: string;
  transcript?: string;
  recentChat?: Array<Pick<AggregatedMessage, 'displayName' | 'content'>> | string[];
}

const defaults: AIModeratorConfig = {
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
};

export const getDefaultAIModeratorConfig = (): AIModeratorConfig => ({ ...defaults });

export const getAIModeratorConfig = async (
  token: string,
): Promise<AIModeratorConfigResponse> => {
  return apiRequest<AIModeratorConfigResponse>('/api/ai-moderator/config', {
    method: 'GET',
    token,
  });
};

export const saveAIModeratorConfig = async (
  token: string,
  config: AIModeratorConfig,
): Promise<{ config: AIModeratorConfig; available: boolean }> => {
  return apiRequest('/api/ai-moderator/config', {
    method: 'PUT',
    token,
    body: config,
  });
};

export const evaluateWithAIModerator = async (
  token: string,
  input: AIModeratorEvaluateInput,
): Promise<AIModeratorDecision> => {
  return apiRequest<AIModeratorDecision>('/api/ai-moderator/evaluate', {
    method: 'POST',
    token,
    body: input,
  });
};

export const generateAIModeratorEngagement = async (
  token: string,
  input: Pick<AIModeratorEvaluateInput, 'streamContext' | 'transcript' | 'recentChat'>,
): Promise<{ message: string | null; usage?: AIModeratorUsage; reason?: string }> => {
  return apiRequest('/api/ai-moderator/engage', {
    method: 'POST',
    token,
    body: input,
  });
};
