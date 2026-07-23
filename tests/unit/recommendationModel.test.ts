import { describe, it, expect } from 'vitest';
import { getRecommendations } from '../../recommendationModel';

describe('recommendationModel', () => {
  it('returns top recommendations based on viewing history and preferences', () => {
    const viewingHistory = [
      { streamId: 's1', watchedAt: '2023-01-01T10:00:00Z' },
      { streamId: 's2', watchedAt: '2023-01-02T12:00:00Z' },
    ];
    const preferences = { genres: ['gaming', 'music'] };
    const recs = getRecommendations(viewingHistory, preferences);
    expect(recs).toBeInstanceOf(Array);
    expect(recs.length).toBeGreaterThan(0);
    recs.forEach(rec => {
      expect(rec).toHaveProperty('streamId');
      expect(rec).toHaveProperty('score');
    });
  });

  it('handles limited viewing history gracefully', () => {
    const viewingHistory = [{ streamId: 's1', watchedAt: '2023-01-01T10:00:00Z' }];
    const preferences = { genres: ['gaming'] };
    const recs = getRecommendations(viewingHistory, preferences);
    expect(recs).toBeInstanceOf(Array);
    expect(recs.length).toBeGreaterThan(0);
  });

  it('returns empty array when no preferences and no history', () => {
    const recs = getRecommendations([], {});
    expect(recs).toEqual([]);
  });
});