export enum Platform {
  YOUTUBE = 'YouTube',
  FACEBOOK = 'Facebook',
  TWITCH = 'Twitch',
  CUSTOM_RTMP = 'Custom RTMP'
}

export enum LayoutMode {
  FULL_CAM = 'FULL_CAM',
  FULL_SCREEN = 'FULL_SCREEN',
  PIP = 'PIP', // Picture in Picture
  SPLIT = 'SPLIT', // Side by side
  NEWSROOM = 'NEWSROOM' // Shoulder view
}

export type MediaType = 'image' | 'video' | 'audio';

export interface Destination {
  id: string;
  platform: Platform;
  name: string; // e.g., "Personal YouTube", "Business YouTube"
  streamKey: string;
  serverUrl?: string;
  authType?: 'manual' | 'oauth';
  isEnabled: boolean;
  status: 'offline' | 'connecting' | 'live' | 'error';
}

export interface StreamConfig {
  title: string;
  description: string;
}

export interface MediaAsset {
  id: string;
  type: MediaType;
  url: string;
  name: string;
}

export interface BrandingSettings {
  showLowerThird: boolean;
  showTicker: boolean;
  primaryColor: string;
  accentColor: string;
  presenterName: string;
  presenterTitle: string;
  tickerText: string;
}

export interface AppState {
  isStreaming: boolean;
  isRecording: boolean;
  streamDuration: number;
}

// Audio Mixer Types
export interface AudioLevels {
  mic: number;      // 0-1 from analyser
  music: number;
  video: number;
}

export interface AudioConfig {
  micVolume: number;
  musicVolume: number;
  videoVolume: number;
  isMicMuted: boolean;
  isMusicMuted: boolean;
  isVideoMuted: boolean;
}

// AI Moderation Types
export interface ModerationResult {
  isAllowed: boolean;
  toxicityScore: number;
  categories: ('spam' | 'harassment' | 'hate' | 'nsfw')[];
  suggestedAction: 'allow' | 'warn' | 'delete' | 'timeout';
  reason?: string;
}

export interface ContentAnalysis {
  sentiment: 'positive' | 'neutral' | 'negative';
  topics: string[];
  engagementSuggestions: string[];
  warnings: string[];
}

// Voice/TTS Types
export interface VoiceConfig {
  voiceId: string;
  rate: number;     // 0.5 - 2.0
  pitch: number;    // 0.5 - 2.0
  volume: number;   // 0 - 1
}

// Chat Screamer Types
export type ScreamTier = 'standard' | 'loud' | 'maximum';

export interface ScreamDonation {
  id: string;
  streamerId: string;
  donorName: string;
  donorEmail?: string;
  amount: number;
  message: string;
  tier: ScreamTier;
  createdAt: Date;
  displayed: boolean;
}

// Mobile/Device Types
export interface DeviceCapabilities {
  isMobile: boolean;
  isTouchDevice: boolean;
  hasRearCamera: boolean;
  hasMicrophone: boolean;
  maxVideoResolution: { width: number; height: number };
  supportsScreenShare: boolean;
}

// Stream Session Types
export interface StreamSession {
  id: string;
  userId: string;
  startedAt: Date;
  endedAt?: Date;
  durationSeconds: number;
  destinations: string[];
  mode: 'local' | 'cloud';
}

// Chat Message Types
export interface ChatMessage {
  id: string;
  streamId: string;
  userId: string;
  displayName: string;
  content: string;
  createdAt: Date;
  moderation?: ModerationResult;
}