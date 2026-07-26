import React from 'react';
import { useAccessibilitySettings } from '../../hooks/useAccessibilitySettings';

const AccessibilitySettings = () => {
  const { settings, updateSettings } = useAccessibilitySettings();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label htmlFor="screen-reader-announcements" className="font-medium">
          Enable screen reader announcements
        </label>
        <input
          id="screen-reader-announcements"
          type="checkbox"
          checked={settings.screenReaderMode}
          onChange={() =>
            updateSettings({ screenReaderMode: !settings.screenReaderMode })
          }
          className="toggle-checkbox"
        />
      </div>
      <div className="flex items-center justify-between">
        <label htmlFor="chat-readout-speed" className="font-medium">
          Increase chat read-out speed
        </label>
        <select
          id="chat-readout-speed"
          value={settings.chatReadOutSpeed}
          onChange={e =>
            updateSettings({ chatReadOutSpeed: e.target.value as any })
          }
          className="select-input"
        >
          <option value="normal">Normal</option>
          <option value="fast">Fast</option>
          <option value="faster">Faster</option>
        </select>
      </div>
      <div className="flex items-center justify-between">
        <label htmlFor="high-contrast-mode" className="font-medium">
          High-contrast mode
        </label>
        <input
          id="high-contrast-mode"
          type="checkbox"
          checked={settings.highContrast}
          onChange={() =>
            updateSettings({ highContrast: !settings.highContrast })
          }
          className="toggle-checkbox"
        />
      </div>
      <div className="flex items-center justify-between">
        <label htmlFor="tts-toggle" className="font-medium">
          Enable dynamic text-to-speech
        </label>
        <button
          id="tts-toggle"
          aria-pressed={settings.ttsEnabled}
          aria-label="Toggle dynamic text-to-speech"
          onClick={() =>
            updateSettings({ ttsEnabled: !settings.ttsEnabled })
          }
          className="accessibility-toggle-button"
        >
          {settings.ttsEnabled ? 'On' : 'Off'}
        </button>
      </div>
    </div>
  );
};

export default AccessibilitySettings;
