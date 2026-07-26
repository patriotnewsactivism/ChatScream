// notification_preferences.js
// Handles user notification preferences with proper authorization checks.
// NOTE: All functions now enforce that the requesting user is either the target user
// or has an admin role. This prevents privilege escalation where a user could
// read or modify another user's preferences.

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

/**
 * Retrieves the preferences for a specific user.
 * @param {string} userId - The ID of the user whose preferences are requested.
 * @returns {Promise<Object>} The merged preferences object.
 * @throws {Error} If the requester is not authorized.
 */
exports.getPreferences = async (userId) => {
  const currentUser = await getCurrentAuthUser();
  if (!currentUser) throw new Error('Unauthorized');

  // Only the user themselves or an admin can access preferences.
  if (currentUser.id !== userId && currentUser.role !== 'admin') {
    throw new Error('Forbidden');
  }

  const prefs = await db.notificationPreferences.findUnique({
    where: { userId }
  });

  return { ...exports.DEFAULT_PREFERENCES, ...prefs?.preferences };
};

/**
 * Updates the preferences for a specific user.
 * @param {string} userId - The ID of the user whose preferences are updated.
 * @param {Object} updates - Partial preferences to merge.
 * @returns {Promise<Object>} The updated record.
 * @throws {Error} If the requester is not authorized.
 */
exports.updatePreferences = async (userId, updates) => {
  const currentUser = await getCurrentAuthUser();
  if (!currentUser) throw new Error('Unauthorized');

  if (currentUser.id !== userId && currentUser.role !== 'admin') {
    throw new Error('Forbidden');
  }

  return db.notificationPreferences.upsert({
    where: { userId },
    update: { preferences: updates },
    create: {
      userId,
      preferences: updates
    }
  });
};

/**
 * Resets preferences for a user to defaults.
 * @param {string} userId - The ID of the user.
 * @returns {Promise<Object>} The deleted record.
 * @throws {Error} If the requester is not authorized.
 */
exports.resetToDefaults = async (userId) => {
  const currentUser = await getCurrentAuthUser();
  if (!currentUser) throw new Error('Unauthorized');

  if (currentUser.id !== userId && currentUser.role !== 'admin') {
    throw new Error('Forbidden');
  }

  return db.notificationPreferences.delete({
    where: { userId }
  });
};