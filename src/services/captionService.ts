import apiClient from './apiClient';

// In-memory fallback cache for translations (key: `${text}|${targetLang}`)
const translationCache: Record<string, string> = {};

/**
 * Translates a caption text to the target language using backend API with fallback cache.
 * @param text Original caption text
 * @param targetLang Target language code (e.g., 'en', 'es', 'fr')
 * @returns Promise<string> Translated text or original text if translation fails
 */
export async function translateCaption(text: string, targetLang: string): Promise<string> {
  if (!text || !targetLang) return text;
  const cacheKey = `${text}|${targetLang}`;
  if (translationCache[cacheKey]) {
    return translationCache[cacheKey];
  }
  try {
    const resp = await apiClient.post('/api/caption/translate', {
      text,
      targetLang,
    });
    if (resp && typeof resp.translatedText === 'string') {
      translationCache[cacheKey] = resp.translatedText;
      return resp.translatedText;
    }
    // Fallback: cache original text if translation failed
    translationCache[cacheKey] = text;
    return text;
  } catch (err) {
    // Fallback: cache original text if translation failed
    translationCache[cacheKey] = text;
    return text;
  }
}

// Existing caption fetching remains unchanged
export async function fetchCaptions(streamId: string): Promise<string[]> {
  // ... existing implementation ...
  // This is a placeholder for the original code
  return [];
}
