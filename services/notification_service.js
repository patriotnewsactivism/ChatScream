const notificationPreferences = require('../notification_preferences.js');
const { getCurrentAuthUser } = require('../server/auth');

// Existing notification service code...

// New ML-powered notification logic
exports.sendPersonalizedNotification = async (userId, eventType, eventData) => {
  const userPrefs = await notificationPreferences.getPreferences(userId);

  // Check if user has opted out or disabled this notification type
  if (userPrefs.optOutAll || userPrefs[eventType]?.disabled) {
    return { success: false, reason: 'user_opted_out' };
  }

  // Analyze user behavior for personalization
  const behaviorScore = await analyzeUserBehavior(userId, eventType);

  // Create personalized notification content
  const personalizedContent = generatePersonalizedContent(eventType, eventData, behaviorScore);

  // Send notification through appropriate channel
  return sendNotification(userPrefs.preferredChannel, personalizedContent);
};

// Helper functions
async function analyzeUserBehavior(userId, eventType) {
  // Integrate with ML model to analyze user behavior
  // This would call the actual ML service in production
  return Math.random(); // Mock implementation
}

function generatePersonalizedContent(eventType, eventData, behaviorScore) {
  // Generate content based on event type and user behavior
  // ...
  return {
    title: `Personalized ${eventType} Notification`,
    body: `Based on your recent activity, we thought you'd like this: ${eventData}`
  };
}

// Integration with leaderboard and donation APIs
exports.notifyLeaderboardUpdate = async (userId, position) => {
  const userPrefs = await notificationPreferences.getPreferences(userId);
  if (userPrefs.leaderboardUpdates?.enabled) {
    await sendNotification(userPrefs.preferredChannel, {
      title: 'Leaderboard Update',
      body: `You are now #${position} on the leaderboard!`
    });
  }
};

exports.notifyDonationReceived = async (userId, amount) => {
  const userPrefs = await notificationPreferences.getPreferences(userId);
  if (userPrefs.donationNotifications?.enabled) {
    await sendNotification(userPrefs.preferredChannel, {
      title: 'New Donation Received',
      body: `You received a $${amount} donation!`
    });
  }
};