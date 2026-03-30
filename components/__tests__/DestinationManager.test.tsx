import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DestinationManager from '../DestinationManager';
import * as oauthService from '../../services/oauthService';
import * as backendService from '../../services/backend';

vi.mock('../../services/oauthService', () => ({
  initiateOAuth: vi.fn(),
  getChannels: vi.fn(),
  getStreamKey: vi.fn(),
}));

vi.mock('../../services/backend', () => ({
  getBackendCapabilities: vi.fn(),
}));

describe('DestinationManager quick connect', () => {
  beforeEach(() => {
    vi.mocked(backendService.getBackendCapabilities).mockResolvedValue({
      authProviders: { google: true },
      streamKeyPlatforms: { youtube: true, facebook: true, twitch: true },
    });
  });

  it('starts YouTube OAuth connect flow', async () => {
    const onAddDestination = vi.fn();
    render(
      <DestinationManager
        destinations={[]}
        onAddDestination={onAddDestination}
        onRemoveDestination={() => {}}
        onToggleDestination={() => {}}
        isStreaming={false}
        userId="user-123"
      />,
    );

    await screen.findByRole('button', { name: /Connect YouTube/i });
    const youtubeButton = screen.getByRole('button', { name: /Connect YouTube/i });
    fireEvent.click(youtubeButton);

    expect(vi.mocked(oauthService.initiateOAuth)).toHaveBeenCalledWith('youtube', 'user-123');
    expect(onAddDestination).not.toHaveBeenCalled();
  });

  it('disables quick connect while streaming', async () => {
    const onAddDestination = vi.fn();
    render(
      <DestinationManager
        destinations={[]}
        onAddDestination={onAddDestination}
        onRemoveDestination={() => {}}
        onToggleDestination={() => {}}
        isStreaming
      />,
    );

    const youtubeButton = await screen.findByRole('button', { name: /YouTube/i });
    expect(youtubeButton).toBeDisabled();
  });

  it('hides unsupported quick connect providers from UI', async () => {
    vi.mocked(backendService.getBackendCapabilities).mockResolvedValue({
      authProviders: { google: true },
      streamKeyPlatforms: { youtube: false, facebook: true, twitch: false },
    });

    render(
      <DestinationManager
        destinations={[]}
        onAddDestination={() => {}}
        onRemoveDestination={() => {}}
        onToggleDestination={() => {}}
        isStreaming={false}
        userId="user-123"
      />,
    );

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Connect YouTube/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Connect Twitch/i })).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /Connect Facebook/i })).toBeInTheDocument();
  });
});
