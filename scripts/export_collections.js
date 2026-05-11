/*
  Exports specified collections to JSON files using a service account.
  Usage:
    1) Place serviceAccountKey.json in scripts/
    2) node scripts/export_collections.js teachers students sessions
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

const collections = process.argv.slice(2);
if (!collections.length) {
  console.error('Usage: node export_collections.js <collection1> <collection2> ...');
  process.exit(1);
}

(async () => {
  try {
    for (const name of collections) {
      const all = [];
      const snap = await db.collection(name).get();
      snap.forEach(d => all.push({ id: d.id, data: d.data() }));
      const out = JSON.stringify(all, null, 2);
      fs.writeFileSync(`${name}.json`, out);
      console.log(`Exported ${name}: ${all.length} documents -> ${name}.json`);
    }
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
})();
