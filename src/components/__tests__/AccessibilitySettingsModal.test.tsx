import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/extend-expect';
import AccessibilitySettingsModal from '../AccessibilitySettingsModal';
import { useAccessibilitySettings } from '../../hooks/useAccessibilitySettings';
import { ThemeProvider } from '../../context/ThemeContext';

jest.mock('../../hooks/useAccessibilitySettings');

const mockUseAccessibilitySettings = useAccessibilitySettings as jest.Mock;

const renderComponent = () => {
  return render(
    <ThemeProvider>
      <AccessibilitySettingsModal />
    </ThemeProvider>
  );
};

describe('AccessibilitySettingsModal', () => {
  beforeEach(() => {
    mockUseAccessibilitySettings.mockReturnValue({
      settings: {
        captionFontSize: 'medium',
        captionFontStyle: 'sans',
        captionFontColor: '#ffffff',
        highContrast: false,
        audioVolumeBoost: false,
        screenReaderMode: false,
        colorScheme: 'light',
        ttsEnabled: false,
      },
      updateSetting: jest.fn(),
      resetSettings: jest.fn(),
      supported: true,
    });
  });

  it('renders without crashing', () => {
    renderComponent();
    expect(screen.getByText('Accessibility Settings')).toBeInTheDocument();
  });

  it('updates font size setting', () => {
    renderComponent();
    fireEvent.change(screen.getByLabelText('Font Size'), { target: { value: 'large' } });
    expect(mockUseAccessibilitySettings().updateSetting).toHaveBeenCalledWith('captionFontSize', 'large');
  });

  it('toggles high contrast mode', () => {
    renderComponent();
    fireEvent.click(screen.getByLabelText('High Contrast'));
    expect(mockUseAccessibilitySettings().updateSetting).toHaveBeenCalledWith('highContrast', true);
  });

  it('toggles TTS mode', () => {
    renderComponent();
    fireEvent.click(screen.getByLabelText('Enable TTS'));
    expect(mockUseAccessibilitySettings().updateSetting).toHaveBeenCalledWith('ttsEnabled', true);
  });

  it('applies color scheme changes', () => {
    renderComponent();
    fireEvent.change(screen.getByLabelText('Font Color'), { target: { value: '#000000' } });
    expect(mockUseAccessibilitySettings().updateSetting).toHaveBeenCalledWith('captionFontColor', '#000000');
  });

  it('applies font size settings', () => {
    mockUseAccessibilitySettings.mockReturnValue({
      settings: {
        captionFontSize: 'large',
        captionFontStyle: 'sans',
        captionFontColor: '#ffffff',
        highContrast: false,
        audioVolumeBoost: false,
        screenReaderMode: false,
        ttsEnabled: false,
      },
      supported: true,
    });
    renderComponent([
      {
        id: '1',
        content: 'Hello',
        user: { id: '1', name: 'Alice', onlineStatus: 'online' },
      },
    ]);
    expect(screen.getByText('Hello')).toHaveStyle('font-size: 24px');
  });

  it('applies high contrast settings', () => {
    mockUseAccessibilitySettings.mockReturnValue({
      settings: {
        captionFontSize: 'medium',
        captionFontStyle: 'sans',
        captionFontColor: '#ffff00',
        highContrast: true,
        audioVolumeBoost: false,
        screenReaderMode: false,
        ttsEnabled: false,
      },
      supported: true,
    });
    renderComponent([
      {
        id: '1',
        content: 'Hello',
        user: { id: '1', name: 'Alice', onlineStatus: 'online' },
      },
    ]);
    expect(screen.getByText('Hello')).toHaveStyle('color: #ffff00');
  });

  it('applies color scheme settings', () => {
    mockUseAccessibilitySettings.mockReturnValue({
      settings: {
        captionFontSize: 'medium',
        captionFontStyle: 'sans',
        captionFontColor: '#000000',
        highContrast: false,
        audioVolumeBoost: false,
        screenReaderMode: false,
        ttsEnabled: false,
      },
      supported: true,
    });
    renderComponent([
      {
        id: '1',
        content: 'Hello',
        user: { id: '1', name: 'Alice', onlineStatus: 'online' },
      },
    ]);
    expect(screen.getByText('Hello')).toHaveStyle('color: #000000');
  });

  it('validates ARIA attributes', () => {
    renderComponent([
      {
        id: '1',
        content: 'Hello',
        user: { id: '1', name: 'Alice', onlineStatus: 'online' },
      },
    ]);
    // Container should have role="log" and aria-live="polite"
    const logContainer = screen.getByRole('log');
    expect(logContainer).toBeInTheDocument();
    expect(logContainer).toHaveAttribute('aria-live', 'polite');

    // Each message should be an article with aria-label
    const article = screen.getByRole('article');
    expect(article).toBeInTheDocument();
    expect(article).toHaveAttribute('aria-label');
  });

  it('simulates keyboard navigation', () => {
    renderComponent([
      { id: '1', content: 'First', user: { id: '1', name: 'Alice', onlineStatus: 'online' } },
      { id: '2', content: 'Second', user: { id: '2', name: 'Bob', onlineStatus: 'online' } },
      { id: '3', content: 'Third', user: { id: '3', name: 'Carol', onlineStatus: 'online' } },
    ]);
    const articles = screen.getAllByRole('article');
    // Focus first message
    articles[0].focus();
    expect(document.activeElement).toBe(articles[0]);

    // ArrowDown moves to next
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(articles[1]);

    // ArrowUp moves back
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(articles[0]);

    // Home key stays on first
    fireEvent.keyDown(document.activeElement!, { key: 'Home' });
    expect(document.activeElement).toBe(articles[0]);

    // End key moves to last
    fireEvent.keyDown(document.activeElement!, { key: 'End' });
    expect(document.activeElement).toBe(articles[2]);
  });
});