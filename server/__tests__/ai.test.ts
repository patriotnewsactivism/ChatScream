import { describe, expect, it } from 'vitest';
import {
  buildFallbackContentAnalysis,
  buildFallbackModeration,
  buildFallbackViralPackage,
  extractTopics,
} from '../ai.js';

describe('server ai helpers', () => {
  it('extracts ranked topics from recent chat', () => {
    expect(
      extractTopics(
        ['Court filing timeline is confusing', 'Need timeline recap', 'timeline matters most'],
        'civil timeline',
      ),
    ).toContain('timeline');
  });

  it('flags unsafe moderation content', () => {
    expect(buildFallbackModeration('I will kill you').isAppropriate).toBe(false);
  });

  it('creates useful fallback viral package content', () => {
    const result = buildFallbackViralPackage('FOIA lawsuit', ['youtube']);
    expect(result.titles.length).toBeGreaterThan(0);
    expect(result.hashtags[0]).toMatch(/^#/);
  });

  it('builds stream analysis warnings for question-heavy chat', () => {
    const result = buildFallbackContentAnalysis(
      ['What happened?', 'Can you explain this?', 'Where is the source?'],
      'Case review',
      'motion hearing',
    );

    expect(result.engagementSuggestions[0]).toMatch(/question/i);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
