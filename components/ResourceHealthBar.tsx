/**
 * ResourceHealthBar â small indicator showing device health during streaming.
 *
 * Shows a colored pill: green (good), yellow (caution), red (danger).
 * Expands on tap to show FPS, memory, recommended quality, and warnings.
 * On phones, this is their safeguard against freezing.
 */
import React, { useState } from 'react';
import type { ResourceSnapshot } from '../hooks/useResourceGuard';
import { Activity, ChevronDown, ChevronUp } from 'lucide-react';

interface Props {
  snapshot: ResourceSnapshot;
  compact?: boolean;
}

const LEVEL_COLORS = {
  green: { bg: 'bg-green-500/20', border: 'border-green-500/40', dot: 'bg-green-500', text: 'text-green-400' },
  yellow: { bg: 'bg-yellow-500/20', border: 'border-yellow-500/40', dot: 'bg-yellow-500', text: 'text-yellow-400' },
  red: { bg: 'bg-red-500/20', border: 'border-red-500/40', dot: 'bg-red-500 animate-pulse', text: 'text-red-400' },
};

const ResourceHealthBar: React.FC<Props> = ({ snapshot, compact }) => {
  const [expanded, setExpanded] = useState(false);
  const c = LEVEL_COLORS[snapshot.level];

  return (
    <div className={`${c.bg} border ${c.border} rounded-lg overflow-hidden transition-all`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 px-3 py-1.5 w-full text-left"
      >
        <div className={`w-2 h-2 rounded-full ${c.dot}`} />
        <Activity size={14} className={c.text} />
        {!compact && (
          <span className={`text-xs font-medium ${c.text}`}>
            {snapshot.fps} fps
          </span>
        )}
        {snapshot.level !== 'green' && (
          <span className="text-[10px] text-gray-400 ml-auto mr-1">
            {snapshot.warnings[0]}
          </span>
        )}
        {expanded ? <ChevronUp size={12} className="text-gray-500" /> : <ChevronDown size={12} className="text-gray-500" />}
      </button>

      {expanded && (
        <div className="px-3 pb-2 space-y-1 border-t border-gray-700/50">
          <div className="flex justify-between text-[10px] text-gray-400 pt-1">
            <span>Frame Rate</span>
            <span className={c.text}>{snapshot.fps} fps</span>
          </div>
          <div className="flex justify-between text-[10px] text-gray-400">
            <span>Memory Pressure</span>
            <span className={c.text}>{Math.round(snapshot.memoryPressure * 100)}%</span>
          </div>
          <div className="flex justify-between text-[10px] text-gray-400">
            <span>Recommended Quality</span>
            <span className="text-white">{snapshot.recommendedResolution}p</span>
          </div>
          {snapshot.warnings.length > 0 && (
            <div className="pt-1 space-y-0.5">
              {snapshot.warnings.map((w, i) => (
                <p key={i} className={`text-[10px] ${c.text}`}>â  {w}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ResourceHealthBar;
