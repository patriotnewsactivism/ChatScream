/**
 * ChatScream - Role Assignment Script
 * Grants beta tester and admin permissions via Firebase custom claims
 * and mirrors them onto Firestore user documents.
 *
 * Usage: Set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON and run:
 *   node assign-roles.js
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

const betaTesterEmails = ['leroytruth247@gmail.com'];
const adminEmails = ['mreardon@wtpnews.org'];

(async () => {
  try {
    for (const email of adminEmails) {
      const userRecord = await admin.auth().getUserByEmail(email);
      const claims = userRecord.customClaims || {};
      await admin.auth().setCustomUserClaims(userRecord.uid, {
        ...claims,
        role: 'admin',
        betaTester: true,
      });

      await db.collection('users').doc(userRecord.uid).set(
        {
          role: 'admin',
          betaTester: true,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      console.log(`Granted admin + beta permissions to ${email}`);
    }

    for (const email of betaTesterEmails) {
      const userRecord = await admin.auth().getUserByEmail(email);
      const claims = userRecord.customClaims || {};
      await admin.auth().setCustomUserClaims(userRecord.uid, {
        ...claims,
        role: claims.role || 'beta_tester',
        betaTester: true,
      });

      await db.collection('users').doc(userRecord.uid).set(
        {
          role: claims.role || 'beta_tester',
          betaTester: true,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      console.log(`Granted beta permissions to ${email}`);
    }

    console.log('Role assignment complete.');
  } catch (error) {
    console.error('Failed to assign roles:', error.message);
    process.exit(1);
  }
})();
