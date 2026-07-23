import React from 'react';

interface Caption {
  start: number;
  end: number;
  text: string;
}

interface CaptionOverlayProps {
  captions: Caption[];
  currentTime: number;
}

const CaptionOverlay: React.FC<CaptionOverlayProps> = ({ captions, currentTime }) => {
  const currentCaption = captions.find(
    (caption) => currentTime >= caption.start && currentTime <= caption.end
  );

  return (
    <div
      className="absolute bottom-20 left-0 right-0 flex justify-center pointer-events-none px-4 sm:px-6 md:px-8 z-20"
      data-testid="caption-overlay"
    >
      <div
        className={`max-w-4xl w-full bg-black/75 backdrop-blur-sm text-white text-center px-4 py-3 rounded-lg transition-all duration-200 ease-in-out ${
          currentCaption ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
        }`}
        aria-live="polite"
        aria-atomic="true"
        role="status"
      >
        <p className="text-sm sm:text-base md:text-lg font-medium leading-relaxed drop-shadow-md">
          {currentCaption?.text || ''}
        </p>
      </div>
    </div>
  );
};

export default CaptionOverlay;
export type { Caption, CaptionOverlayProps };
