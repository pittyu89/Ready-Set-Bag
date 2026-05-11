Quick Firebase CLI steps - deploy rules & indexes, create admin doc, export collections

Prereqs
- Node.js installed
- Firebase CLI installed: `npm install -g firebase-tools`
- A Firebase project (you already have `readysetbag-da917`)
- Service account JSON (for admin scripts): Console → Project Settings → Service accounts → Generate new private key

1) Install dependencies in repo (scripts use `firebase-admin`)

```bash
cd "d:\ORIGINAL READYSETBAG\Ready-Set-Bag"
npm init -y
npm install firebase-admin
```

2) Deploy Firestore rules from `firestore.rules`

```bash
# login to Firebase
firebase login
# select project (or set with --project)
firebase use --add
# deploy rules only
firebase deploy --only firestore:rules
```

3) Deploy Firestore indexes from `firestore.indexes.json`

```bash
# deploy indexes
firebase deploy --only firestore:indexes
```

4) Create an admin document (so rules detect admin users)
- Put your service account JSON at `scripts/serviceAccountKey.json` (DO NOT commit it to git)
- Run (replace <ADMIN_UID> with your admin's Firebase Auth UID):

```bash
node scripts/set_admin_doc.js <ADMIN_UID>
```

5) Export collections for backup (optional)

```bash
# example: export teachers, students, sessions
node scripts/export_collections.js teachers students sessions
```

Notes
- The `scripts/` utilities use the Admin SDK and require a service account key.
- Deploying indexes may take several minutes; monitor the Console → Firestore → Indexes for status.
- If you prefer custom claims instead of the `admins` collection, set `admin:true` using the Admin SDK and I can provide alternate rules.
- Never commit `serviceAccountKey.json` to source control. Add it to `.gitignore` if needed.
