import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Cloud, Download, HardDrive, Loader2, PlayCircle, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface CloudRecording {
  id: string;
  title: string;
  url?: string;
  storageKey: string;
  sizeBytes: number;
  durationSeconds: number;
  format: string;
  createdAt: string;
  destinations?: string[];
}

interface RecordingResponse {
  recordings: CloudRecording[];
  storage: {
    plan: string;
    quotaBytes: number;
    usedBytes: number;
    remainingBytes: number;
    cloudRecordingAllowed: boolean;
  };
}

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index >= 3 ? 2 : 1)} ${units[index]}`;
};

const formatDuration = (seconds: number) => {
  const total = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    : `${m}:${s.toString().padStart(2, '0')}`;
};

const RecordingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { sessionToken, userProfile } = useAuth();
  const [data, setData] = useState<RecordingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState<string | null>(null);
  const [relayStorageReady, setRelayStorageReady] = useState<boolean | null>(null);

  const relayBase = String(import.meta.env.VITE_RELAY_BASE_URL || 'https://chatscream-relay.onrender.com').replace(/\/$/, '');

  const load = useCallback(async () => {
    if (!sessionToken) return;
    setLoading(true);
    setError('');
    try {
      const [recordingResponse, relayHealth] = await Promise.all([
        fetch('/api/recordings', {
          headers: { Authorization: `Bearer ${sessionToken}` },
          credentials: 'include',
        }),
        fetch(`${relayBase}/health`).catch(() => null),
      ]);
      if (!recordingResponse.ok) throw new Error(`Could not load recordings (${recordingResponse.status}).`);
      setData(await recordingResponse.json());
      if (relayHealth?.ok) {
        const health = await relayHealth.json().catch(() => ({}));
        setRelayStorageReady(Boolean(health.cloudRecordingStorage));
      } else {
        setRelayStorageReady(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load recordings.');
    } finally {
      setLoading(false);
    }
  }, [sessionToken, relayBase]);

  useEffect(() => {
    void load();
  }, [load]);

  const usagePercent = useMemo(() => {
    if (!data?.storage?.quotaBytes) return 0;
    return Math.min(100, (data.storage.usedBytes / data.storage.quotaBytes) * 100);
  }, [data]);

  const downloadRecording = async (recording: CloudRecording) => {
    if (!sessionToken) return;
    setDownloading(recording.id);
    setError('');
    try {
      if (recording.url) {
        const anchor = document.createElement('a');
        anchor.href = recording.url;
        anchor.download = `${recording.title || 'chatscream-recording'}.${recording.format || 'mkv'}`;
        anchor.rel = 'noopener';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        return;
      }

      const response = await fetch(
        `${relayBase}/recordings/download?key=${encodeURIComponent(recording.storageKey)}`,
        { headers: { Authorization: `Bearer ${sessionToken}` } },
      );
      if (!response.ok) throw new Error(`Download failed (${response.status}).`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${recording.title || 'chatscream-recording'}.${recording.format || 'mkv'}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed.');
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="min-h-screen bg-dark-950 text-white">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/dashboard')}
              className="p-2 rounded-lg border border-gray-700 bg-dark-900 text-gray-300 hover:text-white"
              title="Back to dashboard"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <p className="text-xs uppercase tracking-widest text-brand-400 font-bold">Creator Library</p>
              <h1 className="text-3xl font-black">Recordings</h1>
              <p className="text-sm text-gray-400">Cloud DVR copies from your live shows, separate from your local master recording.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => void load()}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-700 bg-dark-900 text-sm text-gray-300 hover:text-white"
            >
              <RefreshCw size={15} /> Refresh
            </button>
            <button
              onClick={() => navigate('/studio')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 font-bold"
            >
              <PlayCircle size={16} /> Open Studio
            </button>
          </div>
        </div>

        {error && <div className="rounded-xl border border-red-700/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">{error}</div>}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 rounded-xl border border-gray-800 bg-dark-900 p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 font-bold"><Cloud size={18} className="text-cyan-400" /> Cloud recording storage</div>
              <span className="text-xs uppercase tracking-wide text-gray-400">{data?.storage?.plan || userProfile?.subscription?.plan || 'free'} plan</span>
            </div>
            {data?.storage?.quotaBytes ? (
              <>
                <div className="h-2 rounded-full bg-gray-800 overflow-hidden mb-2">
                  <div className="h-full bg-cyan-500 transition-all" style={{ width: `${usagePercent}%` }} />
                </div>
                <div className="flex justify-between text-xs text-gray-400">
                  <span>{formatBytes(data.storage.usedBytes)} used</span>
                  <span>{formatBytes(data.storage.quotaBytes)} included</span>
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-400">Cloud DVR storage is not included on the current plan.</p>
            )}
          </div>

          <div className="rounded-xl border border-gray-800 bg-dark-900 p-5">
            <div className="flex items-center gap-2 font-bold mb-2"><HardDrive size={18} className="text-brand-400" /> Local master</div>
            <p className="text-sm text-gray-400">
              Studio local recording remains independent and can run at higher quality. It is chunked to IndexedDB for crash recovery and downloads to your device when stopped.
            </p>
          </div>
        </div>

        {relayStorageReady === false && (
          <div className="rounded-xl border border-yellow-700/50 bg-yellow-950/20 px-4 py-3 text-sm text-yellow-200">
            The cloud DVR workflow is installed, but persistent object storage is not configured on the relay yet. Local recording still works normally.
          </div>
        )}

        <div className="rounded-xl border border-gray-800 bg-dark-900 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
            <h2 className="font-bold">Your cloud recordings</h2>
            <span className="text-xs text-gray-500">{data?.recordings?.length || 0} saved</span>
          </div>

          {loading ? (
            <div className="p-10 flex items-center justify-center gap-2 text-gray-400"><Loader2 size={18} className="animate-spin" /> Loading recordings…</div>
          ) : !data?.recordings?.length ? (
            <div className="p-10 text-center text-gray-400">
              <Cloud size={34} className="mx-auto mb-3 text-gray-600" />
              <p className="font-semibold text-gray-300">No cloud recordings yet</p>
              <p className="text-sm mt-1">Eligible live shows will appear here after the relay finishes uploading the archive.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-800">
              {data.recordings.map((recording) => (
                <div key={recording.id} className="p-5 flex items-center gap-4 flex-wrap">
                  <div className="w-12 h-12 rounded-lg bg-cyan-950/40 border border-cyan-800/40 flex items-center justify-center shrink-0">
                    <Cloud size={20} className="text-cyan-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold truncate">{recording.title}</p>
                    <div className="text-xs text-gray-500 flex flex-wrap gap-x-3 gap-y-1 mt-1">
                      <span>{new Date(recording.createdAt).toLocaleString()}</span>
                      <span>{formatDuration(recording.durationSeconds)}</span>
                      <span>{formatBytes(recording.sizeBytes)}</span>
                      <span className="uppercase">{recording.format}</span>
                      {recording.destinations?.length ? <span>{recording.destinations.join(', ')}</span> : null}
                    </div>
                  </div>
                  <button
                    onClick={() => void downloadRecording(recording)}
                    disabled={downloading === recording.id}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 disabled:opacity-50 font-bold text-sm"
                  >
                    {downloading === recording.id ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                    Download
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RecordingsPage;
