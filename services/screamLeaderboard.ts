// ChatScream - Scream Leaderboard Gamification Service
// Tracks weekly scream counts and awards prizes

export interface LeaderboardEntry {
  streamerId: string;
  streamerName: string;
  streamerAvatar?: string;
  screamCount: number;
  totalAmount: number;
  rank: number;
  weekStart: Date;
  weekEnd: Date;
}

export interface WeeklyLeaderboard {
  id: string;
  weekStart: Date;
  weekEnd: Date;
  entries: LeaderboardEntry[];
  winner?: LeaderboardEntry;
  prizeAwarded: boolean;
  prizeValue: number; // $59 Professional tier
}

export interface LeaderboardStats {
  totalScreamsThisWeek: number;
  currentRank: number;
  pointsToNextRank: number;
  weeklyProgress: number; // 0-100 percentage of week
  previousWins: number;
}

// Prize configuration
export const LEADERBOARD_PRIZE = {
  value: 59, // $59 Professional tier
  description: '1 FREE month of Professional tier',
  tierGranted: 'pro',
  durationMonths: 1,
};

// Get current week's start and end dates (Sunday to Saturday)
export const getCurrentWeekDates = (): { start: Date; end: Date } => {
  const now = new Date();
  const dayOfWeek = now.getDay();

  // Start of week (Sunday)
  const start = new Date(now);
  start.setDate(now.getDate() - dayOfWeek);
  start.setHours(0, 0, 0, 0);

  // End of week (Saturday 23:59:59)
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return { start, end };
};

// Calculate time remaining in current week
export const getTimeRemainingInWeek = (): {
  days: number;
  hours: number;
  minutes: number;
  percentage: number;
} => {
  const { start, end } = getCurrentWeekDates();
  const now = new Date();

  const totalMs = end.getTime() - start.getTime();
  const elapsedMs = now.getTime() - start.getTime();
  const remainingMs = end.getTime() - now.getTime();

  const days = Math.floor(remainingMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((remainingMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
  const percentage = Math.min(100, (elapsedMs / totalMs) * 100);

  return { days, hours, minutes, percentage };
};

// Format leaderboard entry for display
export const formatLeaderboardEntry = (entry: LeaderboardEntry): {
  rankDisplay: string;
  screamDisplay: string;
  badge: 'gold' | 'silver' | 'bronze' | null;
} => {
  let badge: 'gold' | 'silver' | 'bronze' | null = null;

  if (entry.rank === 1) badge = 'gold';
  else if (entry.rank === 2) badge = 'silver';
  else if (entry.rank === 3) badge = 'bronze';

  return {
    rankDisplay: `#${entry.rank}`,
    screamDisplay: `${entry.screamCount} screams`,
    badge,
  };
};

// Get ordinal suffix for rank
export const getOrdinalSuffix = (rank: number): string => {
  const j = rank % 10;
  const k = rank % 100;

  if (j === 1 && k !== 11) return `${rank}st`;
  if (j === 2 && k !== 12) return `${rank}nd`;
  if (j === 3 && k !== 13) return `${rank}rd`;
  return `${rank}th`;
};

// Calculate points needed to reach next rank
export const calculatePointsToNextRank = (
  currentScreams: number,
  leaderboard: LeaderboardEntry[]
): number => {
  const sortedEntries = [...leaderboard].sort((a, b) => b.screamCount - a.screamCount);

  // Find current position
  const currentPosition = sortedEntries.findIndex(e => e.screamCount <= currentScreams);

  if (currentPosition <= 0) {
    // Already at top or no one above
    return 0;
  }

  const nextPosition = sortedEntries[currentPosition - 1];
  return nextPosition.screamCount - currentScreams + 1;
};

// Get leaderboard statistics for a streamer
export const getStreamerStats = (
  streamerId: string,
  leaderboard: LeaderboardEntry[],
  previousWins: number = 0
): LeaderboardStats => {
  const entry = leaderboard.find(e => e.streamerId === streamerId);
  const { percentage } = getTimeRemainingInWeek();

  if (!entry) {
    return {
      totalScreamsThisWeek: 0,
      currentRank: leaderboard.length + 1,
      pointsToNextRank: leaderboard.length > 0 ? leaderboard[leaderboard.length - 1].screamCount + 1 : 1,
      weeklyProgress: percentage,
      previousWins,
    };
  }

  return {
    totalScreamsThisWeek: entry.screamCount,
    currentRank: entry.rank,
    pointsToNextRank: calculatePointsToNextRank(entry.screamCount, leaderboard),
    weeklyProgress: percentage,
    previousWins,
  };
};

// Generate mock leaderboard data for demo
export const generateMockLeaderboard = (): LeaderboardEntry[] => {
  const { start, end } = getCurrentWeekDates();

  const mockStreamers = [
    { id: 'user_1', name: 'StreamerKing', screams: 247, amount: 1235 },
    { id: 'user_2', name: 'GamerGirl99', screams: 189, amount: 945 },
    { id: 'user_3', name: 'ProPlayer', screams: 156, amount: 780 },
    { id: 'user_4', name: 'ContentCreator', screams: 98, amount: 490 },
    { id: 'user_5', name: 'LiveStreamer', screams: 67, amount: 335 },
    { id: 'user_6', name: 'CasualGamer', screams: 45, amount: 225 },
    { id: 'user_7', name: 'MusicLive', screams: 32, amount: 160 },
    { id: 'user_8', name: 'TalkShow', screams: 28, amount: 140 },
    { id: 'user_9', name: 'ArtStream', screams: 21, amount: 105 },
    { id: 'user_10', name: 'NewStreamer', screams: 12, amount: 60 },
  ];

  return mockStreamers.map((streamer, index) => ({
    streamerId: streamer.id,
    streamerName: streamer.name,
    screamCount: streamer.screams,
    totalAmount: streamer.amount,
    rank: index + 1,
    weekStart: start,
    weekEnd: end,
  }));
};

// Award prize to weekly winner
export const awardWeeklyPrize = async (winner: LeaderboardEntry): Promise<boolean> => {
  // In production, this would:
  // 1. Credit the winner's account with a free month of Professional tier
  // 2. Send notification email
  // 3. Update leaderboard record as awarded
  // 4. Post to social media / announcement channel

  console.log(`Awarding prize to ${winner.streamerName}:`, LEADERBOARD_PRIZE);

  // Mock implementation
  return new Promise((resolve) => {
    setTimeout(() => resolve(true), 1000);
  });
};

// Check if leaderboard should reset (called on Sunday midnight)
export const shouldResetLeaderboard = (): boolean => {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const hour = now.getHours();

  // Reset on Sunday at midnight (00:00-00:05 window)
  return dayOfWeek === 0 && hour === 0;
};
