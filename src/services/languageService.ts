import axios from 'axios';

const LANGUAGE_DETECTION_API = 'https://api.example.com/detect';
const TRANSLATION_API = 'https://api.example.com/translate';

export const detectLanguage = async (text: string) => {
  try {
    const response = await axios.post(LANGUAGE_DETECTION_API, { text });
    return response.data.language;
  } catch (error) {
    console.error('Language detection failed:', error);
    throw error;
  }
};

export const translateCaption = async (text: string, targetLanguage: string) => {
  try {
    const response = await axios.post(TRANSLATION_API, { text, targetLanguage });
    return response.data;
  } catch (error) {
    console.error('Translation failed:', error);
    throw error;
  }
};
