import React, { useContext } from 'react';
import { ThemeContext } from '../context/ThemeContext';

const StreamPlayerControls = ({ onToggleAccessibilityMode }) => {
  const { isAccessibilityMode, toggleAccessibilityMode } = useContext(ThemeContext);

  return (
    <div className="stream-player-controls">
      <button
        onClick={() => {
          toggleAccessibilityMode();
          onToggleAccessibilityMode();
        }}
        aria-pressed={isAccessibilityMode}
        className="accessibility-toggle"
      >
        Accessibility Mode
      </button>
      <button
        onClick={() => {
          // Handle PiP toggle
        }}
        aria-pressed={false}
        className="pip-toggle"
      >
        PiP
      </button>
    </div>
  );
};

export default StreamPlayerControls;
