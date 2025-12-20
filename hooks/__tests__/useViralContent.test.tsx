import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, act, cleanup, waitFor } from '@testing-library/react';
import React from 'react';
import { useViralContent } from '../useViralContent';

vi.mock('../../services/claudeService', () => ({
  generateViralStreamPackage: vi.fn().mockResolvedValue({
    titles: ['a'],
    descriptions: ['b'],
    hashtags: [],
    tags: [],
  }),
}));

const Harness: React.FC<{
  onReady: (value: ReturnType<typeof useViralContent>) => void;
  token: string | null;
}> = ({ onReady, token }) => {
  const hook = useViralContent(token);
  onReady(hook);
  return null;
};

describe('useViralContent', () => {
  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    cleanup();
  });

  it('prevents generation without a token', async () => {
    let latest: ReturnType<typeof useViralContent> | null = null;
    render(<Harness token={null} onReady={(value) => (latest = value)} />);

    await act(async () => {
      latest?.setStreamTopic('hello');
    });

    await act(async () => {
      await latest?.handleGenerate();
    });

    return waitFor(() => {
      expect(latest?.error ?? '').toContain('sign in');
    });
  });

  it('generates content when authorized', async () => {
    let latest: ReturnType<typeof useViralContent> | null = null;
    render(<Harness token="token" onReady={(value) => (latest = value)} />);

    await act(async () => {
      latest?.setStreamTopic('hello world');
    });

    await act(async () => {
      await latest?.handleGenerate();
    });

    await waitFor(() => {
      expect(latest?.viralPackage?.titles[0]).toBe('a');
      expect(latest?.error).toBeNull();
    });
  });
});
