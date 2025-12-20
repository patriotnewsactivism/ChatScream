import { useCallback, useState } from 'react';
import { generateViralStreamPackage, type ViralStreamPackage } from '../services/claudeService';

export const useViralContent = (authToken: string | null) => {
  const [streamTopic, setStreamTopic] = useState('');
  const [viralPackage, setViralPackage] = useState<ViralStreamPackage | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = useCallback(async () => {
    if (!streamTopic.trim()) return;
    if (!authToken) {
      setError('Please sign in to use AI content generation.');
      return;
    }

    setError(null);
    setIsGenerating(true);
    try {
      const result = await generateViralStreamPackage(streamTopic.trim(), authToken);
      setViralPackage(result);
    } catch (err: any) {
      setError(err?.message || 'Failed to generate copy.');
    } finally {
      setIsGenerating(false);
    }
  }, [authToken, streamTopic]);

  return {
    streamTopic,
    setStreamTopic,
    viralPackage,
    setViralPackage,
    isGenerating,
    error,
    handleGenerate,
  };
};
