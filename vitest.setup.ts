import '@testing-library/jest-dom/vitest';

// jsdom does not implement matchMedia â polyfill it so components that query
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
