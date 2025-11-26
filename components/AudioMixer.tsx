import React from 'react';
import { Mic, Music, Film, Volume2, VolumeX } from 'lucide-react';

interface AudioMixerProps {
  micVolume: number; // 0-1 (Simulated gain for now)
  musicVolume: number; // 0-1
  videoVolume: number; // 0-1
  onMicVolumeChange: (val: number) => void;
  onMusicVolumeChange: (val: number) => void;
  onVideoVolumeChange: (val: number) => void;
}

const AudioMixer: React.FC<AudioMixerProps> = ({
  micVolume,
  musicVolume,
  videoVolume,
  onMicVolumeChange,
  onMusicVolumeChange,
  onVideoVolumeChange
}) => {
  
  const renderSlider = (
    label: string, 
    icon: React.ReactNode, 
    value: number, 
    onChange: (val: number) => void,
    colorClass: string
  ) => (
    <div className="flex items-center gap-3 mb-3 last:mb-0">
      <div className={`p-2 rounded-lg ${value === 0 ? 'bg-gray-700 text-gray-400' : colorClass}`}>
        {value === 0 ? <VolumeX size={16} /> : icon}
      </div>
      <div className="flex-1">
        <div className="flex justify-between text-xs text-gray-400 mb-1 font-semibold">
          <span>{label}</span>
          <span>{Math.round(value * 100)}%</span>
        </div>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-brand-500"
        />
      </div>
    </div>
  );

  return (
    <div className="bg-dark-800 p-4 rounded-lg border border-gray-700 w-64 shadow-xl">
      <h3 className="text-xs font-bold text-gray-400 uppercase mb-3 flex items-center gap-2">
        <Volume2 size={14} /> Audio Mixer
      </h3>
      
      {renderSlider(
        "Microphone", 
        <Mic size={16} />, 
        micVolume, 
        onMicVolumeChange, 
        "bg-red-500/20 text-red-500"
      )}
      
      {renderSlider(
        "Video Clip", 
        <Film size={16} />, 
        videoVolume, 
        onVideoVolumeChange, 
        "bg-blue-500/20 text-blue-500"
      )}
      
      {renderSlider(
        "Music / SFX", 
        <Music size={16} />, 
        musicVolume, 
        onMusicVolumeChange, 
        "bg-purple-500/20 text-purple-500"
      )}
    </div>
  );
};

export default AudioMixer;