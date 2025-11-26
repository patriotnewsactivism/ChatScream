import React, { useState } from 'react';
import { MediaAsset, MediaType } from '../types';
import { Trash2, Upload, Play, Pause, Image as ImageIcon, Film, Music, Eye, EyeOff } from 'lucide-react';

interface MediaBinProps {
  assets: MediaAsset[];
  activeAssets: {
    image: string | null;
    video: string | null;
    audio: string | null;
  };
  onUpload: (file: File, type: MediaType) => void;
  onDelete: (id: string) => void;
  onToggleAsset: (id: string, type: MediaType) => void;
}

const MediaBin: React.FC<MediaBinProps> = ({ 
  assets, 
  activeAssets, 
  onUpload, 
  onDelete, 
  onToggleAsset 
}) => {
  const [activeTab, setActiveTab] = useState<MediaType>('image');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onUpload(e.target.files[0], activeTab);
      // Reset input
      e.target.value = '';
    }
  };

  const filteredAssets = assets.filter(a => a.type === activeTab);

  const isActive = (id: string, type: MediaType) => {
    if (type === 'image') return activeAssets.image === id;
    if (type === 'video') return activeAssets.video === id;
    if (type === 'audio') return activeAssets.audio === id;
    return false;
  };

  return (
    <div className="flex flex-col h-full bg-dark-900 border-r border-gray-800">
      {/* Tabs */}
      <div className="flex border-b border-gray-800">
        <button 
          onClick={() => setActiveTab('image')}
          className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-1 ${activeTab === 'image' ? 'bg-dark-800 text-brand-400 border-b-2 border-brand-500' : 'text-gray-500 hover:text-white'}`}
        >
          <ImageIcon size={14} /> IMAGES
        </button>
        <button 
          onClick={() => setActiveTab('video')}
          className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-1 ${activeTab === 'video' ? 'bg-dark-800 text-brand-400 border-b-2 border-brand-500' : 'text-gray-500 hover:text-white'}`}
        >
          <Film size={14} /> VIDEOS
        </button>
        <button 
          onClick={() => setActiveTab('audio')}
          className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-1 ${activeTab === 'audio' ? 'bg-dark-800 text-brand-400 border-b-2 border-brand-500' : 'text-gray-500 hover:text-white'}`}
        >
          <Music size={14} /> MUSIC
        </button>
      </div>

      {/* Upload Area */}
      <div className="p-3 border-b border-gray-800">
        <label className="flex items-center justify-center gap-2 w-full p-3 bg-dark-800 border border-dashed border-gray-600 rounded cursor-pointer hover:bg-gray-800 transition-colors">
          <Upload size={16} className="text-gray-400" />
          <span className="text-sm text-gray-300">Upload {activeTab === 'image' ? 'Image/Doc' : activeTab === 'video' ? 'Video Clip' : 'Track'}</span>
          <input 
            type="file" 
            accept={activeTab === 'image' ? "image/*" : activeTab === 'video' ? "video/*" : "audio/*"} 
            className="hidden" 
            onChange={handleFileChange} 
          />
        </label>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {filteredAssets.length === 0 && (
          <div className="text-center py-8 text-gray-600 text-xs">
            No {activeTab}s uploaded.
          </div>
        )}

        {filteredAssets.map(asset => {
          const active = isActive(asset.id, asset.type);
          return (
            <div 
              key={asset.id} 
              className={`flex items-center justify-between p-2 rounded border transition-colors ${active ? 'bg-brand-900/20 border-brand-600' : 'bg-dark-800 border-gray-800 hover:border-gray-600'}`}
            >
              <div className="flex items-center gap-3 overflow-hidden">
                {asset.type === 'image' && <img src={asset.url} alt="thumbnail" className="w-10 h-10 object-cover rounded bg-black" />}
                {asset.type === 'video' && <div className="w-10 h-10 bg-black rounded flex items-center justify-center"><Film size={16} /></div>}
                {asset.type === 'audio' && <div className="w-10 h-10 bg-black rounded flex items-center justify-center"><Music size={16} /></div>}
                
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate w-32" title={asset.name}>{asset.name}</div>
                  <div className="text-xs text-gray-500 uppercase">{active ? (asset.type === 'audio' ? 'Playing' : 'Showing') : 'Hidden'}</div>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button 
                  onClick={() => onToggleAsset(asset.id, asset.type)}
                  className={`p-2 rounded hover:bg-gray-700 ${active ? 'text-brand-400' : 'text-gray-400'}`}
                  title={active ? "Hide/Stop" : "Show/Play"}
                >
                  {asset.type === 'audio' || asset.type === 'video' ? (
                     active ? <Pause size={16} /> : <Play size={16} />
                  ) : (
                     active ? <Eye size={16} /> : <EyeOff size={16} />
                  )}
                </button>
                <button 
                  onClick={() => onDelete(asset.id)}
                  className="p-2 rounded hover:bg-red-900/50 text-gray-500 hover:text-red-500"
                  title="Delete"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MediaBin;