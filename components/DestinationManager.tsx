import React, { useMemo, useState } from 'react';
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
} from 'lucide-react';
import { canAddDestination, getPlanById, type PlanTier } from '../services/stripe';
import {
  initiateOAuth,
  getStreamKey,
  type OAuthPlatform as OAuthServicePlatform,
} from '../services/oauthService';

type ConnectedPlatformsSummary = {
  youtube?: { channelName?: string };
  facebook?: { pageName?: string; pageId?: string };
  twitch?: { channelName?: string };
};

interface DestinationManagerProps {
  destinations: Destination[];
  onAddDestination: (dest: Destination) => void;
  onRemoveDestination: (id: string) => void;
  onToggleDestination: (id: string) => void;
  onUpdateDestination?: (id: string, patch: Partial<Destination>) => void;
  isStreaming: boolean;
  userPlan?: PlanTier;
  onUpgradeClick?: () => void;
  userId?: string;
  connectedPlatforms?: ConnectedPlatformsSummary;
  onOpenAdmin?: () => void;
}

const DestinationManager: React.FC<DestinationManagerProps> = ({
  destinations,
  onAddDestination,
  onRemoveDestination,
  onToggleDestination,
  onUpdateDestination = () => {},
  isStreaming,
  userPlan = 'free',
  onUpgradeClick,
  userId,
  connectedPlatforms,
  onOpenAdmin,
}) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newPlatform, setNewPlatform] = useState<Platform>(Platform.YOUTUBE);
  const [newName, setNewName] = useState('');
  const [newKey, setNewKey] = useState('');
  const [newServerUrl, setNewServerUrl] = useState('');
  const [showKey, setShowKey] = useState(false);

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

  // Check destination limits
  const destinationLimit = useMemo(() => {
    return canAddDestination(userPlan, destinations.length);
  }, [userPlan, destinations.length]);

  const currentPlan = useMemo(() => getPlanById(userPlan), [userPlan]);

  const handleAddWithLimitCheck = (dest: Destination): boolean => {
    if (!destinationLimit.allowed) {
      return false; // Don't allow adding if limit reached
    }
    onAddDestination(dest);
    return true;
  };

  const oauthOptions = useMemo(
    () => [
      {
        platform: Platform.YOUTUBE,
        oauthPlatform: 'youtube' as const,
        label: 'YouTube',
        description: 'Stream to your main channel or brand account with YouTube verified bitrate.',
        icon: <Youtube className="text-red-500" aria-hidden />,
      },
      {
        platform: Platform.FACEBOOK,
        oauthPlatform: 'facebook' as const,
        label: 'Facebook Live',
        description: 'Go live to your profile or page without copying stream keys.',
        icon: <Facebook className="text-blue-500" aria-hidden />,
      },
      {
        platform: Platform.TWITCH,
        oauthPlatform: 'twitch' as const,
        label: 'Twitch',
        description: 'Authenticate your channel to keep VOD/audio rules in sync.',
        icon: <Twitch className="text-purple-500" aria-hidden />,
      },
    ],
    [],
  );

  const createOAuthDestination = (platform: Platform): Destination => {
    const platformName = platform === Platform.CUSTOM_RTMP ? 'Custom' : platform;
    const existingCount = destinations.filter((d) => d.platform === platform).length;
    const sequence = existingCount + 1;

    return {
      id: `${platform}-${Date.now()}`,
      platform,
      name: `${platformName} Account ${sequence}`,
      streamKey: 'oauth-linked',
      authType: 'oauth',
      isEnabled: true,
      status: 'offline',
    };
  };

  const handleAdd = () => {
    if (!newName || !newKey || (newPlatform === Platform.CUSTOM_RTMP && !newServerUrl)) return;
    if (!destinationLimit.allowed) return; // Enforce limit

    const newDest: Destination = {
      id: Date.now().toString(),
      platform: newPlatform,
      name: newName,
      streamKey: newKey,
      serverUrl: newPlatform === Platform.CUSTOM_RTMP ? newServerUrl : undefined,
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
    initiateOAuth(platform, userId);
  };

  const handleSyncStreamKey = async (dest: Destination, platform: OAuthServicePlatform) => {
    if (!userId) {
      safeAlert('Please sign in again to sync stream info.');
      return;
    }
    const result = await getStreamKey(platform);
    if (result.error) {
      safeAlert(result.error);
      return;
    }
    if (!result.streamKey || !result.ingestUrl) {
      safeAlert(
        'Stream key not available yet. Try again after connecting, or create a broadcast on the platform.',
      );
      return;
    }
    onUpdateDestination(dest.id, { streamKey: result.streamKey, serverUrl: result.ingestUrl });
  };

  return (
    <div className="bg-dark-800 p-4 rounded-lg border border-gray-700 h-full flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Wifi size={20} /> Destinations
        </h2>
        <div className="flex items-center gap-2">
          {/* Destination counter */}
          <span
            className={`text-xs px-2 py-1 rounded ${
              !destinationLimit.allowed
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : 'bg-gray-700/50 text-gray-400'
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
              className={`text-xs bg-brand-600 hover:bg-brand-500 px-2 py-1 rounded flex items-center gap-1 ${isStreaming ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <Plus size={14} /> Add
            </button>
          )}
        </div>
      </div>

      {/* Destination limit warning */}
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

      <div className="mb-4 bg-brand-900/30 p-2 rounded border border-brand-500/20 text-xs text-gray-300 flex gap-2">
        <Info size={16} className="text-brand-400 shrink-0" />
        <p>
          You can add multiple accounts for the same platform (e.g., Personal YouTube and Business
          YouTube) by adding them as separate destinations.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        {oauthOptions.map((option) => (
          <div
            key={option.platform}
            className={`flex items-start gap-3 p-3 rounded-lg border transition-all text-left bg-dark-900 hover:border-brand-500/60 hover:shadow-lg hover:shadow-brand-900/40 ${isStreaming || !destinationLimit.allowed ? 'opacity-50' : 'border-gray-700'}`}
          >
            <div className="mt-0.5">{option.icon}</div>
            <div className="flex-1 space-y-2 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">{option.label}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/20 text-green-300 font-semibold">
                  One-click
                </span>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed">{option.description}</p>
              <div className="inline-flex items-center gap-1 text-[11px] text-brand-300 bg-brand-900/40 px-2 py-1 rounded-full">
                <Lock size={12} /> Secure OAuth sign-in
              </div>
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`text-[11px] truncate ${isPlatformConnected(option.oauthPlatform) ? 'text-emerald-300' : 'text-gray-500'}`}
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
                      className="text-[11px] px-2 py-1 rounded bg-gray-800/60 hover:bg-gray-800 border border-gray-700 text-gray-200 disabled:opacity-50"
                      title="Open Admin Portal (OAuth IDs)"
                    >
                      <Settings size={14} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      const added = handleAddWithLimitCheck(
                        createOAuthDestination(option.platform),
                      );
                      if (added && !isStreaming) {
                        handleConnectOAuth(option.oauthPlatform);
                      }
                    }}
                    disabled={isStreaming || !destinationLimit.allowed}
                    className="text-[11px] px-2 py-1 rounded bg-brand-600/30 hover:bg-brand-600/40 border border-brand-500/20 text-brand-100 disabled:opacity-50"
                    aria-label={`Connect ${option.label}`}
                  >
                    Connect {option.label}
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleAddWithLimitCheck(createOAuthDestination(option.platform))}
                disabled={isStreaming || !destinationLimit.allowed}
                className="w-full text-[11px] px-2 py-2 rounded bg-gray-800/60 hover:bg-gray-800 border border-gray-700 text-gray-200 disabled:opacity-50"
              >
                Add destination
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto space-y-3">
        {showAddForm && destinationLimit.allowed && (
          <div className="bg-gray-800 p-3 rounded border border-gray-600 mb-3 animate-fade-in">
            <h3 className="text-xs font-semibold mb-2 text-gray-400">CONNECT NEW ACCOUNT</h3>
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

            {newPlatform === Platform.CUSTOM_RTMP && (
              <input
                type="text"
                placeholder="RTMP Server URL (e.g. rtmp://my.server/app)"
                value={newServerUrl}
                onChange={(e) => setNewServerUrl(e.target.value)}
                className="w-full bg-dark-900 border border-gray-700 rounded p-2 mb-2 text-sm text-white focus:border-brand-500 outline-none"
              />
            )}

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

        {destinations.length === 0 && !showAddForm && (
          <p className="text-gray-500 text-sm text-center py-4">No destinations connected.</p>
        )}

        {destinations.map((dest) => (
          <div
            key={dest.id}
            className="flex items-center justify-between bg-dark-900 p-3 rounded border border-gray-800 hover:border-gray-600 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              {getIcon(dest.platform)}
              <div className="min-w-0">
                <div className="text-sm font-medium truncate" title={dest.name}>
                  {dest.name}
                </div>
                <div className="text-xs text-gray-500 flex items-center gap-1">
                  {dest.status === 'live' ? (
                    <span className="text-red-500 font-bold animate-pulse">● LIVE</span>
                  ) : (
                    <span className="capitalize">{dest.status}</span>
                  )}
                  {dest.authType === 'oauth' && (
                    <span className="ml-2 px-1.5 py-0.5 text-[10px] rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                      OAuth
                    </span>
                  )}
                  {isStreaming && dest.status === 'connecting' && (
                    <span className="animate-spin ml-1">⟳</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => onToggleDestination(dest.id)}
                disabled={isStreaming} // Cannot toggle during stream
                className={`text-gray-400 hover:text-white ${isStreaming ? 'opacity-50 cursor-not-allowed' : ''}`}
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
                className={`text-gray-500 hover:text-red-500 ${isStreaming ? 'opacity-50 cursor-not-allowed' : ''}`}
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
