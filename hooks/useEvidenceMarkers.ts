/**
 * useEvidenceMarkers â Timestamped evidence markers for field journalists.
 *
 * Drop markers during a livestream to tag key moments (e.g., "Officer threatened arrest").
 * Export as a formatted evidence log with timestamps linked to recording time.
 */

import { useState, useCallback, useRef } from 'react';

export interface EvidenceMarker {
  id: string;
  timestamp: number; // seconds into stream
  label: string;
  createdAt: Date;
}

export interface EvidenceMarkersResult {
  markers: EvidenceMarker[];
  addMarker: (label?: string) => void;
  removeMarker: (id: string) => void;
  clearMarkers: () => void;
  exportLog: () => string;
  quickMarkerLabels: string[];
}

const QUICK_LABELS = [
  'â ï¸ Rights violation',
  'ð Officer contact',
  'ð Badge/ID visible',
  'ð¤ Key statement',
  'ð Location change',
  'âï¸ Unlawful order',
];

export const useEvidenceMarkers = (streamDuration: number): EvidenceMarkersResult => {
  const [markers, setMarkers] = useState<EvidenceMarker[]>([]);

  const addMarker = useCallback(
    (label?: string) => {
      const marker: EvidenceMarker = {
        id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: streamDuration,
        label: label || 'ð Marker',
        createdAt: new Date(),
      };
      setMarkers((prev) => [...prev, marker]);
    },
    [streamDuration],
  );

  const removeMarker = useCallback((id: string) => {
    setMarkers((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const clearMarkers = useCallback(() => setMarkers([]), []);

  const formatTimestamp = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return h > 0
      ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
      : `${m}:${s.toString().padStart(2, '0')}`;
  };

  const exportLog = useCallback((): string => {
    if (markers.length === 0) return 'No evidence markers recorded.';

    const header = `EVIDENCE LOG â ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}\n`;
    const divider = 'â'.repeat(60) + '\n';
    const lines = markers.map(
      (m, i) =>
        `${(i + 1).toString().padStart(3, ' ')}. [${formatTimestamp(m.timestamp)}] ${m.label}\n     Recorded: ${m.createdAt.toLocaleTimeString()}`,
    );

    return `${header}${divider}${lines.join('\n\n')}\n${divider}Total markers: ${markers.length}`;
  }, [markers]);

  return {
    markers,
    addMarker,
    removeMarker,
    clearMarkers,
    exportLog,
    quickMarkerLabels: QUICK_LABELS,
  };
};
