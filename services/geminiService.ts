import { requestStreamMetadata } from './aiClient';

export const generateStreamMetadata = async (topic: string, authToken: string) => {
  if (!authToken) {
    return { title: 'New Live Stream', description: 'Join me live!' };
  }

  try {
    const response = await requestStreamMetadata(authToken, topic);
    return {
      title: response.title || 'New Live Stream',
      description: response.description || 'Join me live!',
    };
  } catch (error) {
    console.error('Error generating metadata:', error);
    return {
      title: `${topic} - Live Stream`,
      description: `Watch as we dive deep into ${topic}. Streaming now!`,
    };
  }
};
