import { useState, useEffect, useCallback } from 'react';
import {
  subscribeToChat,
  sendChatMessage,
  ChatMessage,
} from '../services/realtimeChat';

interface UseRealtimeChatOptions {
  streamId: string;
  userId: string;
  displayName: string;
  enabled?: boolean;
}

export function useRealtimeChat({
  streamId,
  userId,
  displayName,
  enabled = true,
}: UseRealtimeChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isSending, setIsSending] = useState(false);

  // Subscribe to chat messages
  useEffect(() => {
    if (!enabled || !streamId) {
      setMessages([]);
      setIsConnected(false);
      return;
    }

    setIsConnected(true);
    setError(null);

    const unsubscribe = subscribeToChat(
      streamId,
      (newMessages) => {
        setMessages(newMessages);
      },
      (err) => {
        setError(err);
        setIsConnected(false);
      }
    );

    return () => {
      unsubscribe();
      setIsConnected(false);
    };
  }, [streamId, enabled]);

  // Send message function
  const sendMessage = useCallback(
    async (content: string): Promise<boolean> => {
      if (!content.trim() || !streamId || isSending) {
        return false;
      }

      setIsSending(true);
      try {
        await sendChatMessage(streamId, userId, displayName, content);
        return true;
      } catch (err) {
        console.error('Failed to send message:', err);
        setError(
          err instanceof Error ? err : new Error('Failed to send message')
        );
        return false;
      } finally {
        setIsSending(false);
      }
    },
    [streamId, userId, displayName, isSending]
  );

  return {
    messages,
    isConnected,
    error,
    isSending,
    sendMessage,
  };
}

export type { ChatMessage };
