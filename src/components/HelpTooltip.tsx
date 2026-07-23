import React, { useEffect, useRef } from 'react';

interface HelpTooltipProps {
  message: string;
  onClose: () => void;
  targetRef: React.RefObject<HTMLElement>;
}

const HelpTooltip: React.FC<HelpTooltipProps> = ({ message, onClose, targetRef }) => {
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscapeKey);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [onClose]);

  useEffect(() => {
    if (targetRef.current) {
      const targetRect = targetRef.current.getBoundingClientRect();
      if (tooltipRef.current) {
        tooltipRef.current.style.top = `${targetRect.top + window.scrollY}px`;
        tooltipRef.current.style.left = `${targetRect.left + window.scrollX}px`;
      }
    }
  }, [targetRef]);

  return (
    <div
      ref={tooltipRef}
      role='tooltip'
      aria-live='polite'
      aria-atomic='true'
      className='absolute z-50 bg-gray-800 text-white p-2 rounded shadow-lg pointer-events-none'
    >
      <div className='flex items-center justify-between'>
        <span>{message}</span>
        <button
          onClick={onClose}
          className='ml-2 text-gray-400 hover:text-white focus:outline-none'
          aria-label='Close'
        >
          &times;
        </button>
      </div>
    </div>
  );
};

export default HelpTooltip;