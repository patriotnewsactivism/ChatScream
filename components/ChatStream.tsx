import React, { useState, useEffect, useRef } from 'react';
import { generateChatResponse, moderateMessage } from '../services/claudeService';
import {
  MessageSquare, Send, X, Sparkles, Settings, Eye, EyeOff,
  Volume2, VolumeX, Trash2, Copy, Check, AlertCircle
} from 'lucide-react';

interface ChatMessage {
  id: string;
  type: 'user' | 'ai' | 'broadcast';
  content: string;
  timestamp: Date;
  displayOnStream: boolean;
}

interface ChatStreamProps {
  streamTopic: string;
  isStreaming: boolean;
  onBroadcast: (message: ChatMessage) => void;
}

const ChatStream: React.FC<ChatStreamProps> = ({ streamTopic, isStreaming, onBroadcast }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [showOnStream, setShowOnStream] = useState(true);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      type: 'user',
      content: input.trim(),
      timestamp: new Date(),
      displayOnStream: false,
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');

    // Generate AI response if enabled
    if (aiEnabled) {
      setIsLoading(true);
      try {
        const previousMessages = messages.slice(-5).map(m => m.content);
        const response = await generateChatResponse(input, streamTopic, previousMessages);

        const aiMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          type: 'ai',
          content: response.message,
          timestamp: new Date(),
          displayOnStream: false,
        };

        setMessages(prev => [...prev, aiMessage]);
      } catch (error) {
        console.error('Failed to generate AI response:', error);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleBroadcast = async (message: ChatMessage) => {
    // Moderate message before broadcasting
    const moderation = await moderateMessage(message.content);

    if (!moderation.isAppropriate) {
      alert(`Message blocked: ${moderation.reason || 'Content policy violation'}`);
      return;
    }

    const broadcastMessage: ChatMessage = {
      ...message,
      id: Date.now().toString(),
      type: 'broadcast',
      displayOnStream: true,
    };

    setMessages(prev => [...prev, broadcastMessage]);
    onBroadcast(broadcastMessage);
  };

  const handleQuickBroadcast = async () => {
    if (!input.trim()) return;

    const message: ChatMessage = {
      id: Date.now().toString(),
      type: 'broadcast',
      content: input.trim(),
      timestamp: new Date(),
      displayOnStream: true,
    };

    const moderation = await moderateMessage(input);
    if (!moderation.isAppropriate) {
      alert(`Message blocked: ${moderation.reason || 'Content policy violation'}`);
      return;
    }

    setMessages(prev => [...prev, message]);
    onBroadcast(message);
    setInput('');
  };

  const copyMessage = (content: string, id: string) => {
    navigator.clipboard.writeText(content);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const clearMessages = () => {
    setMessages([]);
  };

  if (!isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className="fixed bottom-36 right-3 md:bottom-24 md:right-4 z-40 p-4 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full shadow-xl shadow-purple-600/30 hover:scale-110 transition-all group"
      >
        <MessageSquare size={24} className="text-white" />
        <span className="absolute -top-2 -right-2 w-5 h-5 bg-green-500 rounded-full border-2 border-dark-900 animate-pulse" />
        <span className="hidden md:block absolute right-full mr-3 top-1/2 -translate-y-1/2 bg-dark-800 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
          Chat Stream
        </span>
      </button>
    );
  }

  return (
    <div className="fixed left-3 right-3 bottom-36 md:left-auto md:right-4 md:bottom-24 z-40 md:w-80 lg:w-96 bg-dark-800/95 backdrop-blur-xl border border-gray-700 rounded-2xl shadow-2xl flex flex-col max-h-[60vh] md:max-h-[70vh] animate-slide-up">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gradient-to-r from-purple-900/30 to-pink-900/30 rounded-t-2xl">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg">
            <MessageSquare size={16} className="text-white" />
          </div>
          <span className="font-bold text-white">Chat Stream</span>
          {isStreaming && (
            <span className="px-2 py-0.5 bg-red-500/20 border border-red-500/30 rounded-full text-xs text-red-400 font-medium">
              LIVE
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAiEnabled(!aiEnabled)}
            className={`p-1.5 rounded-lg transition-colors ${
              aiEnabled ? 'bg-purple-600/30 text-purple-400' : 'text-gray-500 hover:text-gray-300'
            }`}
            title={aiEnabled ? 'AI responses enabled' : 'AI responses disabled'}
          >
            <Sparkles size={16} />
          </button>
          <button
            onClick={clearMessages}
            className="p-1.5 text-gray-500 hover:text-gray-300 rounded-lg transition-colors"
            title="Clear messages"
          >
            <Trash2 size={16} />
          </button>
          <button
            onClick={() => setIsExpanded(false)}
            className="p-1.5 text-gray-500 hover:text-gray-300 rounded-lg transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[200px]">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            <MessageSquare size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">Send messages to your stream!</p>
            <p className="text-xs mt-1">Messages will appear as overlays for your viewers.</p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`group relative ${
                message.type === 'broadcast'
                  ? 'bg-gradient-to-r from-purple-600/20 to-pink-600/20 border border-purple-500/30'
                  : message.type === 'ai'
                  ? 'bg-indigo-600/10 border border-indigo-500/20'
                  : 'bg-gray-800/50 border border-gray-700'
              } rounded-xl p-3`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    {message.type === 'broadcast' && (
                      <span className="text-xs font-bold text-purple-400 uppercase flex items-center gap-1">
                        <Eye size={12} /> On Stream
                      </span>
                    )}
                    {message.type === 'ai' && (
                      <span className="text-xs font-bold text-indigo-400 uppercase flex items-center gap-1">
                        <Sparkles size={12} /> AI Suggestion
                      </span>
                    )}
                    {message.type === 'user' && (
                      <span className="text-xs font-bold text-gray-400 uppercase">You</span>
                    )}
                    <span className="text-xs text-gray-500">
                      {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-sm text-gray-200">{message.content}</p>
                </div>

                {/* Actions */}
                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                  <button
                    onClick={() => copyMessage(message.content, message.id)}
                    className="p-1 text-gray-500 hover:text-gray-300 rounded"
                    title="Copy"
                  >
                    {copied === message.id ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                  </button>
                  {message.type !== 'broadcast' && isStreaming && (
                    <button
                      onClick={() => handleBroadcast(message)}
                      className="p-1 text-purple-500 hover:text-purple-400 rounded"
                      title="Broadcast to stream"
                    >
                      <Send size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}

        {isLoading && (
          <div className="flex items-center gap-2 text-gray-400 text-sm">
            <div className="flex gap-1">
              <span className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <span>AI is thinking...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-gray-700">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (e.ctrlKey || e.metaKey) {
                    handleQuickBroadcast();
                  } else {
                    handleSend();
                  }
                }
              }}
              placeholder="Type a message..."
              className="w-full bg-dark-900/50 border border-gray-700 rounded-xl py-2.5 px-4 pr-10 text-white text-sm placeholder-gray-500 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-500 hover:text-purple-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Send size={16} />
            </button>
          </div>

          {isStreaming && (
            <button
              onClick={handleQuickBroadcast}
              disabled={!input.trim()}
              className="p-2.5 bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-purple-600/30"
              title="Broadcast to stream (Ctrl+Enter)"
            >
              <Eye size={18} />
            </button>
          )}
        </div>

        <p className="mt-2 text-xs text-gray-500 text-center">
          {isStreaming ? (
            <>Press <kbd className="px-1 py-0.5 bg-gray-700 rounded text-gray-400">Ctrl+Enter</kbd> to broadcast directly</>
          ) : (
            <>Start streaming to broadcast messages</>
          )}
        </p>
      </div>
    </div>
  );
};

export default ChatStream;
