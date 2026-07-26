import { useState, useEffect, useCallback } from 'react';
import { useAuthContext } from '../context/AuthContext';

// Define the type for accessibility settings
export type AccessibilitySettings = {
  captionFontSize: 'small' | 'medium' | 'large';
  captionFontStyle: 'sans' | 'serif' | 'mono';
  captionFontColor: string; // hex or named color
  highContrast: boolean;
  audioVolumeBoost: boolean;
  screenReaderMode: boolean;
  colorScheme: 'light' | 'dark';
  chatReadOutSpeed: 'normal' | 'fast' | 'faster';
};

const DEFAULT_SETTINGS: AccessibilitySettings = {
  captionFontSize: 'medium',
  captionFontStyle: 'sans',
  captionFontColor: '#ffffff',
  highContrast: false,
  audioVolumeBoost: false,
  screenReaderMode: false,
  colorScheme: 'light',
  chatReadOutSpeed: 'normal',
};

const LOCAL_STORAGE_KEY = 'streamPlayerAccessibilitySettings';

function isBrowserSupported(): boolean {
  // Feature detection: check for localStorage, CSS variables, Web Audio API
  try {
    if (typeof window === 'undefined') return false;
    if (!window.localStorage) return false;
    if (!window.CSS || typeof window.CSS.supports !== 'function') return false;
    if (!window.AudioContext && !window.webkitAudioContext) return false;
    return true;
  } catch {
    return false;
  }
}

function resolveConflicts(settings: AccessibilitySettings): AccessibilitySettings {
  // If highContrast is true, override custom font color with high contrast color
  if (settings.highContrast) {
    return {
      ...settings,
      captionFontColor: '#ffff00', // bright yellow for high contrast
    };
  }
  return settings;
}

export function useAccessibilitySettings() {
  const { user, syncAccessibilitySettingsToProfile } = useAuthContext();

  const [supported, setSupported] = useState(isBrowserSupported());
  const [settings, setSettings] = useState<AccessibilitySettings>(() => {
    if (!isBrowserSupported()) return DEFAULT_SETTINGS;
    const stored = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // Validate shape
        return { ...DEFAULT_SETTINGS, ...parsed };
      } catch {
        return DEFAULT_SETTINGS;
      }
    }
    return DEFAULT_SETTINGS;
  });

  // Conflict resolution
  const effectiveSettings = resolveConflicts(settings);

  // Persist to localStorage
  useEffect(() => {
    if (!supported) return;
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(settings));
  }, [settings, supported]);

  // Sync to profile if logged in
  useEffect(() => {
    if (!supported || !user) return;
    syncAccessibilitySettingsToProfile(settings);
  }, [supported, user, settings, syncAccessibilitySettingsToProfile]);

  const updateSettings = useCallback((newSettings: Partial<AccessibilitySettings>) => {
    setSettings(prevSettings => ({ ...prevSettings, ...newSettings }));
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
  }, []);

  return { settings: effectiveSettings, updateSettings, resetSettings, supported };
}
