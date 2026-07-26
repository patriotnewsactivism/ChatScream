import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CaptionOverlay } from '../../src/components/CaptionOverlay';
import { CaptionSettings } from '../../src/components/Settings/CaptionSettings';
import { captionService } from '../../src/services/captionService';

// Mock the caption service
vi.mock('../../src/services/captionService', () => ({
  captionService: {
    translateCaption: vi.fn(),
    clearCache: vi.fn(),
  },
}));

// Mock the API request
const mockApiRequest = vi.fn();
vi.mock('../../server/index', () => ({
  apiRequest: (...args) => mockApiRequest(...args),
}));

describe('Caption Flow Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockApiRequest.mockResolvedValue({ translatedText: 'Translated caption' });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Debouncing', () => {
    it('should batch multiple caption updates within 2 seconds', async () => {
      const onTranslationComplete = vi.fn();
      render(
        <CaptionOverlay
          captions={['Hello', 'World', 'Test']}
          targetLang="es"
          onTranslationComplete={onTranslationComplete}
        />
      );

      // Simulate rapid caption updates
      act(() => {
        vi.advanceTimersByTime(100);
      });

      act(() => {
        vi.advanceTimersByTime(100);
      });

      act(() => {
        vi.advanceTimersByTime(100);
      });

      // Should not have called translation yet
      expect(captionService.translateCaption).not.toHaveBeenCalled();

      // Advance past 2 seconds
      act(() => {
        vi.advanceTimersByTime(1700);
      });

      // Should now have batched and translated
      await waitFor(() => {
        expect(captionService.translateCaption).toHaveBeenCalled();
      });
    });

    it('should translate each batch separately', async () => {
      render(
        <CaptionOverlay
          captions={['First batch']}
          targetLang="es"
        />
      );

      // First batch
      act(() => {
        vi.advanceTimersByTime(2100);
      });

      await waitFor(() => {
        expect(captionService.translateCaption).toHaveBeenCalledWith('First batch', 'es');
      });

      // Second batch
      act(() => {
        vi.advanceTimersByTime(2100);
      });

      await waitFor(() => {
        expect(captionService.translateCaption).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('Async Translation', () => {
    it('should not block caption stream during translation', async () => {
      let resolveTranslation: (value: string) => void;
      const translationPromise = new Promise<string>((resolve) => {
        resolveTranslation = resolve;
      });

      (captionService.translateCaption as any).mockReturnValue(translationPromise);

      render(
        <CaptionOverlay
          captions={['Live caption']}
          targetLang="es"
        />
      );

      // Simulate new caption arriving while translation is pending
      act(() => {
        vi.advanceTimersByTime(100);
      });

      // Resolve translation
      act(() => {
        resolveTranslation!('Live caption translated');
      });

      await waitFor(() => {
        expect(screen.getByText('Live caption translated')).toBeDefined();
      });
    });
  });

  describe('Loading Indicator', () => {
    it('should show "Translating..." after 500ms latency', async () => {
      let resolveTranslation: (value: string) => void;
      const translationPromise = new Promise<string>((resolve) => {
        resolveTranslation = resolve;
      });

      (captionService.translateCaption as any).mockReturnValue(translationPromise);

      render(
        <CaptionOverlay
          captions={['Hello']}
          targetLang="es"
        />
      );

      // Trigger translation
      act(() => {
        vi.advanceTimersByTime(2100);
      });

      // After 500ms, should show translating indicator
      act(() => {
        vi.advanceTimersByTime(500);
      });

      await waitFor(() => {
        expect(screen.getByText('Translating...')).toBeDefined();
      });

      // Resolve translation
      act(() => {
        resolveTranslation!('Hola');
      });

      await waitFor(() => {
        expect(screen.getByText('Hola')).toBeDefined();
      });
    });

    it('should not show loading indicator if translation completes within 500ms', async () => {
      (captionService.translateCaption as any).mockResolvedValue('Hola');

      render(
        <CaptionOverlay
          captions={['Hello']}
          targetLang="es"
        />
      );

      act(() => {
        vi.advanceTimersByTime(2100);
      });

      // Should show translated text directly, not loading indicator
      await waitFor(() => {
        expect(screen.getByText('Hola')).toBeDefined();
      });
      expect(screen.queryByText('Translating...')).toBeNull();
    });
  });

  describe('Error Fallback', () => {
    it('should display original caption with error tooltip when translation fails', async () => {
      (captionService.translateCaption as any).mockRejectedValue(new Error('Translation failed'));

      render(
        <CaptionOverlay
          captions={['Hello world']}
          targetLang="es"
          showErrorTooltip={true}
        />
      );

      act(() => {
        vi.advanceTimersByTime(2100);
      });

      await waitFor(() => {
        expect(screen.getByText('Hello world')).toBeDefined();
      });

      // Should show error indicator/tooltip
      expect(screen.getByLabelText('Translation error')).toBeDefined();
    });

    it('should not display tooltip when showErrorTooltip is false', async () => {
      (captionService.translateCaption as any).mockRejectedValue(new Error('Translation failed'));

      render(
        <CaptionOverlay
          captions={['Hello world']}
          targetLang="es"
          showErrorTooltip={false}
        />
      );

      act(() => {
        vi.advanceTimersByTime(2100);
      });

      await waitFor(() => {
        expect(screen.getByText('Hello world')).toBeDefined();
      });

      expect(screen.queryByLabelText('Translation error')).toBeNull();
    });
  });

  describe('Show Original Language Toggle', () => {
    it('should display original captions when toggle is enabled', async () => {
      (captionService.translateCaption as any).mockResolvedValue('Hola');

      render(
        <CaptionOverlay
          captions={['Hello']}
          targetLang="es"
          showOriginal={true}
        />
      );

      act(() => {
        vi.advanceTimersByTime(2100);
      });

      await waitFor(() => {
        // Should show original text, not translation
        expect(screen.getByText('Hello')).toBeDefined();
      });
      expect(screen.queryByText('Hola')).toBeNull();
    });

    it('should display translated captions when toggle is disabled', async () => {
      (captionService.translateCaption as any).mockResolvedValue('Hola');

      render(
        <CaptionOverlay
          captions={['Hello']}
          targetLang="es"
          showOriginal={false}
        />
      );

      act(() => {
        vi.advanceTimersByTime(2100);
      });

      await waitFor(() => {
        expect(screen.getByText('Hola')).toBeDefined();
      });
      expect(screen.queryByText('Hello')).toBeNull();
    });
  });

  describe('Caption Settings Integration', () => {
    it('should update target language when user selects new language', async () => {
      const user = userEvent.setup();

      render(<CaptionSettings />);

      const languageSelect = screen.getByLabelText('Target language');
      await user.selectOptions(languageSelect, 'fr');

      expect(languageSelect).toHaveValue('fr');
    });

    it('should persist language preference to user profile', async () => {
      const user = userEvent.setup();
      mockApiRequest.mockResolvedValue({ success: true });

      render(<CaptionSettings />);

      const languageSelect = screen.getByLabelText('Target language');
      await user.selectOptions(languageSelect, 'de');

      await waitFor(() => {
        expect(mockApiRequest).toHaveBeenCalledWith('/api/user/preferences', {
          method: 'POST',
          body: { captionTargetLanguage: 'de' },
        });
      });
    });
  });

  describe('End-to-End Flow', () => {
    it('should complete full caption translation flow', async () => {
      (captionService.translateCaption as any).mockResolvedValue('Hola mundo');

      render(
        <CaptionOverlay
          captions={['Hello world']}
          targetLang="es"
        />
      );

      // Wait for debounce
      act(() => {
        vi.advanceTimersByTime(2100);
      });

      // Wait for translation
      await waitFor(() => {
        expect(screen.getByText('Hola mundo')).toBeDefined();
      });

      // Verify service was called correctly
      expect(captionService.translateCaption).toHaveBeenCalledWith('Hello world', 'es');
    });

    it('should handle translation failure gracefully in full flow', async () => {
      (captionService.translateCaption as any).mockRejectedValue(new Error('Network error'));

      render(
        <CaptionOverlay
          captions={['Hello world']}
          targetLang="es"
          showErrorTooltip={true}
        />
      );

      act(() => {
        vi.advanceTimersByTime(2100);
      });

      await waitFor(() => {
        expect(screen.getByText('Hello world')).toBeDefined();
      });

      expect(screen.getByLabelText('Translation error')).toBeDefined();
    });

    it('should respect showOriginal toggle throughout the flow', async () => {
      (captionService.translateCaption as any).mockResolvedValue('Hola');

      const { rerender } = render(
        <CaptionOverlay
          captions={['Hello']}
          targetLang="es"
          showOriginal={false}
        />
      );

      act(() => {
        vi.advanceTimersByTime(2100);
      });

      await waitFor(() => {
        expect(screen.getByText('Hola')).toBeDefined();
      });

      // Toggle to show original
      rerender(
        <CaptionOverlay
          captions={['Hello']}
          targetLang="es"
          showOriginal={true}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Hello')).toBeDefined();
      });
      expect(screen.queryByText('Hola')).toBeNull();
    });
  });
});
