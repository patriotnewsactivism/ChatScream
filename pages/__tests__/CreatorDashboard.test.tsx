import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CreatorDashboard from '../CreatorDashboard';

const mockNavigate = vi.fn();
const mockFetch = vi.fn().mockResolvedValue({ status: 200 } as Response);

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { email: 'tester@example.com' },
    userProfile: {
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
  }),
}));

describe('CreatorDashboard', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
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
    expect(screen.getByText(/One-click destinations/i)).toBeInTheDocument();
  });
});
