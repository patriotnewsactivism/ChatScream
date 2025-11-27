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