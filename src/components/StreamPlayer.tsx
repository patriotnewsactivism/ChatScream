import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useAccessibilitySettings } from '../hooks/useAccessibilitySettings';
import { CaptionOverlay } from './CaptionOverlay';
import { LiveCaptions } from './LiveCaptions';
import { StreamPlayerControls } from './StreamPlayerControls';
import { useBitrateAdaptation } from '../hooks/useBitrateAdaptation';

const StreamPlayer = () => {
  const [isHighContrast, setIsHighContrast] = useState(false);
  const videoRef = useRef(null);
  const { adaptBitrate } = useBitrateAdaptation();

  // ABR UI State
  const [currentQuality, setCurrentQuality] = useState('auto');
  const [availableQualities, setAvailableQualities] = useState([
    { label: 'Auto', value: 'auto', bitrate: 0 },
    { label: '1080p', value: '1080p', bitrate: 5000000 },
    { label: '720p', value: '720p', bitrate: 2500000 },
    { label: '480p', value: '480p', bitrate: 1000000 },
    { label: '360p', value: '360p', bitrate: 500000 },
  ]);
  const [networkQuality, setNetworkQuality] = useState('good'); // good, fair, poor
  const [isBuffering, setIsBuffering] = useState(false);
  const [isManualOverride, setIsManualOverride] = useState(false);
  const [isSwitchingQuality, setIsSwitchingQuality] = useState(false);
  const [showQualityMenu, setShowQualityMenu] = useState(false);

  // Simulate network quality changes (in real app, this would come from bitrate adaptation hook)
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isManualOverride) {
        const qualities = ['good', 'fair', 'poor'];
        const randomQuality = qualities[Math.floor(Math.random() * qualities.length)];
        setNetworkQuality(randomQuality);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [isManualOverride]);

  // Simulate buffering events
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleWaiting = () => setIsBuffering(true);
    const handlePlaying = () => setIsBuffering(false);
    const handleCanPlay = () => setIsBuffering(false);

    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('canplay', handleCanPlay);

    return () => {
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('canplay', handleCanPlay);
    };
  }, []);

  // Handle quality change
  const handleQualityChange = useCallback(async (qualityValue: string) => {
    if (qualityValue === currentQuality) return;

    setIsSwitchingQuality(true);
    setCurrentQuality(qualityValue);
    setShowQualityMenu(false);

    // Simulate async bitrate switch
    await new Promise(resolve => setTimeout(resolve, 800));

    setIsSwitchingQuality(false);
    setIsManualOverride(qualityValue !== 'auto');
  }, [currentQuality]);

  // Handle manual override toggle
  const handleManualOverrideToggle = useCallback(() => {
    if (isManualOverride) {
      // Return to auto
      handleQualityChange('auto');
    } else {
      // Enable manual override with current network quality suggestion
      const suggestedQuality = networkQuality === 'good' ? '1080p' :
                              networkQuality === 'fair' ? '720p' : '480p';
      handleQualityChange(suggestedQuality);
    }
  }, [isManualOverride, networkQuality, handleQualityChange]);

  // Keyboard shortcuts for quality
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'q' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        // Toggle quality menu
        setShowQualityMenu(prev => !prev);
      }
      if (event.key === 'a' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        // Quick toggle auto/manual
        handleManualOverrideToggle();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleManualOverrideToggle]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'c') {
        setIsHighContrast(!isHighContrast);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isHighContrast]);

  useKeyboardShortcuts();
  useAccessibilitySettings();

  useEffect(() => {
    const videoElement = videoRef.current;
    if (videoElement) {
      videoElement.addEventListener('loadedmetadata', adaptBitrate);
      return () => {
        videoElement.removeEventListener('loadedmetadata', adaptBitrate);
      };
    }
  }, [adaptBitrate]);

  // Network quality indicator component
  const NetworkQualityIndicator = () => {
    const getSignalBars = () => {
      switch (networkQuality) {
        case 'good': return 4;
        case 'fair': return 2;
        case 'poor': return 1;
        default: return 3;
      }
    };

    const bars = getSignalBars();
    const barColor = networkQuality === 'good' ? 'bg-green-500' :
                     networkQuality === 'fair' ? 'bg-yellow-500' : 'bg-red-500';

    return (
      <div className="flex items-center gap-1" aria-label={`Network quality: ${networkQuality}`}>
        <div className="flex items-end gap-0.5 h-4">
          {[1, 2, 3, 4].map(level => (
            <div
              key={level}
              className={`w-1 rounded-sm transition-all duration-300 ${level <= bars ? barColor : 'bg-gray-600'}`}
              style={{ height: `${level * 3 + 4}px` }}
            />
          ))}
        </div>
        <span className="text-xs text-white/80 ml-1 capitalize">{networkQuality}</span>
      </div>
    );
  };

  // Quality badge component
  const QualityBadge = () => {
    const qualityLabel = availableQualities.find(q => q.value === currentQuality)?.label || 'Auto';
    const badgeColor = currentQuality === 'auto' ? 'bg-blue-500/80' :
                       currentQuality === '1080p' ? 'bg-green-500/80' :
                       currentQuality === '720p' ? 'bg-yellow-500/80' : 'bg-orange-500/80';

    return (
      <div
        className={`${badgeColor} text-white text-xs font-bold px-2 py-1 rounded-md backdrop-blur-sm`}
        aria-live="polite"
        aria-atomic="true"
      >
        {qualityLabel}
      </div>
    );
  };

  // Buffering overlay component
  const BufferingOverlay = () => {
    if (!isBuffering) return null;

    return (
      <div
        className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm pointer-events-none z-20"
        aria-live="polite"
        aria-atomic="true"
        role="status"
      >
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin" />
          <span className="text-white text-sm font-medium">Buffering...</span>
        </div>
      </div>
    );
  };

  // Quality selector dropdown
  const QualitySelector = () => {
    if (!showQualityMenu) return null;

    return (
      <div
        className="absolute bottom-20 right-4 bg-black/80 backdrop-blur-md rounded-lg p-2 z-30 min-w-[160px]"
        role="menu"
        aria-label="Quality selector"
      >
        {availableQualities.map(quality => (
          <button
            key={quality.value}
            onClick={() => handleQualityChange(quality.value)}
            disabled={isSwitchingQuality}
            className={`
              w-full text-left px-3 py-2.5 rounded-md text-sm transition-colors
              flex items-center justify-between
              ${currentQuality === quality.value
                ? 'bg-white/20 text-white font-medium'
                : 'text-white/80 hover:bg-white/10'
              }
              ${isSwitchingQuality ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2 focus:ring-offset-black
              min-h-[44px]
            `}
            role="menuitemradio"
            aria-checked={currentQuality === quality.value}
          >
            <span>{quality.label}</span>
            {currentQuality === quality.value && (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            )}
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className={`stream-player ${isHighContrast ? 'high-contrast' : ''} relative`}>
      <video
        ref={videoRef}
        aria-label='Stream Video'
        className="w-full h-full object-cover"
      >
        {/* Live captions are rendered by the caption overlay, but the element
            still needs a track for assistive technology to discover them. */}
        <track kind="captions" label="Live captions" default />
      </video>

      {/* Buffering Overlay - pointer-events-none to not block controls */}
      <BufferingOverlay />

      {/* Top-left: Network Quality Indicator */}
      <div className="absolute top-4 left-4 z-10 pointer-events-none">
        <div className="bg-black/60 backdrop-blur-sm rounded-lg px-3 py-2">
          <NetworkQualityIndicator />
        </div>
      </div>

      {/* Top-right: Current Quality Badge */}
      <div className="absolute top-4 right-4 z-10 pointer-events-none">
        <QualityBadge />
      </div>

      {/* Bottom-right: Quality Selector Button */}
      <div className="absolute bottom-20 right-4 z-20">
        <button
          onClick={() => setShowQualityMenu(prev => !prev)}
          disabled={isSwitchingQuality}
          className="
            bg-black/60 backdrop-blur-sm hover:bg-black/80
            text-white rounded-lg px-4 py-3
            flex items-center gap-2 transition-colors
            focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2 focus:ring-offset-black
            min-h-[44px] min-w-[44px]
            disabled:opacity-50 disabled:cursor-not-allowed
          "
          aria-label="Quality settings"
          aria-expanded={showQualityMenu}
          aria-haspopup="menu"
        >
          {isSwitchingQuality ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          )}
          <span className="text-sm font-medium">Quality</span>
        </button>

        {/* Quality Dropdown Menu */}
        <QualitySelector />
      </div>

      {/* Manual Override Toggle (bottom-left) */}
      <div className="absolute bottom-20 left-4 z-20">
        <button
          onClick={handleManualOverrideToggle}
          disabled={isSwitchingQuality}
          className="
            bg-black/60 backdrop-blur-sm hover:bg-black/80
            text-white rounded-lg px-4 py-3
            flex items-center gap-2 transition-colors
            focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2 focus:ring-offset-black
            min-h-[44px] min-w-[44px]
            disabled:opacity-50 disabled:cursor-not-allowed
          "
          aria-pressed={isManualOverride}
          aria-label={`${isManualOverride ? 'Disable' : 'Enable'} manual quality control`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
          </svg>
          <span className="text-sm font-medium">Auto</span>
        </button>
      </div>

      <CaptionOverlay />
      <LiveCaptions />
      <StreamPlayerControls />
    </div>
  );
};

export default StreamPlayer;