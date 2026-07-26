import { renderHook, act } from '@testing-library/react-hooks';
import { useTTS } from '../useTTS';
import { mockSpeechSynthesis } from 'mock-speech-synthesis';

jest.mock('mock-speech-synthesis');

describe('useTTS', () => {
  beforeEach(() => {
    mockSpeechSynthesis.mockImplementation(() => {
      return {
        speak: jest.fn(),
        cancel: jest.fn(),
        paused: false,
        speaking: false,
        pending: false,
      };
    });
  });

  it('should initialize with default state', () => {
    const { result } = renderHook(() => useTTS());
    expect(result.current.isSpeaking).toBe(false);
    expect(result.current.isPaused).toBe(false);
  });

  it('should start speaking', () => {
    const { result } = renderHook(() => useTTS());
    act(() => {
      result.current.speak('Hello World');
    });
    expect(mockSpeechSynthesis.speak).toHaveBeenCalledWith('Hello World');
    expect(result.current.isSpeaking).toBe(true);
  });

  it('should pause and resume speaking', () => {
    const { result } = renderHook(() => useTTS());
    act(() => {
      result.current.speak('Hello World');
    });
    act(() => {
      result.current.pause();
    });
    expect(mockSpeechSynthesis.cancel).toHaveBeenCalled();
    expect(result.current.isPaused).toBe(true);
    act(() => {
      result.current.resume();
    });
    expect(mockSpeechSynthesis.speak).toHaveBeenCalledWith('Hello World');
    expect(result.current.isPaused).toBe(false);
  });

  it('should handle long messages by pausing and resuming', () => {
    const { result } = renderHook(() => useTTS());
    act(() => {
      result.current.speak('This is a very long message that should be paused and resumed');
    });
    act(() => {
      result.current.pause();
    });
    expect(mockSpeechSynthesis.cancel).toHaveBeenCalled();
    expect(result.current.isPaused).toBe(true);
    act(() => {
      result.current.resume();
    });
    expect(mockSpeechSynthesis.speak).toHaveBeenCalledWith('This is a very long message that should be paused and resumed');
    expect(result.current.isPaused).toBe(false);
  });
});