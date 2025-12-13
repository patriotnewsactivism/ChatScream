import React, { useState, useEffect } from 'react';
import { MessageSquare } from 'lucide-react';

interface BroadcastMessage {
  id: string;
  content: string;
  timestamp: Date;
}

interface ChatStreamOverlayProps {
  messages: BroadcastMessage[];
  style?: 'default' | 'minimal' | 'gradient' | 'neon';
  position?: 'bottom' | 'center' | 'top';
  duration?: number; // ms to display each message
}

const ChatStreamOverlay: React.FC<ChatStreamOverlayProps> = ({
  messages,
  style = 'default',
  position = 'bottom',
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
    bottom: 'bottom-8 left-4 right-4',
    center: 'top-1/2 left-4 right-4 -translate-y-1/2',
    top: 'top-8 left-4 right-4',
  };

  const styleClasses = {
    default: 'bg-gradient-to-r from-purple-600/90 to-pink-600/90 backdrop-blur-sm',
    minimal: 'bg-black/70 backdrop-blur-md',
    gradient: 'bg-gradient-to-r from-blue-600/90 via-purple-600/90 to-pink-600/90 backdrop-blur-sm',
    neon: 'bg-black/80 border-2 border-cyan-500 shadow-[0_0_20px_rgba(0,255,255,0.5)]',
  };

  return (
    <div
      className={`absolute ${positionClasses[position]} z-30 animate-slide-up`}
      style={{
        animation: isVisible ? 'slideUp 0.3s ease-out, fadeIn 0.3s ease-out' : 'fadeOut 0.3s ease-out',
      }}
    >
      <div className={`${styleClasses[style]} px-6 py-4 rounded-xl shadow-2xl max-w-2xl mx-auto`}>
        <div className="flex items-center gap-2 mb-1">
          <MessageSquare size={14} className={style === 'neon' ? 'text-cyan-400' : 'text-white/70'} />
          <span className={`text-xs font-medium uppercase tracking-wider ${
            style === 'neon' ? 'text-cyan-400' : 'text-white/70'
          }`}>
            Chat Stream
          </span>
        </div>
        <p className={`font-semibold text-lg leading-snug ${
          style === 'neon' ? 'text-cyan-100' : 'text-white'
        }`}>
          {currentMessage.content}
        </p>
      </div>
    </div>
  );
};

export default ChatStreamOverlay;
