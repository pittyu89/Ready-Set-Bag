// scripts/updateFirestore.js
// Safe helper to create sample documents described in FIRESTORE_SETUP_GUIDE.md
// - Requires a Firebase service account JSON key
// - Will only create documents if they do not already exist (no overwrites)

const admin = require('firebase-admin');

async function main() {
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || process.argv[2];
  if (!keyPath) {
    console.error('Error: set GOOGLE_APPLICATION_CREDENTIALS or pass path to service account JSON as first arg.');
    console.error('Usage: node scripts/updateFirestore.js path/to/serviceAccount.json');
    process.exit(1);
  }

  try {
    const serviceAccount = require(keyPath);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } catch (err) {
    console.error('Failed to initialize firebase-admin:', err.message || err);
    process.exit(1);
  }

  const db = admin.firestore();
  const now = admin.firestore.FieldValue.serverTimestamp();

  const samples = {
    teachers: [
      {
        uid: 'teacher_001_uid',
        firstName: 'Maria',
        lastName: 'Santos',
        email: 'maria.santos@school.edu',
        section: 'Grade 6 – Sampaguita',
        password: 'TempPass123!',
        status: 'active'
      }
    ],
    students: [
      {
        authUid: 'student_001_auth',
        teacherId: 'teacher_001_uid',
        section: 'Grade 6 – Sampaguita',
        firstName: 'Juan',
        lastName: 'Dela Cruz',
        displayName: 'Juan Dela Cruz',
        username: 'G6SAMPAGUITA001',
        studentNumber: 1,
        password: 'Student@123'
      }
    ],
    sessions: [
      {
        sessionCode: 'ABC12',
        teacherId: 'teacher_001_uid',
        difficulty: 'beginner',
        playersList: ['student_001_uid', 'student_002_uid'],
        status: 'active'
      }
    ],
    sessionResults: [
      {
        sessionId: 'session_001_id',
        sessionCode: 'ABC12',
        teacherId: 'teacher_001_uid',
        studentId: 'student_001_id',
        studentName: 'Juan Dela Cruz',
        section: 'Grade 6 – Sampaguita',
        score: 85,
        completionTime: 150,
        attempts: 1,
        stage: 'Associative',
        essentials: 12,
        essentialsMax: 15,
        errors: 2,
        difficulty: 'beginner'
      }
    ]
  };

  const summary = { created: [], skipped: [], errors: [] };

  // Teachers: use UID as document ID
  for (const t of samples.teachers) {
    try {
      const ref = db.collection('teachers').doc(t.uid);
      const snap = await ref.get();
      if (snap.exists) {
        console.log(`teachers:${t.uid} exists — skipping`);
        summary.skipped.push(`teachers/${t.uid}`);
      } else {
        await ref.set({ ...t, createdAt: now, updatedAt: now });
        console.log(`teachers:${t.uid} created`);
        summary.created.push(`teachers/${t.uid}`);
      }
    } catch (err) {
      console.error('Error writing teacher', t.uid, err.message || err);
      summary.errors.push({ path: `teachers/${t.uid}`, err: String(err) });
    }
  }

  // Students: avoid duplicates by username or authUid
  for (const s of samples.students) {
    try {
      const col = db.collection('students');
      let exists = false;
      if (s.authUid) {
        const q = await col.where('authUid', '==', s.authUid).limit(1).get();
        if (!q.empty) exists = true;
      }
      if (!exists && s.username) {
        const q2 = await col.where('username', '==', s.username).limit(1).get();
        if (!q2.empty) exists = true;
      }
      if (exists) {
        console.log(`students:${s.username || s.authUid} exists — skipping`);
        summary.skipped.push(`students:${s.username || s.authUid}`);
      } else {
        await db.collection('students').add({ ...s, createdAt: now, updatedAt: now });
        console.log(`students:${s.username || s.authUid} created`);
        summary.created.push(`students:${s.username || s.authUid}`);
      }
    } catch (err) {
      console.error('Error writing student', s.username || s.authUid, err.message || err);
      summary.errors.push({ path: `students:${s.username || s.authUid}`, err: String(err) });
    }
  }

  // Sessions: unique by sessionCode
  for (const sess of samples.sessions) {
    try {
      const q = await db.collection('sessions').where('sessionCode', '==', sess.sessionCode).limit(1).get();
      if (!q.empty) {
        console.log(`sessions:${sess.sessionCode} exists — skipping`);
        summary.skipped.push(`sessions:${sess.sessionCode}`);
      } else {
        await db.collection('sessions').add({ ...sess, createdAt: now, updatedAt: now });
        console.log(`sessions:${sess.sessionCode} created`);
        summary.created.push(`sessions:${sess.sessionCode}`);
      }
    } catch (err) {
      console.error('Error writing session', sess.sessionCode, err.message || err);
      summary.errors.push({ path: `sessions/${sess.sessionCode}`, err: String(err) });
    }
  }

  // SessionResults: unique by (sessionId, studentId)
  for (const r of samples.sessionResults) {
    try {
      let exists = false;
      if (r.sessionId && r.studentId) {
        const q = await db.collection('sessionResults')
          .where('sessionId', '==', r.sessionId)
          .where('studentId', '==', r.studentId)
          .limit(1)
          .get();
        if (!q.empty) exists = true;
      }
      if (exists) {
        console.log(`sessionResults:${r.sessionId}/${r.studentId} exists — skipping`);
        summary.skipped.push(`sessionResults:${r.sessionId}/${r.studentId}`);
      } else {
        await db.collection('sessionResults').add({ ...r, createdAt: now, updatedAt: now });
        console.log(`sessionResults:${r.sessionId}/${r.studentId} created`);
        summary.created.push(`sessionResults:${r.sessionId}/${r.studentId}`);
      }
    } catch (err) {
      console.error('Error writing sessionResult', r.sessionId, r.studentId, err.message || err);
      summary.errors.push({ path: `sessionResults:${r.sessionId}/${r.studentId}`, err: String(err) });
    }
  }

  console.log('\nSummary:');
  console.log('Created:', summary.created.length, summary.created);
  console.log('Skipped:', summary.skipped.length, summary.skipped);
  console.log('Errors:', summary.errors.length, summary.errors);

  process.exit(0);
}

main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
