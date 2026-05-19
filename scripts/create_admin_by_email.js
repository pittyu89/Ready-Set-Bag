/*
  Usage: place a Firebase service account JSON at scripts/serviceAccountKey.json
  then run:
    node scripts/create_admin_by_email.js <ADMIN_EMAIL>

  This finds the Firebase Auth user by email, then creates /admins/<UID>
  with a createdAt server timestamp so the client-side rules consider
  that user an admin.
*/

const admin = require('firebase-admin');
const fs = require('fs');

const svcPath = __dirname + '/serviceAccountKey.json';
if (!fs.existsSync(svcPath)) {
  console.error('Missing serviceAccountKey.json in scripts/ - get this from Firebase Console (Service accounts).');
  process.exit(1);
}

const svc = require(svcPath);
admin.initializeApp({ credential: admin.credential.cert(svc) });
const db = admin.firestore();

const email = process.argv[2];
if (!email) {
  console.error('Usage: node create_admin_by_email.js <ADMIN_EMAIL>');
  process.exit(1);
}

(async () => {
  try {
    // Look up the user by email
    const userRecord = await admin.auth().getUserByEmail(email);
    const uid = userRecord.uid;

    const ref = db.collection('admins').doc(uid);
    await ref.set({ createdAt: admin.firestore.FieldValue.serverTimestamp(), email: email }, { merge: true });
    console.log(`Created/updated admins/${uid} for ${email}`);
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message || err);
    process.exit(1);
  }
})();
