import React, { useState } from 'react';
import { Destination, Platform } from '../types';
import { Trash2, Plus, Youtube, Facebook, Twitch, Globe, ToggleLeft, ToggleRight, Wifi, Info } from 'lucide-react';

interface DestinationManagerProps {
  destinations: Destination[];
  onAddDestination: (dest: Destination) => void;
  onRemoveDestination: (id: string) => void;
  onToggleDestination: (id: string) => void;
  isStreaming: boolean;
}

const DestinationManager: React.FC<DestinationManagerProps> = ({ 
  destinations, 
  onAddDestination, 
  onRemoveDestination, 
  onToggleDestination,
  isStreaming
}) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newPlatform, setNewPlatform] = useState<Platform>(Platform.YOUTUBE);
  const [newName, setNewName] = useState('');
  const [newKey, setNewKey] = useState('');

  const handleAdd = () => {
    if (!newName || !newKey) return;
    const newDest: Destination = {
      id: Date.now().toString(),
      platform: newPlatform,
      name: newName,
      streamKey: newKey,
      isEnabled: true,
      status: 'offline'
    };
    onAddDestination(newDest);
    setNewName('');
    setNewKey('');
    setShowAddForm(false);
  };

  const getIcon = (p: Platform) => {
    switch (p) {
      case Platform.YOUTUBE: return <Youtube className="text-red-500" />;
      case Platform.FACEBOOK: return <Facebook className="text-blue-500" />;
      case Platform.TWITCH: return <Twitch className="text-purple-500" />;
      default: return <Globe className="text-gray-400" />;
    }
  };

  return (
    <div className="bg-dark-800 p-4 rounded-lg border border-gray-700 h-full flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Wifi size={20} /> Destinations
        </h2>
        {!showAddForm && (
          <button 
            onClick={() => setShowAddForm(true)}
            className="text-xs bg-brand-600 hover:bg-brand-500 px-2 py-1 rounded flex items-center gap-1"
          >
            <Plus size={14} /> Add
          </button>
        )}
      </div>

      <div className="mb-4 bg-brand-900/30 p-2 rounded border border-brand-500/20 text-xs text-gray-300 flex gap-2">
         <Info size={16} className="text-brand-400 shrink-0" />
         <p>You can add multiple accounts for the same platform (e.g., Personal YouTube and Business YouTube) by adding them as separate destinations.</p>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3">
        {showAddForm && (
          <div className="bg-gray-800 p-3 rounded border border-gray-600 mb-3 animate-fade-in">
            <h3 className="text-xs font-semibold mb-2 text-gray-400">CONNECT NEW ACCOUNT</h3>
            <select 
              value={newPlatform} 
              onChange={(e) => setNewPlatform(e.target.value as Platform)}
              className="w-full bg-dark-900 border border-gray-700 rounded p-2 mb-2 text-sm text-white"
            >
              {Object.values(Platform).map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <input 
              type="text" 
              placeholder="Account Name (e.g. Personal YT)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full bg-dark-900 border border-gray-700 rounded p-2 mb-2 text-sm text-white"
            />
            <input 
              type="password" 
              placeholder="Stream Key"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              className="w-full bg-dark-900 border border-gray-700 rounded p-2 mb-2 text-sm text-white"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowAddForm(false)} className="text-xs text-gray-400 hover:text-white">Cancel</button>
              <button onClick={handleAdd} className="text-xs bg-brand-600 px-3 py-1 rounded text-white">Save</button>
            </div>
          </div>
        )}

        {destinations.length === 0 && !showAddForm && (
          <p className="text-gray-500 text-sm text-center py-4">No destinations connected.</p>
        )}

        {destinations.map(dest => (
          <div key={dest.id} className="flex items-center justify-between bg-dark-900 p-3 rounded border border-gray-800 hover:border-gray-600 transition-colors">
            <div className="flex items-center gap-3">
              {getIcon(dest.platform)}
              <div>
                <div className="text-sm font-medium">{dest.name}</div>
                <div className="text-xs text-gray-500 flex items-center gap-1">
                  {dest.status === 'live' ? (
                    <span className="text-red-500 font-bold animate-pulse">● LIVE</span>
                  ) : (
                    <span className="capitalize">{dest.status}</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => onToggleDestination(dest.id)}
                disabled={isStreaming} // Cannot toggle during stream
                className={`text-gray-400 hover:text-white ${isStreaming ? 'opacity-50 cursor-not-allowed' : ''}`}
                title={dest.isEnabled ? "Disable" : "Enable"}
              >
                {dest.isEnabled ? <ToggleRight size={24} className="text-brand-500" /> : <ToggleLeft size={24} />}
              </button>
              <button 
                onClick={() => onRemoveDestination(dest.id)}
                disabled={isStreaming}
                className={`text-gray-500 hover:text-red-500 ${isStreaming ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DestinationManager;