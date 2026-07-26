import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import LiveCaptions from '../LiveCaptions';

// Mock translateCaption service
const mockTranslateCaption = jest.fn();
jest.mock('../../services/captionService', () => ({
  translateCaption: (...args) => mockTranslateCaption(...args)
}));

// Helper to create captions
const makeCaption = (id, text) => ({ id, text });

describe('LiveCaptions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders original captions when showOriginalLanguage is true', async () => {
    render(
      <LiveCaptions
        captions={[makeCaption('1', 'Hello world')]}
        captionLanguage="es"
        showOriginalLanguage={true}
      />
    );
    expect(screen.getByText('Hello world')).toBeInTheDocument();
    expect(screen.getByText('Original')).toBeInTheDocument();
  });

  it('renders translated captions when showOriginalLanguage is false', async () => {
    mockTranslateCaption.mockResolvedValue({ translatedText: 'Hola mundo' });
    render(
      <LiveCaptions
        captions={[makeCaption('1', 'Hello world')]}
        captionLanguage="es"
        showOriginalLanguage={false}
      />
    );
    await waitFor(() => {
      expect(screen.getByText('Hola mundo')).toBeInTheDocument();
    });
  });

  it('announces new captions for screen readers', async () => {
    render(
      <LiveCaptions
        captions={[makeCaption('1', 'Hello world')]}
        captionLanguage="es"
        showOriginalLanguage={true}
      />
    );
    const captionsContainer = screen.getByRole('region');
    expect(captionsContainer).toHaveAttribute('aria-live', 'polite');
    expect(captionsContainer).toHaveAttribute('aria-atomic', 'true');
  });

  it('applies high contrast theme', async () => {
    render(
      <LiveCaptions
        captions={[makeCaption('1', 'Hello world')]}
        captionLanguage="es"
        showOriginalLanguage={true}
        highContrast={true}
      />
    );
    const caption = screen.getByText('Hello world');
    expect(caption).toHaveStyle({ color: '#fff', background: '#000' });
  });
});