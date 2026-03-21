import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestStreamContentAnalysis = vi.fn();

vi.mock('../aiClient', () => ({
  requestChatResponse: vi.fn(),
  requestModeration: vi.fn(),
  requestStreamMetadata: vi.fn(),
  requestViralPackage: vi.fn(),
  requestStreamContentAnalysis,
}));

describe('claudeService analyzeStreamContent', () => {
  beforeEach(() => {
    vi.resetModules();
    requestStreamContentAnalysis.mockReset();
  });

  it('uses the backend stream analysis endpoint when auth is available', async () => {
    requestStreamContentAnalysis.mockResolvedValue({
      sentiment: 'positive',
      topics: ['discovery'],
      engagementSuggestions: ['Ask for document theories'],
      warnings: ['OCR confidence dropped on one upload'],
      audienceMood: 'Highly engaged and investigative.',
    });

    const { analyzeStreamContent } = await import('../claudeService');
    const result = await analyzeStreamContent(
      ['Can you compare the filings?', 'Check page 8'],
      'Civil case review',
      'document analysis',
      'token-123',
    );

    expect(requestStreamContentAnalysis).toHaveBeenCalledWith(
      'token-123',
      ['Can you compare the filings?', 'Check page 8'],
      'Civil case review',
      'document analysis',
    );
    expect(result.sentiment).toBe('positive');
    expect(result.topics).toEqual(['discovery']);
  });

  it('falls back safely when the backend request fails', async () => {
    requestStreamContentAnalysis.mockRejectedValue(new Error('boom'));

    const { analyzeStreamContent } = await import('../claudeService');
    const result = await analyzeStreamContent(['hello'], 'Title', undefined, 'token-123');

    expect(result.sentiment).toBe('neutral');
    expect(result.engagementSuggestions.length).toBeGreaterThan(0);
    expect(result.audienceMood).toBe('Unable to analyze');
  });
});
