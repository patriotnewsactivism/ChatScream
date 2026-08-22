// OAuth Service for Social Platform Integration
// Handles YouTube, Facebook, and Twitch OAuth flows

import { buildApiUrl } from './apiClient';
import { getCurrentSessionToken, getOAuthPublicConfig } from './backend';

// Platform types
export type OAuthPlatform = 'youtube' | 'facebook' | 'twitch' | 'tiktok';

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
  // OAuth tokens remain server-side. These fields are optional only for legacy callers.
  accessToken?: string;
  refreshToken?: string;
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

// Get OAuth configuration for each platform
export const getOAuthConfig = async (platform: OAuthPlatform): Promise<OAuthConfig> => {
  const publicConfig = await readOAuthPublicConfigCached();
  // ALWAYS use current window origin so the redirect_uri matches whichever
  // domain the user is on (chatscream.live vs www.chatscream.live).
  // The env-var / stored config is only a last-resort fallback for non-browser
  // contexts (should never happen in practice).
  const baseRedirectUri =
    (typeof window !== 'undefined' && window.location?.origin
      ? `${window.location.origin}/oauth/callback`
      : null) ||
    publicConfig.redirectUriBase ||
    import.meta.env.VITE_OAUTH_REDIRECT_URI ||
    'https://chatscream.live/oauth/callback';

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
        redirectUri: baseRedirectUri,
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
        redirectUri: baseRedirectUri,
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
        redirectUri: baseRedirectUri,
      };

    case 'tiktok':
      return {
        clientId: publicConfig.tiktokClientKey || import.meta.env.VITE_TIKTOK_CLIENT_KEY || '',
        authorizationEndpoint: 'https://www.tiktok.com/v2/auth/authorize/',
        tokenEndpoint: 'https://open.tiktokapis.com/v2/oauth/token/',
        scopes: [
          'user.info.basic',
          'live.room.manage', // Required for TikTok LIVE streaming
          'video.upload', // Required for video/live access
        ],
        redirectUri: baseRedirectUri,
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

  // Store state in localStorage, namespaced per platform, so the OAuth popup
  // window can verify it. Namespacing prevents one pending flow (e.g. YouTube)
  // from getting clobbered if the user starts connecting a second platform
  // (e.g. Facebook) before the first popup's callback resolves.
  localStorage.setItem(oauthStateKey(platform), JSON.stringify(state));

  // Encode state as base64 for URL safety
  return btoa(JSON.stringify(state));
};

// Verify OAuth state from callback
export const verifyOAuthState = (stateParam: string): OAuthState | null => {
  try {
    const receivedState: OAuthState = JSON.parse(atob(stateParam));
    const storedState = localStorage.getItem(oauthStateKey(receivedState.platform));

    if (!storedState) {
      console.error(`No stored OAuth state found for platform "${receivedState.platform}"`);
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
    localStorage.removeItem(oauthStateKey(receivedState.platform));

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

  // TikTok uses different parameter names
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
  tiktok?: ConnectedAccount;
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
      tiktok?: ConnectedAccount;
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

    if (connected.tiktok) {
      platforms.tiktok = {
        platform: 'tiktok',
        ...connected.tiktok,
        expiresAt: new Date(connected.tiktok.expiresAt || Date.now()),
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

/** True when running on a mobile/tablet (touchscreen, narrow viewport, or mobile UA). */
const isMobileDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < 768 || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
};

/**
 * Open the OAuth authorization URL.
 * - Desktop: open a centered popup so the user stays in the studio.
 * - Mobile: skip the popup (always blocked) and open a new tab directly.
 * - Fallback: new tab, then same-tab as last resort.
 */
export const initiateOAuth = (platform: OAuthPlatform, userId: string): void => {
  const mobile = isMobileDevice();

  // For mobile we cannot reliably open a popup from an async context, so we
  // build the URL async and then open a new tab. We must open the tab
  // synchronously first (from the user-gesture context) to prevent blockers.
  if (mobile) {
    // Open a blank tab synchronously so the browser counts this as
    // user-initiated navigation (avoids the popup-blocker on mobile browsers).
    const mobileTab = window.open('about:blank', '_blank');

    void (async () => {
      try {
        const config = await getOAuthConfig(platform);
        if (!config.clientId) {
          console.error(`${platform} OAuth not configured. Missing client ID.`);
          if (mobileTab && !mobileTab.closed) mobileTab.close();
          alert(
            `${platform} integration is not configured yet. Open Admin Portal → OAuth IDs and paste the ${platform} client ID.`,
          );
          return;
        }
        const authUrl = await getAuthorizationUrl(platform, userId);
        if (mobileTab && !mobileTab.closed) {
          mobileTab.location.href = authUrl;
        } else {
          // Tab was blocked — last resort: navigate same tab
          window.location.assign(authUrl);
        }
      } catch (error) {
        console.error(`Failed to start ${platform} OAuth (mobile):`, error);
        if (mobileTab && !mobileTab.closed) mobileTab.close();
        alert(`Could not start ${platform} sign-in. Check your OAuth configuration and try again.`);
      }
    })();
    return;
  }

  // Desktop: centered popup keeps the user in the studio.
  const width = 600;
  const height = 700;
  const left = window.screenX + (window.outerWidth - width) / 2;
  const top = window.screenY + (window.outerHeight - height) / 2;
  const popupName = `${platform}_oauth`;
  const popupFeatures = `width=${width},height=${height},left=${left},top=${top},popup=yes`;

  // Open synchronously from user interaction to avoid popup blockers.
  const popup = window.open('about:blank', popupName, popupFeatures);
  if (popup) {
    popup.focus();
    try {
      popup.document.title = `Connect ${platform}`;
      popup.document.body.innerHTML =
        '<div style="font-family: sans-serif; padding: 16px;">Opening secure sign-in...</div>';
    } catch {
      // Ignore if the browser blocks popup document updates.
    }
  }

  void (async () => {
    try {
      const config = await getOAuthConfig(platform);

      if (!config.clientId) {
        console.error(`${platform} OAuth not configured. Missing client ID.`);
        alert(
          `${platform} integration is not configured yet. Open Admin Portal → OAuth IDs and paste the ${platform} client ID.`,
        );
        if (popup && !popup.closed) popup.close();
        return;
      }

      const authUrl = await getAuthorizationUrl(platform, userId);

      if (popup && !popup.closed) {
        popup.location.href = authUrl;
        return;
      }

      // Popup was blocked — try a new tab instead of hijacking the main window.
      // Same-tab navigation would kick the user out of the studio.
      const newTab = window.open(authUrl, '_blank');
      if (!newTab) {
        // Last resort: same tab (unlikely — at least we tried)
        window.location.assign(authUrl);
      }
    } catch (error) {
      console.error(`Failed to start ${platform} OAuth:`, error);
      if (popup && !popup.closed) popup.close();
      alert(
        `Could not start ${platform} sign-in. Verify OAuth client ID and redirect URI settings, then try again.`,
      );
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
