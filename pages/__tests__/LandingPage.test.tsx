import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LandingPage from '../LandingPage';

const mockNavigate = vi.fn();
const mockUseAuth = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

describe('LandingPage admin access controls', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({
      user: { email: 'viewer@example.com', uid: 'viewer-1' },
      userProfile: {
        role: 'user',
      },
      logout: vi.fn(),
      loading: false,
      error: null,
      configError: null,
      clearError: vi.fn(),
      sessionToken: null,
      refreshProfile: vi.fn(),
      refreshSession: vi.fn(),
      isAuthenticated: true,
    });
  });

  it('shows the admin button for users with admin role claim', () => {
    mockUseAuth.mockReturnValue({
      user: { email: 'creator@example.com', uid: 'admin-1' },
      userProfile: {
        role: 'admin',
      },
      logout: vi.fn(),
      loading: false,
      error: null,
      configError: null,
      clearError: vi.fn(),
      sessionToken: null,
      refreshProfile: vi.fn(),
      refreshSession: vi.fn(),
      isAuthenticated: true,
    });

    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );

    // Navigation to the admin area is a link, not a button — assert it both
    // renders and actually points at /admin.
    const adminLink = screen.getByRole('link', { name: /admin/i });
    expect(adminLink).toBeInTheDocument();
    expect(adminLink).toHaveAttribute('href', '/admin');
  });

  it('does not show the admin button for legacy admin email without admin role', () => {
    mockUseAuth.mockReturnValue({
      user: { email: 'mreardon@wtpnews.org', uid: 'user-1' },
      userProfile: {
        role: 'user',
      },
      logout: vi.fn(),
      loading: false,
      error: null,
      configError: null,
      clearError: vi.fn(),
      sessionToken: null,
      refreshProfile: vi.fn(),
      refreshSession: vi.fn(),
      isAuthenticated: true,
    });

    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('button', { name: /admin/i })).not.toBeInTheDocument();
  });
});
