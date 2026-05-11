const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

exports.applySamples = functions.https.onRequest(async (req, res) => {
  const cfg = functions.config();
  const secret = cfg.updater && cfg.updater.secret;
  const provided = req.get('x-update-secret') || req.query.secret;
  if (!secret || provided !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
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

  try {
    // Teachers
    for (const t of samples.teachers) {
      const ref = db.collection('teachers').doc(t.uid);
      const snap = await ref.get();
      if (snap.exists) {
        summary.skipped.push(`teachers/${t.uid}`);
      } else {
        await ref.set({ ...t, createdAt: now, updatedAt: now });
        summary.created.push(`teachers/${t.uid}`);
      }
    }

    // Students
    for (const s of samples.students) {
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
        summary.skipped.push(`students:${s.username || s.authUid}`);
      } else {
        await col.add({ ...s, createdAt: now, updatedAt: now });
        summary.created.push(`students:${s.username || s.authUid}`);
      }
    }

    // Sessions
    for (const sess of samples.sessions) {
      const q = await db.collection('sessions').where('sessionCode', '==', sess.sessionCode).limit(1).get();
      if (!q.empty) {
        summary.skipped.push(`sessions/${sess.sessionCode}`);
      } else {
        await db.collection('sessions').add({ ...sess, createdAt: now, updatedAt: now });
        summary.created.push(`sessions/${sess.sessionCode}`);
      }
    }

    // SessionResults
    for (const r of samples.sessionResults) {
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
        summary.skipped.push(`sessionResults:${r.sessionId}/${r.studentId}`);
      } else {
        await db.collection('sessionResults').add({ ...r, createdAt: now, updatedAt: now });
        summary.created.push(`sessionResults:${r.sessionId}/${r.studentId}`);
      }
    }

    return res.json({ ok: true, summary });
  } catch (err) {
    console.error('applySamples error', err);
    return res.status(500).json({ error: String(err), summary });
  }
});
