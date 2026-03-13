import React from 'react';
import { Scene, LayoutMode } from '../types';
import { Video, Monitor, Clock, Coffee, Play, MessageSquare, LogOut, Layers } from 'lucide-react';

interface SceneSelectorProps {
  activeSceneId: string | null;
  onSceneSelect: (scene: Scene | null) => void;
}

const PREBUILT_SCENES: Scene[] = [
  {
    id: 'camera-only',
    name: 'Camera Only',
    sources: [
      {
        id: 'cam-1',
        type: 'camera',
        x: 0,
        y: 0,
        width: 1280,
        height: 720,
        zIndex: 1,
        opacity: 1,
        isVisible: true,
      },
    ],
  },
  {
    id: 'screen-cam-pip',
    name: 'Screen + Cam PIP',
    sources: [
      {
        id: 'screen-1',
        type: 'screen',
        x: 0,
        y: 0,
        width: 1280,
        height: 720,
        zIndex: 1,
        opacity: 1,
        isVisible: true,
      },
      {
        id: 'cam-1',
        type: 'camera',
        x: 960,
        y: 540,
        width: 320,
        height: 180,
        zIndex: 2,
        opacity: 1,
        isVisible: true,
      },
    ],
  },
  {
    id: 'starting-soon',
    name: 'Starting Soon',
    sources: [
      {
        id: 'bg-1',
        type: 'image',
        url: 'https://images.unsplash.com/photo-1557683316-973673baf926',
        x: 0,
        y: 0,
        width: 1280,
        height: 720,
        zIndex: 1,
        opacity: 1,
        isVisible: true,
      },
      {
        id: 'text-1',
        type: 'text',
        x: 440,
        y: 300,
        width: 400,
        height: 100,
        zIndex: 2,
        opacity: 1,
        isVisible: true,
      },
    ],
  },
  {
    id: 'brb',
    name: 'BRB',
    sources: [
      {
        id: 'bg-1',
        type: 'image',
        url: 'https://images.unsplash.com/photo-1557682250-33bd709cbe85',
        x: 0,
        y: 0,
        width: 1280,
        height: 720,
        zIndex: 1,
        opacity: 1,
        isVisible: true,
      },
      {
        id: 'text-brb',
        type: 'text',
        x: 500,
        y: 300,
        width: 280,
        height: 80,
        zIndex: 2,
        opacity: 1,
        isVisible: true,
      },
    ],
  },
  {
    id: 'just-chatting',
    name: 'Just Chatting',
    sources: [
      {
        id: 'cam-1',
        type: 'camera',
        x: 50,
        y: 50,
        width: 800,
        height: 450,
        zIndex: 2,
        opacity: 1,
        isVisible: true,
      },
      {
        id: 'bg-1',
        type: 'image',
        url: 'https://images.unsplash.com/photo-1557682224-5b8590cd9ec5',
        x: 0,
        y: 0,
        width: 1280,
        height: 720,
        zIndex: 1,
        opacity: 1,
        isVisible: true,
      },
    ],
  },
];

const SceneSelector: React.FC<SceneSelectorProps> = ({ activeSceneId, onSceneSelect }) => {
  const getIcon = (id: string) => {
    switch (id) {
      case 'camera-only':
        return <Video size={18} />;
      case 'screen-cam-pip':
        return <Monitor size={18} />;
      case 'starting-soon':
        return <Clock size={18} />;
      case 'brb':
        return <Coffee size={18} />;
      case 'just-chatting':
        return <MessageSquare size={18} />;
      default:
        return <Layers size={18} />;
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest px-1">
        Scene Engine
      </h3>
      <div className="grid grid-cols-1 gap-2">
        <button
          onClick={() => onSceneSelect(null)}
          className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${!activeSceneId ? 'bg-brand-500/10 border-brand-500 text-brand-400' : 'bg-dark-800 border-gray-800 text-gray-400 hover:border-gray-600'}`}
        >
          <Layers size={18} />
          <span className="text-sm font-bold uppercase tracking-tight">Manual Layout</span>
        </button>

        {PREBUILT_SCENES.map((scene) => (
          <button
            key={scene.id}
            onClick={() => onSceneSelect(scene)}
            className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${activeSceneId === scene.id ? 'bg-brand-500/10 border-brand-500 text-brand-400' : 'bg-dark-800 border-gray-800 text-gray-400 hover:border-gray-600'}`}
          >
            {getIcon(scene.id)}
            <span className="text-sm font-bold uppercase tracking-tight">{scene.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default SceneSelector;
