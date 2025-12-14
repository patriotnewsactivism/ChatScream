import React from 'react';

type Props = {
  children: React.ReactNode;
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

export default class ChunkErrorBoundary extends React.Component<Props, State> {
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
        window.location.reload();
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
            Your browser likely has an old cached version. Reload to get the latest build.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="w-full px-4 py-3 rounded-xl bg-brand-600 hover:bg-brand-500 font-semibold"
          >
            Reload
          </button>
          <div className="text-xs text-gray-600 break-words">{this.state.message}</div>
        </div>
      </div>
    );
  }
}

