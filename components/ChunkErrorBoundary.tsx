import { Component, ReactNode } from 'react';

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
  message: string;
};

const SHOULD_RELOAD_KEY = 'chunk_error_reload_once';

const isChunkLoadError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error || '');
  return (
    message.includes('Failed to fetch dynamically imported module') ||
    message.includes('Importing a module script failed') ||
    message.includes('Loading chunk') ||
    message.includes('ChunkLoadError')
  );
};

const hardReload = async () => {
  try { sessionStorage.removeItem(SHOULD_RELOAD_KEY); } catch { /* ignore */ }

  if ('caches' in window) {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch { /* ignore */ }
  }

  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg?.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        await new Promise((r) => setTimeout(r, 300));
      }
    } catch { /* ignore */ }
  }

  window.location.reload();
};

export default class ChunkErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? error.message : String(error || 'Unknown error');
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown) {
    if (!isChunkLoadError(error)) return;

    try {
      const alreadyReloaded = sessionStorage.getItem(SHOULD_RELOAD_KEY) === '1';
      if (!alreadyReloaded) {
        sessionStorage.setItem(SHOULD_RELOAD_KEY, '1');
        hardReload();
      }
    } catch {
      // ignore
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen bg-dark-900 text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-dark-800 border border-gray-800 rounded-2xl p-6 space-y-3">
          <h1 className="text-xl font-bold">Update required</h1>
          <p className="text-sm text-gray-400">
            A new version is available. Click below to clear the cache and reload.
          </p>
          <button
            onClick={hardReload}
            className="w-full px-4 py-3 rounded-xl bg-brand-600 hover:bg-brand-500 font-semibold"
          >
            Clear cache &amp; reload
          </button>
          {this.state.message && (
            <div className="text-xs text-gray-600 break-words">{this.state.message}</div>
          )}
        </div>
      </div>
    );
  }
}
