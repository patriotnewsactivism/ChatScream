import { Component, ReactNode } from 'react';

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
  message: string;
  giveUp: boolean;
};

// ââ Keys must match index.html inline script ââââââââââââââââââââââââââââââââââ
const RELOAD_COUNT_KEY = 'cs_loop_count';
const RELOAD_TS_KEY    = 'cs_loop_ts';
const MAX_AUTO_RELOADS = 2;
const RELOAD_WINDOW_MS = 20_000;

// ââ Helpers âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
const isChunkLoadError = (error: unknown): boolean => {
  const msg = error instanceof Error ? error.message : String(error ?? '');
  return (
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /Loading chunk/i.test(msg) ||
    /ChunkLoadError/i.test(msg) ||
    /Load failed/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /Unable to preload CSS/i.test(msg)
  );
};

const clearEverythingAndReload = async (): Promise<void> => {
  // Clear all SW caches
  if ('caches' in window) {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch { /* ignore */ }
  }
  // Unregister all service workers
  if ('serviceWorker' in navigator) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    } catch { /* ignore */ }
  }
  // Hard reload â force browser to fetch fresh index.html from server
  window.location.reload();
};

const getReloadCount = (): number => {
  try {
    const ts = parseInt(localStorage.getItem(RELOAD_TS_KEY) ?? '0', 10);
    if (Date.now() - ts > RELOAD_WINDOW_MS) {
      localStorage.removeItem(RELOAD_COUNT_KEY);
      localStorage.removeItem(RELOAD_TS_KEY);
      return 0;
    }
    return parseInt(localStorage.getItem(RELOAD_COUNT_KEY) ?? '0', 10);
  } catch {
    return 0;
  }
};

const bumpReloadCount = (): number => {
  try {
    const next = getReloadCount() + 1;
    localStorage.setItem(RELOAD_COUNT_KEY, String(next));
    localStorage.setItem(RELOAD_TS_KEY, String(Date.now()));
    return next;
  } catch {
    return 99;
  }
};

// ââ Component âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
export default class ChunkErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '', giveUp: false };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error ?? 'Unknown error'),
    };
  }

  componentDidCatch(error: unknown): void {
    if (!isChunkLoadError(error)) return; // Let non-chunk errors bubble to ErrorBoundary

    const count = getReloadCount();

    if (count >= MAX_AUTO_RELOADS) {
      // Tried enough times â show manual button, stop looping
      this.setState({ giveUp: true });
      return;
    }

    bumpReloadCount();
    clearEverythingAndReload();
  }

  handleManualReload = (): void => {
    try {
      // Full reset â clear both our keys and any legacy keys
      ['cs_loop_count','cs_loop_ts','chunk_error_reload_count','chunk_error_reload_ts','cs_sw_reload_ts']
        .forEach((k) => localStorage.removeItem(k));
    } catch { /* ignore */ }
    clearEverythingAndReload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    // Attempting auto-recovery
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

    // Auto-recovery failed â manual action required
    return (
      <div className="min-h-screen bg-dark-900 text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-dark-800 border border-gray-800 rounded-2xl p-6 space-y-4">
          <h1 className="text-xl font-bold">Update available</h1>
          <p className="text-sm text-gray-400">
            A new version of ChatScream was deployed. Tap below to load it fresh.
          </p>
          <button
            onClick={this.handleManualReload}
            className="w-full px-4 py-3 rounded-xl bg-brand-600 hover:bg-brand-500 font-semibold transition-colors"
          >
            Load Latest Version
          </button>
          {this.state.message && (
            <details className="text-xs text-gray-600">
              <summary className="cursor-pointer">Details</summary>
              <p className="mt-1 break-words">{this.state.message}</p>
            </details>
          )}
        </div>
      </div>
    );
  }
}
