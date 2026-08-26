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

  it('routes Facebook destination actions through OAuth instead of adding a placeholder key', async () => {
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

    const addFacebookButton = await screen.findByRole('button', {
      name: /Add Facebook destination/i,
    });
    fireEvent.click(addFacebookButton);

    expect(vi.mocked(oauthService.initiateOAuth)).toHaveBeenCalledWith('facebook', 'user-123');
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

    // Two YouTube controls exist while streaming — the quick-connect button and
    // the manual "add destination" fallback. Both must be locked, so assert on
    // each by its accessible name rather than a substring that matches both.
    expect(await screen.findByRole('button', { name: /Connect YouTube/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Add YouTube destination/i })).toBeDisabled();
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

describe('destination connect that crosses a full-page redirect', () => {
  // On mobile, initiateOAuth navigates the current tab, so the postMessage
  // listener that normally advances from "account connected" to "pick a
  // channel" is destroyed with the page. Without a marker that outlives the
  // redirect the user lands back in Studio connected but with nothing to
  // stream to — which is exactly what production showed.
  const PENDING_KEY = 'chatscream_pending_destination_connect';

  const renderManager = (connectedPlatforms?: Record<string, unknown>) =>
    render(
      <DestinationManager
        destinations={[]}
        onAddDestination={() => {}}
        onRemoveDestination={() => {}}
        onToggleDestination={() => {}}
        isStreaming={false}
        userId="user-123"
        connectedPlatforms={connectedPlatforms as never}
      />,
    );

  beforeEach(() => {
    sessionStorage.clear();
    // Call history persists across tests otherwise, so a picker opened by an
    // earlier case would read as this one having opened it.
    vi.clearAllMocks();
    vi.mocked(backendService.getBackendCapabilities).mockResolvedValue({
      authProviders: { google: true },
      streamKeyPlatforms: { youtube: true, facebook: true, twitch: true },
    });
    vi.mocked(oauthService.getChannels).mockResolvedValue({ channels: [] });
  });

  it('records the pending connect before navigating away', async () => {
    renderManager();

    fireEvent.click(await screen.findByRole('button', { name: /Connect YouTube/i }));

    const stored = JSON.parse(sessionStorage.getItem(PENDING_KEY) || '{}');
    expect(stored.platform).toBe('youtube');
    expect(typeof stored.timestamp).toBe('number');
  });

  it('opens the channel picker on return, so a destination can be created', async () => {
    sessionStorage.setItem(
      PENDING_KEY,
      JSON.stringify({ platform: 'youtube', timestamp: Date.now() }),
    );

    renderManager({ youtube: { channelName: 'Test Channel' } });

    await waitFor(() => expect(vi.mocked(oauthService.getChannels)).toHaveBeenCalledWith('youtube'));
    // Consumed, so a later unrelated render cannot pop the picker again.
    expect(sessionStorage.getItem(PENDING_KEY)).toBeNull();
  });

  it('waits rather than discarding the marker while the profile is still loading', async () => {
    sessionStorage.setItem(
      PENDING_KEY,
      JSON.stringify({ platform: 'youtube', timestamp: Date.now() }),
    );

    // connectedPlatforms undefined = profile not loaded yet.
    renderManager(undefined);

    await screen.findByRole('button', { name: /Connect YouTube/i });
    expect(vi.mocked(oauthService.getChannels)).not.toHaveBeenCalled();
    // Still present, so the picker opens once the profile arrives.
    expect(sessionStorage.getItem(PENDING_KEY)).not.toBeNull();
  });

  it('ignores a marker older than its ten-minute window', async () => {
    sessionStorage.setItem(
      PENDING_KEY,
      JSON.stringify({ platform: 'youtube', timestamp: Date.now() - 11 * 60 * 1000 }),
    );

    renderManager({ youtube: { channelName: 'Test Channel' } });

    await screen.findByRole('button', { name: /Connect YouTube/i });
    expect(vi.mocked(oauthService.getChannels)).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(PENDING_KEY)).toBeNull();
  });

  it('does not open a picker for a connect that never completed', async () => {
    sessionStorage.setItem(
      PENDING_KEY,
      JSON.stringify({ platform: 'youtube', timestamp: Date.now() }),
    );

    // Marker present but the account is not connected — the connect failed.
    renderManager({});

    await screen.findByRole('button', { name: /Connect YouTube/i });
    expect(vi.mocked(oauthService.getChannels)).not.toHaveBeenCalled();
  });
});
