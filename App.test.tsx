import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { ApiRequestError, apiRequest, buildApiUrl } from './services/apiClient';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('./hooks/useMobileLayout', () => ({
  useMobileLayout: () => ({
    isLandscape: false,
    isCompactLandscape: false,
    mobileTip: null,
    setMobileTip: vi.fn(),
  }),
}));

vi.mock('./hooks/useAudioPipeline', () => ({
  useAudioPipeline: () => ({
    initAudio: vi.fn(),
    combinedStream: null,
    levels: { mic: 0, music: 0, video: 0 },
  }),
}));

vi.mock('./hooks/useAutoCaption', () => ({
  useAutoCaption: () => ({
    caption: '',
    isActive: false,
    isSupported: false,
    toggle: vi.fn(),
  }),
}));

vi.mock('./hooks/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: vi.fn(),
}));

vi.mock('./contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { uid: 'u_1', displayName: 'Streamer' },
    userProfile: null,
    sessionToken: 'token_123',
    logout: vi.fn(),
  }),
}));

vi.mock('./services/webrtcGuestService', () => ({
  GuestHostService: class {
    connect() {}
    disconnect() {}
  },
  generateRoomId: () => 'room_1',
  generateGuestInviteUrl: () => 'https://example.com/guest',
}));

vi.mock('./services/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./services/apiClient')>();
  return {
    ...actual,
    apiRequest: vi.fn(),
    buildApiUrl: vi.fn(actual.buildApiUrl),
  };
});

vi.mock('./components/CanvasCompositor', () => ({
  default: React.forwardRef(() => <div data-testid="canvas" />),
}));

vi.mock('./components/DestinationManager', () => ({ default: () => <div /> }));
vi.mock('./components/LayoutSelector', () => ({ default: () => <div /> }));
vi.mock('./components/AudioMixer', () => ({ default: () => <div /> }));
vi.mock('./components/BrandingPanel', () => ({ default: () => <div /> }));
vi.mock('./components/BackgroundSelector', () => ({ default: () => <div /> }));
vi.mock('./components/AuthStatusBanner', () => ({ default: () => <div /> }));
vi.mock('./components/ChatStream', () => ({ default: () => <div /> }));
vi.mock('./components/SceneSelector', () => ({ default: () => <div /> }));
vi.mock('./components/MusicPlayer', () => ({ default: () => <div /> }));

vi.mock('./components/MediaBin', () => ({
  default: ({ onUpload, onDelete }: { onUpload: (file: File, type: 'image' | 'video' | 'audio') => Promise<void>; onDelete: (id: string) => Promise<void> }) => (
    <div>
      <button onClick={() => onUpload(new File(['hello'], 'test.png', { type: 'image/png' }), 'image')}>
        upload-media
      </button>
      <button onClick={() => onDelete('asset-1')}>delete-media</button>
    </div>
  ),
}));

describe('App media API behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_API_BASE_URL', 'https://media-api.example.com/');
  });

  it('uses api client auth flow and configured base URL for media actions', async () => {
    const apiRequestMock = vi.mocked(apiRequest);
    const buildApiUrlMock = vi.mocked(buildApiUrl);
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ asset: { id: 'asset-2', type: 'image', url: '/img.png', name: 'img' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    apiRequestMock.mockResolvedValueOnce({ assets: [] }).mockResolvedValueOnce({});

    render(<App />);

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith('/api/media/list', {
        token: 'token_123',
      });
    });

    fireEvent.click(screen.getByTitle('Media'));
    fireEvent.click(screen.getByText('upload-media'));

    await waitFor(() => {
      expect(buildApiUrlMock).toHaveBeenCalledWith('/api/media/upload');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://media-api.example.com/api/media/upload',
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
          headers: expect.objectContaining({ Authorization: 'Bearer token_123' }),
        }),
      );
    });

    fireEvent.click(screen.getByText('delete-media'));

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenLastCalledWith('/api/media/asset-1', {
        method: 'DELETE',
        token: 'token_123',
      });
    });
  });

  it('shows UI error when media list request fails', async () => {
    // Key the failure to the media path rather than call order: the Studio also
    // loads AI co-host config on mount, and whichever effect runs first would
    // otherwise swallow a queued one-shot rejection.
    vi.mocked(apiRequest).mockImplementation((path: string) =>
      path === '/api/media/list'
        ? Promise.reject(new ApiRequestError('Media list failed.', 500, null))
        : (Promise.resolve({}) as ReturnType<typeof apiRequest>),
    );

    render(<App />);

    fireEvent.click(screen.getByTitle('Media'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Media list failed.');
  });
});
