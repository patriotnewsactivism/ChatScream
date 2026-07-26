import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react-hooks';
import { useCaptionSignService } from '../captionSignService';
import { getCaptionStream } from '../../api/captionStream';
import { signlangAvatar } from 'signlang-avatar';

vi.mock('../../api/captionStream');
vi.mock('signlang-avatar');

const mockCaptionStream = {
  subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
  unsubscribe: vi.fn()
};

getCaptionStream.mockImplementation(() => mockCaptionStream);

signlangAvatar.sign.mockImplementation(() => Promise.resolve());

describe('captionSignService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('subscribes to caption stream when enabled', () => {
    const { result } = renderHook(() => useCaptionSignService(true));
    expect(getCaptionStream).toHaveBeenCalledTimes(1);
    expect(mockCaptionStream.subscribe).toHaveBeenCalledTimes(1);
  });

  it('does not subscribe when disabled', () => {
    renderHook(() => useCaptionSignService(false));
    expect(getCaptionStream).not.toHaveBeenCalled();
    expect(mockCaptionStream.subscribe).not.toHaveBeenCalled();
  });

  it('calls avatar.sign with correct text', () => {
    const mockCaption = { text: 'Hello world' };
    const { result } = renderHook(() => useCaptionSignService(true));
    const subscriptionCallback = mockCaptionStream.subscribe.mock.calls[0][0];
    act(() => subscriptionCallback(mockCaption));
    expect(signlangAvatar.sign).toHaveBeenCalledWith('Hello world');
  });

  it('handles multiple caption segments', () => {
    const mockCaptions = [
      { text: 'First segment' },
      { text: 'Second segment' }
    ];
    const { result } = renderHook(() => useCaptionSignService(true));
    const subscriptionCallback = mockCaptionStream.subscribe.mock.calls[0][0];
    mockCaptions.forEach(caption => {
      act(() => subscriptionCallback(caption));
    });
    expect(signlangAvatar.sign).toHaveBeenCalledTimes(mockCaptions.length);
    expect(signlangAvatar.sign).toHaveBeenNthCalledWith(1, 'First segment');
    expect(signlangAvatar.sign).toHaveBeenNthCalledWith(2, 'Second segment');
  });

  it('unsubscribes on cleanup', () => {
    const { unmount } = renderHook(() => useCaptionSignService(true));
    unmount();
    expect(mockCaptionStream.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('disables avatar when bandwidth is low', () => {
    const { result } = renderHook(() => useCaptionSignService(true, 512 * 1024)); // 512 kbps
    expect(signlangAvatar.sign).not.toHaveBeenCalled();
  });
});