import React from 'react';
import { Image as ImageIcon, Check } from 'lucide-react';

export const PRESET_BACKGROUNDS = [
  { id: 'default', name: 'Studio Dark', url: null, color: 'linear-gradient(to bottom, #111827, #000000)' },
  { id: 'news', name: 'Newsroom', url: 'https://images.unsplash.com/photo-1586880244406-556ebe35f282?q=80&w=600&auto=format&fit=crop', color: '#2c3e50' },
  { id: 'office', name: 'Office', url: 'https://images.unsplash.com/photo-1497366216548-37526070297c?q=80&w=600&auto=format&fit=crop', color: '#95a5a6' },
  { id: 'neon', name: 'Neon Gamer', url: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=600&auto=format&fit=crop', color: '#8e44ad' },
  { id: 'cozy', name: 'Cozy Home', url: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?q=80&w=600&auto=format&fit=crop', color: '#d35400' },
];

interface BackgroundSelectorProps {
  currentBackgroundId: string | null;
  onSelect: (url: string | null, id: string) => void;
}

const BackgroundSelector: React.FC<BackgroundSelectorProps> = ({ currentBackgroundId, onSelect }) => {
  return (
    <div className="p-4 border-t border-gray-800">
       <h3 className="text-xs font-bold text-gray-400 mb-3 uppercase flex items-center gap-2">
          <ImageIcon size={14} /> Studio Backgrounds
      </h3>
      <div className="grid grid-cols-3 gap-2">
        {PRESET_BACKGROUNDS.map((bg) => {
          const isSelected = (currentBackgroundId === bg.id) || (bg.id === 'default' && !currentBackgroundId);
          return (
            <button
              key={bg.id}
              onClick={() => onSelect(bg.url, bg.id)}
              className={`relative aspect-video rounded overflow-hidden border-2 transition-all group
                ${isSelected ? 'border-brand-500 shadow-lg shadow-brand-900/50' : 'border-gray-700 opacity-60 hover:opacity-100 hover:border-gray-500'}
              `}
              title={bg.name}
            >
              {bg.url ? (
                <img src={bg.url} alt={bg.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full" style={{ background: bg.color }} />
              )}
              
              {isSelected && (
                <div className="absolute inset-0 bg-brand-900/40 flex items-center justify-center">
                  <Check size={16} className="text-white drop-shadow-md" />
                </div>
              )}
              <div className="absolute bottom-0 inset-x-0 bg-black/60 p-1 text-[9px] text-center text-white truncate">
                {bg.name}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default BackgroundSelector;