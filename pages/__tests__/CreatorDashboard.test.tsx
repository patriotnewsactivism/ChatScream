import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CreatorDashboard from '../CreatorDashboard';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    userProfile: {
      subscription: { plan: 'pro' },
    },
  }),
}));

describe('CreatorDashboard', () => {
  it('shows plan cloud hours and quick actions', () => {
    render(
      <MemoryRouter>
        <CreatorDashboard />
      </MemoryRouter>
    );

    expect(screen.getByText('Creator control center')).toBeInTheDocument();
    expect(screen.getByText(/Cloud VM hours/i)).toBeInTheDocument();
    expect(screen.getByText('10 hrs')).toBeInTheDocument();
    expect(screen.getByText(/One-click destinations/i)).toBeInTheDocument();
  });
});
