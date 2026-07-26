import React from 'react';

interface GestureFeedbackOverlayProps {
  showPlayPause: boolean;
  isPlaying: boolean;
  showVolume: boolean;
  volumeLevel: number;
  showSeek: boolean;
  seekPosition: number;
  seekTime: string;
}

const GestureFeedbackOverlay: React.FC<GestureFeedbackOverlayProps> = ({
  showPlayPause,
  isPlaying,
  showVolume,
  volumeLevel,
  showSeek,
  seekPosition,
  seekTime,
}) => {
  return (
    <div className="gesture-feedback-overlay" aria-live="polite" aria-atomic="true">
      {/* Play/Pause Icon Overlay - centered, large, fades in/out */}
      {showPlayPause && (
        <div className="gesture-overlay-play-pause">
          <div className="gesture-icon-container">
            {isPlaying ? (
              <svg className="gesture-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            ) : (
              <svg className="gesture-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </div>
        </div>
      )}

      {/* Volume Level Bar - vertical on right side with numeric indicator */}
      {showVolume && (
        <div className="gesture-overlay-volume">
          <div className="volume-bar-container">
            <div className="volume-bar-bg">
              <div
                className="volume-bar-fill"
                style={{ height: `${volumeLevel}%` }}
                role="progressbar"
                aria-valuenow={volumeLevel}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Volume level ${volumeLevel}%`}
              />
            </div>
            <div className="volume-indicator">{volumeLevel}%</div>
          </div>
        </div>
      )}

      {/* Seek Position Preview - horizontal bar at bottom with time tooltip */}
      {showSeek && (
        <div className="gesture-overlay-seek">
          <div className="seek-preview-container">
            <div className="seek-bar-bg">
              <div
                className="seek-bar-fill"
                style={{ width: `${seekPosition}%` }}
              />
              <div
                className="seek-thumb"
                style={{ left: `${seekPosition}%` }}
              />
            </div>
            <div className="seek-time-tooltip" style={{ left: `${seekPosition}%` }}>
              {seekTime}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GestureFeedbackOverlay;
