const { getCurrentAuthUser } = require('../server/auth');
const { db } = require('../server/db');

// Default preferences structure
exports.DEFAULT_PREFERENCES = {
  optOutAll: false,
  preferredChannel: 'email',
  leaderboardUpdates: {
    enabled: true,
    frequency: 'daily'
  },
  donationNotifications: {
    enabled: true,
    minAmount: 5
  },
  // Other notification types...
};

// Get user preferences with fallback to defaults
exports.getPreferences = async (userId) => {
  const user = await getCurrentAuthUser();
  if (!user) throw new Error('Unauthorized');

  const prefs = await db.notificationPreferences.findUnique({
    where: { userId }
  });

  return { ...exports.DEFAULT_PREFERENCES, ...prefs?.preferences };
};

// Update user preferences
exports.updatePreferences = async (userId, updates) => {
  const user = await getCurrentAuthUser();
  if (!user) throw new Error('Unauthorized');

  return db.notificationPreferences.upsert({
    where: { userId },
    update: { preferences: updates },
    create: {
      userId,
      preferences: updates
    }
  });
};

// Reset to defaults
exports.resetToDefaults = async (userId) => {
  const user = await getCurrentAuthUser();
  if (!user) throw new Error('Unauthorized');

  return db.notificationPreferences.delete({
    where: { userId }
  });
};