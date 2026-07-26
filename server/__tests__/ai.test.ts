import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { processChatMessage } from '../../server/ai';
import { mockApi } from '../../services/__mocks__/apiClient';

describe('AI Chat Moderation', () => {
  beforeEach(() => {
    mockApi.fetchChatHistory.mockClear();
  });

  it('should flag toxic content', async () => {
    const message = { id: 'm1', text: 'You are an idiot.' };
    const result = await processChatMessage(message);
    expect(result.flagged).toBe(true);
  });

  it('should not flag non-toxic content', async () => {
    const message = { id: 'm2', text: 'Hello, how are you?' };
    const result = await processChatMessage(message);
    expect(result.flagged).toBe(false);
  });

  it('should handle empty messages', async () => {
    const message = { id: 'm3', text: '' };
    const result = await processChatMessage(message);
    expect(result.flagged).toBe(false);
  });

  it('should handle very long messages', async () => {
    const message = { id: 'm4', text: 'a'.repeat(10000) };
    const result = await processChatMessage(message);
    expect(result.flagged).toBe(false);
  });

  it('should handle special characters', async () => {
    const message = { id: 'm5', text: '!@#$%^&*()' };
    const result = await processChatMessage(message);
    expect(result.flagged).toBe(false);
  });

  it('should handle messages with only whitespace', async () => {
    const message = { id: 'm6', text: '   ' };
    const result = await processChatMessage(message);
    expect(result.flagged).toBe(false);
  });
});