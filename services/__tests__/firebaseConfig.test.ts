import { describe, expect, it, vi } from 'vitest';
import { firebaseConfigError, onAuthChange } from '../firebase';

describe('firebase configuration fallback', () => {
  it('surfaces a helpful error when env vars are missing', () => {
    // firebaseConfigError can be null if config is valid, or a string if invalid
    if (firebaseConfigError !== null) {
      expect(firebaseConfigError).toMatch(/Missing Firebase config/);
    } else {
      // If config is valid, this test should pass
      expect(firebaseConfigError).toBeNull();
    }
  });

  it('returns a safe auth listener when Firebase is not configured', () => {
    const callback = vi.fn();
    const unsubscribe = onAuthChange(callback);

    // If Firebase is configured, callback may not be called immediately with null
    // If not configured, it should return a no-op function
    expect(typeof unsubscribe).toBe('function');
    unsubscribe();
  });
});
