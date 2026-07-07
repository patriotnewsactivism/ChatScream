import { describe, expect, it, vi } from 'vitest';
import { backendConfigError, onAuthChange } from '../backend';

describe('backend configuration fallback', () => {
  it('does not force client-side backend env vars', () => {
    expect(backendConfigError).toBeNull();
  });

  it('returns a safe auth listener even without an active session', async () => {
    const callback = vi.fn();
    const unsubscribe = onAuthChange(callback);

    // Initial callback fires on a deferred microtask so React can mount first.
    await Promise.resolve();

    expect(callback).toHaveBeenCalled();
    expect(typeof unsubscribe).toBe('function');
    unsubscribe();
  });
});
