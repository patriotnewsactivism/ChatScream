/**
 * EvidenceMarkerPanel — UI for dropping and managing evidence markers during a stream.
 *
 * Shows quick-tap buttons for common marker types + custom marker input.
 * Displays marker timeline and export button.
 */

import React, { useState } from 'react';
import { Bookmark, Download, Trash2, Plus, Clock, AlertTriangle } from 'lucide-react';
import type { EvidenceMarker } from '../hooks/useEvidenceMarkers';

interface EvidenceMarkerPanelProps {
  markers: EvidenceMarker[];
  quickLabels: string[];
  streamDuration: number;
  isStreaming: boolean;
  onAddMarker: (label?: string) => void;
  onRemoveMarker: (id: string) => void;
  onClearMarkers: () => void;
  onExportLog: () => string;
  compact?: boolean;
}

const formatTime = (s: number): string => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
    : `${m}:${sec.toString().padStart(2, '0')}`;
};

const EvidenceMarkerPanel: React.FC<EvidenceMarkerPanelProps> = ({
  markers,
  quickLabels,
  streamDuration,
  isStreaming,
  onAddMarker,
  onRemoveMarker,
  onClearMarkers,
  onExportLog,
  compact = false,
}) => {
  const [customLabel, setCustomLabel] = useState('');

  const handleCustomMarker = () => {
    if (customLabel.trim()) {
      onAddMarker(customLabel.trim());
      setCustomLabel('');
    }
  };

  const handleExport = () => {
    const log = onExportLog();
    const blob = new Blob([log], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `evidence-log-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bookmark size={16} className="text-red-400" />
          <h3 className="text-sm font-bold text-gray-200">Evidence Markers</h3>
          {markers.length > 0 && (
            <span className="text-[10px] font-bold text-red-400 bg-red-500/20 px-1.5 py-0.5 rounded-full">
              {markers.length}
            </span>
          )}
        </div>
        {markers.length > 0 && (
          <div className="flex gap-1.5">
            <button
              onClick={handleExport}
              className="p-1.5 rounded bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
              title="Export evidence log"
            >
              <Download size={14} />
            </button>
            <button
              onClick={onClearMarkers}
              className="p-1.5 rounded bg-gray-800 text-gray-400 hover:text-red-400 hover:bg-gray-700 transition-colors"
              title="Clear all markers"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Quick marker buttons */}
      {isStreaming && (
        <>
          <div className={`grid ${compact ? 'grid-cols-2' : 'grid-cols-3'} gap-1.5`}>
            {quickLabels.map((label) => (
              <button
                key={label}
                onClick={() => onAddMarker(label)}
                className="px-2 py-2 rounded-lg bg-red-600/15 border border-red-500/30 text-[11px] font-medium text-red-300 hover:bg-red-600/30 hover:border-red-500/50 active:scale-95 transition-all text-center"
              >
                {label}
              </button>
            ))}
          </div>

          {/* Custom marker input */}
          <div className="flex gap-1.5">
            <input
              type="text"
              placeholder="Custom marker..."
              value={customLabel}
              onChange={(e) => setCustomLabel(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCustomMarker()}
              className="flex-1 bg-dark-950 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-500"
            />
            <button
              onClick={handleCustomMarker}
              disabled={!customLabel.trim()}
              className="px-3 py-2 rounded-lg bg-red-600 text-white text-xs font-semibold disabled:opacity-40 hover:bg-red-500 active:scale-95 transition-all"
            >
              <Plus size={14} />
            </button>
          </div>
        </>
      )}

      {/* Marker timeline */}
      {markers.length > 0 ? (
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {[...markers].reverse().map((marker) => (
            <div
              key={marker.id}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-dark-900 border border-gray-800 group"
            >
              <Clock size={11} className="text-gray-500 shrink-0" />
              <span className="text-[11px] font-mono text-brand-400 shrink-0">
                {formatTime(marker.timestamp)}
              </span>
              <span className="text-[11px] text-gray-300 truncate flex-1">
                {marker.label}
              </span>
              <button
                onClick={() => onRemoveMarker(marker.id)}
                className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-500 hover:text-red-400 transition-all"
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-4">
          <AlertTriangle size={20} className="mx-auto text-gray-600 mb-2" />
          <p className="text-[11px] text-gray-500">
            {isStreaming
              ? 'Tap a button above to mark key moments'
              : 'Start streaming to drop evidence markers'}
          </p>
        </div>
      )}
    </div>
  );
};

export default EvidenceMarkerPanel;
