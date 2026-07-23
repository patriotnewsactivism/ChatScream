import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import StreamDiscovery from '../StreamDiscovery';
import { AuthContext } from '../../contexts/AuthContext';

vi.mock('../../services/apiClient', () => ({
  fetchRecommendedStreams: vi.fn(),
}));

import { fetchRecommendedStreams } from '../../services/apiClient';

describe('StreamDiscovery', () => {
  const mockUser = { id: 'user1', name: 'Test User' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders tabs and shows recommended tab when data available', async () => {
    fetchRecommendedStreams.mockResolvedValueOnce([
      { streamId: 's1', title: 'Stream 1' },
      { streamId: 's2', title: 'Stream 2' },
    ]);

    render(
      <AuthContext.Provider value={{ user: mockUser, isAuthenticated: true }}>
        <StreamDiscovery />
      </AuthContext.Provider>
    );

    const recommendedTab = screen.getByRole('tab', { name: /recommended/i });
    expect(recommendedTab).toBeInTheDocument();

    fireEvent.click(recommendedTab);

    await waitFor(() => {
      expect(screen.getByText(/stream 1/i)).toBeInTheDocument();
      expect(screen.getByText(/stream 2/i)).toBeInTheDocument();
    });
  });

  it('shows loading spinner while fetching recommendations', async () => {
    let resolvePromise;
    const promise = new Promise(resolve => { resolvePromise = resolve; });
    fetchRecommendedStreams.mockReturnValueOnce(promise);

    render(
      <AuthContext.Provider value={{ user: mockUser, isAuthenticated: true }}>
        <StreamDiscovery />
      </AuthContext.Provider>
    );

    const recommendedTab = screen.getByRole('tab', { name: /recommended/i });
    fireEvent.click(recommendedTab);

    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();

    resolvePromise([]);
    await waitFor(() => {
      expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    });
  });

  it('handles error state gracefully', async () => {
    fetchRecommendedStreams.mockRejectedValueOnce(new Error('Network error'));

    render(
      <AuthContext.Provider value={{ user: mockUser, isAuthenticated: true }}>
        <StreamDiscovery />
      </AuthContext.Provider>
    );

    const recommendedTab = screen.getByRole('tab', { name: /recommended/i });
    fireEvent.click(recommendedTab);

    await waitFor(() => {
      expect(screen.getByText(/failed to load recommendations/i)).toBeInTheDocument();
    });
  });
});