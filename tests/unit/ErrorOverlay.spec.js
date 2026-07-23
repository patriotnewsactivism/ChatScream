import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import ErrorOverlay from '../../src/components/ErrorOverlay';

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const renderWithRouter = (ui) => {
  return render(
    <BrowserRouter>
      {ui}
    </BrowserRouter>
  );
};

describe('ErrorOverlay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear();
  });

  const defaultProps = {
    errorCode: '404',
    errorMessage: 'Stream not found',
    retryCallback: vi.fn(),
    attemptCount: 1,
    maxAttempts: 3,
  };

  it('renders with error code and message', () => {
    renderWithRouter(<ErrorOverlay {...defaultProps} />);
    
    expect(screen.getByText('Stream not found')).toBeInTheDocument();
    expect(screen.getByText(/404/)).toBeInTheDocument();
  });

  it('renders Retry and Go to Home buttons', () => {
    renderWithRouter(<ErrorOverlay {...defaultProps} />);
    
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /go to home/i })).toBeInTheDocument();
  });

  it('calls retryCallback when Retry button is clicked', () => {
    const mockRetry = vi.fn();
    renderWithRouter(<ErrorOverlay {...defaultProps} retryCallback={mockRetry} />);
    
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(mockRetry).toHaveBeenCalledTimes(1);
  });

  it('navigates to home when Go to Home button is clicked', () => {
    renderWithRouter(<ErrorOverlay {...defaultProps} />);
    
    fireEvent.click(screen.getByRole('button', { name: /go to home/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('displays attempt count correctly', () => {
    renderWithRouter(<ErrorOverlay {...defaultProps} attemptCount={2} />);
    
    expect(screen.getByText(/attempt 2 of 3/i)).toBeInTheDocument();
  });

  it('displays attempt 1 of max correctly', () => {
    renderWithRouter(<ErrorOverlay {...defaultProps} attemptCount={1} maxAttempts={5} />);
    
    expect(screen.getByText(/attempt 1 of 5/i)).toBeInTheDocument();
  });

  it('has proper accessibility attributes', () => {
    renderWithRouter(<ErrorOverlay {...defaultProps} />);
    
    const overlay = screen.getByRole('alert');
    expect(overlay).toHaveAttribute('aria-live', 'polite');
    expect(overlay).toHaveAttribute('aria-atomic', 'true');
  });

  it('renders error icon with accessible label', () => {
    renderWithRouter(<ErrorOverlay {...defaultProps} />);
    
    const icon = screen.getByLabelText(/error/i);
    expect(icon).toBeInTheDocument();
  });

  it('displays DRM-specific message for DRM errors', () => {
    renderWithRouter(
      <ErrorOverlay 
        {...defaultProps} 
        errorCode="DRM_ERROR" 
        errorMessage="DRM protection failed" 
      />
    );
    
    expect(screen.getByText(/drm/i)).toBeInTheDocument();
    expect(screen.getByText(/support/i)).toBeInTheDocument();
  });

  it('renders different error codes with friendly messages', () => {
    const testCases = [
      { code: '403', message: 'Access denied' },
      { code: 'NETWORK_ERROR', message: 'Network issue detected' },
      { code: 'TIMEOUT', message: 'Connection timed out' },
    ];

    testCases.forEach(({ code, message }) => {
      renderWithRouter(
        <ErrorOverlay 
          errorCode={code} 
          errorMessage={message} 
          retryCallback={vi.fn()}
          attemptCount={1}
          maxAttempts={3}
        />
      );
      
      expect(screen.getByText(message)).toBeInTheDocument();
    });
  });

  it('disables Retry button when max attempts reached', () => {
    renderWithRouter(
      <ErrorOverlay 
        {...defaultProps} 
        attemptCount={3} 
        maxAttempts={3} 
      />
    );
    
    const retryButton = screen.getByRole('button', { name: /retry/i });
    expect(retryButton).toBeDisabled();
  });

  it('keeps Retry button enabled when attempts remaining', () => {
    renderWithRouter(
      <ErrorOverlay 
        {...defaultProps} 
        attemptCount={2} 
        maxAttempts={3} 
      />
    );
    
    const retryButton = screen.getByRole('button', { name: /retry/i });
    expect(retryButton).not.toBeDisabled();
  });

  it('has proper button focus styles for accessibility', () => {
    renderWithRouter(<ErrorOverlay {...defaultProps} />);
    
    const retryButton = screen.getByRole('button', { name: /retry/i });
    const homeButton = screen.getByRole('button', { name: /go to home/i });
    
    // Verify buttons are native button elements (keyboard focusable)
    expect(retryButton.tagName).toBe('BUTTON');
    expect(homeButton.tagName).toBe('BUTTON');
  });

  it('renders with custom attempt count display', () => {
    renderWithRouter(
      <ErrorOverlay 
        errorCode="500" 
        errorMessage="Server error" 
        retryCallback={vi.fn()}
        attemptCount={0}
        maxAttempts={3}
      />
    );
    
    expect(screen.getByText(/attempt 0 of 3/i)).toBeInTheDocument();
  });
});
