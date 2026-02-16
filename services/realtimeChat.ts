import { ApiRequestError, apiRequest } from './apiClient';
import { getCurrentSessionToken } from './backend';

export interface ChatMessage {
  id: string;
  streamId: string;
  userId: string;
  displayName: string;
  content: string;
  createdAt: Date;
  isModerated?: boolean;
}

interface ChatMessagePayload {
  id?: unknown;
  streamId?: unknown;
  userId?: unknown;
  displayName?: unknown;
  content?: unknown;
  createdAt?: unknown;
  isModerated?: unknown;
}

const POLL_INTERVAL_MS = 2000;

const getToken = () => getCurrentSessionToken();

const parseMessage = (payload: unknown): ChatMessage | null => {
  if (!payload || typeof payload !== 'object') return null;
  const data = payload as ChatMessagePayload;
  const streamId = typeof data.streamId === 'string' ? data.streamId : '';
  const userId = typeof data.userId === 'string' ? data.userId : '';
  const displayName = typeof data.displayName === 'string' ? data.displayName : 'Viewer';
  const content = typeof data.content === 'string' ? data.content : '';

  if (!streamId || !content) return null;

  const createdAt = new Date(String(data.createdAt || Date.now()));
  return {
    id: typeof data.id === 'string' ? data.id : `${streamId}:${createdAt.getTime()}:${userId}`,
    streamId,
    userId,
    displayName,
    content,
    createdAt: Number.isNaN(createdAt.getTime()) ? new Date() : createdAt,
    isModerated: typeof data.isModerated === 'boolean' ? data.isModerated : undefined,
  };
};

const fetchMessages = async (streamId: string, messageLimit: number): Promise<ChatMessage[]> => {
  const response = await apiRequest<unknown>(
    `/api/chat/messages?streamId=${encodeURIComponent(streamId)}&limit=${messageLimit}`,
    {
      method: 'GET',
      token: getToken(),
    },
  );

  const payload =
    response && typeof response === 'object' ? (response as Record<string, unknown>) : {};
  const list = Array.isArray(payload.messages)
    ? payload.messages
    : Array.isArray(response)
      ? response
      : [];

  return list
    .map((entry) => parseMessage(entry))
    .filter((entry): entry is ChatMessage => Boolean(entry))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
};

// Subscribe to real-time chat messages.
export function subscribeToChat(
  streamId: string,
  onMessage: (messages: ChatMessage[]) => void,
  onError?: (error: Error) => void,
  messageLimit: number = 100,
): () => void {
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastSnapshotKey = '';

  const poll = async () => {
    if (disposed) return;
    try {
      const messages = await fetchMessages(streamId, messageLimit);
      const snapshotKey = JSON.stringify(
        messages.map((message) => [message.id, message.createdAt.getTime(), message.content]),
      );
      if (snapshotKey !== lastSnapshotKey) {
        lastSnapshotKey = snapshotKey;
        onMessage(messages);
      }
    } catch (err) {
      if (err instanceof ApiRequestError && (err.status === 404 || err.status === 405)) {
        onMessage([]);
      } else {
        const error = err instanceof Error ? err : new Error('Chat subscription error');
        console.error('Chat subscription error:', error);
        onError?.(error);
      }
    } finally {
      if (!disposed) {
        timer = setTimeout(poll, POLL_INTERVAL_MS);
      }
    }
  };

  void poll();

  return () => {
    disposed = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
}

// Send a chat message.
export async function sendChatMessage(
  streamId: string,
  userId: string,
  displayName: string,
  content: string,
): Promise<string> {
  const response = await apiRequest<unknown>('/api/chat/messages', {
    method: 'POST',
    token: getToken(),
    body: {
      streamId,
      userId,
      displayName,
      content: content.trim().slice(0, 500),
    },
  });

  const payload =
    response && typeof response === 'object' ? (response as Record<string, unknown>) : {};
  const id = payload.id;
  return typeof id === 'string' ? id : `${streamId}:${Date.now()}`;
}

// Create a unique stream ID for a session.
export function generateStreamId(userId: string): string {
  return `${userId}_${Date.now()}`;
}
