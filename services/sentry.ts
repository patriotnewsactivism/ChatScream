import { clientEnv } from './env';

/**
 * Sentry Error Tracking Integration
 *
 * To enable Sentry:
 * 1. Create account at https://sentry.io
 * 2. Create a new React project
 * 3. Add VITE_SENTRY_DSN to your .env.local
 * 4. The ErrorBoundary will automatically report errors
 */

// Sentry configuration
const SENTRY_DSN = clientEnv.VITE_SENTRY_DSN || '';
const ENVIRONMENT = import.meta.env.MODE || 'development';
const RELEASE = `chatscream@${import.meta.env.VITE_APP_VERSION || '1.1.0'}`;

interface SentryEvent {
  message: string;
  level: 'fatal' | 'error' | 'warning' | 'info' | 'debug';
  timestamp: string;
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
  user?: {
    id?: string;
    email?: string;
    username?: string;
  };
  stacktrace?: string;
}

// Simple Sentry client (no SDK dependency)
class SentryClient {
  private dsn: string;
  private projectId: string;
  private publicKey: string;
  private host: string;
  private enabled: boolean;

  constructor(dsn: string) {
    this.dsn = dsn;
    this.enabled = false;
    this.projectId = '';
    this.publicKey = '';
    this.host = '';

    if (dsn) {
      try {
        const url = new URL(dsn);
        this.publicKey = url.username;
        this.host = url.host;
        this.projectId = url.pathname.replace('/', '');
        this.enabled = true;
      } catch {
        console.warn('Invalid Sentry DSN');
      }
    }
  }

  private async send(event: SentryEvent): Promise<void> {
    if (!this.enabled) return;

    const endpoint = `https://${this.host}/api/${this.projectId}/store/`;

    const payload = {
      event_id: crypto.randomUUID().replace(/-/g, ''),
      timestamp: event.timestamp,
      platform: 'javascript',
      level: event.level,
      logger: 'javascript',
      environment: ENVIRONMENT,
      release: RELEASE,
      message: event.message,
      tags: event.tags || {},
      extra: event.extra || {},
      user: event.user,
      sdk: {
        name: 'chatscream-sentry',
        version: '1.0.0',
      },
      request: {
        url: window.location.href,
        headers: {
          'User-Agent': navigator.userAgent,
        },
      },
    };

    try {
      await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${this.publicKey}, sentry_client=chatscream-sentry/1.0.0`,
        },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      // Silently fail - don't cause more errors
      console.debug('Sentry send failed:', err);
    }
  }

  captureException(error: Error, extra?: Record<string, unknown>): void {
    this.send({
      message: error.message,
      level: 'error',
      timestamp: new Date().toISOString(),
      stacktrace: error.stack,
      extra: {
        ...extra,
        name: error.name,
        stack: error.stack,
      },
    });
  }

  captureMessage(message: string, level: SentryEvent['level'] = 'info', extra?: Record<string, unknown>): void {
    this.send({
      message,
      level,
      timestamp: new Date().toISOString(),
      extra,
    });
  }

  setUser(user: SentryEvent['user']): void {
    // Store for future events
    this.currentUser = user;
  }

  private currentUser?: SentryEvent['user'];
}

// Singleton instance
export const sentry = new SentryClient(SENTRY_DSN);

// Global error handler
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    sentry.captureException(event.error || new Error(event.message), {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const error = event.reason instanceof Error
      ? event.reason
      : new Error(String(event.reason));
    sentry.captureException(error, { type: 'unhandledrejection' });
  });
}

// Helper functions
export function captureException(error: Error, extra?: Record<string, unknown>): void {
  sentry.captureException(error, extra);
}

export function captureMessage(message: string, level?: SentryEvent['level'], extra?: Record<string, unknown>): void {
  sentry.captureMessage(message, level, extra);
}

export function setUser(user: { id?: string; email?: string; username?: string }): void {
  sentry.setUser(user);
}

export default sentry;
