import { Component, ReactNode } from 'react';

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
  message: string;
  reloadAttempted: boolean;
};

const RELOAD_KEY = 'chunk_error_reload_ts';
const RELOAD_COOLDOWN_MS = 10_000; // 10 seconds between auto-reloads

const isChunkLoadError = (error: unknown): boolean => {
  const msg = error instanceof Error ? error.message : String(error || '');
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('Loading chunk') ||
    msg.includes('ChunkLoadError') ||
    msg.includes('Failed to fetch') ||
    msg.includes('Load failed') ||
    msg.includes('error loading dynamically imported module')
  );
};

const clearCachesAndReload = async (): Promise<void> => {
  // Clear all caches
  if ('caches' in window) {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch { /* ignore */ }
  }
  // Unregister service workers
  if ('serviceWorker' in navigator) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    } catch { /* ignore */ }
  }
  // Hard reload — bypass browser cache
  window.location.reload();
};

export default class ChunkErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '', reloadAttempted: false };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    const message = error instanceof Error ? error.message : String(error || 'Unknown error');
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown): void {
    if (!isChunkLoadError(error)) return;

    try {
      const lastReload = parseInt(sessionStorage.getItem(RELOAD_KEY) || '0', 10);
      const now = Date.now();

      if (now - lastReload > RELOAD_COOLDOWN_MS) {
        // First time hitting this error — auto-reload silently
        sessionStorage.setItem(RELOAD_KEY, String(now));
        clearCachesAndReload();
      } else {
        // Already tried reloading — show the manual button
        this.setState({ reloadAttempted: true });
      }
    } catch {
      this.setState({ reloadAttempted: true });
    }
  }

  handleManualReload = (): void => {
    try { sessionStorage.removeItem(RELOAD_KEY); } catch { /* ignore */ }
    clearCachesAndReload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    // If auto-reload is in progress, show a minimal spinner (not the banner)
    if (!this.state.reloadAttempted) {
      return (
        <div className="min-h-screen bg-dark-900 text-white flex items-center justify-center">
          <div className="text-center space-y-3">
            <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm text-gray-400">Refreshing app...</p>
          </div>
        </div>
      );
    }

    // Auto-reload was tried and failed — show the manual button
    return (
      <div className="min-h-screen bg-dark-900 text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-dark-800 border border-gray-800 rounded-2xl p-6 space-y-4">
          <h1 className="text-xl font-bold">Update required</h1>
          <p className="text-sm text-gray-400">
            A new version of ChatScream was deployed. Click below to load the latest version.
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
