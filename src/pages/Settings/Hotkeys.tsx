import React, { useState } from 'react';
import { useMobileLayout } from '../../hooks/useMobileLayout';
import { shortcuts } from '../../constants/shortcuts';
import HotkeyRecorder from '../../components/HotkeyRecorder';

const HotkeysPage: React.FC = () => {
  const { isMobile } = useMobileLayout();
  const [recordingAction, setRecordingAction] = useState<string | null>(null);

  const handleEditClick = (action: string) => {
    setRecordingAction(action);
  };

  const handleCloseRecorder = () => {
    setRecordingAction(null);
  };

  const handleSave = (action: string, combo: string) => {
    // TODO: dispatch Redux action to update hotkey
    // For now, just close the recorder
    setRecordingAction(null);
  };

  if (isMobile) {
    return (
      <div className="p-4">
        <h1 className="text-xl font-semibold mb-4">Hotkeys</h1>
        <p
          className="text-sm text-gray-600"
          role="alert"
          aria-live="polite"
        >
          Hotkey customization is available only on desktop devices. Please use a desktop to configure shortcuts.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold mb-4">Hotkeys</h1>
      <form>
        {shortcuts.map((s) => (
          <div
            key={s.action}
            className="flex items-center justify-between mb-3"
          >
            <label className="w-1/3 font-medium">{s.action}</label>
            <span className="w-1/3 text-gray-500">{s.combo}</span>
            <button
              type="button"
              className="w-1/3 bg-gray-100 rounded px-2 py-1 focus:ring focus:ring-blue-200"
              onClick={() => handleEditClick(s.action)}
              aria-label={`Edit shortcut for ${s.action}`}
            >
              Edit
            </button>
          </div>
        ))}
      </form>
      {recordingAction && (
        <HotkeyRecorder
          action={recordingAction}
          onClose={handleCloseRecorder}
          onSave={handleSave}
        />
      )}
    </div>
  );
};

export default HotkeysPage;
