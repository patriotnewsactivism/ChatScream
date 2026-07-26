import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { captionService, CaptionService } from '../captionService';

// Mock the apiRequest function
const mockApiRequest = vi.fn();
vi.mock('../../server/index', () => ({
  apiRequest: (...args) => mockApiRequest(...args),
}));

describe('CaptionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Reset the service instance to clear any state between tests
    captionService.clearCache();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('translateCaption', () => {
    it('should return cached translation on cache hit', async () => {
      mockApiRequest.mockResolvedValue({ translatedText: 'Hola mundo' });

      // First call - cache miss
      const result1 = await captionService.translateCaption('Hello world', 'es');
      expect(result1).toBe('Hola mundo');
      expect(mockApiRequest).toHaveBeenCalledTimes(1);

      // Second call - cache hit
      const result2 = await captionService.translateCaption('Hello world', 'es');
      expect(result2).toBe('Hola mundo');
      // Should not call API again
      expect(mockApiRequest).toHaveBeenCalledTimes(1);
    });

    it('should call API on cache miss', async () => {
      mockApiRequest.mockResolvedValue({ translatedText: 'Bonjour le monde' });

      const result = await captionService.translateCaption('Hello world', 'fr');
      expect(result).toBe('Bonjour le monde');
      expect(mockApiRequest).toHaveBeenCalledWith('/api/caption/translate', {
        method: 'POST',
        body: { text: 'Hello world', targetLang: 'fr' },
      });
    });

    it('should generate unique cache keys for different text/language combinations', async () => {
      mockApiRequest.mockResolvedValue({ translatedText: 'Translated' });

      await captionService.translateCaption('Hello', 'es');
      await captionService.translateCaption('World', 'es');
      await captionService.translateCaption('Hello', 'fr');

      expect(mockApiRequest).toHaveBeenCalledTimes(3);
    });

    it('should expire cache after 24 hours', async () => {
      mockApiRequest.mockResolvedValue({ translatedText: 'Hola' });

      // First call
      await captionService.translateCaption('Hello', 'es');
      expect(mockApiRequest).toHaveBeenCalledTimes(1);

      // Advance time by 23 hours - should still be cached
      vi.advanceTimersByTime(23 * 60 * 60 * 1000);
      await captionService.translateCaption('Hello', 'es');
      expect(mockApiRequest).toHaveBeenCalledTimes(1);

      // Advance time by 2 more hours (total 25h) - should expire
      vi.advanceTimersByTime(2 * 60 * 60 * 1000);
      await captionService.translateCaption('Hello', 'es');
      expect(mockApiRequest).toHaveBeenCalledTimes(2);
    });

    it('should handle API errors gracefully', async () => {
      mockApiRequest.mockRejectedValue(new Error('API rate limit exceeded'));

      await expect(captionService.translateCaption('Hello', 'es')).rejects.toThrow('API rate limit exceeded');
      expect(mockApiRequest).toHaveBeenCalledTimes(1);
    });

    it('should handle empty text', async () => {
      mockApiRequest.mockResolvedValue({ translatedText: '' });

      const result = await captionService.translateCaption('', 'es');
      expect(result).toBe('');
      expect(mockApiRequest).toHaveBeenCalledWith('/api/caption/translate', {
        method: 'POST',
        body: { text: '', targetLang: 'es' },
      });
    });

    it('should handle special characters in text', async () => {
      mockApiRequest.mockResolvedValue({ translatedText: '¡Hola! ¿Cómo estás?' });

      const result = await captionService.translateCaption('Hello! How are you?', 'es');
      expect(result).toBe('¡Hola! ¿Cómo estás?');
    });
  });

  describe('clearCache', () => {
    it('should clear all cached entries', async () => {
      mockApiRequest.mockResolvedValue({ translatedText: 'Translated' });

      await captionService.translateCaption('Hello', 'es');
      await captionService.translateCaption('World', 'fr');
      expect(mockApiRequest).toHaveBeenCalledTimes(2);

      captionService.clearCache();

      await captionService.translateCaption('Hello', 'es');
      expect(mockApiRequest).toHaveBeenCalledTimes(3);
    });
  });

  describe('cache key generation', () => {
    it('should treat same text with different target languages as separate cache entries', async () => {
      mockApiRequest.mockResolvedValue({ translatedText: 'Translated' });

      await captionService.translateCaption('Hello', 'es');
      await captionService.translateCaption('Hello', 'fr');
      await captionService.translateCaption('Hello', 'de');

      expect(mockApiRequest).toHaveBeenCalledTimes(3);
    });

    it('should treat different texts with same target language as separate cache entries', async () => {
      mockApiRequest.mockResolvedValue({ translatedText: 'Translated' });

      await captionService.translateCaption('Hello', 'es');
      await captionService.translateCaption('World', 'es');

      expect(mockApiRequest).toHaveBeenCalledTimes(2);
    });
  });

  describe('TTL edge cases', () => {
    it('should handle cache entry exactly at TTL boundary', async () => {
      mockApiRequest.mockResolvedValue({ translatedText: 'Hola' });

      await captionService.translateCaption('Hello', 'es');
      expect(mockApiRequest).toHaveBeenCalledTimes(1);

      // Advance time to exactly 24 hours
      vi.advanceTimersByTime(24 * 60 * 60 * 1000);
      await captionService.translateCaption('Hello', 'es');
      // Should call API again at exactly TTL
      expect(mockApiRequest).toHaveBeenCalledTimes(2);
    });

    it('should handle multiple cache entries with different ages', async () => {
      mockApiRequest.mockResolvedValue({ translatedText: 'Translated' });

      // Add first entry
      await captionService.translateCaption('Hello', 'es');
      expect(mockApiRequest).toHaveBeenCalledTimes(1);

      // Advance 12 hours
      vi.advanceTimersByTime(12 * 60 * 60 * 1000);

      // Add second entry
      await captionService.translateCaption('World', 'es');
      expect(mockApiRequest).toHaveBeenCalledTimes(2);

      // Advance 12 more hours (total 24h from first entry)
      vi.advanceTimersByTime(12 * 60 * 60 * 1000);

      // First entry should be expired, second should still be valid
      await captionService.translateCaption('Hello', 'es');
      await captionService.translateCaption('World', 'es');

      expect(mockApiRequest).toHaveBeenCalledTimes(3); // Only 'Hello' should trigger new API call
    });
  });
});
