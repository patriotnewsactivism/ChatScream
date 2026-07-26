export type Message = {
  id: string;
  content: string;
  author: {
    id: string;
    name: string;
  };
  timestamp: Date;
};

/**
 * Generates an accessible aria-label for a chat message.
 * Format: "{author}, {timeAgo}, says: {content}".
 */
export function getMessageAriaLabel(message: Message): string {
  const timeAgo = getTimeAgo(message.timestamp);
  return `${message.author.name}, ${timeAgo}, says: ${message.content}`;
}

function getTimeAgo(date: Date): string {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return `${diff} seconds ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
  return `${Math.floor(diff / 86400)} days ago`;
}

/**
 * Generates an accessible aria-live region for TTS announcements.
 */
export function getTTSAriaLiveRegion(message: Message): string {
  return `${message.author.name} says: ${message.content}`;
}
