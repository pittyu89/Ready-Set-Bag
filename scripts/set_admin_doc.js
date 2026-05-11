/*
  Usage: place a Firebase service account JSON at scripts/serviceAccountKey.json
  then run:
    node scripts/set_admin_doc.js <ADMIN_UID>
  This creates /admins/<ADMIN_UID> with createdAt timestamp.
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

const uid = process.argv[2];
if (!uid) {
  console.error('Usage: node set_admin_doc.js <ADMIN_UID>');
  process.exit(1);
}

(async () => {
  try {
    const ref = db.collection('admins').doc(uid);
    await ref.set({ createdAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    console.log('Created/updated admins/' + uid);
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
})();
