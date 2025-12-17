import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import AuthStatusBanner from '../AuthStatusBanner';
import { useAuth } from '../../contexts/AuthContext';

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

const mockUseAuth = useAuth as unknown as ReturnType<typeof vi.fn>;

describe('AuthStatusBanner', () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
  });

  it('renders nothing when there is no auth error', () => {
    mockUseAuth.mockReturnValue({ error: null, configError: null, clearError: vi.fn() });

    const { container } = render(<AuthStatusBanner />);

    expect(container.firstChild).toBeNull();
  });

  it('shows config error without dismiss control', () => {
    mockUseAuth.mockReturnValue({ error: null, configError: 'Missing Firebase config', clearError: vi.fn() });

    render(<AuthStatusBanner />);

    expect(screen.getByText('Missing Firebase config')).toBeInTheDocument();
    expect(screen.queryByText(/Dismiss/i)).not.toBeInTheDocument();
  });

  it('allows dismissing non-critical errors', () => {
    const clearError = vi.fn();
    mockUseAuth.mockReturnValue({ error: 'Network error', configError: null, clearError });

    render(<AuthStatusBanner />);

    expect(screen.getByText('Network error')).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Dismiss/i));

    expect(clearError).toHaveBeenCalled();
  });
});
