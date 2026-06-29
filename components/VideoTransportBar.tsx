import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react';

interface VideoTransportBarProps {
  videoElement: HTMLVideoElement | null;
  videoName?: string;
  volume: number;
  onVolumeChange: (v: number) => void;
  onStop: () => void;
}

const VideoTransportBar: React.FC<VideoTransportBarProps> = ({
  videoElement,
  videoName,
  volume,
  onVolumeChange,
  onStop,
}) => {
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLive, setIsLive] = useState(false);
  const [paused, setPaused] = useState(false);
  const [seeking, setSeeking] = useState(false);
  const rafRef = useRef<number>(0);
  const metadataLoadedRef = useRef(false);

  const sync = useCallback(() => {
    if (videoElement && !seeking) {
      setCurrentTime(videoElement.currentTime);
      const rawDuration = videoElement.duration;
      // Handle NaN (metadata not loaded), Infinity (live stream), and normal values
      const d = isFinite(rawDuration) && rawDuration > 0 ? rawDuration : 0;
      const isLive = !isFinite(rawDuration);
      setDuration(d);
      setIsLive(isLive);
      if (d > 0 || isLive) metadataLoadedRef.current = true;
      setPaused(videoElement.paused);
    }
    rafRef.current = requestAnimationFrame(sync);
  }, [videoElement, seeking]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(sync);
    return () => cancelAnimationFrame(rafRef.current);
  }, [sync]);

  const formatTime = (s: number) => {
    if (!isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = parseFloat(e.target.value);
    setCurrentTime(t);
    if (videoElement) videoElement.currentTime = t;
  };

  const togglePlay = () => {
    if (!videoElement) return;
    if (videoElement.paused) videoElement.play().catch(() => {});
    else videoElement.pause();
  };

  const skip = (delta: number) => {
    if (!videoElement) return;
    videoElement.currentTime = Math.max(0, Math.min(videoElement.currentTime + delta, duration));
  };

  if (!videoElement) return null;
  if (!metadataLoadedRef.current && !duration) {
    return (
      <div className="bg-dark-800/90 backdrop-blur-md border border-gray-700 rounded-lg px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-gray-500 animate-pulse" />
          <span className="text-xs text-gray-400">
            {videoName ? `Loading ${videoName}…` : 'Loading video metadata…'}
          </span>
        </div>
      </div>
    );
  }
  if (!duration && !isLive) return null;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="bg-dark-800/90 backdrop-blur-md border border-gray-700 rounded-lg px-3 py-2 space-y-1.5">
      {videoName && (
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-300 truncate max-w-[60%]">
            🎬 {videoName}
          </span>
          <button
            onClick={onStop}
            className="text-[10px] text-red-400 hover:text-red-300 font-bold uppercase"
          >
            Stop & Remove
          </button>
        </div>
      )}

      {/* Seek bar */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-gray-500 font-mono w-10 text-right">
          {formatTime(currentTime)}
        </span>
        <div className="flex-1 relative h-5 flex items-center">
          <div className="absolute inset-x-0 h-1 bg-gray-700 rounded-full">
            <div
              className="h-full bg-brand-500 rounded-full transition-[width] duration-100"
              style={{ width: `${progress}%` }}
            />
          </div>
          <input
            type="range"
            min={0}
            max={duration || 1}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            onMouseDown={() => setSeeking(true)}
            onMouseUp={() => setSeeking(false)}
            onTouchStart={() => setSeeking(true)}
            onTouchEnd={() => setSeeking(false)}
            className="absolute inset-x-0 w-full h-5 opacity-0 cursor-pointer"
          />
        </div>
        <span className="text-[10px] text-gray-500 font-mono w-10">{formatTime(duration)}</span>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={() => skip(-10)}
          className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-white"
          title="Back 10s"
        >
          <SkipBack size={14} />
        </button>
        <button
          onClick={togglePlay}
          className="p-2 rounded-full bg-brand-500 hover:bg-brand-600 text-white"
          title={paused ? 'Play' : 'Pause'}
        >
          {paused ? <Play size={16} fill="currentColor" /> : <Pause size={16} />}
        </button>
        <button
          onClick={() => skip(10)}
          className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-white"
          title="Forward 10s"
        >
          <SkipForward size={14} />
        </button>

        <div className="ml-3 flex items-center gap-1.5">
          <button
            onClick={() => onVolumeChange(volume > 0 ? 0 : 0.8)}
            className="p-1 text-gray-400 hover:text-white"
          >
            {volume < 0.01 ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
            className="w-16 h-1 accent-brand-500"
          />
        </div>
      </div>
    </div>
  );
};

export default VideoTransportBar;
