import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AuthPage from '../AuthPage';
import * as backendService from '../../services/backend';

const signInGoogleMock = vi.fn();

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signInGoogle: signInGoogleMock,
    sendResetEmail: vi.fn(),
    loading: false,
    error: null,
    clearError: vi.fn(),
  }),
}));

vi.mock('../../services/backend', async () => {
  const actual = await vi.importActual<typeof import('../../services/backend')>(
    '../../services/backend',
  );
  return {
    ...actual,
    getAffiliateByCode: vi.fn(),
    getBackendCapabilities: vi.fn(),
  };
});

describe('AuthPage capability signaling', () => {
  it('disables Google sign-in when backend capabilities report it as unsupported', async () => {
    vi.mocked(backendService.getBackendCapabilities).mockResolvedValue({
      authProviders: { google: false },
      streamKeyPlatforms: { youtube: true, facebook: true, twitch: true },
    });

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<AuthPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const googleButton = await screen.findByRole('button', { name: /Google/i });

    await waitFor(() => {
      expect(googleButton).toBeDisabled();
    });

    fireEvent.click(googleButton);
    expect(signInGoogleMock).not.toHaveBeenCalled();
    expect(screen.getByText(/Google sign-in is currently unavailable/i)).toBeInTheDocument();
  });
});
