import React, { useEffect, useMemo, useState } from 'react';
import { Destination, Platform } from '../types';
import {
  Trash2,
  Plus,
  Youtube,
  Facebook,
  Twitch,
  Globe,
  ToggleLeft,
  ToggleRight,
  Wifi,
  Info,
  Eye,
  EyeOff,
  Lock,
  AlertTriangle,
  Zap,
  Settings,
  Loader2,
  Music2,
} from 'lucide-react';
import { canAddDestination, type PlanTier } from '../services/stripe';
import {
  initiateOAuth,
  getChannels,
  getStreamKey,
  type AccountChannel,
  type OAuthPlatform as OAuthServicePlatform,
} from '../services/oauthService';
import { apiRequest } from '../services/apiClient';
import { getBackendCapabilities, getCurrentSessionToken } from '../services/backend';

type ConnectedPlatformsSummary = {
  youtube?: { channelName?: string };
  facebook?: { pageName?: string; pageId?: string };
  twitch?: { channelName?: string };
  tiktok?: { accountName?: string };
};

interface DestinationManagerProps {
  destinations: Destination[];
  onAddDestination: (dest: Destination) => void;
  onRemoveDestination: (id: string) => void;
  onToggleDestination: (id: string) => void;
  onUpdateDestination?: (id: string, patch: Partial<Destination>) => void;
  isStreaming: boolean;
  userPlan?: PlanTier;
  userEmail?: string | null;
  onUpgradeClick?: () => void;
  userId?: string;
  connectedPlatforms?: ConnectedPlatformsSummary;
  onOpenAdmin?: () => void;
  onPlatformConnected?: (platform: OAuthServicePlatform) => void;
}

type OAuthOption = {
  platform: Platform;
  oauthPlatform: OAuthServicePlatform;
  label: string;
  description: string;
  icon: React.ReactNode;
};

const DestinationManager: React.FC<DestinationManagerProps> = ({
  destinations,
  onAddDestination,
  onRemoveDestination,
  onToggleDestination,
  isStreaming,
  userPlan = 'free',
  userEmail,
  onUpgradeClick,
  userId,
  connectedPlatforms,
  onOpenAdmin,
  onPlatformConnected,
}) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newPlatform, setNewPlatform] = useState<Platform>(Platform.YOUTUBE);
  const [newName, setNewName] = useState('');
  const [newKey, setNewKey] = useState('');
  const [newServerUrl, setNewServerUrl] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [showYouTubePicker, setShowYouTubePicker] = useState(false);
  const [youtubeChannels, setYouTubeChannels] = useState<AccountChannel[]>([]);
  const [youtubeChannelsLoading, setYouTubeChannelsLoading] = useState(false);
  const [youtubeSelectionPending, setYouTubeSelectionPending] = useState<string | null>(null);
  const [youtubePickerError, setYouTubePickerError] = useState<string | null>(null);
  // Facebook Page picker
  const [showFacebookPicker, setShowFacebookPicker] = useState(false);
  const [facebookPages, setFacebookPages] = useState<
    { id: string; name: string; fanCount: number; pictureUrl: string | null }[]
  >([]);
  const [facebookPagesLoading, setFacebookPagesLoading] = useState(false);
  const [facebookPageSelectionPending, setFacebookPageSelectionPending] = useState<string | null>(
    null,
  );
  const [facebookPickerError, setFacebookPickerError] = useState<string | null>(null);
  // TikTok manual RTMP key entry
  const [showTikTokManualEntry, setShowTikTokManualEntry] = useState(false);
  const [tiktokManualKey, setTikTokManualKey] = useState('');
  const [connectingPlatform, setConnectingPlatform] = useState<OAuthServicePlatform | null>(null);
  const [oauthCapability, setOauthCapability] = useState({
    youtube: true,
    facebook: true,
    twitch: true,
    tiktok: true,
  });

  const safeAlert = (message: string) => {
    const isJsdom =
      typeof navigator !== 'undefined' && navigator.userAgent?.toLowerCase().includes('jsdom');
    if (!isJsdom && typeof window !== 'undefined' && typeof window.alert === 'function') {
      try {
        window.alert(message);
        return;
      } catch {
        // fall through to console.warn
      }
    }
    console.warn(message);
  };

  const destinationLimit = useMemo(() => {
    return canAddDestination(userPlan, destinations.length, userEmail);
  }, [userPlan, destinations.length, userEmail]);

  // Track OAuth credential status for better error messaging
  const [oauthDiagnostics, setOauthDiagnostics] = useState({
    youtube: { configured: false, missingSecret: false },
    facebook: { configured: false, missingSecret: false },
    twitch: { configured: false, missingSecret: false },
    tiktok: { configured: false, missingSecret: false },
  });

  useEffect(() => {
    const loadCapabilities = async () => {
      try {
        const capabilities = await getBackendCapabilities();
        setOauthCapability(capabilities.streamKeyPlatforms);
        // Store diagnostic info for UI messaging
        if (capabilities.oauthDiagnostics) {
          setOauthDiagnostics(capabilities.oauthDiagnostics);
        }
      } catch {
        // On error, assume all platforms are available but will fail on connect
        setOauthCapability({ youtube: true, facebook: true, twitch: true, tiktok: true });
      }
    };

    void loadCapabilities();
  }, []);

  const handleAddWithLimitCheck = (dest: Destination): boolean => {
    if (!destinationLimit.allowed) {
      return false;
    }
    onAddDestination(dest);
    return true;
  };

  const oauthOptions = useMemo<OAuthOption[]>(
    () => [
      {
        platform: Platform.YOUTUBE,
        oauthPlatform: 'youtube' as const,
        label: 'YouTube',
        description: 'Stream to your main channel or brand account with YouTube verified bitrate.',
        icon: <Youtube className="text-red-500" aria-hidden />,
      },
      {
        platform: Platform.TWITCH,
        oauthPlatform: 'twitch' as const,
        label: 'Twitch',
        description:
          'Fast, secure connection to fetch your ingest server and stream key automatically.',
        icon: <Twitch className="text-purple-500" aria-hidden />,
      },
      {
        platform: Platform.FACEBOOK,
        oauthPlatform: 'facebook' as const,
        label: 'Facebook',
        description: 'Go live on your personal profile or managed pages with a single click.',
        icon: <Facebook className="text-blue-500" aria-hidden />,
      },
      {
        platform: Platform.TIKTOK,
        oauthPlatform: 'tiktok' as const,
        label: 'TikTok',
        description: 'Connect your TikTok account for live streaming. Requires TikTok LIVE access.',
        icon: <Music2 className="text-pink-500" aria-hidden />,
      },
    ],
    [],
  );

  const visibleOAuthOptions = useMemo(
    () => oauthOptions.filter((option) => oauthCapability[option.oauthPlatform]),
    [oauthCapability, oauthOptions],
  );

  const createOAuthDestination = (
    platform: Platform,
    options: {
      name?: string;
      streamKey?: string;
      serverUrl?: string;
    } = {},
  ): Destination => {
    const platformName = platform === Platform.CUSTOM_RTMP ? 'Custom' : platform;
    const existingCount = destinations.filter((d) => d.platform === platform).length;
    const sequence = existingCount + 1;

    return {
      id: `${platform}-${Date.now()}`,
      platform,
      name: options.name || `${platformName} Account ${sequence}`,
      streamKey: options.streamKey || 'oauth-linked',
      serverUrl: options.serverUrl,
      authType: 'oauth',
      isEnabled: true,
      status: 'offline',
    };
  };

  const handleAdd = () => {
    if (!newName || !newKey) return;
    if (!destinationLimit.allowed) return;

    const newDest: Destination = {
      id: Date.now().toString(),
      platform: newPlatform,
      name: newName,
      streamKey: newKey,
      serverUrl: newServerUrl || undefined,
      authType: 'manual',
      isEnabled: true,
      status: 'offline',
    };
    onAddDestination(newDest);
    setNewName('');
    setNewKey('');
    setNewServerUrl('');
    setShowAddForm(false);
  };

  const getIcon = (p: Platform) => {
    switch (p) {
      case Platform.YOUTUBE:
        return <Youtube className="text-red-500" />;
      case Platform.FACEBOOK:
        return <Facebook className="text-blue-500" />;
      case Platform.TWITCH:
        return <Twitch className="text-purple-500" />;
      case Platform.KICK:
        return (
          <div className="w-5 h-5 bg-green-500 rounded flex items-center justify-center text-[10px] font-bold text-black">
            K
          </div>
        );
      case Platform.X_TWITTER:
        return (
          <div className="w-5 h-5 bg-white text-black rounded flex items-center justify-center font-black">
            X
          </div>
        );
      case Platform.RUMBLE:
        return (
          <div className="w-5 h-5 bg-green-600 rounded flex items-center justify-center text-[10px] font-bold text-white">
            R
          </div>
        );
      default:
        return <Globe className="text-gray-400" />;
    }
  };

  const isPlatformConnected = (platform: OAuthServicePlatform): boolean => {
    if (!connectedPlatforms) return false;
    return Boolean(connectedPlatforms[platform]);
  };

  const getConnectedLabel = (platform: OAuthServicePlatform): string => {
    if (!connectedPlatforms) return 'Not connected';
    if (platform === 'youtube')
      return connectedPlatforms.youtube?.channelName
        ? `Connected: ${connectedPlatforms.youtube.channelName}`
        : 'Connected';
    if (platform === 'facebook')
      return connectedPlatforms.facebook?.pageName
        ? `Connected: ${connectedPlatforms.facebook.pageName}`
        : 'Connected';
    if (platform === 'twitch')
      return connectedPlatforms.twitch?.channelName
        ? `Connected: ${connectedPlatforms.twitch.channelName}`
        : 'Connected';
    return 'Connected';
  };

  const handleConnectOAuth = (platform: OAuthServicePlatform) => {
    if (!userId) {
      safeAlert('Please sign in again to connect this platform.');
      return;
    }

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'oauth:connected' && event.data?.platform === platform) {
        window.removeEventListener('message', onMessage);
        if (!event.data?.error) {
          onPlatformConnected?.(platform);
          // Auto-open channel picker for YouTube after connecting
          if (platform === 'youtube') {
            setTimeout(() => openYouTubeChannelPicker(), 500);
          }
        }
      }
    };
    window.addEventListener('message', onMessage);
    // Clean up listener after 5 minutes if OAuth never completes
    setTimeout(() => window.removeEventListener('message', onMessage), 5 * 60 * 1000);

    initiateOAuth(platform, userId);
  };

  const openYouTubeChannelPicker = async () => {
    if (!userId) {
      safeAlert('Please sign in again to manage YouTube destinations.');
      return;
    }
    setShowYouTubePicker(true);
    setYouTubeChannelsLoading(true);
    setYouTubePickerError(null);

    const result = await getChannels('youtube');
    if (result.error) {
      setYouTubeChannels([]);
      setYouTubePickerError(result.error);
      setYouTubeChannelsLoading(false);
      return;
    }

    setYouTubeChannels(result.channels);
    if (!result.channels.length) {
      setYouTubePickerError(
        'No YouTube channels found. Ensure this Google account has a YouTube channel.',
      );
    }
    setYouTubeChannelsLoading(false);
  };

  const openFacebookPagePicker = async () => {
    if (!userId) {
      safeAlert('Please sign in again to manage Facebook destinations.');
      return;
    }
    setShowFacebookPicker(true);
    setFacebookPagesLoading(true);
    setFacebookPickerError(null);

    try {
      const data = await apiRequest<{
        pages: { id: string; name: string; fanCount: number; pictureUrl: string | null }[];
      }>('/api/destinations/facebook/pages', {
        headers: { Authorization: `Bearer ${getCurrentSessionToken() ?? ''}` },
      });
      setFacebookPages(data.pages || []);
      if (!data.pages?.length) {
        setFacebookPickerError(
          'No Facebook Pages found. You can still stream to your personal profile by selecting "Personal Profile" below.',
        );
      }
    } catch {
      setFacebookPickerError(
        'Could not load Facebook Pages. Reconnect your account or stream to your personal profile.',
      );
      setFacebookPages([]);
    }
    setFacebookPagesLoading(false);
  };

  const handleAddFacebookPage = async (pageId: string | null, pageName: string) => {
    if (!destinationLimit.allowed) {
      safeAlert(destinationLimit.message);
      return;
    }
    setFacebookPageSelectionPending(pageId ?? 'personal');
    try {
      const data = await apiRequest<{
        streamUrl?: string;
        streamKey?: string;
        liveVideoId?: string;
      }>('/api/destinations/facebook/create-live', {
        method: 'POST',
        headers: { Authorization: `Bearer ${getCurrentSessionToken() ?? ''}` },
        body: pageId ? { pageId } : {},
      });
      if (!data.streamUrl) {
        safeAlert(
          'Facebook did not return a stream URL. Ensure your account has live streaming permissions.',
        );
        return;
      }
      // Facebook live_videos returns stream_url as "rtmp://live-api-s.facebook.com:80/rtmp/<key>"
      // Split into serverUrl + streamKey
      const urlParts = data.streamUrl.match(/^(rtmp:\/\/[^/]+\/[^/]+)\/(.+)$/);
      const serverUrl = urlParts ? urlParts[1] : data.streamUrl;
      const streamKey = urlParts ? urlParts[2] : data.streamKey || '';
      const liveVideoId = data.liveVideoId || undefined;

      handleAddWithLimitCheck({
        ...createOAuthDestination(Platform.FACEBOOK, {
          name: `Facebook Live - ${pageName}`,
          serverUrl,
          streamKey,
        }),
        liveVideoId,
      });
      setShowFacebookPicker(false);
    } catch (err: unknown) {
      const msg =
        (err instanceof Error ? err.message : null) ||
        'Facebook live creation failed. Confirm your account has live streaming permissions.';
      safeAlert(msg);
    }
    setFacebookPageSelectionPending(null);
  };

  const handleAddTikTokManual = () => {
    if (!tiktokManualKey.trim()) {
      safeAlert('Please enter your TikTok RTMP stream key.');
      return;
    }
    if (!destinationLimit.allowed) {
      safeAlert(destinationLimit.message);
      return;
    }
    handleAddWithLimitCheck(
      createOAuthDestination(Platform.TIKTOK, {
        name: 'TikTok LIVE',
        serverUrl: 'rtmp://push.tiktokv.com/live/',
        streamKey: tiktokManualKey.trim(),
      }),
    );
    setTikTokManualKey('');
    setShowTikTokManualEntry(false);
  };

  const handleAddYouTubeChannel = async (channel: AccountChannel) => {
    if (!destinationLimit.allowed) {
      safeAlert(destinationLimit.message);
      return;
    }

    setYouTubeSelectionPending(channel.id);
    const result = await getStreamKey('youtube', channel.id);
    setYouTubeSelectionPending(null);

    if (result.error) {
      safeAlert(result.error);
      return;
    }
    if (!result.streamKey || !result.ingestUrl) {
      safeAlert(
        'Stream key not available yet. Create or verify a reusable stream in YouTube Studio and try again.',
      );
      return;
    }

    const added = handleAddWithLimitCheck(
      createOAuthDestination(Platform.YOUTUBE, {
        name: `YouTube - ${channel.name}`,
        streamKey: result.streamKey,
        serverUrl: result.ingestUrl,
      }),
    );
    if (!added) {
      safeAlert(destinationLimit.message);
      return;
    }
    setShowYouTubePicker(false);
  };

  const handleOAuthPrimaryAction = async (option: OAuthOption) => {
    if (!userId) return safeAlert('Please sign in');

    setConnectingPlatform(option.oauthPlatform);
    try {
      if (option.oauthPlatform === 'youtube') {
        if (isPlatformConnected('youtube')) await openYouTubeChannelPicker();
        else handleConnectOAuth('youtube');
      } else if (option.oauthPlatform === 'twitch') {
        if (isPlatformConnected('twitch')) {
          try {
            const data = await apiRequest<{
              streamKey?: string;
              serverUrl?: string;
              message?: string;
            }>('/api/destinations/twitch/stream-key', {
              headers: { Authorization: `Bearer ${getCurrentSessionToken() ?? ''}` },
            });
            if (data.streamKey) {
              onAddDestination(
                createOAuthDestination(Platform.TWITCH, {
                  name: 'Twitch Channel',
                  streamKey: data.streamKey,
                  serverUrl: data.serverUrl,
                }),
              );
            } else if (data.message) {
              safeAlert(data.message);
            }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : null;
            safeAlert(
              msg ||
                'Twitch stream key retrieval failed. Confirm Twitch OAuth is connected and TWITCH_CLIENT_ID/TWITCH_CLIENT_SECRET are configured server-side.',
            );
          }
        } else handleConnectOAuth('twitch');
      } else if (option.oauthPlatform === 'facebook') {
        if (isPlatformConnected('facebook')) {
          await openFacebookPagePicker();
        } else handleConnectOAuth('facebook');
      } else if (option.oauthPlatform === 'tiktok') {
        if (isPlatformConnected('tiktok')) {
          setShowTikTokManualEntry(true);
        } else handleConnectOAuth('tiktok');
      }
    } finally {
      setConnectingPlatform(null);
    }
  };

  const handleOAuthAddDestination = async (option: OAuthOption) => {
    if (option.oauthPlatform === 'youtube') {
      if (isPlatformConnected('youtube')) {
        await openYouTubeChannelPicker();
      } else {
        handleConnectOAuth('youtube');
      }
      return;
    }

    handleAddWithLimitCheck(createOAuthDestination(option.platform));
  };

  return (
    <div className="bg-gradient-to-b from-dark-800 to-dark-900 p-4 rounded-xl border border-gray-700/80 h-full flex flex-col">
      <div className="mb-4">
        <div className="flex justify-between items-start gap-3">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Wifi size={20} /> Destinations
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              Connect accounts and choose where your stream goes live.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`text-xs px-2 py-1 rounded border ${
                !destinationLimit.allowed
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-gray-800/60 text-gray-300 border-gray-700'
              }`}
            >
              {destinationLimit.maxDestinations === -1
                ? `${destinations.length} used`
                : `${destinations.length}/${destinationLimit.maxDestinations}`}
            </span>
            {!showAddForm && destinationLimit.allowed && (
              <button
                onClick={() => setShowAddForm(true)}
                disabled={isStreaming}
                className={`text-xs bg-brand-600 hover:bg-brand-500 px-2.5 py-1.5 rounded flex items-center gap-1 ${isStreaming ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <Plus size={14} /> Add Custom
              </button>
            )}
          </div>
        </div>
      </div>

      {!destinationLimit.allowed && (
        <div className="mb-4 bg-amber-500/10 p-3 rounded border border-amber-500/30 flex items-start gap-2">
          <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-xs text-amber-200 font-medium">{destinationLimit.message}</p>
            {onUpgradeClick && (
              <button
                onClick={onUpgradeClick}
                className="mt-2 text-xs bg-brand-600 hover:bg-brand-500 px-3 py-1.5 rounded flex items-center gap-1.5 font-medium"
              >
                <Zap size={12} /> Upgrade Plan
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        <div className="mb-4 bg-brand-900/30 p-3 rounded border border-brand-500/25 text-xs text-gray-300 flex gap-2">
          <Info size={16} className="text-brand-300 shrink-0 mt-0.5" />
          <p>
            Add multiple accounts from the same platform as separate destinations, such as personal
            and business channels.
          </p>
        </div>

        {showAddForm && (
          <div className="bg-gray-800/95 p-3 rounded-lg border border-brand-500 mb-3 animate-fade-in">
            <h3 className="text-xs font-semibold mb-2 text-gray-300">
              ADD MANUAL RTMP DESTINATION
            </h3>
            <select
              value={newPlatform}
              onChange={(e) => setNewPlatform(e.target.value as Platform)}
              className="w-full bg-dark-900 border border-gray-700 rounded p-2 mb-2 text-sm text-white focus:border-brand-500 outline-none"
            >
              {Object.values(Platform).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>

            <input
              type="text"
              placeholder={
                newPlatform === Platform.FACEBOOK
                  ? 'RTMP Server URL (from Facebook Live Producer)'
                  : 'RTMP Server URL (e.g. rtmp://my.server/app)'
              }
              value={newServerUrl}
              onChange={(e) => setNewServerUrl(e.target.value)}
              className="w-full bg-dark-900 border border-gray-700 rounded p-2 mb-2 text-sm text-white focus:border-brand-500 outline-none"
            />

            <input
              type="text"
              placeholder="Account Name (e.g. Personal YT)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full bg-dark-900 border border-gray-700 rounded p-2 mb-2 text-sm text-white focus:border-brand-500 outline-none"
            />
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                placeholder="Stream Key"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                className="w-full bg-dark-900 border border-gray-700 rounded p-2 mb-2 text-sm text-white pr-8 focus:border-brand-500 outline-none"
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-2 text-gray-400 hover:text-white"
              >
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowAddForm(false)}
                className="text-xs text-gray-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                className="text-xs bg-brand-600 px-3 py-1 rounded text-white hover:bg-brand-500"
              >
                Save
              </button>
            </div>
          </div>
        )}

        <section className="mb-4 rounded-lg border border-brand-500/20 bg-dark-900/70 p-3">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[11px] uppercase tracking-wide text-brand-200 font-semibold">
              Quick Connect (OAuth)
            </h3>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/20 text-green-300 font-semibold">
              Recommended
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {visibleOAuthOptions.map((option) => (
              <div
                key={option.platform}
                className={`flex items-start gap-3 p-3 rounded-lg border transition-all text-left bg-dark-900/80 hover:border-brand-500/60 hover:shadow-lg hover:shadow-brand-900/30 ${
                  isStreaming || !destinationLimit.allowed ? 'opacity-50' : 'border-gray-600'
                }`}
              >
                <div className="mt-0.5">{option.icon}</div>
                <div className="flex-1 space-y-2 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{option.label}</span>
                  </div>
                  <p className="text-xs text-gray-300 leading-relaxed">{option.description}</p>
                  <div className="inline-flex items-center gap-1 text-[11px] text-brand-200 bg-brand-900/40 px-2 py-1 rounded-full border border-brand-500/20">
                    <Lock size={12} /> Secure OAuth sign-in
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-[11px] truncate ${
                        isPlatformConnected(option.oauthPlatform)
                          ? 'text-emerald-300'
                          : 'text-gray-500'
                      }`}
                    >
                      {isPlatformConnected(option.oauthPlatform)
                        ? getConnectedLabel(option.oauthPlatform)
                        : 'Not connected'}
                    </span>
                    <div className="flex items-center gap-2">
                      {onOpenAdmin && (
                        <button
                          type="button"
                          onClick={onOpenAdmin}
                          disabled={isStreaming}
                          className="text-[11px] px-2 py-1 rounded bg-gray-800/80 hover:bg-gray-800 border border-gray-600 text-gray-200 disabled:opacity-50"
                          title="Open Admin Portal (OAuth IDs)"
                        >
                          <Settings size={14} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          void handleOAuthPrimaryAction(option);
                        }}
                        disabled={
                          isStreaming ||
                          !destinationLimit.allowed ||
                          connectingPlatform === option.oauthPlatform ||
                          (option.oauthPlatform === 'youtube' && youtubeChannelsLoading)
                        }
                        className="text-[11px] px-2 py-1 rounded bg-brand-600 hover:bg-brand-500 text-white disabled:opacity-50 flex items-center gap-1"
                        aria-label={`Connect ${option.label}`}
                      >
                        {connectingPlatform === option.oauthPlatform ? (
                          <>
                            <Loader2 size={10} className="animate-spin" />
                            Opening...
                          </>
                        ) : option.oauthPlatform === 'youtube' && isPlatformConnected('youtube') ? (
                          youtubeChannelsLoading ? (
                            'Loading...'
                          ) : (
                            'Select channel'
                          )
                        ) : (
                          `Connect ${option.label}`
                        )}
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void handleOAuthAddDestination(option);
                    }}
                    disabled={
                      isStreaming ||
                      !destinationLimit.allowed ||
                      (option.oauthPlatform === 'youtube' && youtubeChannelsLoading)
                    }
                    className="w-full text-[11px] px-2 py-2 rounded bg-gray-800/80 hover:bg-gray-800 border border-gray-600 text-gray-200 disabled:opacity-50"
                  >
                    {option.oauthPlatform === 'youtube' && isPlatformConnected('youtube')
                      ? 'Select destination'
                      : 'Add destination'}
                  </button>
                </div>
              </div>
            ))}
          </div>
          {visibleOAuthOptions.length === 0 && (
            <div className="space-y-2">
              <p className="text-xs text-amber-300 mb-3">
                OAuth quick-connect requires provider credentials. Ask an admin to configure them in
                the Admin Portal.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {oauthOptions.map((option) => (
                  <div
                    key={option.platform}
                    className="flex items-start gap-3 p-3 rounded-lg border border-gray-700 bg-dark-900/40 opacity-60"
                  >
                    <div className="mt-0.5">{option.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-sm">{option.label}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-700 text-gray-400 font-semibold">
                          Setup Required
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 leading-relaxed">
                        {oauthDiagnostics[option.oauthPlatform as keyof typeof oauthDiagnostics]
                          ?.missingSecret
                          ? `${option.label} client ID found but server secret is missing. Configure backend secrets.`
                          : `${option.label} OAuth credentials not configured. Contact admin.`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {visibleOAuthOptions.length > 0 && visibleOAuthOptions.length < oauthOptions.length && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
              {oauthOptions
                .filter((o) => !oauthCapability[o.oauthPlatform])
                .map((option) => (
                  <div
                    key={option.platform}
                    className="flex items-start gap-3 p-3 rounded-lg border border-gray-700 bg-dark-900/40 opacity-60"
                  >
                    <div className="mt-0.5">{option.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-sm">{option.label}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-700 text-gray-400 font-semibold">
                          Setup Required
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 leading-relaxed">
                        {oauthDiagnostics[option.oauthPlatform as keyof typeof oauthDiagnostics]
                          ?.missingSecret
                          ? `${option.label} client ID configured but server secret missing.`
                          : `${option.label} OAuth not fully configured.`}
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </section>

        {showYouTubePicker && (
          <div className="bg-gray-800/95 p-3 rounded-lg border border-gray-600 mb-3 animate-fade-in space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold text-gray-200">SELECT YOUTUBE DESTINATION</h3>
              <button
                type="button"
                onClick={() => setShowYouTubePicker(false)}
                className="text-xs text-gray-400 hover:text-white"
              >
                Close
              </button>
            </div>

            {youtubeChannelsLoading && <p className="text-xs text-gray-300">Loading channels...</p>}

            {!youtubeChannelsLoading && youtubePickerError && (
              <p className="text-xs text-amber-300">{youtubePickerError}</p>
            )}

            {!youtubeChannelsLoading && !youtubePickerError && youtubeChannels.length === 0 && (
              <p className="text-xs text-gray-400">No channels available.</p>
            )}

            {!youtubeChannelsLoading && youtubeChannels.length > 0 && (
              <div className="space-y-2">
                {youtubeChannels.map((channel) => (
                  <button
                    key={channel.id}
                    type="button"
                    onClick={() => {
                      void handleAddYouTubeChannel(channel);
                    }}
                    disabled={Boolean(youtubeSelectionPending)}
                    className="w-full flex items-center justify-between gap-3 rounded-lg border border-gray-700 bg-dark-900 px-3 py-2 text-left hover:border-brand-500/60 disabled:opacity-60"
                  >
                    <span className="text-sm truncate">{channel.name}</span>
                    <span className="text-[11px] text-brand-300 shrink-0">
                      {youtubeSelectionPending === channel.id ? 'Adding...' : 'Use channel'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {showFacebookPicker && (
          <div className="bg-gray-800/95 p-3 rounded-lg border border-gray-600 mb-3 animate-fade-in space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold text-gray-200">SELECT FACEBOOK DESTINATION</h3>
              <button
                type="button"
                onClick={() => setShowFacebookPicker(false)}
                className="text-xs text-gray-400 hover:text-white"
              >
                Close
              </button>
            </div>

            {facebookPagesLoading && <p className="text-xs text-gray-300">Loading pages...</p>}

            {!facebookPagesLoading && facebookPickerError && (
              <p className="text-xs text-amber-300">{facebookPickerError}</p>
            )}

            {!facebookPagesLoading && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    void handleAddFacebookPage(null, 'Personal Profile');
                  }}
                  disabled={Boolean(facebookPageSelectionPending)}
                  className="w-full flex items-center justify-between gap-3 rounded-lg border border-gray-700 bg-dark-900 px-3 py-2 text-left hover:border-brand-500/60 disabled:opacity-60"
                >
                  <span className="text-sm truncate">Personal Profile</span>
                  <span className="text-[11px] text-brand-300 shrink-0">
                    {facebookPageSelectionPending === 'personal' ? 'Adding...' : 'Use profile'}
                  </span>
                </button>
                {facebookPages.map((page) => (
                  <button
                    key={page.id}
                    type="button"
                    onClick={() => {
                      void handleAddFacebookPage(page.id, page.name);
                    }}
                    disabled={Boolean(facebookPageSelectionPending)}
                    className="w-full flex items-center justify-between gap-3 rounded-lg border border-gray-700 bg-dark-900 px-3 py-2 text-left hover:border-brand-500/60 disabled:opacity-60"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {page.pictureUrl && (
                        <img
                          src={page.pictureUrl}
                          alt=""
                          className="w-6 h-6 rounded-full shrink-0"
                        />
                      )}
                      <span className="text-sm truncate">{page.name}</span>
                    </div>
                    <span className="text-[11px] text-brand-300 shrink-0">
                      {facebookPageSelectionPending === page.id ? 'Adding...' : 'Use page'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {showTikTokManualEntry && (
          <div className="bg-gray-800/95 p-3 rounded-lg border border-gray-600 mb-3 animate-fade-in space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold text-gray-200">TIKTOK LIVE — RTMP KEY</h3>
              <button
                type="button"
                onClick={() => setShowTikTokManualEntry(false)}
                className="text-xs text-gray-400 hover:text-white"
              >
                Close
              </button>
            </div>
            <p className="text-xs text-gray-400">
              TikTok Live requires 10,000+ followers and partner access. Get your RTMP key from{' '}
              <a
                href="https://www.tiktok.com/studio/livestream"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-400 underline"
              >
                TikTok Studio → Go LIVE
              </a>{' '}
              → RTMP.
            </p>
            <div className="flex gap-2">
              <input
                type="password"
                placeholder="Paste your TikTok stream key..."
                value={tiktokManualKey}
                onChange={(e) => setTikTokManualKey(e.target.value)}
                className="flex-1 text-xs bg-dark-900 border border-gray-700 rounded px-2 py-1.5 text-white placeholder-gray-500 focus:border-brand-500 outline-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddTikTokManual();
                }}
              />
              <button
                type="button"
                onClick={handleAddTikTokManual}
                disabled={!tiktokManualKey.trim()}
                className="text-xs bg-brand-600 hover:bg-brand-500 disabled:opacity-50 px-3 py-1.5 rounded"
              >
                Add
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <h3 className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">
            Connected Destinations
          </h3>
          <span className="text-[11px] text-gray-500">{destinations.length} total</span>
        </div>

        {destinations.length === 0 && !showAddForm && (
          <div className="rounded-lg border border-dashed border-gray-700 bg-dark-900/70 p-4 text-center">
            <p className="text-gray-300 text-sm">No destinations connected yet.</p>
            <p className="text-gray-500 text-xs mt-1">
              Use Quick Connect above or add a manual RTMP destination.
            </p>
          </div>
        )}

        {destinations.map((dest) => (
          <div
            key={dest.id}
            className="flex items-center justify-between bg-dark-900 p-3 rounded-lg border border-gray-700 hover:border-gray-500 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              {getIcon(dest.platform)}
              <div className="min-w-0">
                <div className="text-sm font-medium truncate" title={dest.name}>
                  {dest.name}
                </div>
                <div className="text-xs text-gray-400 flex items-center gap-1.5">
                  {dest.status === 'live' ? (
                    <span className="text-red-400 font-semibold uppercase tracking-wide">LIVE</span>
                  ) : (
                    <span className="capitalize">{dest.status}</span>
                  )}
                  {dest.authType === 'oauth' && (
                    <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                      OAuth
                    </span>
                  )}
                  {isStreaming && dest.status === 'connecting' && (
                    <Loader2 size={12} className="animate-spin ml-0.5 text-brand-300" />
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => onToggleDestination(dest.id)}
                disabled={isStreaming}
                className={`text-gray-300 hover:text-white ${isStreaming ? 'opacity-50 cursor-not-allowed' : ''}`}
                title={dest.isEnabled ? 'Disable' : 'Enable'}
              >
                {dest.isEnabled ? (
                  <ToggleRight size={24} className="text-brand-500" />
                ) : (
                  <ToggleLeft size={24} />
                )}
              </button>
              <button
                onClick={() => onRemoveDestination(dest.id)}
                disabled={isStreaming}
                className={`text-gray-500 hover:text-red-400 ${isStreaming ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DestinationManager;
