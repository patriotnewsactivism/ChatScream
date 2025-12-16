import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ProtectedRoute from '../ProtectedRoute';
import { useAuth } from '../../contexts/AuthContext';

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

const mockUseAuth = useAuth as unknown as vi.Mock;

describe('ProtectedRoute', () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
  });

  it('shows loader when session is still loading', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true, configError: null, error: null, clearError: vi.fn() });

    render(
      <MemoryRouter>
        <ProtectedRoute>
          <div>Secret</div>
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.getByText('Checking your session...')).toBeInTheDocument();
  });

  it('renders config error state', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false, configError: 'Missing Firebase config', error: null, clearError: vi.fn() });

    render(
      <MemoryRouter>
        <ProtectedRoute>
          <div>Secret</div>
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.getByText('Missing Firebase config')).toBeInTheDocument();
  });

  it('redirects to login when no user is present', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false, configError: null, error: null, clearError: vi.fn() });

    render(
      <MemoryRouter initialEntries={[{ pathname: '/private' }]} initialIndex={0}>
        <Routes>
          <Route
            path="/private"
            element={(
              <ProtectedRoute>
                <div>Secret</div>
              </ProtectedRoute>
            )}
          />
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });

  it('renders children when authenticated', () => {
    mockUseAuth.mockReturnValue({ user: { uid: '123' }, loading: false, configError: null, error: null, clearError: vi.fn() });

    render(
      <MemoryRouter>
        <ProtectedRoute>
          <div>Secret Content</div>
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.getByText('Secret Content')).toBeInTheDocument();
  });
});
