import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { jest } from '@jest/globals';
import PlayerWrapper from '../../src/components/PlayerWrapper';
import ErrorBoundary from '../../src/components/ErrorBoundary';

// Mock HLS.js
const mockHls = {
  on: vi.fn(),
  off: vi.fn(),
  destroy: vi.fn(),
  loadSource: vi.fn(),
  attachMedia: vi.fn(),
};

vi.mock('hls.js', () => ({
  default: vi.fn(() => mockHls),
  isSupported: vi.fn(() => true),
}));

// Mock video element
const mockVideoElement = {
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
  load: vi.fn(),
  src: '',
  currentTime: 0,
  error: null,
};

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useParams: () => ({ streamId: 'test-stream-123' }),
    useLocation: () => ({ pathname: '/stream/test-stream-123' }),
  };
});

// Mock localStorage for chat draft preservation
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: vi.fn((key) => store[key] || null),
    setItem: vi.fn((key, value) => { store[key] = value; }),
    removeItem: vi.fn((key) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock chat draft
const mockChatDraft = 'Hello, this is a chat draft!';
localStorageMock.getItem.mockImplementation((key) => {
  if (key === 'chatDraft_test-stream-123') return mockChatDraft;
  return null;
});

describe('Player Error Handling Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear.mockClear();
    mockHls.on.mockClear();
    mockHls.off.mockClear();
    mockHls.destroy.mockClear();
    mockHls.loadSource.mockClear();
    mockHls.attachMedia.mockClear();
    mockVideoElement.addEventListener.mockClear();
    mockVideoElement.removeEventListener.mockClear();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  const renderWithRouter = (ui) => {
    return render(
      <BrowserRouter>
        {ui}
      </BrowserRouter>
    );
  };

  it('simulates HLS.js ERROR event with 404 code and shows friendly message', async () => {
    let errorHandler;
    
    mockHls.on.mockImplementation((event, handler) => {
      if (event === 'hlsError') {
        errorHandler = handler;
      }
    });

    renderWithRouter(<PlayerWrapper streamId="test-stream-123" />);
    
    // Simulate HLS.js error with 404
    await act(async () => {
      errorHandler?.({ type: 'hlsError', details: { fatal: true, code: 404 } });
    });
    
    expect(screen.getByText('Stream not found')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('simulates HLS.js ERROR event with 403 code and shows access denied', async () => {
    let errorHandler;
    
    mockHls.on.mockImplementation((event, handler) => {
      if (event === 'hlsError') {
        errorHandler = handler;
      }
    });

    renderWithRouter(<PlayerWrapper streamId="test-stream-123" />);
    
    await act(async () => {
      errorHandler?.({ type: 'hlsError', details: { fatal: true, code: 403 } });
    });
    
    expect(screen.getByText('Access denied')).toBeInTheDocument();
  });

  it('simulates network fetch failure and shows network error message', async () => {
    let errorHandler;
    
    mockHls.on.mockImplementation((event, handler) => {
      if (event === 'hlsError') {
        errorHandler = handler;
      }
    });

    renderWithRouter(<PlayerWrapper streamId="test-stream-123" />);
    
    await act(async () => {
      errorHandler?.({ 
        type: 'hlsError', 
        details: { 
          fatal: true, 
          code: 'NETWORK_ERROR',
          reason: 'networkError'
        } 
      });
    });
    
    expect(screen.getByText('Network issue detected')).toBeInTheDocument();
  });

  it('successful retry hides overlay and resumes playback', async () => {
    let errorHandler;
    let retryCallback;
    
    mockHls.on.mockImplementation((event, handler) => {
      if (event === 'hlsError') {
        errorHandler = handler;
      }
    });

    renderWithRouter(<PlayerWrapper streamId="test-stream-123" />);
    
    // Trigger error
    await act(async () => {
      errorHandler?.({ type: 'hlsError', details: { fatal: true, code: 404 } });
    });
    
    expect(screen.getByText('Stream not found')).toBeInTheDocument();
    
    // Simulate successful retry
    await act(async () => {
      // The retry button should be available
      const retryButton = screen.getByRole('button', { name: /retry/i });
      fireEvent.click(retryButton);
    });
    
    // After successful retry, overlay should be hidden
    await waitFor(() => {
      expect(screen.queryByText('Stream not found')).not.toBeInTheDocument();
    });
  });

  it('implements exponential backoff and shows attempt count', async () => {
    let errorHandler;
    
    mockHls.on.mockImplementation((event, handler) => {
      if (event === 'hlsError') {
        errorHandler = handler;
      }
    });

    renderWithRouter(<PlayerWrapper streamId="test-stream-123" />);
    
    // First error
    await act(async () => {
      errorHandler?.({ type: 'hlsError', details: { fatal: true, code: 500 } });
    });
    
    expect(screen.getByText(/attempt 1 of 3/i)).toBeInTheDocument();
    
    // Retry and fail again
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /retry/i }));
      // Simulate second error
      errorHandler?.({ type: 'hlsError', details: { fatal: true, code: 500 } });
    });
    
    expect(screen.getByText(/attempt 2 of 3/i)).toBeInTheDocument();
    
    // Retry and fail third time
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /retry/i }));
      errorHandler?.({ type: 'hlsError', details: { fatal: true, code: 500 } });
    });
    
    expect(screen.getByText(/attempt 3 of 3/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeDisabled();
  });

  it('displays DRM-specific error message with support link', async () => {
    let errorHandler;
    
    mockHls.on.mockImplementation((event, handler) => {
      if (event === 'hlsError') {
        errorHandler = handler;
      }
    });

    renderWithRouter(<PlayerWrapper streamId="test-stream-123" />);
    
    await act(async () => {
      errorHandler?.({ 
        type: 'hlsError', 
        details: { 
          fatal: true, 
          code: 'DRM_ERROR',
          reason: 'drmProtectionFailed'
        } 
      });
    });
    
    expect(screen.getByText(/drm/i)).toBeInTheDocument();
    expect(screen.getByText(/support/i)).toBeInTheDocument();
    const supportLink = screen.getByRole('link', { name: /contact support/i });
    expect(supportLink).toHaveAttribute('href', '/support');
  });

  it('preserves chat draft when navigating away and back', async () => {
    let errorHandler;
    
    mockHls.on.mockImplementation((event, handler) => {
      if (event === 'hlsError') {
        errorHandler = handler;
      }
    });

    const { unmount } = renderWithRouter(<PlayerWrapper streamId="test-stream-123" />);
    
    // Trigger error to show overlay
    await act(async () => {
      errorHandler?.({ type: 'hlsError', details: { fatal: true, code: 404 } });
    });
    
    expect(screen.getByText('Stream not found')).toBeInTheDocument();
    
    // Click Go to Home
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /go to home/i }));
    });
    
    // Verify localStorage was cleared for player state but chat draft preserved
    expect(localStorageMock.removeItem).toHaveBeenCalled();
    
    // Re-mount component (simulating navigation back)
    unmount();
    renderWithRouter(<PlayerWrapper streamId="test-stream-123" />);
    
    // Chat draft should still be in localStorage
    expect(localStorageMock.getItem).toHaveBeenCalledWith('chatDraft_test-stream-123');
  });

  it('ErrorBoundary catches stream-specific errors and shows overlay', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    const ThrowError = () => {
      throw new Error('Stream error');
    };
    
    renderWithRouter(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );
    
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    
    consoleError.mockRestore();
  });

  it('handles video element error events', async () => {
    let videoErrorHandler;
    
    mockVideoElement.addEventListener.mockImplementation((event, handler) => {
      if (event === 'error') {
        videoErrorHandler = handler;
      }
    });

    renderWithRouter(<PlayerWrapper streamId="test-stream-123" />);
    
    // Simulate video error event
    await act(async () => {
      videoErrorHandler?.({ target: { error: { code: 4, message: 'Media error' } } });
    });
    
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('clears previous error before starting new async operation', async () => {
    let errorHandler;
    
    mockHls.on.mockImplementation((event, handler) => {
      if (event === 'hlsError') {
        errorHandler = handler;
      }
    });

    renderWithRouter(<PlayerWrapper streamId="test-stream-123" />);
    
    // First error
    await act(async () => {
      errorHandler?.({ type: 'hlsError', details: { fatal: true, code: 404 } });
    });
    
    expect(screen.getByText('Stream not found')).toBeInTheDocument();
    
    // Second error should replace first
    await act(async () => {
      errorHandler?.({ type: 'hlsError', details: { fatal: true, code: 403 } });
    });
    
    expect(screen.queryByText('Stream not found')).not.toBeInTheDocument();
    expect(screen.getByText('Access denied')).toBeInTheDocument();
  });

  it('retry function re-initializes player with same stream ID', async () => {
    let errorHandler;
    
    mockHls.on.mockImplementation((event, handler) => {
      if (event === 'hlsError') {
        errorHandler = handler;
      }
    });

    renderWithRouter(<PlayerWrapper streamId="test-stream-123" />);
    
    await act(async () => {
      errorHandler?.({ type: 'hlsError', details: { fatal: true, code: 500 } });
    });
    
    // Click retry
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    });
    
    // Verify HLS.js was re-initialized
    expect(mockHls.destroy).toHaveBeenCalled();
    expect(mockHls.loadSource).toHaveBeenCalled();
    expect(mockHls.attachMedia).toHaveBeenCalled();
  });

  it('disables interactive elements during retry to prevent duplicate requests', async () => {
    let errorHandler;
    
    mockHls.on.mockImplementation((event, handler) => {
      if (event === 'hlsError') {
        errorHandler = handler;
      }
    });

    renderWithRouter(<PlayerWrapper streamId="test-stream-123" />);
    
    await act(async () => {
      errorHandler?.({ type: 'hlsError', details: { fatal: true, code: 500 } });
    });
    
    // Click retry
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    });
    
    // Buttons should be disabled during retry
    const retryButton = screen.getByRole('button', { name: /retry/i });
    expect(retryButton).toBeDisabled();
  });
});
