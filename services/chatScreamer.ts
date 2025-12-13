// ChatScream - Chat Screamer Donation Alert Service
// This handles donation-triggered alerts with scaling visual/audio effects

import { getScreamTier, ScreamTier } from './stripe';

export interface ScreamAlert {
  id: string;
  donorName: string;
  amount: number;
  message: string;
  tier: ScreamTier;
  timestamp: Date;
  streamerId: string;
  processed: boolean;
}

export interface ScreamSettings {
  enabled: boolean;
  minimumAmount: number;
  customSounds: {
    standard: string | null;
    loud: string | null;
    maximum: string | null;
  };
  customAnimations: {
    standard: string | null;
    loud: string | null;
    maximum: string | null;
  };
  ttsVoice: string;
  ttsSpeed: number;
  alertPosition: 'top' | 'center' | 'bottom';
  showAmount: boolean;
  profanityFilter: boolean;
}

export const DEFAULT_SCREAM_SETTINGS: ScreamSettings = {
  enabled: true,
  minimumAmount: 5,
  customSounds: {
    standard: null,
    loud: null,
    maximum: null,
  },
  customAnimations: {
    standard: null,
    loud: null,
    maximum: null,
  },
  ttsVoice: 'en-US-Standard-D',
  ttsSpeed: 1.0,
  alertPosition: 'center',
  showAmount: true,
  profanityFilter: true,
};

// Create a new scream alert from donation
export const createScreamAlert = (
  donorName: string,
  amount: number,
  message: string,
  streamerId: string
): ScreamAlert | null => {
  const tier = getScreamTier(amount);

  if (!tier) {
    console.log('Donation amount too low for scream alert:', amount);
    return null;
  }

  return {
    id: `scream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    donorName,
    amount,
    message,
    tier,
    timestamp: new Date(),
    streamerId,
    processed: false,
  };
};

// Get CSS classes for scream overlay based on tier
export const getScreamOverlayClasses = (tier: ScreamTier): string => {
  const baseClasses = 'fixed z-50 flex items-center justify-center transition-all duration-500';

  switch (tier.effects.overlay) {
    case 'small':
      return `${baseClasses} bottom-8 right-8 max-w-md`;
    case 'medium':
      return `${baseClasses} bottom-1/4 left-1/2 -translate-x-1/2 max-w-lg`;
    case 'large':
      return `${baseClasses} inset-x-8 bottom-1/4 top-1/4`;
    case 'fullscreen':
      return `${baseClasses} inset-0 bg-gradient-to-br from-red-600/90 to-pink-600/90 backdrop-blur-sm`;
    default:
      return baseClasses;
  }
};

// Get animation classes based on tier
export const getScreamAnimationClasses = (tier: ScreamTier): string => {
  switch (tier.effects.animation) {
    case 'fade':
      return 'animate-fade-in';
    case 'bounce':
      return 'animate-bounce';
    case 'shake':
      return 'animate-shake';
    case 'explode':
      return 'animate-scream';
    default:
      return 'animate-fade-in';
  }
};

// Get gradient colors based on tier
export const getScreamGradient = (tier: ScreamTier): string => {
  switch (tier.id) {
    case 'standard':
      return 'from-green-500 to-emerald-500';
    case 'loud':
      return 'from-yellow-500 to-orange-500';
    case 'maximum':
      return 'from-red-500 to-pink-500';
    default:
      return 'from-brand-500 to-brand-600';
  }
};

// Generate TTS audio for scream message
export const generateScreamTTS = async (
  message: string,
  voice: string = 'en-US-Standard-D',
  speed: number = 1.0
): Promise<string | null> => {
  // In production, this would call a TTS API (Google Cloud TTS, Amazon Polly, etc.)
  // For now, we'll use the browser's built-in speech synthesis

  if ('speechSynthesis' in window) {
    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(message);
      utterance.rate = speed;
      utterance.onend = () => resolve('success');
      utterance.onerror = () => resolve(null);
      speechSynthesis.speak(utterance);
    });
  }

  return null;
};

// Play scream sound effect based on tier
export const playScreamSound = (tier: ScreamTier, customSound?: string | null): void => {
  const defaultSounds = {
    standard: '/sounds/scream-standard.mp3',
    loud: '/sounds/scream-loud.mp3',
    maximum: '/sounds/scream-maximum.mp3',
  };

  const soundUrl = customSound || defaultSounds[tier.id as keyof typeof defaultSounds];

  if (soundUrl) {
    const audio = new Audio(soundUrl);
    audio.volume = tier.effects.volume / 100;
    audio.play().catch(err => console.warn('Could not play scream sound:', err));
  }
};

// Filter profanity from message (basic implementation)
export const filterProfanity = (message: string): string => {
  const profanityList = ['fuck', 'shit', 'ass', 'bitch', 'damn', 'crap'];
  let filtered = message.toLowerCase();

  profanityList.forEach(word => {
    const regex = new RegExp(word, 'gi');
    filtered = filtered.replace(regex, '*'.repeat(word.length));
  });

  return filtered;
};

// Format scream alert for display
export const formatScreamDisplay = (alert: ScreamAlert, settings: ScreamSettings): {
  displayName: string;
  displayAmount: string;
  displayMessage: string;
  tierName: string;
} => {
  let displayMessage = alert.message;

  if (settings.profanityFilter) {
    displayMessage = filterProfanity(displayMessage);
  }

  return {
    displayName: alert.donorName,
    displayAmount: settings.showAmount ? `$${alert.amount.toFixed(2)}` : '',
    displayMessage,
    tierName: alert.tier.name,
  };
};

// Calculate scream duration based on tier and message length
export const calculateScreamDuration = (tier: ScreamTier, messageLength: number): number => {
  const baseDuration = tier.effects.duration * 1000; // Convert to ms
  const extraTimePerChar = 50; // 50ms per character for TTS
  const maxExtra = 10000; // Max 10 seconds extra

  const extra = Math.min(messageLength * extraTimePerChar, maxExtra);

  return baseDuration + extra;
};

// Export types for use in components
export type { ScreamTier };
