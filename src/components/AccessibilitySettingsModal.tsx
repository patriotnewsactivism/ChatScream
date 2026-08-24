import React from 'react';
import AccessibilitySettings from './Settings/AccessibilitySettings';
import { useAccessibilitySettings } from '../hooks/useAccessibilitySettings';

const AccessibilitySettingsModal = ({ onClose }: { onClose: () => void }) => {
  const { settings, updateSettings, resetSettings } = useAccessibilitySettings();

  const handleApply = () => {
    // Apply settings logic
  };

  const handleReset = () => {
    resetSettings();
  };

  return (
    <div className="modal-backdrop" aria-labelledby="accessibility-settings-title">
      <div className="modal-content" role="dialog" aria-modal="true">
        <div className="modal-header flex items-center justify-between p-4 border-b">
          <h2 id="accessibility-settings-title" className="text-lg font-semibold">
            Accessibility Settings
          </h2>
          <button
            onClick={onClose}
            aria-label="Close settings"
            className="p-2 rounded hover:bg-gray-200"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <div className="modal-body p-4">
          <AccessibilitySettings />
        </div>
        <div className="modal-footer flex justify-end p-4 border-t">
          <button
            onClick={handleReset}
            className="mr-2 px-4 py-2 rounded bg-gray-200 hover:bg-gray-300"
          >
            Reset to Defaults
          </button>
          <button
            onClick={handleApply}
            className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
          >
            Apply Settings
          </button>
        </div>
      </div>
    </div>
  );
};

export default AccessibilitySettingsModal;
