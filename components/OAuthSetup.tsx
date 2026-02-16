import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getOAuthPublicConfig, setOAuthPublicConfig } from '../services/backend';
import {
  Youtube,
  Facebook,
  Twitch,
  ExternalLink,
  Check,
  AlertCircle,
  Key,
  Globe,
  Copy,
  Eye,
  EyeOff,
  Save,
  RefreshCw,
} from 'lucide-react';

type PlatformKey = keyof typeof PLATFORM_INFO;

type ClientIdConfig = {
  clientId: string;
  redirectUri: string;
  enabled: boolean;
};

type AppIdConfig = {
  appId: string;
  redirectUri: string;
  enabled: boolean;
};

type PlatformConfig = ClientIdConfig | AppIdConfig;

interface OAuthConfig {
  youtube?: ClientIdConfig;
  facebook?: AppIdConfig;
  twitch?: ClientIdConfig;
}

const DEFAULT_REDIRECT_URI =
  typeof window !== 'undefined' ? `${window.location.origin}/oauth/callback` : '';

const PLATFORM_INFO = {
  youtube: {
    name: 'YouTube',
    icon: Youtube,
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/30',
    consoleUrl: 'https://console.cloud.google.com/apis/credentials',
    scopes: [
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/youtube.force-ssl',
    ],
    instructions: [
      'Go to Google Cloud Console',
      'Create or select a project',
      'Enable YouTube Data API v3',
      'Go to Credentials → Create OAuth 2.0 Client ID',
      'Set application type to "Web application"',
      'Add authorized redirect URI',
      'Copy Client ID here',
    ],
  },
  facebook: {
    name: 'Facebook',
    icon: Facebook,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    consoleUrl: 'https://developers.facebook.com/apps',
    scopes: ['publish_video', 'pages_show_list', 'pages_read_engagement'],
    instructions: [
      'Go to Facebook Developers',
      'Create a new app (Business type)',
      'Add Facebook Login product',
      'Go to Settings → Basic',
      'Copy App ID here',
      'Add valid OAuth redirect URI in Facebook Login settings',
      'Submit for App Review for live access',
    ],
  },
  twitch: {
    name: 'Twitch',
    icon: Twitch,
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/30',
    consoleUrl: 'https://dev.twitch.tv/console/apps',
    scopes: ['user:read:email', 'channel:read:stream_key', 'channel:manage:broadcast'],
    instructions: [
      'Go to Twitch Developer Console',
      'Register Your Application',
      'Set category to "Broadcasting"',
      'Add OAuth Redirect URL',
      'Copy Client ID here',
      'Note: Client Secret is configured server-side',
    ],
  },
};

const OAuthSetup: React.FC = () => {
  const { user, userProfile } = useAuth();
  const [config, setConfig] = useState<OAuthConfig>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isAdmin =
    userProfile?.role === 'admin' || user?.email?.toLowerCase() === 'mreardon@wtpnews.org';

  const isFacebookPlatform = (platform: PlatformKey): platform is 'facebook' =>
    platform === 'facebook';
  const isAppIdConfig = (platformConfig?: PlatformConfig): platformConfig is AppIdConfig =>
    Boolean(platformConfig && 'appId' in platformConfig);
  const isClientIdConfig = (platformConfig?: PlatformConfig): platformConfig is ClientIdConfig =>
    Boolean(platformConfig && 'clientId' in platformConfig);

  const buildDefaultConfig = (platform: PlatformKey): PlatformConfig =>
    isFacebookPlatform(platform)
      ? { appId: '', redirectUri: DEFAULT_REDIRECT_URI, enabled: false }
      : { clientId: '', redirectUri: DEFAULT_REDIRECT_URI, enabled: false };

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const oauth = await getOAuthPublicConfig();
      setConfig({
        youtube: {
          clientId: oauth.youtubeClientId || '',
          redirectUri: oauth.redirectUriBase || DEFAULT_REDIRECT_URI,
          enabled: Boolean(oauth.youtubeClientId),
        },
        facebook: {
          appId: oauth.facebookAppId || '',
          redirectUri: oauth.redirectUriBase || DEFAULT_REDIRECT_URI,
          enabled: Boolean(oauth.facebookAppId),
        },
        twitch: {
          clientId: oauth.twitchClientId || '',
          redirectUri: oauth.redirectUriBase || DEFAULT_REDIRECT_URI,
          enabled: Boolean(oauth.twitchClientId),
        },
      });
    } catch (err) {
      console.error('Failed to load OAuth config:', err);
      setError('Failed to load OAuth configuration');
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    if (!isAdmin) {
      setError('Admin access required');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await setOAuthPublicConfig({
        youtubeClientId: config.youtube?.clientId || '',
        facebookAppId: config.facebook?.appId || '',
        twitchClientId: config.twitch?.clientId || '',
        redirectUriBase:
          config.youtube?.redirectUri ||
          config.facebook?.redirectUri ||
          config.twitch?.redirectUri ||
          DEFAULT_REDIRECT_URI,
      });
      setSuccess('OAuth configuration saved successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Failed to save OAuth config:', err);
      setError('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const updatePlatformEnabled = (platform: PlatformKey, enabled: boolean) => {
    setConfig((prev) => {
      const previous = prev[platform] ?? buildDefaultConfig(platform);
      const nextConfig = isFacebookPlatform(platform)
        ? { ...(previous as AppIdConfig), enabled, redirectUri: DEFAULT_REDIRECT_URI }
        : { ...(previous as ClientIdConfig), enabled, redirectUri: DEFAULT_REDIRECT_URI };

      return {
        ...prev,
        [platform]: nextConfig,
      };
    });
  };

  const updatePlatformId = (platform: PlatformKey, idValue: string) => {
    setConfig((prev) => {
      const previous = prev[platform] ?? buildDefaultConfig(platform);
      const nextConfig = isFacebookPlatform(platform)
        ? { ...(previous as AppIdConfig), appId: idValue, redirectUri: DEFAULT_REDIRECT_URI }
        : { ...(previous as ClientIdConfig), clientId: idValue, redirectUri: DEFAULT_REDIRECT_URI };

      return {
        ...prev,
        [platform]: nextConfig,
      };
    });
  };

  const getPlatformId = (platform: PlatformKey): string => {
    const platformConfig = config[platform];
    if (isFacebookPlatform(platform) && isAppIdConfig(platformConfig)) {
      return platformConfig.appId;
    }
    if (isClientIdConfig(platformConfig)) {
      return platformConfig.clientId;
    }
    return '';
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setError('Failed to copy to clipboard');
    }
  };

  const getAuthUrl = (platform: PlatformKey) => {
    const platformConfig = config[platform];
    const clientId = getPlatformId(platform);
    if (!platformConfig || !clientId) return null;
    const info = PLATFORM_INFO[platform];
    const scopes = info.scopes.join(' ');
    const redirectUri = encodeURIComponent(platformConfig.redirectUri || DEFAULT_REDIRECT_URI);

    switch (platform) {
      case 'youtube':
        return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${encodeURIComponent(scopes)}&access_type=offline&prompt=consent`;
      case 'facebook':
        return `https://www.facebook.com/v18.0/dialog/oauth?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${encodeURIComponent(scopes)}`;
      case 'twitch':
        return `https://id.twitch.tv/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${encodeURIComponent(scopes)}`;
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Key className="w-5 h-5 text-brand-400" />
            OAuth Configuration
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            Configure platform connections for one-click streaming
          </p>
        </div>

        {isAdmin && (
          <button
            onClick={saveConfig}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 rounded-lg text-white font-medium transition-colors"
          >
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Configuration
          </button>
        )}
      </div>

      {/* Messages */}
      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          {error}
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 p-4 bg-green-500/10 border border-green-500/30 rounded-lg text-green-400">
          <Check className="w-5 h-5 flex-shrink-0" />
          {success}
        </div>
      )}

      {/* Redirect URI */}
      <div className="p-4 bg-dark-800 rounded-xl border border-gray-700">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-white flex items-center gap-2">
              <Globe className="w-4 h-4 text-gray-400" />
              OAuth Redirect URI
            </h3>
            <p className="text-sm text-gray-400 mt-1">
              Use this URI when configuring OAuth apps on each platform
            </p>
          </div>
          <button
            onClick={() => copyToClipboard(DEFAULT_REDIRECT_URI, 'redirect')}
            className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-white transition-colors"
          >
            {copied === 'redirect' ? (
              <Check className="w-4 h-4 text-green-400" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
            Copy
          </button>
        </div>
        <code className="block mt-3 p-3 bg-dark-900 rounded-lg text-sm text-brand-400 font-mono break-all">
          {DEFAULT_REDIRECT_URI}
        </code>
      </div>

      {/* Platform Cards */}
      <div className="grid gap-6">
        {(Object.keys(PLATFORM_INFO) as Array<keyof typeof PLATFORM_INFO>).map((platform) => {
          const info = PLATFORM_INFO[platform];
          const Icon = info.icon;
          const platformConfig = config[platform];
          const authUrl = getAuthUrl(platform);

          return (
            <div
              key={platform}
              className={`p-6 rounded-xl border ${info.borderColor} ${info.bgColor}`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${info.bgColor}`}>
                    <Icon className={`w-6 h-6 ${info.color}`} />
                  </div>
                  <div>
                    <h3 className="font-bold text-white">{info.name}</h3>
                    <a
                      href={info.consoleUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-gray-400 hover:text-white flex items-center gap-1"
                    >
                      Developer Console <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>

                <label className="flex items-center gap-2 cursor-pointer">
                  <span className="text-sm text-gray-400">Enabled</span>
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={platformConfig?.enabled || false}
                      onChange={(e) => updatePlatformEnabled(platform, e.target.checked)}
                      disabled={!isAdmin}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-6 bg-gray-700 rounded-full peer peer-checked:bg-brand-500 transition-colors" />
                    <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4" />
                  </div>
                </label>
              </div>

              {/* Client ID Input */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  {platform === 'facebook' ? 'App ID' : 'Client ID'}
                </label>
                <div className="relative">
                  <input
                    type={showSecrets[platform] ? 'text' : 'password'}
                    value={getPlatformId(platform)}
                    onChange={(e) => updatePlatformId(platform, e.target.value)}
                    disabled={!isAdmin}
                    placeholder={`Enter ${info.name} ${platform === 'facebook' ? 'App' : 'Client'} ID`}
                    className="w-full bg-dark-900 border border-gray-700 rounded-lg px-4 py-2.5 pr-20 text-white placeholder-gray-500 focus:border-brand-500 outline-none disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setShowSecrets((prev) => ({ ...prev, [platform]: !prev[platform] }))
                    }
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-white"
                  >
                    {showSecrets[platform] ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Test Connection Button */}
              {authUrl && platformConfig?.enabled && (
                <a
                  href={authUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-dark-900 hover:bg-dark-800 border border-gray-700 rounded-lg text-sm text-white transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  Test Connection
                </a>
              )}

              {/* Setup Instructions */}
              <details className="mt-4">
                <summary className="text-sm text-gray-400 cursor-pointer hover:text-white">
                  Setup Instructions
                </summary>
                <ol className="mt-3 space-y-2 text-sm text-gray-400 list-decimal list-inside">
                  {info.instructions.map((step, index) => (
                    <li key={index}>{step}</li>
                  ))}
                </ol>
              </details>

              {/* Required Scopes */}
              <div className="mt-4 pt-4 border-t border-gray-700/50">
                <p className="text-xs text-gray-500 mb-2">Required Scopes:</p>
                <div className="flex flex-wrap gap-1">
                  {info.scopes.map((scope) => (
                    <code
                      key={scope}
                      className="px-2 py-0.5 bg-dark-900 rounded text-xs text-gray-400"
                    >
                      {scope}
                    </code>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Server-Side Secrets Note */}
      <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-semibold text-amber-300">Server-Side Configuration Required</h4>
            <p className="text-sm text-amber-200/80 mt-1">
              Client secrets must be configured in your backend secret manager. Example environment
              variables:
            </p>
            <pre className="mt-3 p-3 bg-dark-900 rounded-lg text-xs text-gray-300 overflow-x-auto">
              {`YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=
FACEBOOK_APP_ID=
FACEBOOK_APP_SECRET=
TWITCH_CLIENT_ID=
TWITCH_CLIENT_SECRET=`}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OAuthSetup;
