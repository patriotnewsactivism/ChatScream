import React from 'react';

const CaptionOverlay = ({ captions }) => {
  return (
    <div className='caption-overlay' aria-live='polite' aria-atomic='true'>
      {captions.map((caption, index) => (
        <p key={index}>{caption}</p>
      ))}
    </div>
  );
};

export default CaptionOverlay;