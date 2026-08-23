import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Cloud, ExternalLink, Play, RefreshCw, Square, Video } from 'lucide-react';
import type { Destination } from '../types';
import {
  endCloudSession,
  getCloudStreamingStatus,
  startCloudSession,
  setCloudOverages,
  type CloudStreamingStatus,
} from '../services/cloudStreamingService';

interface CloudBroadcastPanelProps {
  userId?: string;
  userPlan?: string;
  destinations: Destination[];
  compact?: boolean;
}

const CloudBroadcastPanel: React.FC<CloudBroadcastPanelProps> = ({
  userId,
  userPlan = 'free',
  destinations,
  compact = false,
}) => {
  const [sourceUrl, setSourceUrl] = useState('');
  const [quality, setQuality] = useState<'720p' | '1080p'>('1080p');
  const [recording, setRecording] = useState(true);
  const [allowOverages, setAllowOverages] = useState(false);
  const [status, setStatus] = useState<CloudStreamingStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const enabledDestinations = useMemo(
    () => destinations.filter((destination) => destination.isEnabled && destination.streamKey),
    [destinations],
  );

  const refresh = useCallback(async () => {
    if (!userId) return;
    const next = await getCloudStreamingStatus(userId, userPlan);
    setStatus(next);
  }, [userId, userPlan]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const start = async () => {
    if (!userId) {
      setNotice('Sign in to use Cloud Broadcast.');
      return;
    }
    if (!sourceUrl.trim()) {
      setNotice('Paste a direct video, public Google Drive file, or Dropbox shared link.');
      return;
    }
    if (enabledDestinations.length === 0) {
      setNotice('Enable at least one destination with a usable stream key first.');
      return;
    }

    setBusy(true);
    setNotice('Starting a cloud worker…');
    try {
      const overageSaved = await setCloudOverages(allowOverages);
      if (!overageSaved) {
        setNotice('Could not save the cloud overage preference. No worker was started.');
        return;
      }
      const result = await startCloudSession(userId, userPlan, enabledDestinations.length, {
        sourceUrl: sourceUrl.trim(),
        quality,
        bitrateKbps: quality === '1080p' ? 6000 : 4000,
        recording,
        allowOverages,
        destinations: enabledDestinations.map((destination) => ({
          id: destination.id,
          platform: destination.platform,
          ingestUrl: destination.serverUrl,
          streamKey: destination.streamKey,
          enabled: destination.isEnabled,
        })),
      });
      setNotice(result.message);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    if (!userId || !status?.activeSession?.sessionId) return;
    setBusy(true);
    try {
      const result = await endCloudSession(userId, status.activeSession.sessionId);
      setNotice(result.message);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const active = Boolean(status?.activeSession);

  return (
    <div className={`rounded-2xl border border-cyan-500/25 bg-cyan-950/10 ${compact ? 'p-3' : 'p-4'} space-y-4`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <div className="rounded-lg bg-cyan-500/15 p-2 text-cyan-300">
            <Cloud size={18} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Cloud Broadcast</h3>
            <p className="text-[11px] text-gray-400">
              Paste authorized media, close your device, and let ChatScream air it at constant bitrate.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={busy || !userId}
          className="rounded-lg border border-gray-700 p-2 text-gray-400 hover:text-white disabled:opacity-40"
          title="Refresh cloud status"
        >
          <RefreshCw size={14} className={busy ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
          Video source
        </label>
        <div className="flex gap-2">
          <input
            value={sourceUrl}
            onChange={(event) => setSourceUrl(event.target.value)}
            disabled={active}
            placeholder="https://… video / Google Drive / Dropbox"
            className="min-w-0 flex-1 rounded-xl border border-gray-700 bg-dark-950 px-3 py-2 text-xs text-white placeholder-gray-600 focus:border-cyan-500 focus:outline-none"
          />
          {sourceUrl && (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-gray-700 p-2.5 text-gray-400 hover:text-white"
              title="Open source"
            >
              <ExternalLink size={15} />
            </a>
          )}
        </div>
        <p className="text-[10px] text-gray-500">
          Supports direct HTTP(S) media, public Drive files and Dropbox shares. Arbitrary YouTube page ripping is intentionally unsupported.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="text-[10px] text-gray-400">
          Output quality
          <select
            value={quality}
            disabled={active}
            onChange={(event) => setQuality(event.target.value as '720p' | '1080p')}
            className="mt-1 w-full rounded-lg border border-gray-700 bg-dark-950 px-2 py-2 text-xs text-white"
          >
            <option value="720p">720p / 4 Mbps CBR</option>
            <option value="1080p">1080p / 6 Mbps CBR</option>
          </select>
        </label>
        <div className="rounded-lg border border-gray-800 bg-dark-950/50 px-3 py-2">
          <div className="text-[9px] uppercase text-gray-500">Enabled outputs</div>
          <div className="mt-1 text-lg font-black text-white">{enabledDestinations.length}</div>
          <div className="text-[9px] text-gray-500">encoded once · fanned out in cloud</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[10px] text-gray-300">
        <label className="flex items-center gap-2 rounded-lg border border-gray-800 p-2">
          <input
            type="checkbox"
            checked={recording}
            disabled={active}
            onChange={(event) => setRecording(event.target.checked)}
            className="accent-cyan-500"
          />
          Save DVR copy
        </label>
        <label className="flex items-center gap-2 rounded-lg border border-gray-800 p-2">
          <input
            type="checkbox"
            checked={allowOverages}
            disabled={active}
            onChange={(event) => setAllowOverages(event.target.checked)}
            className="accent-cyan-500"
          />
          Allow paid overages
        </label>
      </div>

      {status && (
        <div className="rounded-xl border border-gray-800 bg-dark-950/60 p-3 space-y-2">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-gray-400">Included cloud time</span>
            <span className="font-semibold text-white">
              {status.hoursRemaining.toFixed(2)} / {status.hoursTotal.toFixed(0)} hrs left
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-gray-800">
            <div className="h-full bg-cyan-500" style={{ width: `${Math.min(100, status.percentUsed)}%` }} />
          </div>
          {active && (
            <div className="flex items-center gap-2 text-[10px] text-green-300">
              <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
              Cloud session {status.activeSession?.sessionId.slice(-8)} is active
            </div>
          )}
        </div>
      )}

      {notice && <div className="text-[11px] text-gray-300">{notice}</div>}

      <button
        type="button"
        onClick={active ? stop : start}
        disabled={busy || !userId || (!active && !status?.canStream && !allowOverages)}
        className={`w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-black transition-colors disabled:opacity-50 ${
          active
            ? 'bg-red-600 hover:bg-red-500 text-white'
            : 'bg-cyan-600 hover:bg-cyan-500 text-white'
        }`}
      >
        {active ? <Square size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
        {active ? 'STOP CLOUD BROADCAST' : 'START CLOUD BROADCAST'}
      </button>

      <div className="flex items-start gap-2 text-[10px] leading-relaxed text-gray-500">
        <Video size={13} className="mt-0.5 shrink-0" />
        The browser becomes the control surface only. The cloud worker pulls the media and continues broadcasting even if this device disconnects.
      </div>
    </div>
  );
};

export default CloudBroadcastPanel;
