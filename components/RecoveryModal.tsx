import React, { useState, useEffect } from 'react';

interface RecoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onResume: (playbackPosition: number) => void;
  onClear: () => void;
  streamTitle: string;
  playbackPosition: number;
}

const RecoveryModal: React.FC<RecoveryModalProps> = ({
  isOpen,
  onClose,
  onResume,
  onClear,
  streamTitle,
  playbackPosition
}) => {
  const [isVisible, setIsVisible] = useState(false);
  
  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
    } else {
      const timer = setTimeout(() => setIsVisible(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isOpen && !isVisible) {
    return null;
  }

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <>
      {/* Backdrop */}
      <div 
        className={`fixed inset-0 bg-black bg-opacity-50 transition-opacity duration-300 z-40 ${
          isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />
      
      {/* Modal */}
      <div 
        className={`fixed inset-0 flex items-center justify-center p-4 z-50 ${
          isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="recovery-modal-title"
        aria-describedby="recovery-modal-description"
      >
        <div 
          className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6 transform transition-all duration-300 scale-100"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-between items-start mb-4">
            <h2 
              id="recovery-modal-title" 
              className="text-xl font-bold text-gray-900 dark:text-white"
            >
              Resume Previous Session?
            </h2>
            <button
              type="button"
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-full p-1"
              onClick={onClose}
              aria-label="Close modal"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          <div className="mb-6">
            <p id="recovery-modal-description" className="text-gray-600 dark:text-gray-300 mb-2">
              We found a previous streaming session that was interrupted:
            </p>
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 mb-4">
              <p className="font-medium text-gray-900 dark:text-white truncate">{streamTitle}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Playback position: {formatTime(playbackPosition)}
              </p>
            </div>
            <p className="text-gray-600 dark:text-gray-300 text-sm">
              You can resume from where you left off or start a new session.
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              onClick={() => onResume(playbackPosition)}
              aria-label="Resume previous session"
            >
              Resume Session
            </button>
            <button
              type="button"
              className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 dark:bg-gray-600 dark:hover:bg-gray-500 dark:text-white font-medium rounded-md transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
              onClick={onClear}
              aria-label="Clear saved session and start fresh"
            >
              Start New Session
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default RecoveryModal;