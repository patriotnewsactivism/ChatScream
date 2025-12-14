/**
 * ChatScream - Access List Setup Script
 *
 * Writes `config/access` with `admins` and `betaTesters` email allowlists.
 * Use this to pre-register beta testers BEFORE they create accounts, so
 * `accessOnUserCreate` can auto-assign claims and upgrade plans.
 *
 * Usage:
 *   export GOOGLE_APPLICATION_CREDENTIALS="/path/to/serviceAccount.json"
 *   ADMIN_EMAILS="mreardon@wtpnews.org" \
 *   BETA_TESTER_EMAILS="leroytruth247@gmail.com,jess@example.com" \
 *   node set-access-list.js
 */

const admin = require('firebase-admin');

const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (serviceAccountPath) {
  admin.initializeApp({
    credential: admin.credential.cert(require(serviceAccountPath)),
  });
} else {
  admin.initializeApp();
}

const db = admin.firestore();

const parseEmailList = (value) => {
  if (!value) return [];
  return String(value)
    .split(/[,\n]/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
};

const unique = (emails) => Array.from(new Set(parseEmailList(emails)));

const admins = unique(process.env.ADMIN_EMAILS || 'mreardon@wtpnews.org').slice(0, 200);
const betaTesters = unique(process.env.BETA_TESTER_EMAILS || 'leroytruth247@gmail.com').slice(0, 500);

(async () => {
  try {
    await db.collection('config').doc('access').set(
      {
        admins,
        betaTesters,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    console.log('Updated config/access');
    console.log(`Admins: ${admins.length}`);
    console.log(`Beta testers: ${betaTesters.length}`);
  } catch (error) {
    console.error('Failed to set access list:', error.message);
    process.exit(1);
  }
})();

