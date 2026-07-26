import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Volume2,
  Music as MusicIcon,
  List,
  Trash2,
} from 'lucide-react';
import { MediaAsset } from '../types';

interface MusicPlayerProps {
  playlist: MediaAsset[];
  activeTrackId: string | null;
  onTrackSelect: (id: string | null) => void;
  volume: number;
  onVolumeChange: (val: number) => void;
  onDeleteTrack: (id: string) => void;
  onAudioInit?: (el: HTMLAudioElement) => void;
}

const MusicPlayer: React.FC<MusicPlayerProps> = ({
  playlist,
  activeTrackId,
  onTrackSelect,
  volume,
  onVolumeChange,
  onDeleteTrack,
  onAudioInit,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(new Audio());
  const [highContrastMode, setHighContrastMode] = useState(false);

  useEffect(() => {
    if (onAudioInit) onAudioInit(audioRef.current);
  }, []);

  const activeTrack = playlist.find((t) => t.id === activeTrackId);

  useEffect(() => {
    const audio = audioRef.current;
    audio.crossOrigin = 'anonymous';

    if (activeTrack) {
      if (audio.src !== activeTrack.url) {
        audio.src = activeTrack.url;
        if (isPlaying) audio.play().catch((e) => console.warn('Audio play failed', e));
      }
    } else {
      audio.pause();
      audio.src = '';
      setIsPlaying(false);
    }
  }, [activeTrackId]);

  useEffect(() => {
    audioRef.current.volume = volume;
  }, [volume]);

  const togglePlay = () => {
    if (!activeTrack) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch((e) => console.warn('Audio play failed', e));
    }
    setIsPlaying(!isPlaying);
  };

  const handleNext = () => {
    if (playlist.length === 0) return;
    const currentIndex = playlist.findIndex((t) => t.id === activeTrackId);
    const nextIndex = (currentIndex + 1) % playlist.length;
    onTrackSelect(playlist[nextIndex].id);
    setIsPlaying(true);
  };

  const handlePrev = () => {
    if (playlist.length === 0) return;
    const currentIndex = playlist.findIndex((t) => t.id === activeTrackId);
    const prevIndex = (currentIndex - 1 + playlist.length) % playlist.length;
    onTrackSelect(playlist[prevIndex].id);
    setIsPlaying(true);
  };

  const toggleHighContrastMode = () => {
    setHighContrastMode(!highContrastMode);
  };

  return (
    <div className={`bg-dark-800 rounded-xl border border-gray-700 overflow-hidden flex flex-col h-full shadow-2xl ${highContrastMode ? 'high-contrast' : ''}`}>
      <div className="p-4 bg-dark-700 border-b border-gray-600 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-lg bg-brand-500/20 flex items-center justify-center text-brand-400 ${isPlaying ? 'animate-pulse' : ''}`}
          >
            <MusicIcon size={20} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white truncate w-40">
              {activeTrack ? activeTrack.name : 'No track selected'}
            </h3>
            <p className="text-[10px] text-gray-400 uppercase tracking-wider font-bold">
              {isPlaying ? 'Now Playing' : 'Paused'}
            </p>
          </div>
        </div>
        <button
          onClick={toggleHighContrastMode}
          className="text-gray-400 hover:text-white transition-colors"
          aria-pressed={highContrastMode}
        >
          {highContrastMode ? 'Disable High Contrast' : 'Enable High Contrast'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {playlist.length === 0 && (
          <div className="text-center py-8 text-gray-500 text-xs italic">
            Your playlist is empty.
          </div>
        )}
        {playlist.map((track) => (
          <div
            key={track.id}
            onClick={() => onTrackSelect(track.id)}
            className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${activeTrackId === track.id ? 'bg-brand-500/10 border border-brand-500/30' : 'hover:bg-dark-700 border border-transparent'}`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`w-2 h-2 rounded-full ${activeTrackId === track.id ? 'bg-brand-500' : 'bg-gray-600'}`}
              />
              <span className="text-xs font-medium truncate text-gray-300">{track.name}</span>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDeleteTrack(track.id);
              }}
              className="p-1.5 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      <div className="p-4 bg-dark-900 border-t border-gray-700">
        <div className="flex items-center justify-center gap-4 mb-4">
          <button onClick={handlePrev} className="text-gray-400 hover:text-white transition-colors">
            <SkipBack size={20} />
          </button>
          <button
            onClick={togglePlay}
            className="w-12 h-12 rounded-full bg-brand-500 flex items-center justify-center text-white hover:bg-brand-600 transition-all shadow-lg shadow-brand-500/20"
          >
            {isPlaying ? (
              <Pause size={24} fill="currentColor" />
            ) : (
              <Play size={24} fill="currentColor" className="ml-1" />
            )}
          </button>
          <button onClick={handleNext} className="text-gray-400 hover:text-white transition-colors">
            <SkipForward size={20} />
          </button>
        </div>

        <div className="flex items-center gap-3">
          <Volume2 size={16} className="text-gray-500" />
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
            className="flex-1 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-brand-500"
          />
        </div>
      </div>
    </div>
  );
};

export default MusicPlayer;
