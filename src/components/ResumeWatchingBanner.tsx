import React from 'react';
import PropTypes from 'prop-types';

const ResumeWatchingBanner = ({ streamTitle, thumbnail, playbackPosition, onResume, onStartFresh, onDismiss }) => {
  return (
    <div className="fixed bottom-4 left-4 right-4 bg-gray-800 p-4 rounded-lg shadow-lg z-50" role="alert" aria-live="polite" aria-atomic="true">
      <div className="flex items-center">
        <img src={thumbnail} alt={streamTitle} className="w-16 h-16 rounded mr-4" />
        <div>
          <h3 className="text-lg font-semibold">{streamTitle}</h3>
          <p className="text-sm">Resume at {playbackPosition}</p>
        </div>
      </div>
      <div className="flex justify-end mt-4">
        <button onClick={onResume} className="mr-2 px-4 py-2 bg-blue-500 text-white rounded">Resume</button>
        <button onClick={onStartFresh} className="mr-2 px-4 py-2 bg-gray-500 text-white rounded">Start Fresh</button>
        <button onClick={onDismiss} className="px-4 py-2 bg-red-500 text-white rounded">Dismiss</button>
      </div>
    </div>
  );
};

ResumeWatchingBanner.propTypes = {
  streamTitle: PropTypes.string.isRequired,
  thumbnail: PropTypes.string.isRequired,
  playbackPosition: PropTypes.string.isRequired,
  onResume: PropTypes.func.isRequired,
  onStartFresh: PropTypes.func.isRequired,
  onDismiss: PropTypes.func.isRequired,
};

export default ResumeWatchingBanner;
