import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CreatorDashboard from '../CreatorDashboard';

const mockNavigate = vi.fn();
const mockFetch = vi.fn().mockResolvedValue({ status: 200 } as Response);
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

describe('CreatorDashboard', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockUseAuth.mockReturnValue({
      user: { email: 'tester@example.com' },
      userProfile: {
        role: 'user',
        subscription: { plan: 'pro' },
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

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows plan cloud hours and quick actions', async () => {
    render(
      <MemoryRouter>
        <CreatorDashboard />
      </MemoryRouter>,
    );

    await screen.findByText('Auth Session');
    expect(screen.getByText('Creator control center')).toBeInTheDocument();
    expect(screen.getByText(/Cloud VM hours/i)).toBeInTheDocument();
    expect(screen.getByText('10 hrs')).toBeInTheDocument();
    expect(screen.getByText('Destinations')).toBeInTheDocument();
  });

  it('shows admin portal action when role claim is admin', async () => {
    mockUseAuth.mockReturnValue({
      user: { email: 'viewer@example.com' },
      userProfile: {
        role: 'admin',
        subscription: { plan: 'pro' },
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
        <CreatorDashboard />
      </MemoryRouter>,
    );

    await screen.findByText('Auth Session');
    expect(screen.getByRole('button', { name: /admin portal/i })).toBeInTheDocument();
  });

  it('hides admin portal action when email matches legacy admin but role is not admin', async () => {
    mockUseAuth.mockReturnValue({
      user: { email: 'mreardon@wtpnews.org' },
      userProfile: {
        role: 'user',
        subscription: { plan: 'pro' },
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
        <CreatorDashboard />
      </MemoryRouter>,
    );

    await screen.findByText('Auth Session');
    expect(screen.queryByRole('button', { name: /admin portal/i })).not.toBeInTheDocument();
  });
});
