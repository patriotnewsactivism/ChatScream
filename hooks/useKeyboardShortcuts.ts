/**
 * useKeyboardShortcuts
 *
 * Registers global keyboard shortcuts for studio controls.
 * Shortcuts are disabled when focus is inside an input/textarea.
 *
 * Default bindings:
 *   Space  â toggle Go Live / End Stream
 *   M      â mute / unmute mic
 *   R      â start / stop recording
 *   C      â save clip
 *   T      â toggle auto-captions
 *   1-5    â switch scene by index
 *   F      â toggle fullscreen cam layout
 */

import { useEffect } from 'react';

export interface StudioShortcuts {
  onToggleLive?: () => void;
  onToggleMic?: () => void;
  onToggleRecord?: () => void;
  onSaveClip?: () => void;
  onToggleCaptions?: () => void;
  onSwitchScene?: (index: number) => void;
  onToggleFullscreen?: () => void;
}

const isInputFocused = () => {
  const tag = document.activeElement?.tagName?.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select';
};

export const useKeyboardShortcuts = (shortcuts: StudioShortcuts) => {
  useEffect(() => {
    const handler = (evt: KeyboardEvent) => {
      if (isInputFocused()) return;
      if (evt.metaKey || evt.ctrlKey || evt.altKey) return;

      switch (evt.key) {
        case ' ':
          evt.preventDefault();
          shortcuts.onToggleLive?.();
          break;
        case 'm':
        case 'M':
          shortcuts.onToggleMic?.();
          break;
        case 'r':
        case 'R':
          shortcuts.onToggleRecord?.();
          break;
        case 'c':
        case 'C':
          shortcuts.onSaveClip?.();
          break;
        case 't':
        case 'T':
          shortcuts.onToggleCaptions?.();
          break;
        case 'f':
        case 'F':
          shortcuts.onToggleFullscreen?.();
          break;
        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
          shortcuts.onSwitchScene?.(parseInt(evt.key, 10) - 1);
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [shortcuts]);
};
