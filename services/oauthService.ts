// OAuth Service for Social Platform Integration
// Handles YouTube, Facebook, and Twitch OAuth flows

import { buildApiUrl } from './apiClient';
import { getCurrentSessionToken, getOAuthPublicConfig } from './backend';

// Platform types
export type OAuthPlatform = 'youtube' | 'facebook' | 'twitch';

// OAuth Configuration
export interface OAuthConfig {
  clientId: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  scopes: string[];
  redirectUri: string;
}

// Connected account info
export interface ConnectedAccount {
  platform: OAuthPlatform;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  accountId: string;
  accountName: string;
  profileImage?: string;
  channels?: AccountChannel[];
}

// Channel/Page info for accounts with multiple broadcast destinations
export interface AccountChannel {
  id: string;
  name: string;
  thumbnailUrl?: string;
  streamKey?: string;
  ingestUrl?: string;
}

// OAuth state for CSRF protection
export interface OAuthState {
  platform: OAuthPlatform;
  userId: string;
  timestamp: number;
  nonce: string;
}

const OAUTH_STATE_STORAGE_KEY = 'oauth_state';

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

// Get OAuth configuration for each platform
export const getOAuthConfig = async (platform: OAuthPlatform): Promise<OAuthConfig> => {
  const publicConfig = await readOAuthPublicConfigCached();
  const baseRedirectUri =
    publicConfig.redirectUriBase ||
    import.meta.env.VITE_OAUTH_REDIRECT_URI ||
    `${window.location.origin}/oauth/callback`;

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
        redirectUri: `${baseRedirectUri}?platform=youtube`,
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
          'publish_video',
        ],
        redirectUri: `${baseRedirectUri}?platform=facebook`,
      };

    case 'twitch':
      return {
        clientId: publicConfig.twitchClientId || import.meta.env.VITE_TWITCH_CLIENT_ID || '',
        authorizationEndpoint: 'https://id.twitch.tv/oauth2/authorize',
        tokenEndpoint: 'https://id.twitch.tv/oauth2/token',
        scopes: [
          'user:read:email',
          'channel:read:stream_key',
          'channel:manage:broadcast',
          'channel:read:subscriptions',
        ],
        redirectUri: `${baseRedirectUri}?platform=twitch`,
      };

    default:
      throw new Error(`Unsupported OAuth platform: ${platform}`);
  }
};

// Generate a random nonce for state parameter
const generateNonce = (): string => {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
};

// Create OAuth state and store it for verification
export const createOAuthState = (platform: OAuthPlatform, userId: string): string => {
  const state: OAuthState = {
    platform,
    userId,
    timestamp: Date.now(),
    nonce: generateNonce(),
  };

  // Store state in localStorage so the OAuth popup window can verify it
  localStorage.setItem(OAUTH_STATE_STORAGE_KEY, JSON.stringify(state));

  // Encode state as base64 for URL safety
  return btoa(JSON.stringify(state));
};

// Verify OAuth state from callback
export const verifyOAuthState = (stateParam: string): OAuthState | null => {
  try {
    const receivedState: OAuthState = JSON.parse(atob(stateParam));
    const storedState = localStorage.getItem(OAUTH_STATE_STORAGE_KEY);

    if (!storedState) {
      console.error('No stored OAuth state found');
      return null;
    }

    const parsed: OAuthState = JSON.parse(storedState);

    // Verify nonce matches
    if (parsed.nonce !== receivedState.nonce) {
      console.error('OAuth state nonce mismatch');
      return null;
    }

    // Verify state is not too old (10 minute expiry)
    const tenMinutes = 10 * 60 * 1000;
    if (Date.now() - receivedState.timestamp > tenMinutes) {
      console.error('OAuth state expired');
      return null;
    }

    // Clear stored state
    localStorage.removeItem(OAUTH_STATE_STORAGE_KEY);

    return receivedState;
  } catch (error) {
    console.error('Failed to verify OAuth state:', error);
    return null;
  }
};

// Generate OAuth authorization URL
export const getAuthorizationUrl = async (
  platform: OAuthPlatform,
  userId: string,
): Promise<string> => {
  const config = await getOAuthConfig(platform);
  const state = createOAuthState(platform, userId);

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: config.scopes.join(' '),
    state,
    access_type: 'offline', // For refresh tokens (YouTube/Google)
    prompt: 'consent', // Force consent screen to get refresh token
  });

  // Platform-specific parameters
  if (platform === 'twitch') {
    params.set('force_verify', 'true');
  }

  return `${config.authorizationEndpoint}?${params.toString()}`;
};

// Exchange authorization code for tokens (via Cloud Function)
export const exchangeCodeForTokens = async (
  platform: OAuthPlatform,
  code: string,
): Promise<{ success: boolean; error?: string }> => {
  try {
    const authHeader = getAuthorizationHeader();
    if (!authHeader) {
      return { success: false, error: 'You must be signed in to connect accounts.' };
    }

    const redirectUri = (await getOAuthConfig(platform)).redirectUri;
    const response = await fetch(buildApiUrl('/api/oauth/exchange'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      credentials: 'include',
      body: JSON.stringify({
        platform,
        code,
        redirectUri,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      return { success: false, error: error.message || 'Token exchange failed' };
    }

    return { success: true };
  } catch (error) {
    console.error('Token exchange error:', error);
    return { success: false, error: 'Failed to connect account' };
  }
};

// Refresh access token (via Cloud Function)
export const refreshAccessToken = async (
  platform: OAuthPlatform,
): Promise<{ success: boolean; error?: string }> => {
  try {
    const authHeader = getAuthorizationHeader();
    if (!authHeader) {
      return { success: false, error: 'You must be signed in to refresh tokens.' };
    }

    const response = await fetch(buildApiUrl('/api/oauth/refresh'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      credentials: 'include',
      body: JSON.stringify({
        platform,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      return { success: false, error: error.message || 'Token refresh failed' };
    }

    return { success: true };
  } catch (error) {
    console.error('Token refresh error:', error);
    return { success: false, error: 'Failed to refresh token' };
  }
};

// Disconnect platform account
export const disconnectPlatform = async (
  platform: OAuthPlatform,
  userId: string,
): Promise<{ success: boolean; error?: string }> => {
  try {
    const authHeader = getAuthorizationHeader();
    if (!authHeader) {
      return { success: false, error: 'You must be signed in to disconnect accounts.' };
    }

    await fetch(buildApiUrl('/api/oauth/disconnect'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      credentials: 'include',
      body: JSON.stringify({ platform, userId }),
    });

    // Optionally revoke tokens on the platform side
    try {
      await fetch(buildApiUrl('/api/oauth/revoke'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader,
        },
        credentials: 'include',
        body: JSON.stringify({ platform, userId }),
      });
    } catch {
      // Non-critical if revocation fails
      console.warn('Token revocation failed, but account disconnected locally');
    }

    return { success: true };
  } catch (error) {
    console.error('Disconnect error:', error);
    return { success: false, error: 'Failed to disconnect account' };
  }
};

// Get connected platforms for a user
export const getConnectedPlatforms = async (
  userId: string,
): Promise<{
  youtube?: ConnectedAccount;
  facebook?: ConnectedAccount;
  twitch?: ConnectedAccount;
}> => {
  try {
    const authHeader = getAuthorizationHeader();
    if (!authHeader) return {};
    const response = await fetch(
      buildApiUrl(`/api/oauth/platforms?userId=${encodeURIComponent(userId)}`),
      {
        method: 'GET',
        headers: {
          Authorization: authHeader,
        },
        credentials: 'include',
      },
    );
    if (!response.ok) {
      return {};
    }

    const payload = (await response.json()) as Record<string, any>;
    const data = (payload.platforms || payload.connectedPlatforms || {}) as Record<string, any>;
    const connected = (data.connectedPlatforms || data) as Record<string, any>;
    const platforms: {
      youtube?: ConnectedAccount;
      facebook?: ConnectedAccount;
      twitch?: ConnectedAccount;
    } = {};

    if (connected.youtube) {
      platforms.youtube = {
        platform: 'youtube',
        ...connected.youtube,
        expiresAt: new Date(connected.youtube.expiresAt || Date.now()),
      };
    }

    if (connected.facebook) {
      platforms.facebook = {
        platform: 'facebook',
        ...connected.facebook,
        expiresAt: new Date(connected.facebook.expiresAt || Date.now()),
      };
    }

    if (connected.twitch) {
      platforms.twitch = {
        platform: 'twitch',
        ...connected.twitch,
        expiresAt: new Date(connected.twitch.expiresAt || Date.now()),
      };
    }

    return platforms;
  } catch (error) {
    console.error('Error getting connected platforms:', error);
    return {};
  }
};

// Check if token is expired or about to expire (within 5 minutes)
export const isTokenExpired = (expiresAt: Date): boolean => {
  const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
  return expiresAt <= fiveMinutesFromNow;
};

// Get stream key for a platform (fetches from platform API via Cloud Function)
export const getStreamKey = async (
  platform: OAuthPlatform,
  channelId?: string,
): Promise<{ streamKey?: string; ingestUrl?: string; error?: string }> => {
  try {
    const authHeader = getAuthorizationHeader();
    if (!authHeader) {
      return { error: 'You must be signed in to retrieve stream info.' };
    }

    const response = await fetch(buildApiUrl('/api/oauth/stream-key'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      credentials: 'include',
      body: JSON.stringify({ platform, channelId }),
    });

    if (!response.ok) {
      const error = await response.json();
      return { error: error.message || 'Failed to get stream key' };
    }

    const data = await response.json();
    return {
      streamKey: data.streamKey,
      ingestUrl: data.ingestUrl,
    };
  } catch (error) {
    console.error('Get stream key error:', error);
    return { error: 'Failed to retrieve stream key' };
  }
};

// Get user's channels/pages for platforms that support multiple destinations
export const getChannels = async (
  platform: OAuthPlatform,
): Promise<{ channels: AccountChannel[]; error?: string }> => {
  try {
    const authHeader = getAuthorizationHeader();
    if (!authHeader) {
      return { channels: [], error: 'You must be signed in to retrieve channels.' };
    }

    const response = await fetch(buildApiUrl('/api/oauth/channels'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      credentials: 'include',
      body: JSON.stringify({ platform }),
    });

    if (!response.ok) {
      const error = await response.json();
      return { channels: [], error: error.message || 'Failed to get channels' };
    }

    const data = await response.json();
    return { channels: data.channels || [] };
  } catch (error) {
    console.error('Get channels error:', error);
    return { channels: [], error: 'Failed to retrieve channels' };
  }
};

// Initiate OAuth flow for a platform
export const initiateOAuth = (platform: OAuthPlatform, userId: string): void => {
  void (async () => {
    const config = await getOAuthConfig(platform);

    if (!config.clientId) {
      console.error(`${platform} OAuth not configured. Missing client ID.`);
      alert(
        `${platform} integration is not configured yet. Open Admin Portal → OAuth IDs and paste the ${platform} client id.`,
      );
      return;
    }

    const authUrl = await getAuthorizationUrl(platform, userId);

    // Open OAuth popup
    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      authUrl,
      `${platform}_oauth`,
      `width=${width},height=${height},left=${left},top=${top},popup=yes`,
    );

    if (popup) {
      popup.focus();
    }
  })();
};

// Handle OAuth callback (called from callback page)
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

  if (!code || !state) {
    return { success: false, error: 'Missing authorization code or state' };
  }

  const stateData = verifyOAuthState(state);
  if (!stateData) {
    return { success: false, error: 'Invalid or expired authorization state' };
  }

  const result = await exchangeCodeForTokens(stateData.platform, code);

  if (!result.success) {
    return { success: false, platform: stateData.platform, error: result.error };
  }

  return { success: true, platform: stateData.platform };
};
