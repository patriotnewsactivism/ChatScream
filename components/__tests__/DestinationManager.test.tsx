import { render, screen, fireEvent } from '@testing-library/react';
import DestinationManager from '../DestinationManager';
import { Platform } from '../../types';

describe('DestinationManager quick connect', () => {
  it('adds an OAuth destination with one-click flow', () => {
    const onAddDestination = vi.fn();
    render(
      <DestinationManager
        destinations={[]}
        onAddDestination={onAddDestination}
        onRemoveDestination={() => {}}
        onToggleDestination={() => {}}
        isStreaming={false}
      />
    );

    const youtubeButton = screen.getByRole('button', { name: /YouTube/i });
    fireEvent.click(youtubeButton);

    expect(onAddDestination).toHaveBeenCalledTimes(1);
    const payload = onAddDestination.mock.calls[0][0];
    expect(payload.platform).toBe(Platform.YOUTUBE);
    expect(payload.authType).toBe('oauth');
    expect(payload.streamKey).toBe('oauth-linked');
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
      />
    );

    const youtubeButton = screen.getByRole('button', { name: /YouTube/i });
    expect(youtubeButton).toBeDisabled();
  });
});
