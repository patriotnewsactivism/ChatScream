/**
 * ChatScream - Firestore Database Initialization
 * Copyright 2025. Based out of Houston TX.
 *
 * This script initializes the Firestore database with required collections
 * and seed data for testing.
 *
 * Usage: node init-firestore.js
 *
 * Required: Set GOOGLE_APPLICATION_CREDENTIALS environment variable
 * to your service account key file path.
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = process.env.GOOGLE_APPLICATION_CREDENTIALS
  ? require(process.env.GOOGLE_APPLICATION_CREDENTIALS)
  : null;

if (serviceAccount) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
} else {
  // Use default credentials (for Cloud environment)
  admin.initializeApp();
}

const db = admin.firestore();

// Seed data for testing
const seedData = {
  // Partner accounts (affiliates with special rates)
  partners: {
    'mythical-meta': {
      name: 'Mythical Meta',
      email: 'contact@mythicalmeta.com',
      affiliateCode: 'MMM',
      commissionRate: 0.40, // 40%
      bonusTrialDays: 7,
      totalEarnings: 0,
      pendingPayout: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      isActive: true,
    },
  },

  // Affiliate codes
  affiliates: {
    MMM: {
      code: 'MMM',
      ownerId: 'mythical-meta',
      ownerEmail: 'contact@mythicalmeta.com',
      ownerName: 'Mythical Meta',
      commissionRate: 0.40,
      bonusTrialDays: 7,
      totalReferrals: 0,
      totalEarnings: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      isActive: true,
    },
  },

  // Scream tier configuration
  config: {
    scream_tiers: {
      standard: { min: 5, max: 9.99, description: 'Standard Scream' },
      loud: { min: 10, max: 49.99, description: 'LOUD Scream' },
      maximum: { min: 50, max: null, description: 'MAXIMUM SCREAM!!!' },
    },
    leaderboard: {
      prizeValue: 59,
      prizeDescription: 'Free month of Professional tier',
      weeklyResetDay: 0, // Sunday
      weeklyResetTime: '00:00:00',
      timezone: 'America/New_York',
    },
    subscription_plans: {
      starter: {
        name: 'Starter',
        price: 19,
        features: [
          '2 Simultaneous Destinations',
          '720p Streaming',
          '5 Custom Overlays',
          'Basic Chat Screamer',
          'Email Support',
        ],
      },
      creator: {
        name: 'Creator',
        price: 39,
        features: [
          '5 Simultaneous Destinations',
          '1080p Streaming',
          '20 Custom Overlays',
          'Full Chat Screamer',
          'Priority Support',
          'Stream Analytics',
        ],
      },
      professional: {
        name: 'Professional',
        price: 59,
        features: [
          'Unlimited Destinations',
          '4K Streaming',
          'Unlimited Overlays',
          'Premium Chat Screamer',
          'Leaderboard Badge',
          '24/7 Support',
          'API Access',
        ],
      },
    },
  },
};

async function initializeDatabase() {
  console.log('========================================');
  console.log('  ChatScream - Database Initialization');
  console.log('  Copyright 2025. Houston, TX');
  console.log('========================================\n');

  try {
    // Create partners collection
    console.log('[1/4] Creating partners collection...');
    for (const [id, data] of Object.entries(seedData.partners)) {
      await db.collection('partners').doc(id).set(data);
      console.log(`  - Created partner: ${data.name}`);
    }

    // Create affiliates collection
    console.log('[2/4] Creating affiliates collection...');
    for (const [id, data] of Object.entries(seedData.affiliates)) {
      await db.collection('affiliates').doc(id).set(data);
      console.log(`  - Created affiliate code: ${data.code}`);
    }

    // Create config collection
    console.log('[3/4] Creating config collection...');
    for (const [id, data] of Object.entries(seedData.config)) {
      await db.collection('config').doc(id).set(data);
      console.log(`  - Created config: ${id}`);
    }

    // Create initial leaderboard for current week
    console.log('[4/4] Creating initial leaderboard...');
    const weekId = getCurrentWeekId();
    await db.collection('scream_leaderboard').doc(weekId).set({
      weekId,
      weekStart: getWeekStart(),
      weekEnd: getWeekEnd(),
      prizeAwarded: false,
      prizeValue: 59,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`  - Created leaderboard for week: ${weekId}`);

    console.log('\n========================================');
    console.log('  Database Initialization Complete!');
    console.log('========================================\n');

    console.log('Collections created:');
    console.log('  - partners');
    console.log('  - affiliates');
    console.log('  - config');
    console.log('  - scream_leaderboard');
    console.log('\nThe following collections will be created dynamically:');
    console.log('  - users (on user signup)');
    console.log('  - screams (on donations)');
    console.log('  - scream_alerts (on donations)');
    console.log('  - referrals (on referral signups)');
    console.log('  - affiliate_commissions (on paid invoices)');
    console.log('  - notifications (on events)');
    console.log('  - stream_sessions (on stream start)');
  } catch (error) {
    console.error('Error initializing database:', error);
    process.exit(1);
  }
}

function getCurrentWeekId() {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const days = Math.floor((now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
  const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${weekNumber.toString().padStart(2, '0')}`;
}

function getWeekStart() {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day;
  const sunday = new Date(now.setDate(diff));
  sunday.setHours(0, 0, 0, 0);
  return admin.firestore.Timestamp.fromDate(sunday);
}

function getWeekEnd() {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + 6;
  const saturday = new Date(now.setDate(diff));
  saturday.setHours(23, 59, 59, 999);
  return admin.firestore.Timestamp.fromDate(saturday);
}

// Run initialization
initializeDatabase()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
