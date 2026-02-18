import { render, screen, fireEvent } from '@testing-library/react';
import DestinationManager from '../DestinationManager';
import * as oauthService from '../../services/oauthService';

vi.mock('../../services/oauthService', () => ({
  initiateOAuth: vi.fn(),
  getChannels: vi.fn(),
  getStreamKey: vi.fn(),
}));

describe('DestinationManager quick connect', () => {
  it('starts YouTube OAuth connect flow', () => {
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

    const youtubeButton = screen.getByRole('button', { name: /Connect YouTube/i });
    fireEvent.click(youtubeButton);

    expect(vi.mocked(oauthService.initiateOAuth)).toHaveBeenCalledWith('youtube', 'user-123');
    expect(onAddDestination).not.toHaveBeenCalled();
  });

  it('disables quick connect while streaming', () => {
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

    const youtubeButton = screen.getByRole('button', { name: /YouTube/i });
    expect(youtubeButton).toBeDisabled();
  });
});
