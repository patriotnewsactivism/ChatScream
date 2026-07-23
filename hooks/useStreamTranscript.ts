/**
 * useStreamTranscript â Accumulates auto-caption text into a full transcript.
 *
 * While streaming, captures every caption chunk from useAutoCaption and builds
 * a complete transcript. When the stream ends, the transcript is available for
 * AI article generation and export.
 */

import { useState, useCallback, useRef, useEffect } from 'react';

export interface TranscriptChunk {
  text: string;
  timestamp: number; // seconds into stream
}

export interface StreamTranscriptResult {
  chunks: TranscriptChunk[];
  fullText: string;
  isCapturing: boolean;
  startCapture: () => void;
  stopCapture: () => void;
  addChunk: (text: string, timestamp: number) => void;
  clearTranscript: () => void;
  exportTranscript: () => string;
  wordCount: number;
}

export const useStreamTranscript = (): StreamTranscriptResult => {
  const [chunks, setChunks] = useState<TranscriptChunk[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const lastTextRef = useRef('');

  const startCapture = useCallback(() => {
    setIsCapturing(true);
  }, []);

  const stopCapture = useCallback(() => {
    setIsCapturing(false);
  }, []);

  const addChunk = useCallback(
    (text: string, timestamp: number) => {
      if (!isCapturing) return;
      const trimmed = text.trim();
      if (!trimmed || trimmed === lastTextRef.current) return;
      lastTextRef.current = trimmed;
      setChunks((prev) => [...prev, { text: trimmed, timestamp }]);
    },
    [isCapturing],
  );

  const clearTranscript = useCallback(() => {
    setChunks([]);
    lastTextRef.current = '';
  }, []);

  const fullText = chunks.map((c) => c.text).join(' ');
  const wordCount = fullText.split(/\s+/).filter(Boolean).length;

  const formatTimestamp = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return h > 0
      ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
      : `${m}:${s.toString().padStart(2, '0')}`;
  };

  const exportTranscript = useCallback((): string => {
    if (chunks.length === 0) return 'No transcript captured.';

    const header = `STREAM TRANSCRIPT â ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}\n`;
    const divider = 'â'.repeat(60) + '\n';

    // Group chunks into paragraphs (every ~60 seconds)
    const paragraphs: { startTime: number; text: string }[] = [];
    let currentParagraph = { startTime: 0, text: '' };

    for (const chunk of chunks) {
      if (
        currentParagraph.text &&
        chunk.timestamp - currentParagraph.startTime > 60
      ) {
        paragraphs.push({ ...currentParagraph });
        currentParagraph = { startTime: chunk.timestamp, text: chunk.text };
      } else {
        if (!currentParagraph.text) currentParagraph.startTime = chunk.timestamp;
        currentParagraph.text += (currentParagraph.text ? ' ' : '') + chunk.text;
      }
    }
    if (currentParagraph.text) paragraphs.push(currentParagraph);

    const lines = paragraphs.map(
      (p) => `[${formatTimestamp(p.startTime)}]\n${p.text}`,
    );

    return `${header}${divider}\n${lines.join('\n\n')}\n\n${divider}Words: ${wordCount} | Duration: ${chunks.length > 0 ? formatTimestamp(chunks[chunks.length - 1].timestamp) : '0:00'}`;
  }, [chunks, wordCount]);

  return {
    chunks,
    fullText,
    isCapturing,
    startCapture,
    stopCapture,
    addChunk,
    clearTranscript,
    exportTranscript,
    wordCount,
  };
};
