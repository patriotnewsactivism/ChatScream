/**
 * Input sanitization utilities for XSS protection
 */

// HTML entities to escape
const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;',
};

/**
 * Escape HTML special characters to prevent XSS
 */
export function escapeHtml(str: string): string {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/[&<>"'`=/]/g, (char) => HTML_ENTITIES[char] || char);
}

/**
 * Strip all HTML tags from a string
 */
export function stripHtml(str: string): string {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]*>/g, '');
}

/**
 * Sanitize a string for safe display (strips HTML and limits length)
 */
export function sanitizeString(str: string, maxLength: number = 1000): string {
  if (!str || typeof str !== 'string') return '';
  return stripHtml(str).trim().slice(0, maxLength);
}

/**
 * Sanitize a URL to prevent javascript: and data: attacks
 */
export function sanitizeUrl(url: string): string {
  if (!url || typeof url !== 'string') return '';

  const trimmed = url.trim().toLowerCase();

  // Block dangerous protocols
  if (
    trimmed.startsWith('javascript:') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('vbscript:')
  ) {
    return '';
  }

  // Allow http, https, mailto, tel, and relative URLs
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('mailto:') ||
    trimmed.startsWith('tel:') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('#')
  ) {
    return url;
  }

  // Prepend https:// for URLs without protocol
  if (trimmed.match(/^[a-z0-9-]+\.[a-z]{2,}/i)) {
    return `https://${url}`;
  }

  return '';
}

/**
 * Sanitize stream key input (alphanumeric and common stream key chars)
 */
export function sanitizeStreamKey(key: string): string {
  if (!key || typeof key !== 'string') return '';
  // Allow alphanumeric, dash, underscore, and common stream key characters
  return key.replace(/[^a-zA-Z0-9\-_]/g, '').slice(0, 200);
}

/**
 * Sanitize username/display name
 */
export function sanitizeUsername(name: string): string {
  if (!name || typeof name !== 'string') return '';
  return stripHtml(name)
    .replace(/[^\p{L}\p{N}\s\-_.]/gu, '')
    .trim()
    .slice(0, 50);
}

/**
 * Sanitize chat message (allow some basic formatting but no scripts)
 */
export function sanitizeChatMessage(message: string): string {
  if (!message || typeof message !== 'string') return '';
  return stripHtml(message)
    .replace(/\n{3,}/g, '\n\n') // Limit consecutive newlines
    .trim()
    .slice(0, 500);
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

/**
 * Sanitize and validate JSON string
 */
export function sanitizeJson<T>(jsonStr: string, fallback: T): T {
  try {
    return JSON.parse(jsonStr) as T;
  } catch {
    return fallback;
  }
}

/**
 * Create a CSP nonce for inline scripts
 */
export function generateNonce(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Rate limiter for client-side actions
 */
export class RateLimiter {
  private timestamps: Map<string, number[]> = new Map();

  constructor(
    private maxRequests: number,
    private windowMs: number
  ) {}

  canProceed(key: string): boolean {
    const now = Date.now();
    const timestamps = this.timestamps.get(key) || [];

    // Remove old timestamps
    const validTimestamps = timestamps.filter(t => now - t < this.windowMs);

    if (validTimestamps.length >= this.maxRequests) {
      return false;
    }

    validTimestamps.push(now);
    this.timestamps.set(key, validTimestamps);
    return true;
  }

  reset(key: string): void {
    this.timestamps.delete(key);
  }

  resetAll(): void {
    this.timestamps.clear();
  }
}

// Pre-configured rate limiters
export const aiGenerationLimiter = new RateLimiter(10, 60000); // 10 per minute
export const chatMessageLimiter = new RateLimiter(30, 60000); // 30 per minute
export const apiCallLimiter = new RateLimiter(100, 60000); // 100 per minute
