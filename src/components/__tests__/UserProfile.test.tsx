import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import UserProfile from '../UserProfile';
import { AuthContext } from '../../contexts/AuthContext';

vi.mock('../../services/apiClient', () => ({
  fetchViewingHistory: vi.fn(),
  updatePreferences: vi.fn(),
}));

import { fetchViewingHistory, updatePreferences } from '../../services/apiClient';

describe('UserProfile', () => {
  const mockUser = { id: 'user1', name: 'Test User' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('displays viewing history and allows preference editing', async () => {
    fetchViewingHistory.mockResolvedValueOnce([
      { streamId: 's1', title: 'Stream 1', watchedAt: '2023-01-01T10:00:00Z' },
      { streamId: 's2', title: 'Stream 2', watchedAt: '2023-01-02T12:00:00Z' },
    ]);

    render(
      <AuthContext.Provider value={{ user: mockUser, isAuthenticated: true }}>
        <UserProfile />
      </AuthContext.Provider>
    );

    await waitFor(() => {
      expect(screen.getByText(/stream 1/i)).toBeInTheDocument();
      expect(screen.getByText(/stream 2/i)).toBeInTheDocument();
    });

    const editButton = screen.getByRole('button', { name: /edit preferences/i });
    fireEvent.click(editButton);

    const input = screen.getByLabelText(/genres/i);
    fireEvent.change(input, { target: { value: 'gaming, music' } });

    const saveButton = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(updatePreferences).toHaveBeenCalledWith(mockUser.id, { genres: ['gaming', 'music'] });
    });
  });

  it('shows message when viewing history is empty', async () => {
    fetchViewingHistory.mockResolvedValueOnce([]);

    render(
      <AuthContext.Provider value={{ user: mockUser, isAuthenticated: true }}>
        <UserProfile />
      </AuthContext.Provider>
    );

    await waitFor(() => {
      expect(screen.getByText(/no viewing history yet/i)).toBeInTheDocument();
    });
  });
});