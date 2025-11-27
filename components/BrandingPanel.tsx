import React from 'react';
import { BrandingSettings } from '../types';
import { Type, LayoutTemplate, Palette, MessageSquare } from 'lucide-react';

interface BrandingPanelProps {
  settings: BrandingSettings;
  onChange: (settings: BrandingSettings) => void;
}

const BrandingPanel: React.FC<BrandingPanelProps> = ({ settings, onChange }) => {
  const handleChange = (key: keyof BrandingSettings, value: any) => {
    onChange({ ...settings, [key]: value });
  };

  return (
    <div className="flex flex-col h-full bg-dark-900 overflow-y-auto p-4 space-y-6">
      
      {/* Lower Third Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-gray-400 uppercase flex items-center gap-2">
                <LayoutTemplate size={14} /> Lower Third
            </h3>
            <label className="relative inline-flex items-center cursor-pointer">
                <input 
                    type="checkbox" 
                    checked={settings.showLowerThird} 
                    onChange={(e) => handleChange('showLowerThird', e.target.checked)}
                    className="sr-only peer" 
                />
                <div className="w-9 h-5 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-600"></div>
            </label>
        </div>
        
        <div className={`space-y-3 transition-opacity ${settings.showLowerThird ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
            <div>
                <label className="block text-xs text-gray-500 mb-1">Presenter Name</label>
                <input 
                    type="text"
                    value={settings.presenterName}
                    onChange={(e) => handleChange('presenterName', e.target.value)}
                    className="w-full bg-dark-800 border border-gray-700 rounded p-2 text-sm text-white focus:border-brand-500 outline-none"
                    placeholder="e.g. Jane Doe"
                />
            </div>
            <div>
                <label className="block text-xs text-gray-500 mb-1">Headline / Title</label>
                <input 
                    type="text"
                    value={settings.presenterTitle}
                    onChange={(e) => handleChange('presenterTitle', e.target.value)}
                    className="w-full bg-dark-800 border border-gray-700 rounded p-2 text-sm text-white focus:border-brand-500 outline-none"
                    placeholder="e.g. Live Stream Host"
                />
            </div>
        </div>
      </div>

      <hr className="border-gray-800" />

      {/* Ticker Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-gray-400 uppercase flex items-center gap-2">
                <MessageSquare size={14} /> Scrolling Ticker
            </h3>
            <label className="relative inline-flex items-center cursor-pointer">
                <input 
                    type="checkbox" 
                    checked={settings.showTicker} 
                    onChange={(e) => handleChange('showTicker', e.target.checked)}
                    className="sr-only peer" 
                />
                <div className="w-9 h-5 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-600"></div>
            </label>
        </div>
        
        <div className={`transition-opacity ${settings.showTicker ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
            <label className="block text-xs text-gray-500 mb-1">Ticker Message</label>
            <textarea 
                value={settings.tickerText}
                onChange={(e) => handleChange('tickerText', e.target.value)}
                className="w-full bg-dark-800 border border-gray-700 rounded p-2 text-sm text-white focus:border-brand-500 outline-none h-20 resize-none"
                placeholder="News updates, call to actions, or social handles..."
            />
        </div>
      </div>

      <hr className="border-gray-800" />

      {/* Style Section */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-gray-400 uppercase flex items-center gap-2">
            <Palette size={14} /> Theme Colors
        </h3>
        
        <div className="flex items-center justify-between">
            <label className="text-sm text-gray-300">Primary Color</label>
            <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 font-mono">{settings.primaryColor}</span>
                <input 
                    type="color" 
                    value={settings.primaryColor}
                    onChange={(e) => handleChange('primaryColor', e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer border-0 p-0 bg-transparent"
                />
            </div>
        </div>

        <div className="flex items-center justify-between">
            <label className="text-sm text-gray-300">Accent Color</label>
            <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 font-mono">{settings.accentColor}</span>
                <input 
                    type="color" 
                    value={settings.accentColor}
                    onChange={(e) => handleChange('accentColor', e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer border-0 p-0 bg-transparent"
                />
            </div>
        </div>
      </div>

    </div>
  );
};

export default BrandingPanel;