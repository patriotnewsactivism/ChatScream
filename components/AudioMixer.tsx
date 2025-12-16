import React from 'react';
import { Mic, MicOff, Music, Film, Volume2, VolumeX } from 'lucide-react';

interface AudioMixerProps {
  micVolume: number;
  musicVolume: number;
  videoVolume: number;
  onMicVolumeChange: (val: number) => void;
  onMusicVolumeChange: (val: number) => void;
  onVideoVolumeChange: (val: number) => void;
  // Real-time audio level props (0-1 normalized)
  micLevel?: number;
  musicLevel?: number;
  videoLevel?: number;
  // Mute state and toggle
  isMicMuted?: boolean;
  onMicMuteToggle?: () => void;
}

// Level meter component that shows real-time audio level
const LevelMeter: React.FC<{ level: number; color: string }> = ({ level, color }) => {
  // Normalize level (0-1) and add some visual scaling
  const normalizedLevel = Math.min(Math.max(level, 0), 1);
  const displayWidth = Math.pow(normalizedLevel, 0.7) * 100; // Apply curve for better visual response

  return (
    <div className="h-1.5 w-full bg-gray-700 rounded overflow-hidden mt-1">
      <div
        className={`h-full ${color} transition-all duration-75`}
        style={{ width: `${displayWidth}%` }}
      />
    </div>
  );
};

const AudioMixer: React.FC<AudioMixerProps> = ({
  micVolume,
  musicVolume,
  videoVolume,
  onMicVolumeChange,
  onMusicVolumeChange,
  onVideoVolumeChange,
  micLevel = 0,
  musicLevel = 0,
  videoLevel = 0,
  isMicMuted = false,
  onMicMuteToggle
}) => {

  const renderSlider = (
    label: string,
    icon: React.ReactNode,
    mutedIcon: React.ReactNode | null,
    value: number,
    onChange: (val: number) => void,
    colorClass: string,
    levelColorClass: string,
    level: number,
    isMuted?: boolean,
    onMuteToggle?: () => void
  ) => (
    <div className="flex items-center gap-3 mb-4 last:mb-0">
      {/* Icon/Mute button */}
      {onMuteToggle ? (
        <button
          onClick={onMuteToggle}
          className={`p-2 rounded-lg transition-all ${
            isMuted
              ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
              : value === 0
                ? 'bg-gray-700 text-gray-400'
                : `${colorClass} hover:opacity-80`
          }`}
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? mutedIcon : (value === 0 ? <VolumeX size={16} /> : icon)}
        </button>
      ) : (
        <div className={`p-2 rounded-lg ${value === 0 ? 'bg-gray-700 text-gray-400' : colorClass}`}>
          {value === 0 ? <VolumeX size={16} /> : icon}
        </div>
      )}

      <div className="flex-1">
        <div className="flex justify-between text-xs text-gray-400 mb-1 font-semibold">
          <span className={isMuted ? 'text-red-400' : ''}>{label}{isMuted ? ' (Muted)' : ''}</span>
          <span>{Math.round(value * 100)}%</span>
        </div>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          disabled={isMuted}
          className={`w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-brand-500 ${
            isMuted ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        />
        {/* Real-time level meter */}
        <LevelMeter
          level={isMuted ? 0 : level}
          color={levelColorClass}
        />
      </div>
    </div>
  );

  return (
    <div className="bg-dark-800 p-4 rounded-lg border border-gray-700 w-64 shadow-xl">
      <h3 className="text-xs font-bold text-gray-400 uppercase mb-4 flex items-center gap-2">
        <Volume2 size={14} /> Audio Mixer
      </h3>

      {/* Microphone with mute toggle */}
      {renderSlider(
        "Microphone",
        <Mic size={16} />,
        <MicOff size={16} />,
        micVolume,
        onMicVolumeChange,
        "bg-red-500/20 text-red-500",
        "bg-gradient-to-r from-red-500 to-red-400",
        micLevel,
        isMicMuted,
        onMicMuteToggle
      )}

      {/* Video Clip */}
      {renderSlider(
        "Video Clip",
        <Film size={16} />,
        null,
        videoVolume,
        onVideoVolumeChange,
        "bg-blue-500/20 text-blue-500",
        "bg-gradient-to-r from-blue-500 to-blue-400",
        videoLevel
      )}

      {/* Music / SFX */}
      {renderSlider(
        "Music / SFX",
        <Music size={16} />,
        null,
        musicVolume,
        onMusicVolumeChange,
        "bg-purple-500/20 text-purple-500",
        "bg-gradient-to-r from-purple-500 to-purple-400",
        musicLevel
      )}

      {/* Audio status indicator */}
      <div className="mt-4 pt-3 border-t border-gray-700">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">Output Level</span>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${
              (micLevel > 0.01 || musicLevel > 0.01 || videoLevel > 0.01)
                ? 'bg-green-500 animate-pulse'
                : 'bg-gray-600'
            }`} />
            <span className="text-gray-400">
              {(micLevel > 0.01 || musicLevel > 0.01 || videoLevel > 0.01) ? 'Active' : 'Silent'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AudioMixer;
