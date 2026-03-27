import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  escapeHtml,
  stripHtml,
  sanitizeUrl,
  sanitizeStreamKey,
  sanitizeChatMessage,
  isValidEmail,
  sanitizeJson,
  RateLimiter,
} from '../sanitize';

describe('escapeHtml', () => {
  it('escapes all HTML entity characters', () => {
    expect(escapeHtml('&')).toBe('&amp;');
    expect(escapeHtml('<')).toBe('&lt;');
    expect(escapeHtml('>')).toBe('&gt;');
    expect(escapeHtml('"')).toBe('&quot;');
    expect(escapeHtml("'")).toBe('&#x27;');
    expect(escapeHtml('/')).toBe('&#x2F;');
    expect(escapeHtml('`')).toBe('&#x60;');
    expect(escapeHtml('=')).toBe('&#x3D;');
  });

  it('escapes a full XSS payload', () => {
    const input = '<script>alert("xss")</script>';
    const result = escapeHtml(input);
    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
    expect(result).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;');
  });

  it('returns plain text unchanged', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });

  it('returns empty string for empty input', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('returns empty string for non-string input', () => {
    expect(escapeHtml(null as unknown as string)).toBe('');
    expect(escapeHtml(undefined as unknown as string)).toBe('');
    expect(escapeHtml(42 as unknown as string)).toBe('');
  });
});

describe('stripHtml', () => {
  it('removes script blocks entirely', () => {
    const input = 'hello<script>alert("xss")</script>world';
    expect(stripHtml(input)).toBe('helloworld');
  });

  it('removes style blocks entirely', () => {
    const input = 'hello<style>.evil { color: red; }</style>world';
    expect(stripHtml(input)).toBe('helloworld');
  });

  it('removes inline tags leaving text content', () => {
    expect(stripHtml('<b>bold</b>')).toBe('bold');
    expect(stripHtml('<a href="x">link</a>')).toBe('link');
    expect(stripHtml('<p>paragraph</p>')).toBe('paragraph');
  });

  it('leaves plain text intact', () => {
    expect(stripHtml('just text')).toBe('just text');
  });

  it('handles multiline script tags', () => {
    const input = 'before<script>\nvar x = 1;\nconsole.log(x);\n</script>after';
    expect(stripHtml(input)).toBe('beforeafter');
  });

  it('returns empty string for empty input', () => {
    expect(stripHtml('')).toBe('');
  });

  it('returns empty string for non-string input', () => {
    expect(stripHtml(null as unknown as string)).toBe('');
    expect(stripHtml(undefined as unknown as string)).toBe('');
  });
});

describe('sanitizeUrl', () => {
  it('blocks javascript: protocol', () => {
    expect(sanitizeUrl('javascript:alert(1)')).toBe('');
    expect(sanitizeUrl('JAVASCRIPT:alert(1)')).toBe('');
    expect(sanitizeUrl('  javascript:alert(1)')).toBe('');
  });

  it('blocks data: protocol', () => {
    expect(sanitizeUrl('data:text/html,<h1>hi</h1>')).toBe('');
    expect(sanitizeUrl('DATA:text/html,x')).toBe('');
  });

  it('blocks vbscript: protocol', () => {
    expect(sanitizeUrl('vbscript:msgbox(1)')).toBe('');
    expect(sanitizeUrl('VBSCRIPT:msgbox(1)')).toBe('');
  });

  it('allows http:// URLs', () => {
    expect(sanitizeUrl('http://example.com')).toBe('http://example.com');
  });

  it('allows https:// URLs', () => {
    expect(sanitizeUrl('https://example.com/path?q=1')).toBe('https://example.com/path?q=1');
  });

  it('allows relative paths starting with /', () => {
    expect(sanitizeUrl('/dashboard')).toBe('/dashboard');
    expect(sanitizeUrl('/path/to/page')).toBe('/path/to/page');
  });

  it('allows hash fragments', () => {
    expect(sanitizeUrl('#section')).toBe('#section');
  });

  it('allows mailto: protocol', () => {
    expect(sanitizeUrl('mailto:user@example.com')).toBe('mailto:user@example.com');
  });

  it('allows tel: protocol', () => {
    expect(sanitizeUrl('tel:+1234567890')).toBe('tel:+1234567890');
  });

  it('prepends https:// to bare domains', () => {
    expect(sanitizeUrl('example.com')).toBe('https://example.com');
    expect(sanitizeUrl('sub.example.org')).toBe('https://sub.example.org');
  });

  it('returns empty string for unrecognized URLs', () => {
    expect(sanitizeUrl('not a url')).toBe('');
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeUrl('')).toBe('');
  });

  it('returns empty string for non-string input', () => {
    expect(sanitizeUrl(null as unknown as string)).toBe('');
    expect(sanitizeUrl(undefined as unknown as string)).toBe('');
  });
});

describe('sanitizeStreamKey', () => {
  it('allows alphanumeric characters', () => {
    expect(sanitizeStreamKey('abc123')).toBe('abc123');
    expect(sanitizeStreamKey('ABC')).toBe('ABC');
  });

  it('allows dash and underscore', () => {
    expect(sanitizeStreamKey('key-name_v2')).toBe('key-name_v2');
  });

  it('strips disallowed characters', () => {
    expect(sanitizeStreamKey('key!@#$%^&*()')).toBe('key');
    expect(sanitizeStreamKey('hello world')).toBe('helloworld');
    expect(sanitizeStreamKey('<script>')).toBe('script');
  });

  it('enforces 200-character limit', () => {
    const long = 'a'.repeat(300);
    expect(sanitizeStreamKey(long)).toHaveLength(200);
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeStreamKey('')).toBe('');
  });

  it('returns empty string for non-string input', () => {
    expect(sanitizeStreamKey(null as unknown as string)).toBe('');
    expect(sanitizeStreamKey(undefined as unknown as string)).toBe('');
  });
});

describe('sanitizeChatMessage', () => {
  it('strips HTML tags', () => {
    expect(sanitizeChatMessage('<b>hello</b>')).toBe('hello');
    expect(sanitizeChatMessage('<script>evil()</script>safe')).toBe('safe');
  });

  it('collapses 3+ consecutive newlines to 2', () => {
    expect(sanitizeChatMessage('a\n\n\nb')).toBe('a\n\nb');
    expect(sanitizeChatMessage('a\n\n\n\n\nb')).toBe('a\n\nb');
  });

  it('preserves up to 2 consecutive newlines', () => {
    expect(sanitizeChatMessage('a\n\nb')).toBe('a\n\nb');
    expect(sanitizeChatMessage('a\nb')).toBe('a\nb');
  });

  it('enforces 500-character limit', () => {
    const long = 'x'.repeat(600);
    expect(sanitizeChatMessage(long)).toHaveLength(500);
  });

  it('trims leading and trailing whitespace', () => {
    expect(sanitizeChatMessage('  hello  ')).toBe('hello');
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeChatMessage('')).toBe('');
  });

  it('returns empty string for non-string input', () => {
    expect(sanitizeChatMessage(null as unknown as string)).toBe('');
    expect(sanitizeChatMessage(undefined as unknown as string)).toBe('');
  });
});

describe('isValidEmail', () => {
  it('accepts valid email addresses', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
    expect(isValidEmail('user+tag@sub.domain.org')).toBe(true);
    expect(isValidEmail('name.surname@company.io')).toBe(true);
  });

  it('rejects addresses with no @', () => {
    expect(isValidEmail('notanemail')).toBe(false);
    expect(isValidEmail('noatsign.com')).toBe(false);
  });

  it('rejects addresses with multiple @', () => {
    expect(isValidEmail('a@b@c.com')).toBe(false);
  });

  it('rejects addresses with spaces', () => {
    expect(isValidEmail('user @example.com')).toBe(false);
    expect(isValidEmail('user@ example.com')).toBe(false);
  });

  it('rejects addresses with no domain part', () => {
    expect(isValidEmail('user@')).toBe(false);
  });

  it('rejects addresses with no TLD', () => {
    expect(isValidEmail('user@domain')).toBe(false);
  });

  it('returns false for empty input', () => {
    expect(isValidEmail('')).toBe(false);
  });

  it('returns false for non-string input', () => {
    expect(isValidEmail(null as unknown as string)).toBe(false);
    expect(isValidEmail(undefined as unknown as string)).toBe(false);
  });
});

describe('sanitizeJson', () => {
  it('parses valid JSON and returns the value', () => {
    expect(sanitizeJson('{"key":"value"}', null)).toEqual({ key: 'value' });
    expect(sanitizeJson('[1,2,3]', [])).toEqual([1, 2, 3]);
    expect(sanitizeJson('"hello"', '')).toBe('hello');
  });

  it('returns fallback for malformed JSON', () => {
    expect(sanitizeJson('{bad json}', null)).toBe(null);
    expect(sanitizeJson('', [])).toEqual([]);
    expect(sanitizeJson('undefined', 0)).toBe(0);
  });

  it('returns the parsed value even if the type differs from fallback', () => {
    // The function does not enforce type checking — just parses or falls back
    const result = sanitizeJson('42', 'fallback');
    expect(result).toBe(42);
  });
});

describe('RateLimiter', () => {
  let now: number;

  beforeEach(() => {
    now = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows requests within the limit', () => {
    const limiter = new RateLimiter(3, 1000);
    expect(limiter.canProceed('key')).toBe(true);
    expect(limiter.canProceed('key')).toBe(true);
    expect(limiter.canProceed('key')).toBe(true);
  });

  it('blocks once the limit is reached', () => {
    const limiter = new RateLimiter(2, 1000);
    limiter.canProceed('key');
    limiter.canProceed('key');
    expect(limiter.canProceed('key')).toBe(false);
  });

  it('allows again after the window expires', () => {
    const limiter = new RateLimiter(2, 1000);
    limiter.canProceed('key');
    limiter.canProceed('key');
    expect(limiter.canProceed('key')).toBe(false);

    // Advance time past the window
    vi.setSystemTime(now + 1001);
    expect(limiter.canProceed('key')).toBe(true);
  });

  it('tracks different keys independently', () => {
    const limiter = new RateLimiter(1, 1000);
    expect(limiter.canProceed('keyA')).toBe(true);
    expect(limiter.canProceed('keyA')).toBe(false);
    expect(limiter.canProceed('keyB')).toBe(true); // separate key, unaffected
  });

  it('reset clears a single key', () => {
    const limiter = new RateLimiter(1, 1000);
    limiter.canProceed('key');
    expect(limiter.canProceed('key')).toBe(false);
    limiter.reset('key');
    expect(limiter.canProceed('key')).toBe(true);
  });

  it('resetAll clears all keys', () => {
    const limiter = new RateLimiter(1, 1000);
    limiter.canProceed('a');
    limiter.canProceed('b');
    expect(limiter.canProceed('a')).toBe(false);
    expect(limiter.canProceed('b')).toBe(false);
    limiter.resetAll();
    expect(limiter.canProceed('a')).toBe(true);
    expect(limiter.canProceed('b')).toBe(true);
  });
});
