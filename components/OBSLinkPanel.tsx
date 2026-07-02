/**
 * OBS Browser Source Link Component
 * 
 * Generates a URL that streamers can paste into OBS as a Browser Source.
 * The URL loads a lightweight overlay-only view of the ChatScream canvas
 * that displays scream alerts, chat, graphics, and branding — composited
 * on a transparent background so it layers over the streamer's own OBS scene.
 */

import { useState, useEffect, useRef } from 'react';
import {
  ExternalLink,
  Copy,
  Check,
  Monitor,
  Info,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { Platform } from '../types';

interface OBSLinkPanelProps {
  streamId: string;
  branding: {
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
  };
  overlayConfig: {
    showScreamAlerts: boolean;
    showChat: boolean;
    showScoreboard: boolean;
    showLowerThird: boolean;
    showTimer: boolean;
    chatMaxMessages: number;
    alertDuration: number;
    alertPosition: 'top' | 'center' | 'bottom';
  };
}

export function OBSLinkPanel({ streamId, branding, overlayConfig }: OBSLinkPanelProps) {
  const [copied, setCopied] = useState(false);
  const [obsStatus, setObsStatus] = useState<'disconnected' | 'connected'>('disconnected');
  const [resolution, setResolution] = useState<'720p' | '1080p'>('1080p');
  const wsRef = useRef<WebSocket | null>(null);

  // Build the OBS browser source URL
  const baseUrl = window.location.origin;
  const params = new URLSearchParams({
    mode: 'obs',
    stream: streamId,
    res: resolution,
    transparent: 'true',
    screams: String(overlayConfig.showScreamAlerts),
    chat: String(overlayConfig.showChat),
    scoreboard: String(overlayConfig.showScoreboard),
    lower: String(overlayConfig.showLowerThird),
    timer: String(overlayConfig.showTimer),
    chatMax: String(overlayConfig.chatMaxMessages),
    alertDur: String(overlayConfig.alertDuration),
    alertPos: overlayConfig.alertPosition,
    primary: branding.primaryColor,
    secondary: branding.secondaryColor,
    accent: branding.accentColor,
  });

  const obsUrl = `${baseUrl}/obs-overlay?${params.toString()}`;

  // Monitor OBS connection status via WebSocket
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/obs-status?stream=${streamId}`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'obs:subscribe', streamId }));
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'obs:connected') setObsStatus('connected');
        if (data.type === 'obs:disconnected') setObsStatus('disconnected');
      };

      ws.onclose = () => setObsStatus('disconnected');

      return () => {
        ws.close();
      };
    } catch {
      // WebSocket not available — show as disconnected
    }
  }, [streamId]);

  const copyUrl = () => {
    navigator.clipboard.writeText(obsUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const openInBrowser = () => {
    window.open(obsUrl, '_blank', 'width=1280,height=720');
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Monitor className="h-5 w-5 text-orange-500" />
          <h3 className="text-lg font-semibold text-white">OBS Browser Source</h3>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          {obsStatus === 'connected' ? (
            <>
              <Wifi className="h-3.5 w-3.5 text-green-500" />
              <span className="text-green-400">OBS Connected</span>
            </>
          ) : (
            <>
              <WifiOff className="h-3.5 w-3.5 text-zinc-500" />
              <span className="text-zinc-500">OBS Not Connected</span>
            </>
          )}
        </div>
      </div>

      <p className="text-sm text-zinc-400">
        Paste this URL into OBS as a Browser Source to overlay ChatScream alerts,
        chat, and graphics on your stream. The background is transparent — it layers
        over your existing OBS scene.
      </p>

      {/* URL display + copy */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={obsUrl}
          readOnly
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 font-mono"
          onClick={(e) => e.currentTarget.select()}
        />
        <button
          onClick={copyUrl}
          className="flex items-center gap-1.5 px-3 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 transition"
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Copied!' : 'Copy'}
        </button>
        <button
          onClick={openInBrowser}
          className="flex items-center gap-1.5 px-3 py-2 bg-zinc-700 text-white rounded-lg text-sm font-medium hover:bg-zinc-600 transition"
          title="Preview the overlay in a new window"
        >
          <ExternalLink className="h-4 w-4" />
        </button>
      </div>

      {/* Resolution selector */}
      <div className="flex items-center gap-3">
        <label className="text-sm text-zinc-400">Resolution:</label>
        <div className="flex gap-2">
          {(['720p', '1080p'] as const).map((res) => (
            <button
              key={res}
              onClick={() => setResolution(res)}
              className={`px-3 py-1 rounded text-sm font-medium transition ${
                resolution === res
                  ? 'bg-orange-600 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
              }`}
            >
              {res}
            </button>
          ))}
        </div>
      </div>

      {/* OBS setup instructions */}
      <div className="bg-zinc-800/50 border border-zinc-800 rounded-lg p-4 space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400">
          <Info className="h-3.5 w-3.5" /> OBS SETUP INSTRUCTIONS
        </div>
        <ol className="text-xs text-zinc-500 space-y-1.5 ml-5 list-decimal">
          <li>Open OBS → add a new <strong className="text-zinc-300">Browser</strong> source</li>
          <li>Paste the URL above into the URL field</li>
          <li>Set Width: <strong className="text-zinc-300">{resolution === '1080p' ? '1920' : '1280'}</strong>, Height: <strong className="text-zinc-300">{resolution === '1080p' ? '1080' : '720'}</strong></li>
          <li>Check <strong className="text-zinc-300">"Refresh browser when scene becomes active"</strong></li>
          <li>Position the source over your camera/scene — background is transparent</li>
          <li>Scream alerts and chat will appear automatically during your stream</li>
        </ol>
      </div>

      {/* Active overlays summary */}
      <div className="flex flex-wrap gap-2">
        {overlayConfig.showScreamAlerts && (
          <span className="px-2 py-1 bg-red-500/20 text-red-400 text-xs rounded-full border border-red-500/30">
            🔊 Scream Alerts
          </span>
        )}
        {overlayConfig.showChat && (
          <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded-full border border-blue-500/30">
            💬 Chat ({overlayConfig.chatMaxMessages} msgs)
          </span>
        )}
        {overlayConfig.showScoreboard && (
          <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded-full border border-green-500/30">
            📊 Scoreboard
          </span>
        )}
        {overlayConfig.showLowerThird && (
          <span className="px-2 py-1 bg-purple-500/20 text-purple-400 text-xs rounded-full border border-purple-500/30">
            📝 Lower Third
          </span>
        )}
        {overlayConfig.showTimer && (
          <span className="px-2 py-1 bg-orange-500/20 text-orange-400 text-xs rounded-full border border-orange-500/30">
            ⏱️ Timer
          </span>
        )}
      </div>

      {/* Connection status */}
      <div className="text-xs text-zinc-500 border-t border-zinc-800 pt-3">
        {obsStatus === 'connected' ? (
          <span className="text-green-400">✓ OBS is receiving the overlay feed</span>
        ) : (
          <span>Add the Browser Source in OBS to connect. The status updates automatically.</span>
        )}
      </div>
    </div>
  );
}

export default OBSLinkPanel;
