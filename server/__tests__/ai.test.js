import { describe, expect, it } from 'vitest';
import { __testUtils } from '../ai.js';

describe('server ai helpers', () => {
  it('sanitizes string lists and trims values', () => {
    expect(__testUtils.sanitizeList([' one ', '', 'two', 3, 'three'], 2)).toEqual(['one', 'two']);
  });

  it('parses JSON text responses', () => {
    expect(__testUtils.parseJsonText('{"ok":true}')).toEqual({ ok: true });
  });

  it('throws on empty AI responses', () => {
    expect(() => __testUtils.parseJsonText('')).toThrow(/empty response/i);
  });
});
