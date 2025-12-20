import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';
import React from 'react';
import { useMobileLayout } from '../useMobileLayout';

const Harness: React.FC<{ onReady: (value: ReturnType<typeof useMobileLayout>) => void }> = ({
  onReady,
}) => {
  const state = useMobileLayout();
  onReady(state);
  return null;
};

describe('useMobileLayout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 800 });
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: 600,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('updates landscape state on resize', () => {
    let latest: ReturnType<typeof useMobileLayout> | null = null;
    render(<Harness onReady={(value) => (latest = value)} />);

    expect(latest?.isLandscape).toBe(true);

    act(() => {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 500 });
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });
      window.dispatchEvent(new Event('resize'));
    });

    expect(latest?.isLandscape).toBe(false);
  });

  it('clears mobile tips after timeout', () => {
    let latest: ReturnType<typeof useMobileLayout> | null = null;
    render(<Harness onReady={(value) => (latest = value)} />);

    act(() => {
      latest?.setMobileTip('hello');
    });

    expect(latest?.mobileTip).toBe('hello');

    act(() => {
      vi.advanceTimersByTime(6500);
    });

    expect(latest?.mobileTip).toBeNull();
  });
});
