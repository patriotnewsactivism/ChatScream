import { FC, ReactNode } from 'react';
import { Headphones, Mic, MicOff, Music, Film, Volume2, VolumeX } from 'lucide-react';

interface AudioMixerProps {
  micVolume: number;
  musicVolume: number;
  videoVolume: number;
  onMicVolumeChange: (val: number) => void;
  onMusicVolumeChange: (val: number) => void;
  onVideoVolumeChange: (val: number) => void;
  micLevel?: number;
  musicLevel?: number;
  videoLevel?: number;
  isMicMuted?: boolean;
  onMicMuteToggle?: () => void;
  audienceMonitorEnabled?: boolean;
  onAudienceMonitorToggle?: () => void;
}

const LevelMeter: FC<{ level: number; color: string }> = ({ level, color }) => {
  const normalizedLevel = Math.min(Math.max(level, 0), 1);
  const displayWidth = Math.pow(normalizedLevel, 0.7) * 100;
  return (
    <div className="h-1.5 w-full bg-gray-700 rounded overflow-hidden mt-1">
      <div className={`h-full ${color} transition-all duration-75`} style={{ width: `${displayWidth}%` }} />
    </div>
  );
};

const AudioMixer: FC<AudioMixerProps> = ({
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
  onMicMuteToggle,
  audienceMonitorEnabled = false,
  onAudienceMonitorToggle,
}) => {
  const renderSlider = (
    label: string,
    icon: ReactNode,
    mutedIcon: ReactNode | null,
    value: number,
    onChange: (val: number) => void,
    colorClass: string,
    levelColorClass: string,
    level: number,
    isMuted?: boolean,
    onMuteToggle?: () => void,
  ) => (
    <div className="flex items-center gap-3 mb-4 last:mb-0">
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
          title={isMuted ? 'Turn audience microphone on' : 'Mute audience microphone'}
        >
          {isMuted ? mutedIcon : value === 0 ? <VolumeX size={16} /> : icon}
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
        <LevelMeter level={isMuted ? 0 : level} color={levelColorClass} />
      </div>
    </div>
  );

  const programAudioActive = musicLevel > 0.01 || videoLevel > 0.01;

  return (
    <div className="bg-dark-800 p-4 rounded-lg border border-gray-700 w-72 shadow-xl">
      <h3 className="text-xs font-bold text-gray-400 uppercase mb-3 flex items-center gap-2">
        <Volume2 size={14} /> Audience Audio
      </h3>

      {onMicMuteToggle && (
        <button
          type="button"
          onClick={onMicMuteToggle}
          className={`w-full mb-3 rounded-xl border px-4 py-3 flex items-center justify-between font-bold transition-all ${
            isMicMuted
              ? 'bg-red-950/40 border-red-700/60 text-red-300 hover:bg-red-900/50'
              : 'bg-green-950/40 border-green-600/60 text-green-300 hover:bg-green-900/50'
          }`}
          aria-pressed={!isMicMuted}
        >
          <span className="flex items-center gap-2">
            {isMicMuted ? <MicOff size={20} /> : <Mic size={20} />}
            Audience Mic
          </span>
          <span className="text-xs tracking-wider">{isMicMuted ? 'MUTED' : 'LIVE'}</span>
        </button>
      )}

      {onAudienceMonitorToggle && (
        <button
          type="button"
          onClick={onAudienceMonitorToggle}
          className={`w-full mb-3 rounded-xl border px-4 py-3 flex items-center justify-between font-bold transition-all ${
            audienceMonitorEnabled
              ? 'bg-cyan-950/50 border-cyan-500/70 text-cyan-200'
              : 'bg-gray-900 border-gray-700 text-gray-300 hover:border-cyan-500/60'
          }`}
          aria-pressed={audienceMonitorEnabled}
          title="Monitor the exact pre-relay audience audio mix with minimum local latency. Headphones strongly recommended."
        >
          <span className="flex items-center gap-2">
            <Headphones size={20} /> Live Monitor
          </span>
          <span className="text-xs tracking-wider">{audienceMonitorEnabled ? 'HEARING MIX' : 'OFF'}</span>
        </button>
      )}

      <p className="text-[11px] leading-4 text-gray-400 mb-4">
        {audienceMonitorEnabled
          ? 'You are hearing the outgoing audience mix before internet/platform delay. Use headphones to avoid feedback.'
          : isMicMuted
            ? 'Your microphone and nearby background sound are excluded. Screen-share, video and music audio stay independent.'
            : 'Your microphone is being mixed into what the audience hears.'}
      </p>

      {renderSlider(
        'Mic level to audience',
        <Mic size={16} />,
        <MicOff size={16} />,
        micVolume,
        onMicVolumeChange,
        'bg-green-500/20 text-green-400',
        'bg-gradient-to-r from-green-500 to-green-400',
        micLevel,
        isMicMuted,
        onMicMuteToggle,
      )}

      {renderSlider(
        'Video / Program Audio',
        <Film size={16} />,
        null,
        videoVolume,
        onVideoVolumeChange,
        'bg-blue-500/20 text-blue-500',
        'bg-gradient-to-r from-blue-500 to-blue-400',
        videoLevel,
      )}

      {renderSlider(
        'Music / SFX',
        <Music size={16} />,
        null,
        musicVolume,
        onMusicVolumeChange,
        'bg-purple-500/20 text-purple-500',
        'bg-gradient-to-r from-purple-500 to-purple-400',
        musicLevel,
      )}

      <div className="mt-4 pt-3 border-t border-gray-700 text-xs flex items-center justify-between">
        <span className="text-gray-500">Audience hears</span>
        <span className="text-gray-300">
          {!isMicMuted && micLevel > 0.01 ? 'Mic + program' : programAudioActive ? 'Program only' : 'Silence'}
        </span>
      </div>
    </div>
  );
};

export default AudioMixer;
