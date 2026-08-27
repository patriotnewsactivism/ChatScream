import React, { useEffect, useRef } from 'react';
import { Film, Image as ImageIcon } from 'lucide-react';
import { MediaAsset } from '../types';

interface MediaPreviewProps {
  kind: 'video' | 'image';
  asset: MediaAsset | undefined;
  volume?: number;
  onVolumeChange?: (val: number) => void;
}

const MediaPreview: React.FC<MediaPreviewProps> = ({ kind, asset, volume = 1, onVolumeChange }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.volume = volume;
    el.muted = volume < 0.01;
  }, [volume, asset?.url]);

  const Empty = ({ label }: { label: string }) => (
    <div className="flex-1 flex flex-col items-center justify-center gap-2 text-gray-500">
      {kind === 'video' ? <Film size={28} /> : <ImageIcon size={28} />}
      <p className="text-xs italic">{label}</p>
    </div>
  );

  return (
    <div className="bg-dark-800 rounded-xl border border-gray-700 overflow-hidden flex flex-col h-full shadow-2xl">
      <div className="p-4 bg-dark-700 border-b border-gray-600 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-brand-500/20 flex items-center justify-center text-brand-400">
          {kind === 'video' ? <Film size={20} /> : <ImageIcon size={20} />}
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-white truncate">
            {asset ? asset.name : kind === 'video' ? 'No clip selected' : 'No image selected'}
          </h3>
          <p className="text-[10px] text-gray-400 uppercase tracking-wider font-bold">
            {asset ? 'On air' : 'Nothing on air'}
          </p>
        </div>
      </div>

      <div className="flex-1 min-h-0 bg-black flex items-center justify-center p-3">
        {!asset && (
          <Empty
            label={
              kind === 'video'
                ? 'Select a clip to send it to the canvas.'
                : 'Select an image to overlay it on the canvas.'
            }
          />
        )}
        {asset && kind === 'video' && (
          <video
            ref={videoRef}
            src={asset.url}
            className="max-h-full max-w-full rounded"
            autoPlay
            loop
            playsInline
            controls
          >
            {/* User-supplied clips carry no caption track; the element is a
                local preview of a file the operator just picked. */}
            <track kind="captions" />
          </video>
        )}
        {asset && kind === 'image' && (
          <img src={asset.url} alt={asset.name} className="max-h-full max-w-full rounded" />
        )}
      </div>

      {kind === 'video' && onVolumeChange && (
        <div className="p-4 bg-dark-900 border-t border-gray-700 flex items-center gap-3">
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
            Clip volume
          </span>
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
      )}
    </div>
  );
};

export default MediaPreview;
