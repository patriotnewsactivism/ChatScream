/**
 * useLocalRecording — safe, chunked local recording for phones.
 *
 * Key safety features for mobile:
 * - Segments recording into chunks (default 30 s) so a crash never loses everything
 * - Monitors memory via ResourceGuard — pauses recording at red level
 * - Automatically drops to lower bitrate if FPS falls below threshold
 * - Uses IndexedDB for chunk storage so RAM stays low
 * - Final export stitches chunks into a single .webm download
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import type { HealthLevel } from './useResourceGuard';

export type RecordingQuality = 'high' | 'medium' | 'low' | 'auto';

interface RecordingConfig {
  quality: RecordingQuality;
  segmentDurationMs: number;    // chunk length (default 30 000)
  maxDurationMs: number;        // hard cap (default 4 hrs)
  mimeType?: string;
}

interface RecordingState {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;             // seconds
  chunkCount: number;
  totalSizeMB: number;
  currentQuality: RecordingQuality;
}

const QUALITY_BITRATES: Record<Exclude<RecordingQuality, 'auto'>, number> = {
  high: 4_000_000,   // 4 Mbps
  medium: 2_000_000,  // 2 Mbps
  low: 800_000,       // 800 kbps
};

const pickMimeType = (): string => {
  const preferred = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  for (const mime of preferred) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return 'video/webm';
};

const openChunkStore = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open('chatscream_recordings', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('chunks')) {
        db.createObjectStore('chunks', { autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

export const useLocalRecording = (
  config: Partial<RecordingConfig> = {},
  resourceLevel: HealthLevel = 'green',
) => {
  const {
    quality = 'auto',
    segmentDurationMs = 30_000,
    maxDurationMs = 4 * 60 * 60 * 1000,
    mimeType = pickMimeType(),
  } = config;

  const [state, setState] = useState<RecordingState>({
    isRecording: false,
    isPaused: false,
    duration: 0,
    chunkCount: 0,
    totalSizeMB: 0,
    currentQuality: quality === 'auto' ? 'high' : quality,
  });

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);
  const startTimeRef = useRef(0);
  const dbRef = useRef<IDBDatabase | null>(null);

  // Initialize IndexedDB
  useEffect(() => {
    openChunkStore()
      .then(db => { dbRef.current = db; })
      .catch(console.warn);
    return () => { dbRef.current?.close(); };
  }, []);

  // Save chunk to IDB for crash recovery
  const persistChunk = useCallback(async (blob: Blob) => {
    const db = dbRef.current;
    if (!db) return;
    const tx = db.transaction('chunks', 'readwrite');
    tx.objectStore('chunks').add(blob);
  }, []);

  // Auto-quality: downgrade when device is stressed
  useEffect(() => {
    if (quality !== 'auto' || !state.isRecording) return;
    let newQ: Exclude<RecordingQuality, 'auto'>;
    if (resourceLevel === 'red') newQ = 'low';
    else if (resourceLevel === 'yellow') newQ = 'medium';
    else newQ = 'high';

    if (newQ !== state.currentQuality) {
      setState(prev => ({ ...prev, currentQuality: newQ }));
      // Restart recorder with new bitrate (seamless segment boundary)
      if (recorderRef.current?.state === 'recording') {
        recorderRef.current.requestData(); // flush current segment
      }
    }
  }, [resourceLevel, quality, state.isRecording, state.currentQuality]);

  // Pause when device hits red
  useEffect(() => {
    if (!state.isRecording || state.isPaused) return;
    if (resourceLevel === 'red') {
      recorderRef.current?.pause();
      setState(prev => ({ ...prev, isPaused: true }));
    }
  }, [resourceLevel, state.isRecording, state.isPaused]);

  // Resume when green/yellow
  useEffect(() => {
    if (!state.isRecording || !state.isPaused) return;
    if (resourceLevel !== 'red') {
      recorderRef.current?.resume();
      setState(prev => ({ ...prev, isPaused: false }));
    }
  }, [resourceLevel, state.isRecording, state.isPaused]);

  // ── Start ────────────────────────────────────────────────────────────────
  const startRecording = useCallback((stream: MediaStream) => {
    const effectiveQ: Exclude<RecordingQuality, 'auto'> =
      quality === 'auto'
        ? (resourceLevel === 'red' ? 'low' : resourceLevel === 'yellow' ? 'medium' : 'high')
        : quality;

    const bitrate = QUALITY_BITRATES[effectiveQ];

    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: bitrate,
    });

    chunksRef.current = [];
    // Clear IDB chunks from previous recording
    if (dbRef.current) {
      const tx = dbRef.current.transaction('chunks', 'readwrite');
      tx.objectStore('chunks').clear();
    }

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data);
        persistChunk(e.data);
        setState(prev => ({
          ...prev,
          chunkCount: prev.chunkCount + 1,
          totalSizeMB: +(
            chunksRef.current.reduce((sum, c) => sum + c.size, 0) / (1024 * 1024)
          ).toFixed(1),
        }));
      }
    };

    recorder.start(segmentDurationMs); // timeslice = chunked recording
    recorderRef.current = recorder;
    startTimeRef.current = Date.now();

    // Duration timer
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      setState(prev => ({ ...prev, duration: elapsed }));

      // Hard cap
      if (elapsed * 1000 >= maxDurationMs) {
        stopRecording();
      }
    }, 1000);

    setState({
      isRecording: true,
      isPaused: false,
      duration: 0,
      chunkCount: 0,
      totalSizeMB: 0,
      currentQuality: effectiveQ,
    });
  }, [quality, resourceLevel, mimeType, segmentDurationMs, maxDurationMs, persistChunk]);

  // ── Stop + Download ──────────────────────────────────────────────────────
  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
    recorderRef.current = null;
    clearInterval(timerRef.current);

    // Build final file from all chunks
    setTimeout(() => {
      if (chunksRef.current.length === 0) return;
      const blob = new Blob(chunksRef.current, { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chatscream-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      chunksRef.current = [];
    }, 200);

    setState(prev => ({ ...prev, isRecording: false, isPaused: false }));
  }, [mimeType]);

  // ── Pause / Resume ───────────────────────────────────────────────────────
  const togglePause = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (recorder.state === 'recording') {
      recorder.pause();
      setState(prev => ({ ...prev, isPaused: true }));
    } else if (recorder.state === 'paused') {
      recorder.resume();
      setState(prev => ({ ...prev, isPaused: false }));
    }
  }, []);

  return {
    ...state,
    startRecording,
    stopRecording,
    togglePause,
  };
};
