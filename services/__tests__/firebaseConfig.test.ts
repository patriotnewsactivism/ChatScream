import { describe, expect, it, vi } from 'vitest';
import { firebaseConfigError, onAuthChange } from '../firebase';

describe('firebase configuration fallback', () => {
  it('surfaces a helpful error when env vars are missing', () => {
    expect(firebaseConfigError).toMatch(/Missing Firebase config/);
  });

  it('returns a safe auth listener when Firebase is not configured', () => {
    const callback = vi.fn();
    const unsubscribe = onAuthChange(callback);

    expect(callback).toHaveBeenCalledWith(null);
    expect(typeof unsubscribe).toBe('function');
    unsubscribe();
  });
});
