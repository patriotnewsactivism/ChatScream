import React from 'react';
import { LayoutMode } from '../types';
import { Layout, Maximize, Square, Columns, User } from 'lucide-react';

interface LayoutSelectorProps {
  currentLayout: LayoutMode;
  onSelect: (mode: LayoutMode) => void;
}

const LayoutSelector: React.FC<LayoutSelectorProps> = ({ currentLayout, onSelect }) => {
  const layouts = [
    { mode: LayoutMode.FULL_CAM, label: 'Solo', icon: <User size={20} /> },
    { mode: LayoutMode.FULL_SCREEN, label: 'Screen', icon: <Maximize size={20} /> },
    { mode: LayoutMode.PIP, label: 'PiP', icon: <Layout size={20} /> },
    { mode: LayoutMode.SPLIT, label: 'Split', icon: <Columns size={20} /> },
    { mode: LayoutMode.NEWSROOM, label: 'News', icon: <Square size={20} /> },
  ];

  return (
    <div className="flex justify-center gap-4 bg-dark-800 p-4 rounded-lg border border-gray-700">
      {layouts.map((item) => (
        <button
          key={item.mode}
          onClick={() => onSelect(item.mode)}
          className={`flex flex-col items-center gap-2 p-3 rounded-lg transition-all w-20
            ${currentLayout === item.mode 
              ? 'bg-brand-600 text-white shadow-lg shadow-brand-900/50 scale-105' 
              : 'text-gray-400 hover:bg-gray-700 hover:text-white'
            }`}
        >
          {item.icon}
          <span className="text-xs font-medium">{item.label}</span>
        </button>
      ))}
    </div>
  );
};

export default LayoutSelector;