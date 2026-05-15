import { Component, ReactNode } from 'react';

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
  message: string;
  giveUp: boolean;
};

const RELOAD_COUNT_KEY = 'chunk_error_reload_count';
const RELOAD_TS_KEY = 'chunk_error_reload_ts';
const MAX_AUTO_RELOADS = 2;
const RELOAD_WINDOW_MS = 30_000; // reset count after 30s of no errors

const isChunkLoadError = (error: unknown): boolean => {
  const msg = error instanceof Error ? error.message : String(error || '');
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('Loading chunk') ||
    msg.includes('ChunkLoadError') ||
    msg.includes('Load failed') ||
    msg.includes('error loading dynamically imported module')
  );
};

const clearCachesAndReload = async (): Promise<void> => {
  if ('caches' in window) {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch { /* ignore */ }
  }
  if ('serviceWorker' in navigator) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    } catch { /* ignore */ }
  }
  window.location.reload();
};

const getReloadCount = (): number => {
  try {
    const ts = parseInt(localStorage.getItem(RELOAD_TS_KEY) || '0', 10);
    // If last reload was more than 30s ago, reset the counter
    if (Date.now() - ts > RELOAD_WINDOW_MS) {
      localStorage.removeItem(RELOAD_COUNT_KEY);
      localStorage.removeItem(RELOAD_TS_KEY);
      return 0;
    }
    return parseInt(localStorage.getItem(RELOAD_COUNT_KEY) || '0', 10);
  } catch {
    return 0;
  }
};

const incrementReloadCount = (): number => {
  try {
    const count = getReloadCount() + 1;
    localStorage.setItem(RELOAD_COUNT_KEY, String(count));
    localStorage.setItem(RELOAD_TS_KEY, String(Date.now()));
    return count;
  } catch {
    return 99; // fail-safe: treat as exceeded
  }
};

export default class ChunkErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '', giveUp: false };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    const message = error instanceof Error ? error.message : String(error || 'Unknown error');
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown): void {
    if (!isChunkLoadError(error)) return;

    const count = getReloadCount();
    if (count >= MAX_AUTO_RELOADS) {
      // Already tried — stop looping, show manual button
      this.setState({ giveUp: true });
      return;
    }

    // First or second attempt — increment and reload
    incrementReloadCount();
    clearCachesAndReload();
  }

  handleManualReload = (): void => {
    try {
      localStorage.removeItem(RELOAD_COUNT_KEY);
      localStorage.removeItem(RELOAD_TS_KEY);
    } catch { /* ignore */ }
    clearCachesAndReload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    // Auto-reload in progress
    if (!this.state.giveUp) {
      return (
        <div className="min-h-screen bg-dark-900 text-white flex items-center justify-center">
          <div className="text-center space-y-3">
            <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm text-gray-400">Loading update...</p>
          </div>
        </div>
      );
    }

    // Gave up — show manual button
    return (
      <div className="min-h-screen bg-dark-900 text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-dark-800 border border-gray-800 rounded-2xl p-6 space-y-4">
          <h1 className="text-xl font-bold">Update required</h1>
          <p className="text-sm text-gray-400">
            A new version of ChatScream is available. Tap below to load it.
          </p>
          <button
            onClick={this.handleManualReload}
            className="w-full px-4 py-3 rounded-xl bg-brand-600 hover:bg-brand-500 font-semibold transition-colors"
          >
            Load Latest Version
          </button>
          {this.state.message && (
            <details className="text-xs text-gray-600">
              <summary className="cursor-pointer">Technical details</summary>
              <p className="mt-1 break-words">{this.state.message}</p>
            </details>
          )}
        </div>
      </div>
    );
  }
}
