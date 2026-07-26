import React, { useEffect, useRef } from 'react';

interface RecoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onResume: () => void;
  onClear: () => void;
  streamTitle?: string;
  streamTime?: string;
}

const RecoveryModal: React.FC<RecoveryModalProps> = ({
  isOpen,
  onClose,
  onResume,
  onClear,
  streamTitle,
  streamTime,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-75 transition-opacity"
      aria-modal="true"
      role="dialog"
      aria-labelledby="recovery-modal-title"
      aria-describedby="recovery-modal-description"
    >
      <div 
        ref={modalRef}
        className="w-full max-w-md mx-auto bg-white rounded-xl shadow-2xl overflow-hidden transform transition-all duration-300 scale-100"
      >
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <h2 
              id="recovery-modal-title" 
              className="text-xl font-bold text-gray-900"
            >
              Resume Your Stream?
            </h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-full p-1 w-8 h-8 flex items-center justify-center"
              aria-label="Close modal"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
          
          <div id="recovery-modal-description" className="mb-6">
            <p className="text-gray-700 mb-2">
              We found a previous streaming session that was interrupted.
            </p>
            {streamTitle && (
              <p className="text-gray-700 mb-1">
                <span className="font-medium">Stream:</span> {streamTitle}
              </p>
            )}
            {streamTime && (
              <p className="text-gray-700">
                <span className="font-medium">Time:</span> {streamTime}
              </p>
            )}
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={onResume}
              className="flex-1 px-4 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors min-h-[44px] flex items-center justify-center"
            >
              Resume Streaming
            </button>
            <button
              onClick={onClear}
              className="flex-1 px-4 py-3 bg-gray-200 text-gray-800 font-medium rounded-lg hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors min-h-[44px] flex items-center justify-center"
            >
              Start New Session
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RecoveryModal;