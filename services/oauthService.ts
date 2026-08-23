// OAuth Service for Social Platform Integration
// Handles YouTube, Facebook, Twitch, and TikTok OAuth flows.

import { buildApiUrl } from './apiClient';
import { getCurrentSessionToken, getOAuthPublicConfig } from './backend';

export type OAuthPlatform = 'youtube' | 'facebook' | 'twitch' | 'tiktok';

export interface OAuthConfig {
  clientId: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  scopes: string[];
  redirectUri: string;
}

export interface ConnectedAccount {
  platform: OAuthPlatform;
  accessToken?: string;
  refreshToken?: string;
  expiresAt: Date;
  accountId: string;
  accountName: string;
  profileImage?: string;
  channels?: AccountChannel[];
}

export interface AccountChannel {
  id: string;
  name: string;
  thumbnailUrl?: string;
  streamKey?: string;
  ingestUrl?: string;
}

export interface OAuthState {
  platform: OAuthPlatform;
  userId: string;
  timestamp: number;
  nonce: string;
  returnOrigin?: string;
}

const OAUTH_STATE_STORAGE_KEY = 'oauth_state';
const YOUTUBE_PRODUCTION_REDIRECT_URI =
  'https://api.chatscream.live/api/auth/oauth/google/callback';
const oauthStateKey = (platform: OAuthPlatform): string => `${OAUTH_STATE_STORAGE_KEY}_${platform}`;

let oauthPublicConfigCache: {
  value: Awaited<ReturnType<typeof getOAuthPublicConfig>>;
  loadedAt: number;
} | null = null;

const readOAuthPublicConfigCached = async (): Promise<
  Awaited<ReturnType<typeof getOAuthPublicConfig>>
> => {
  const now = Date.now();
  if (oauthPublicConfigCache && now - oauthPublicConfigCache.loadedAt < 60_000) {
    return oauthPublicConfigCache.value;
  }
  const value = await getOAuthPublicConfig();
  oauthPublicConfigCache = { value, loadedAt: now };
  return value;
};

const getAuthorizationHeader = (): string | null => {
  const token = getCurrentSessionToken();
  return token ? `Bearer ${token}` : null;
};

const getBrowserCallbackUri = (): string => {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/oauth/callback`;
  }
  return 'https://www.chatscream.live/oauth/callback';
};

const getYouTubeRedirectUri = (): string => {
  if (typeof window !== 'undefined') {
    const host = window.location?.hostname || '';
    if (host === 'localhost' || host === '127.0.0.1') {
      return `${window.location.origin}/oauth/callback`;
    }
  }
  return YOUTUBE_PRODUCTION_REDIRECT_URI;
};

export const getOAuthConfig = async (platform: OAuthPlatform): Promise<OAuthConfig> => {
  const publicConfig = await readOAuthPublicConfigCached();
  const browserRedirectUri = getBrowserCallbackUri();

  switch (platform) {
    case 'youtube':
      return {
        clientId: publicConfig.youtubeClientId || import.meta.env.VITE_YOUTUBE_CLIENT_ID || '',
        authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenEndpoint: 'https://oauth2.googleapis.com/token',
        scopes: [
          'https://www.googleapis.com/auth/youtube',
          'https://www.googleapis.com/auth/youtube.force-ssl',
          'https://www.googleapis.com/auth/youtube.readonly',
          'profile',
          'email',
        ],
        redirectUri: getYouTubeRedirectUri(),
      };
    case 'facebook':
      return {
        clientId: publicConfig.facebookAppId || import.meta.env.VITE_FACEBOOK_APP_ID || '',
        authorizationEndpoint: 'https://www.facebook.com/v18.0/dialog/oauth',
        tokenEndpoint: 'https://graph.facebook.com/v18.0/oauth/access_token',
        scopes: [
          'public_profile',
          'email',
          'pages_show_list',
          'pages_read_engagement',
          'pages_manage_posts',
          'pages_manage_metadata',
          'publish_video',
        ],
        redirectUri: publicConfig.redirectUriBase || browserRedirectUri,
      };
    case 'twitch':
      return {
        clientId: publicConfig.twitchClientId || import.meta.env.VITE_TWITCH_CLIENT_ID || '',
        authorizationEndpoint: 'https://id.twitch.tv/oauth2/authorize',
        tokenEndpoint: 'https://id.twitch.tv/oauth2/token',
        scopes: [
          'user:read:email',
          'chat:read',
          'chat:edit',
          'channel:read:stream_key',
          'channel:manage:broadcast',
          'channel:read:subscriptions',
        ],
        redirectUri: publicConfig.redirectUriBase || browserRedirectUri,
      };
    case 'tiktok':
      return {
        clientId: publicConfig.tiktokClientKey || import.meta.env.VITE_TIKTOK_CLIENT_KEY || '',
        authorizationEndpoint: 'https://www.tiktok.com/v2/auth/authorize/',
        tokenEndpoint: 'https://open.tiktokapis.com/v2/oauth/token/',
        scopes: ['user.info.basic', 'live.room.manage', 'video.upload'],
        redirectUri: publicConfig.redirectUriBase || browserRedirectUri,
      };
    default:
      throw new Error(`Unsupported OAuth platform: ${platform}`);
  }
};

const generateNonce = (): string => {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
};

export const createOAuthState = (platform: OAuthPlatform, userId: string): string => {
  const state: OAuthState = {
    platform,
    userId,
    timestamp: Date.now(),
    nonce: generateNonce(),
    returnOrigin:
      typeof window !== 'undefined' && window.location?.origin ? window.location.origin : undefined,
  };
  localStorage.setItem(oauthStateKey(platform), JSON.stringify(state));
  return btoa(JSON.stringify(state));
};

export const verifyOAuthState = (stateParam: string): OAuthState | null => {
  try {
    const receivedState: OAuthState = JSON.parse(atob(stateParam));
    const storedState = localStorage.getItem(oauthStateKey(receivedState.platform));
    if (!storedState) return null;
    const parsed: OAuthState = JSON.parse(storedState);
    if (parsed.nonce !== receivedState.nonce || parsed.userId !== receivedState.userId) return null;
    if (Date.now() - receivedState.timestamp > 10 * 60 * 1000) return null;
    localStorage.removeItem(oauthStateKey(receivedState.platform));
    return receivedState;
  } catch (error) {
    console.error('Failed to verify OAuth state:', error);
    return null;
  }
};

export const getAuthorizationUrl = async (
  platform: OAuthPlatform,
  userId: string,
): Promise<string> => {
  const config = await getOAuthConfig(platform);
  const state = createOAuthState(platform, userId);

  if (platform === 'tiktok') {
    const params = new URLSearchParams({
      client_key: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      scope: config.scopes.join(','),
      state,
    });
    return `${config.authorizationEndpoint}?${params.toString()}`;
  }

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: config.scopes.join(' '),
    state,
    access_type: 'offline',
    prompt: 'consent',
  });

  if (platform === 'youtube') params.set('include_granted_scopes', 'true');
  if (platform === 'twitch') params.set('force_verify', 'true');

  return `${config.authorizationEndpoint}?${params.toString()}`;
};

export const exchangeCodeForTokens = async (
  platform: OAuthPlatform,
  code: string,
): Promise<{ success: boolean; error?: string }> => {
  try {
    const authHeader = getAuthorizationHeader();
    if (!authHeader) return { success: false, error: 'You must be signed in to connect accounts.' };

    const redirectUri = (await getOAuthConfig(platform)).redirectUri;
    const response = await fetch(buildApiUrl('/api/oauth/exchange'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      credentials: 'include',
      body: JSON.stringify({ platform, code, redirectUri }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return { success: false, error: error.message || 'Token exchange failed' };
    }
    return { success: true };
  } catch (error) {
    console.error('Token exchange error:', error);
    return { success: false, error: 'Failed to connect account' };
  }
};

export const refreshAccessToken = async (
  platform: OAuthPlatform,
): Promise<{ success: boolean; error?: string }> => {
  try {
    const authHeader = getAuthorizationHeader();
    if (!authHeader) return { success: false, error: 'You must be signed in to refresh tokens.' };
    const response = await fetch(buildApiUrl('/api/oauth/refresh'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      credentials: 'include',
      body: JSON.stringify({ platform }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return { success: false, error: error.message || 'Failed to refresh token' };
    }
    return { success: true };
  } catch (error) {
    console.error('Refresh token error:', error);
    return { success: false, error: 'Failed to refresh token' };
  }
};

export const disconnectPlatform = async (
  platform: OAuthPlatform,
  userId: string,
): Promise<{ success: boolean; error?: string }> => {
  try {
    const authHeader = getAuthorizationHeader();
    if (!authHeader) return { success: false, error: 'You must be signed in to disconnect accounts.' };

    await fetch(buildApiUrl('/api/oauth/disconnect'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      credentials: 'include',
      body: JSON.stringify({ platform, userId }),
    });

    try {
      await fetch(buildApiUrl('/api/oauth/revoke'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: authHeader },
        credentials: 'include',
        body: JSON.stringify({ platform, userId }),
      });
    } catch {
      console.warn('Token revocation failed, but account disconnected locally');
    }
    return { success: true };
  } catch (error) {
    console.error('Disconnect error:', error);
    return { success: false, error: 'Failed to disconnect account' };
  }
};

export const getConnectedPlatforms = async (
  userId: string,
): Promise<{
  youtube?: ConnectedAccount;
  facebook?: ConnectedAccount;
  twitch?: ConnectedAccount;
  tiktok?: ConnectedAccount;
}> => {
  try {
    const authHeader = getAuthorizationHeader();
    if (!authHeader) return {};
    const response = await fetch(buildApiUrl(`/api/oauth/platforms?userId=${encodeURIComponent(userId)}`), {
      headers: { Authorization: authHeader },
      credentials: 'include',
    });
    if (!response.ok) return {};
    const payload = (await response.json()) as Record<string, any>;
    const data = (payload.platforms || payload.connectedPlatforms || {}) as Record<string, any>;
    const connected = (data.connectedPlatforms || data) as Record<string, any>;
    const result: Record<string, ConnectedAccount> = {};
    for (const platform of ['youtube', 'facebook', 'twitch', 'tiktok'] as OAuthPlatform[]) {
      if (connected[platform]) {
        result[platform] = {
          platform,
          ...connected[platform],
          expiresAt: new Date(connected[platform].expiresAt || Date.now()),
        } as ConnectedAccount;
      }
    }
    return result;
  } catch (error) {
    console.error('Error getting connected platforms:', error);
    return {};
  }
};

export const isTokenExpired = (expiresAt: Date): boolean =>
  expiresAt <= new Date(Date.now() + 5 * 60 * 1000);

export const getStreamKey = async (
  platform: OAuthPlatform,
  channelId?: string,
): Promise<{ streamKey?: string; ingestUrl?: string; error?: string }> => {
  try {
    const authHeader = getAuthorizationHeader();
    if (!authHeader) return { error: 'You must be signed in to retrieve stream info.' };
    const response = await fetch(buildApiUrl('/api/oauth/stream-key'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      credentials: 'include',
      body: JSON.stringify({ platform, channelId }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return { error: error.message || 'Failed to get stream key' };
    }
    const data = await response.json();
    return { streamKey: data.streamKey, ingestUrl: data.ingestUrl };
  } catch (error) {
    console.error('Get stream key error:', error);
    return { error: 'Failed to retrieve stream key' };
  }
};

export const getChannels = async (
  platform: OAuthPlatform,
): Promise<{ channels: AccountChannel[]; error?: string }> => {
  try {
    const authHeader = getAuthorizationHeader();
    if (!authHeader) return { channels: [], error: 'You must be signed in to retrieve channels.' };
    const response = await fetch(buildApiUrl('/api/oauth/channels'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      credentials: 'include',
      body: JSON.stringify({ platform }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return { channels: [], error: error.message || 'Failed to get channels' };
    }
    const data = await response.json();
    return { channels: data.channels || [] };
  } catch (error) {
    console.error('Get channels error:', error);
    return { channels: [], error: 'Failed to retrieve channels' };
  }
};

const isMobileDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < 768 || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
};

const ensureConfigured = async (platform: OAuthPlatform): Promise<void> => {
  const config = await getOAuthConfig(platform);
  if (!config.clientId) {
    throw new Error(`${platform} integration is not configured yet.`);
  }
};

export const initiateOAuth = (platform: OAuthPlatform, userId: string): void => {
  const mobile = isMobileDevice();

  if (mobile) {
    const mobileTab = window.open('about:blank', '_blank');
    void (async () => {
      try {
        await ensureConfigured(platform);
        const authUrl = await getAuthorizationUrl(platform, userId);
        if (mobileTab && !mobileTab.closed) mobileTab.location.href = authUrl;
        else window.location.assign(authUrl);
      } catch (error) {
        console.error(`Failed to start ${platform} OAuth (mobile):`, error);
        if (mobileTab && !mobileTab.closed) mobileTab.close();
        alert(`Could not start ${platform} sign-in. Check your OAuth configuration and try again.`);
      }
    })();
    return;
  }

  const width = 600;
  const height = 700;
  const left = window.screenX + (window.outerWidth - width) / 2;
  const top = window.screenY + (window.outerHeight - height) / 2;
  const popup = window.open(
    'about:blank',
    `${platform}_oauth`,
    `width=${width},height=${height},left=${left},top=${top},popup=yes`,
  );
  popup?.focus();

  void (async () => {
    try {
      await ensureConfigured(platform);
      const authUrl = await getAuthorizationUrl(platform, userId);
      if (popup && !popup.closed) {
        popup.location.href = authUrl;
        return;
      }
      const newTab = window.open(authUrl, '_blank');
      if (!newTab) window.location.assign(authUrl);
    } catch (error) {
      console.error(`Failed to start ${platform} OAuth:`, error);
      if (popup && !popup.closed) popup.close();
      alert(`Could not start ${platform} sign-in. Verify OAuth settings and try again.`);
    }
  })();
};

export const handleOAuthCallback = async (
  searchParams: URLSearchParams,
): Promise<{ success: boolean; platform?: OAuthPlatform; error?: string }> => {
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  if (error) {
    return {
      success: false,
      error: error === 'access_denied' ? 'Authorization was denied' : error,
    };
  }
  if (!code || !state) return { success: false, error: 'Missing authorization code or state' };

  const stateData = verifyOAuthState(state);
  if (!stateData) return { success: false, error: 'Invalid or expired authorization state' };

  const result = await exchangeCodeForTokens(stateData.platform, code);
  if (!result.success) {
    return { success: false, platform: stateData.platform, error: result.error };
  }
  return { success: true, platform: stateData.platform };
};
