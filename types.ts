export enum Platform {
  YOUTUBE = 'YouTube',
  FACEBOOK = 'Facebook',
  TWITCH = 'Twitch',
  TIKTOK = 'TikTok',
  KICK = 'Kick',
  X_TWITTER = 'X (Twitter)',
  RUMBLE = 'Rumble',
  LINKEDIN = 'LinkedIn',
  CUSTOM_RTMP = 'Custom RTMP',
}

export enum LayoutMode {
  FULL_CAM = 'FULL_CAM',
  FULL_SCREEN = 'FULL_SCREEN',
  PIP = 'PIP',
  SPLIT = 'SPLIT',
  NEWSROOM = 'NEWSROOM',
  PORTRAIT = 'PORTRAIT',
}

export enum OnlineStatus {
  ONLINE = 'online',
  IDLE = 'idle',
  OFFLINE = 'offline',
}

export type MediaType = 'image' | 'video' | 'audio';

export interface Destination {
  id: string;
  platform: Platform;
  name: string;
  streamKey: string;
  serverUrl?: string;
  authType: 'manual' | 'oauth';
  oauthTokenId?: string;
  isEnabled: boolean;
  status: 'offline' | 'connecting' | 'live' | 'error';
  liveChatId?: string;
  liveVideoId?: string;
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

export interface SceneSource {
  id: string;
  assetId?: string;
  type: 'camera' | 'screen' | 'image' | 'video' | 'text';
  url?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  opacity: number;
  isVisible: boolean;
}

export interface Scene {
  id: string;
  name: string;
  sources: SceneSource[];
}

export interface BrandingSettings {
  showLowerThird: boolean;
  showTicker: boolean;
  showLogo: boolean;
  showNowPlaying: boolean;
  logoUrl?: string;
  logoPosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  logoOpacity: number;
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

export interface AudioLevels {
  mic: number;
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

export interface VoiceConfig {
  voiceId: string;
  rate: number;
  pitch: number;
  volume: number;
}

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

export interface DeviceCapabilities {
  isMobile: boolean;
  isTouchDevice: boolean;
  hasRearCamera: boolean;
  hasMicrophone: boolean;
  maxVideoResolution: { width: number; height: number };
  supportsScreenShare: boolean;
}

export interface StreamSession {
  id: string;
  userId: string;
  startedAt: Date;
  endedAt?: Date;
  durationSeconds: number;
  destinations: string[];
  mode: 'local' | 'cloud';
}

export interface ChatMessage {
  id: string;
  streamId: string;
  userId: string;
  displayName: string;
  content: string;
  createdAt: Date;
  moderation?: ModerationResult;
}

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  onlineStatus?: OnlineStatus;
  accessibilitySettings?: any;
}