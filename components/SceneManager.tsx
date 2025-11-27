import React, { useState } from 'react';
import { Scene } from '../types';
import { Save, Play, Trash2, Plus, Film as FilmIcon, Settings } from 'lucide-react';

interface SceneManagerProps {
  scenes: Scene[];
  currentSceneId: string | null;
  onSaveScene: (name: string) => void;
  onLoadScene: (sceneId: string) => void;
  onDeleteScene: (sceneId: string) => void;
  recordingQuality?: 'low' | 'medium' | 'high' | 'ultra';
  onRecordingQualityChange?: (quality: 'low' | 'medium' | 'high' | 'ultra') => void;
}

const SceneManager: React.FC<SceneManagerProps> = ({
  scenes,
  currentSceneId,
  onSaveScene,
  onLoadScene,
  onDeleteScene,
  recordingQuality = 'high',
  onRecordingQualityChange
}) => {
  const [newSceneName, setNewSceneName] = useState('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);

  const handleSave = () => {
    if (newSceneName.trim()) {
      onSaveScene(newSceneName.trim());
      setNewSceneName('');
      setShowSaveDialog(false);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="bg-dark-900 border-b border-gray-800 p-4">
      <div className="flex items-center justify-between mb-3 gap-3">
        <h3 className="text-xs font-bold text-gray-400 uppercase flex items-center gap-2">
          <FilmIcon size={14} className="text-brand-400" /> Scenes
        </h3>

        <div className="flex items-center gap-2">
          {/* Recording Quality Selector */}
          {onRecordingQualityChange && (
            <div className="flex items-center gap-2 px-2 py-1 bg-dark-800 border border-gray-700 rounded-lg">
              <Settings size={12} className="text-gray-500" />
              <select
                value={recordingQuality}
                onChange={(e) => onRecordingQualityChange(e.target.value as any)}
                className="bg-transparent text-xs text-white outline-none cursor-pointer"
              >
                <option value="low">Low (2.5Mbps)</option>
                <option value="medium">Medium (5Mbps)</option>
                <option value="high">High (8Mbps)</option>
                <option value="ultra">Ultra (15Mbps)</option>
              </select>
            </div>
          )}

          <button
            onClick={() => setShowSaveDialog(!showSaveDialog)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white text-xs rounded-lg transition-colors"
          >
            <Plus size={14} />
            Save Current
          </button>
        </div>
      </div>

      {/* Save Dialog */}
      {showSaveDialog && (
        <div className="mb-3 p-3 bg-dark-800 rounded-lg border border-brand-500/30 animate-fade-in">
          <input
            type="text"
            placeholder="Scene name (e.g., Gaming Setup)"
            value={newSceneName}
            onChange={(e) => setNewSceneName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            className="w-full bg-dark-900 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-brand-500 outline-none mb-2"
            autoFocus
          />
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={!newSceneName.trim()}
              className="flex-1 bg-brand-600 hover:bg-brand-500 text-white text-xs py-2 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save Scene
            </button>
            <button
              onClick={() => {
                setShowSaveDialog(false);
                setNewSceneName('');
              }}
              className="px-4 bg-gray-700 hover:bg-gray-600 text-white text-xs py-2 rounded"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Scenes List */}
      <div className="space-y-2 max-h-32 overflow-y-auto scrollbar-thin">
        {scenes.length === 0 ? (
          <div className="text-center py-4 text-gray-500 text-xs">
            No saved scenes yet. Save your current setup to quickly switch between configurations.
          </div>
        ) : (
          scenes.map((scene) => (
            <div
              key={scene.id}
              className={`flex items-center gap-2 p-2 rounded-lg transition-all ${
                currentSceneId === scene.id
                  ? 'bg-brand-600/20 border border-brand-500/50'
                  : 'bg-dark-800 border border-gray-700 hover:border-gray-600'
              }`}
            >
              <button
                onClick={() => onLoadScene(scene.id)}
                className="flex-1 text-left flex items-start gap-2 min-w-0"
              >
                <Play size={14} className="text-brand-400 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-white truncate">
                    {scene.name}
                  </div>
                  <div className="text-xs text-gray-500">
                    {formatDate(scene.createdAt)}
                  </div>
                </div>
              </button>
              <button
                onClick={() => {
                  if (confirm(`Delete scene "${scene.name}"?`)) {
                    onDeleteScene(scene.id);
                  }
                }}
                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-500/10 rounded transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </div>

      {scenes.length > 0 && (
        <div className="mt-2 text-xs text-gray-500 text-center">
          {scenes.length} {scenes.length === 1 ? 'scene' : 'scenes'} saved
        </div>
      )}
    </div>
  );
};

export default SceneManager;
