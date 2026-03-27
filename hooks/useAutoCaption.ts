/**
 * useAutoCaption
 *
 * Real-time speech-to-text captions using the browser's built-in
 * SpeechRecognition API (available in Chrome/Android Chrome at no cost).
 *
 * Returns the current caption string and start/stop controls.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

// Normalise browser vendor prefix
const SpeechRecognitionClass =
  (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

export interface AutoCaptionOptions {
  lang?: string;
  /** Maximum characters shown in the caption bar. Default 120. */
  maxChars?: number;
}

export const useAutoCaption = (options: AutoCaptionOptions = {}) => {
  const { lang = 'en-US', maxChars = 120 } = options;

  const [caption, setCaption] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [isSupported] = useState(() => Boolean(SpeechRecognitionClass));

  const recRef = useRef<any>(null);
  const activeRef = useRef(false);

  const start = useCallback(() => {
    if (!isSupported || activeRef.current) return;

    const rec = new SpeechRecognitionClass();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (evt: any) => {
      let interim = '';
      let final = '';
      for (let i = evt.resultIndex; i < evt.results.length; i++) {
        const transcript = evt.results[i][0].transcript;
        if (evt.results[i].isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }
      const text = (final || interim).trim().slice(-maxChars);
      setCaption(text);
    };

    rec.onerror = (evt: any) => {
      if (evt.error !== 'no-speech') {
        console.warn('[AutoCaption] error:', evt.error);
      }
    };

    rec.onend = () => {
      // Auto-restart unless the user explicitly stopped
      if (activeRef.current) rec.start();
    };

    recRef.current = rec;
    activeRef.current = true;
    setIsActive(true);
    rec.start();
  }, [isSupported, lang, maxChars]);

  const stop = useCallback(() => {
    activeRef.current = false;
    setIsActive(false);
    setCaption('');
    recRef.current?.stop();
    recRef.current = null;
  }, []);

  const toggle = useCallback(() => {
    if (activeRef.current) stop();
    else start();
  }, [start, stop]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      activeRef.current = false;
      recRef.current?.stop();
    };
  }, []);

  return { caption, isActive, isSupported, start, stop, toggle };
};
