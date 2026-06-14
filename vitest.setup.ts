import '@testing-library/jest-dom/vitest';

// jsdom doesn't include MediaRecorder — stub it so tests that render
// components referencing it don't throw ReferenceError.
if (typeof MediaRecorder === 'undefined') {
  (globalThis as any).MediaRecorder = class MediaRecorder extends EventTarget {
    static isTypeSupported() { return false; }
    state = 'inactive';
    constructor() { super(); }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; }
    pause() { this.state = 'paused'; }
    resume() { this.state = 'recording'; }
  };
}

// jsdom doesn't implement window.matchMedia — stub it.
if (typeof window !== 'undefined' && typeof window.matchMedia === 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// jsdom doesn't include indexedDB — stub it so hooks don't throw.
if (typeof indexedDB === 'undefined') {
  (globalThis as any).indexedDB = {
    open: () => {
      const req: any = { result: null, error: null };
      req.onerror = null;
      req.onsuccess = null;
      req.onupgradeneeded = null;
      setTimeout(() => { req.onerror?.(new Event('error')); }, 0);
      return req;
    },
  };
}
