import React from 'react';
import { useNavigate } from 'react-router-dom';

interface ErrorOverlayProps {
  errorCode?: string | number;
  errorMessage: string;
  retryCallback: () => void;
  attemptCount: number;
  isRetrying: boolean;
}

const ErrorOverlay: React.FC<ErrorOverlayProps> = ({
  errorCode,
  errorMessage,
  retryCallback,
  attemptCount,
  isRetrying,
}) => {
  const navigate = useNavigate();

  const handleGoHome = () => {
    navigate('/');
  };

  return (
    <div
      className="absolute inset-0 flex items-center justify-center pointer-events-none z-50"
      role="alert"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="bg-black/80 backdrop-blur-sm rounded-lg p-6 max-w-md w-full mx-4 pointer-events-auto">
        {/* Error Icon */}
        <div className="flex justify-center mb-4">
          <svg
            className="w-16 h-16 text-red-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>

        {/* Error Code Badge */}
        {errorCode && (
          <div className="text-center mb-2">
            <span className="text-xs font-mono text-gray-400 bg-gray-800 px-2 py-1 rounded">
              Error {errorCode}
            </span>
          </div>
        )}

        {/* Error Message */}
        <h2 className="text-xl font-bold text-white text-center mb-2">
          {errorMessage || 'Something went wrong'}
        </h2>

        {/* Retry Attempt Info */}
        {attemptCount > 0 && (
          <p className="text-sm text-gray-300 text-center mb-4">
            {isRetrying
              ? `Retrying... (Attempt ${attemptCount}/3)`
              : `Attempt ${attemptCount}/3 failed`}
          </p>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={retryCallback}
            disabled={isRetrying || attemptCount >= 3}
            className="flex-1 min-h-[44px] px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-black transition-colors"
          >
            {isRetrying ? 'Retrying...' : 'Retry'}
          </button>
          <button
            onClick={handleGoHome}
            className="flex-1 min-h-[44px] px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:ring-offset-black transition-colors"
          >
            Go to Home
          </button>
        </div>
      </div>
    </div>
  );
};

export default ErrorOverlay;
