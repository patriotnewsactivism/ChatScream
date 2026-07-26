import React, { useEffect, useRef, useState, useCallback } from 'react';
import { translateCaption } from '../../services/captionService';
import { useUserPreferences } from '../../hooks/useUserPreferences';
import { useAccessibilitySettings } from '../../hooks/useAccessibilitySettings';
import HelpTooltip from '../HelpTooltip';

// Utility: debounce batching
function useDebouncedBatch<T>(items: T[], delay: number, onBatch: (batch: T[]) => void) {
  const timer = useRef<NodeJS.Timeout | null>(null);
  const batch = useRef<T[]>([]);

  useEffect(() => {
    if (items.length === 0) return;
    batch.current.push(...items);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      onBatch(batch.current);
      batch.current = [];
    }, delay);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);
}

interface Caption {
  id: string;
  text: string;
  timestamp: number;
}

interface LiveCaptionsProps {
  captions: Caption[];
  // ...other props
}

const LiveCaptions: React.FC<LiveCaptionsProps> = ({ captions }) => {
  const { captionLanguage, showOriginalLanguage } = useUserPreferences(); // custom hook, returns { captionLanguage, showOriginalLanguage }
  const { captionFontSize, captionFontFamily, highContrast, screenReaderMode } = useAccessibilitySettings();
  const [displayedCaptions, setDisplayedCaptions] = useState<Caption[]>([]);
  const [translatedCaptions, setTranslatedCaptions] = useState<Record<string, string>>({});
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const [errorIds, setErrorIds] = useState<Record<string, string>>({});
  const [translationLatency, setTranslationLatency] = useState<Record<string, number>>({});

  // Clear errors before new async operation
  const clearErrors = useCallback(() => {
    setErrorIds({});
  }, []);

  // Debounce batching: batch new captions every 2s
  const [pendingCaptions, setPendingCaptions] = useState<Caption[]>([]);

  useEffect(() => {
    // Only batch new captions
    const newCaptions = captions.filter(
      (c) => !displayedCaptions.some((dc) => dc.id === c.id)
    );
    if (newCaptions.length > 0) {
      setPendingCaptions((prev) => [...prev, ...newCaptions]);
      setDisplayedCaptions((prev) => [...prev, ...newCaptions]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captions]);

  useDebouncedBatch(
    pendingCaptions,
    2000,
    async (batch) => {
      if (!captionLanguage || captionLanguage === 'original') return;
      clearErrors();
      const ids = batch.map((c) => c.id);
      setLoadingIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.add(id));
        return next;
      });
      try {
        const translations = await Promise.all(
          batch.map((c) => translateCaption(c.text, captionLanguage))
        );
        setTranslatedCaptions((prev) => ({
          ...prev,
          ...Object.fromEntries(translations.map((t, i) => [batch[i].id, t]))
        }));
        setTranslationLatency((prev) => ({
          ...prev,
          ...Object.fromEntries(translations.map((t, i) => [batch[i].id, Date.now() - batch[i].timestamp]))
        }));
      } catch (err) {
        setErrorIds((prev) => ({
          ...prev,
          ...Object.fromEntries(ids.map((id) => [id, 'Translation failed']))
        }));
      } finally {
        setLoadingIds((prev) => {
          const next = new Set(prev);
          ids.forEach((id) => next.delete(id));
          return next;
        });
      }
    }
  );

  // Accessibility: ARIA live region, font size/style, contrast, screen reader mode
  const captionsContainerRef = useRef<HTMLDivElement>(null);

  // Announce new captions for screen readers if screenReaderMode is enabled
  useEffect(() => {
    if (!screenReaderMode) return;
    if (captionsContainerRef.current) {
      captionsContainerRef.current.setAttribute('aria-live', 'assertive');
      captionsContainerRef.current.setAttribute('aria-atomic', 'true');
    }
    return () => {
      if (captionsContainerRef.current) {
        captionsContainerRef.current.setAttribute('aria-live', 'polite');
        captionsContainerRef.current.setAttribute('aria-atomic', 'true');
      }
    };
  }, [screenReaderMode]);

  // Caption style
  const captionStyle: React.CSSProperties = {
    fontSize: captionFontSize || 18,
    fontFamily: captionFontFamily || 'sans-serif',
    color: highContrast ? '#fff' : '#222',
    background: highContrast ? '#000' : 'rgba(255,255,255,0.7)',
    padding: '2px 8px',
    borderRadius: 4,
    marginBottom: 2,
    outline: screenReaderMode ? '2px solid #005fcc' : undefined
  };

  return (
    <div
      className="live-captions"
      ref={captionsContainerRef}
      aria-live={screenReaderMode ? 'assertive' : 'polite'}
      aria-atomic="true"
      tabIndex={screenReaderMode ? 0 : -1}
      style={{ outline: screenReaderMode ? '2px solid #005fcc' : undefined }}
    >
      {displayedCaptions.map((caption) => (
        <div key={caption.id} className="caption" style={captionStyle}>
          {loadingIds.has(caption.id) ? 'Loading...' : translatedCaptions[caption.id] || caption.text}
          {errorIds[caption.id] && <span className="error" aria-live="assertive">Error: {errorIds[caption.id]}</span>}
        </div>
      ))}
    </div>
  );
};

export default LiveCaptions;