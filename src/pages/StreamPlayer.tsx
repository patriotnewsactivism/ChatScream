import React, { useState, useRef, useEffect, useContext } from 'react';
import VideoTransportBar from '../components/VideoTransportBar';
import ChatStream from '../components/ChatStream';
import HighlightsTab from '../components/HighlightsTab';
import { useMobileLayout } from '../hooks/useMobileLayout';
import { useSessionPersistence } from '../hooks/useSessionPersistence';
import ResumeWatchingBanner from '../components/ResumeWatchingBanner';
import { ThemeContext } from '../context/ThemeContext';

const StreamPlayer: React.FC = () => {
  const videoPlayerRef = useRef<HTMLVideoElement>(null);
  const [activeTab, setActiveTab] = useState<'chat' | 'highlights' | 'info'>('chat');
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { isLandscape, isCompactLandscape } = useMobileLayout();
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { session, resumeSession, startFreshSession, dismissSession } = useSessionPersistence();
  const { fontSize, highContrast, toggleHighContrast, setFontSize } = useContext(ThemeContext);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);
  };

  const handleTouchStart = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);
  };

  return (
    <div className={`min-h-screen bg-gray-900 text-white ${highContrast ? 'high-contrast' : ''}`} style={{ fontSize: `${fontSize}px` }}>
      <div className="flex flex-col lg:flex-row gap-4 p-4">
        <div className="flex-1">
          <div
            className={`relative bg-black rounded-lg overflow-hidden aspect-video ${isFullscreen ? 'fixed inset-0 z-50' : ''}`}
            onMouseMove={handleMouseMove}
            onTouchStart={handleTouchStart}
          >
            <video
              ref={videoPlayerRef}
              className="w-full h-full"
              controls={false}
            >
              {/* existing video sources */}
            </video>
            <div
              className={`absolute bottom-0 left-0 right-0 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}
            >
              <VideoTransportBar
                videoRef={videoPlayerRef}
                isFullscreen={isFullscreen}
                onFullscreenToggle={() => {
                  if (!document.fullscreenElement) {
                    videoPlayerRef.current?.requestFullscreen();
                  } else {
                    document.exitFullscreen();
                  }
                }}
              />
            </div>
            {/* existing overlays */}
          </div>
        </div>
        <div className="w-full lg:w-96 bg-gray-800 rounded-lg overflow-hidden">
          {/* Tab Navigation */}
          <div className="flex">
            <button
              className={`flex-1 p-2 ${activeTab === 'chat' ? 'bg-gray-700' : 'bg-gray-800'}`}
              onClick={() => setActiveTab('chat')}
              aria-pressed={activeTab === 'chat'}
            >
              Chat
            </button>
            <button
              className={`flex-1 p-2 ${activeTab === 'highlights' ? 'bg-gray-700' : 'bg-gray-800'}`}
              onClick={() => setActiveTab('highlights')}
              aria-pressed={activeTab === 'highlights'}
            >
              Highlights
            </button>
            <button
              className={`flex-1 p-2 ${activeTab === 'info' ? 'bg-gray-700' : 'bg-gray-800'}`}
              onClick={() => setActiveTab('info')}
              aria-pressed={activeTab === 'info'}
            >
              Info
            </button>
          </div>
          <div className="p-4">
            {activeTab === 'chat' && <ChatStream />}
            {activeTab === 'highlights' && <HighlightsTab />}
            {activeTab === 'info' && <ResumeWatchingBanner session={session} onResume={resumeSession} onStartFresh={startFreshSession} onDismiss={dismissSession} />}
          </div>
        </div>
      </div>
      <div className="fixed bottom-4 right-4 flex flex-col gap-2">
        <button
          className="p-2 bg-gray-700 rounded-full"
          onClick={() => setFontSize(fontSize + 1)}
          aria-label="Increase font size"
        >
          A+
        </button>
        <button
          className="p-2 bg-gray-700 rounded-full"
          onClick={() => setFontSize(fontSize - 1)}
          aria-label="Decrease font size"
        >
          A-
        </button>
        <button
          className="p-2 bg-gray-700 rounded-full"
          onClick={toggleHighContrast}
          aria-label="Toggle high contrast mode"
          aria-pressed={highContrast}
        >
          {highContrast ? 'High Contrast Off' : 'High Contrast On'}
        </button>
      </div>
    </div>
  );
};

export default StreamPlayer;