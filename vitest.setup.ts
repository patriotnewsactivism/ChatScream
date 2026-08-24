import '@testing-library/jest-dom/vitest';
// jsdom ships no IndexedDB, so the local-recording chunk store throws on mount
// and takes the whole Studio tree down with it. fake-indexeddb is a real
// in-memory implementation, so recording code under test behaves normally.
import 'fake-indexeddb/auto';

// jsdom does not implement matchMedia — polyfill it so components that query
// media features (PWA install detection, responsive hooks, etc.) don't crash.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}
