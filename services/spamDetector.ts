/**
 * Spam Detection Service
 * Analyzes chat messages for spam patterns including excessive caps,
 * links, character repetition, and banned words.
 */

export interface SpamCheckResult {
  isSpam: boolean;
  score: number;
  reasons: string[];
  recommendedAction: 'allow' | 'flag' | 'mute' | 'delete';
}

export interface SpamConfig {
  // Thresholds (0.0 - 1.0)
  capsRatioThreshold: number;
  // Weights for scoring
  capsWeight: number;
  linkWeight: number;
  repetitionWeight: number;
  bannedWordWeight: number;
  // Score thresholds for actions
  scoreThresholds: {
    flag: number;
    mute: number;
    delete: number;
  };
  // List of banned words/phrases
  bannedWords: string[];
}

const DEFAULT_CONFIG: SpamConfig = {
  capsRatioThreshold: 0.75, // 75% caps
  capsWeight: 20,
  linkWeight: 30,
  repetitionWeight: 25,
  bannedWordWeight: 50,
  scoreThresholds: {
    flag: 30,
    mute: 60,
    delete: 100,
  },
  bannedWords: [
    'buy followers',
    'click here',
    'free money',
    'crypto scam',
    'xanax',
    'viagra',
    'lottery winner',
    'nigerian prince',
    'claim your prize',
    'join my discord', // Optional: depends on community rules
  ],
};

/**
 * Analyzes a message for spam patterns.
 * @param message The message content to analyze.
 * @param config Optional configuration overrides.
 * @returns SpamCheckResult containing score, reasons, and recommended action.
 */
export function detectSpam(
  message: string,
  config: Partial<SpamConfig> = {}
): SpamCheckResult {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const normalizedMessage = message.trim();
  let score = 0;
  const reasons: string[] = [];

  // 1. Check for Empty/Short Messages (Edge case)
  if (normalizedMessage.length < 2) {
    return {
      isSpam: false,
      score: 0,
      reasons: [],
      recommendedAction: 'allow',
    };
  }

  // 2. Excessive Caps Lock Check
  const alphaChars = normalizedMessage.replace(/[^a-zA-Z]/g, '');
  if (alphaChars.length > 5) {
    // Only check if message has enough letters to be meaningful
    const upperCaseChars = normalizedMessage.replace(/[^A-Z]/g, '');
    const capsRatio = upperCaseChars.length / alphaChars.length;

    if (capsRatio > finalConfig.capsRatioThreshold) {
      score += finalConfig.capsWeight;
      reasons.push('Excessive capitalization');
    }
  }

  // 3. Link Detection
  const urlRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|(\.[a-z]{2,}\/?)/i;
  if (urlRegex.test(normalizedMessage)) {
    score += finalConfig.linkWeight;
    reasons.push('Contains URL/Link');
  }

  // 4. Character Repetition (e.g., "aaaaaa", "!!!!!!")
  // Matches any character repeated 5 or more times consecutively
  const repetitionRegex = /(.)\1{4,}/;
  if (repetitionRegex.test(normalizedMessage)) {
    score += finalConfig.repetitionWeight;
    reasons.push('Excessive character repetition');
  }

  // 5. Banned Words Check
  const lowerMessage = normalizedMessage.toLowerCase();
  for (const word of finalConfig.bannedWords) {
    if (lowerMessage.includes(word.toLowerCase())) {
      score += finalConfig.bannedWordWeight;
      reasons.push(`Banned phrase: "${word}"`);
      // Don't break immediately; catch all banned phrases for full context
    }
  }

  // Determine Action based on Score
  let recommendedAction: SpamCheckResult['recommendedAction'] = 'allow';

  if (score >= finalConfig.scoreThresholds.delete) {
    recommendedAction = 'delete';
  } else if (score >= finalConfig.scoreThresholds.mute) {
    recommendedAction = 'mute';
  } else if (score >= finalConfig.scoreThresholds.flag) {
    recommendedAction = 'flag';
  }

  return {
    isSpam: score > 0,
    score,
    reasons,
    recommendedAction,
  };
}

/**
 * Helper to update user spam state based on detection result.
 * This logic is intended to be used by the API layer after DB retrieval.
 */
export function calculateUserSpamState(
  currentScore: number,
  newMessageScore: number,
  isCurrentlyMuted: boolean
): {
  newScore: number;
  shouldMute: boolean;
  shouldDelete: boolean;
} {
  const newScore = currentScore + newMessageScore;
  // Simple heuristic: if score > 100, mute. If single message score > 100, delete.
  return {
    newScore,
    shouldMute: newScore > 100,
    shouldDelete: newMessageScore > 100,
  };
}
