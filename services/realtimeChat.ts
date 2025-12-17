import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  addDoc,
  serverTimestamp,
  Timestamp,
  where,
} from 'firebase/firestore';
import { db } from './firebase';

export interface ChatMessage {
  id: string;
  streamId: string;
  userId: string;
  displayName: string;
  content: string;
  createdAt: Date;
  isModerated?: boolean;
}

interface FirestoreChatMessage {
  streamId: string;
  userId: string;
  displayName: string;
  content: string;
  createdAt: Timestamp;
  isModerated?: boolean;
}

// Subscribe to real-time chat messages
export function subscribeToChat(
  streamId: string,
  onMessage: (messages: ChatMessage[]) => void,
  onError?: (error: Error) => void,
  messageLimit: number = 100
): () => void {
  if (!db) {
    throw new Error('Firestore is not initialized');
  }
  const chatRef = collection(db, 'chat_messages');
  const q = query(
    chatRef,
    where('streamId', '==', streamId),
    orderBy('createdAt', 'desc'),
    limit(messageLimit)
  );

  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const messages: ChatMessage[] = snapshot.docs
        .map((doc) => {
          const data = doc.data() as FirestoreChatMessage;
          return {
            id: doc.id,
            streamId: data.streamId,
            userId: data.userId,
            displayName: data.displayName,
            content: data.content,
            createdAt: data.createdAt?.toDate() || new Date(),
            isModerated: data.isModerated,
          };
        })
        .reverse(); // Reverse to get chronological order

      onMessage(messages);
    },
    (error) => {
      console.error('Chat subscription error:', error);
      onError?.(error);
    }
  );

  return unsubscribe;
}

// Send a chat message
export async function sendChatMessage(
  streamId: string,
  userId: string,
  displayName: string,
  content: string
): Promise<string> {
  if (!db) {
    throw new Error('Firestore is not initialized');
  }
  const chatRef = collection(db, 'chat_messages');

  const docRef = await addDoc(chatRef, {
    streamId,
    userId,
    displayName,
    content: content.trim().slice(0, 500), // Limit message length
    createdAt: serverTimestamp(),
    isModerated: false,
  });

  return docRef.id;
}

// Create a unique stream ID for a session
export function generateStreamId(userId: string): string {
  return `${userId}_${Date.now()}`;
}
