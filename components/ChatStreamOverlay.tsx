import React, { useEffect, useState } from 'react';
import { MessageSquare } from 'react-feather';
import { BroadcastMessage } from '../types';

interface ChatStreamOverlayProps {
  messages: BroadcastMessage[];
  position?: 'top' | 'center' | 'bottom';
  style?: 'default' | 'minimal' | 'gradient' | 'neon';
  duration?: number;
}

const ChatStreamOverlay: React.FC<ChatStreamOverlayProps> = ({
  messages,
  position = 'bottom',
  style = 'default',
  duration = 5000,
}) => {
  const [currentMessage, setCurrentMessage] = useState<BroadcastMessage | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (messages.length > 0) {
      const latestMessage = messages[messages.length - 1];

      // Check if this is a new message
      if (!currentMessage || latestMessage.id !== currentMessage.id) {
        setCurrentMessage(latestMessage);
        setIsVisible(true);

        // Auto-hide after duration
        const timer = setTimeout(() => {
          setIsVisible(false);
        }, duration);

        return () => clearTimeout(timer);
      }
    }
  }, [messages, currentMessage, duration]);

  if (!currentMessage || !isVisible) return null;

  const positionClasses = {
    bottom: 'bottom-4 left-3 right-3 sm:left-4 sm:right-4',
    center: 'top-1/2 left-3 right-3 sm:left-4 sm:right-4 -translate-y-1/2',
    top: 'top-4 left-3 right-3 sm:left-4 sm:right-4',
  };

  const styleClasses = {
    default: 'bg-gradient-to-r from-purple-600/90 to-pink-600/90 backdrop-blur-sm',
    minimal: 'bg-black/70 backdrop-blur-md',
    gradient: 'bg-gradient-to-r from-blue-600/90 via-purple-600/90 to-pink-600/90 backdrop-blur-sm',
    neon: 'bg-black/80 border-2 border-cyan-500 shadow-[0_0_20px_rgba(0,255,255,0.5)]',
  };

  return (
    <div
      className={`absolute ${positionClasses[position]} z-30`}
      style={{ animation: isVisible ? 'slideUp 0.3s ease-out, fadeIn 0.3s ease-out' : 'fadeOut 0.3s ease-out' }}
    >
      <div className={`${styleClasses[style]} px-4 py-3 sm:px-6 sm:py-4 rounded-xl shadow-2xl max-w-2xl mx-auto`}>
        <div className="flex items-center gap-2 mb-1">
          <MessageSquare size={14} className={style === 'neon' ? 'text-cyan-400' : 'text-white/70'} />
          <span className={`text-xs font-medium uppercase tracking-wider ${style === 'neon' ? 'text-cyan-400' : 'text-white/70'}`}>
            Chat Stream
          </span>
        </div>
        <p className={`font-semibold text-base sm:text-lg leading-snug ${style === 'neon' ? 'text-cyan-100' : 'text-white'}`}>
          {currentMessage.content}
        </p>
        {currentMessage.isToxic && (
          <div className="toxic-warning">
            <span>Toxic Content Detected</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatStreamOverlay;