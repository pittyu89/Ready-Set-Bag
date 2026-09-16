// ============================================================================
// LOCAL EMULATOR SEED SCRIPT  (safe: writes ONLY to the local emulator)
// ----------------------------------------------------------------------------
// Hardcodes the emulator hosts so it can NEVER touch production, even by
// accident. Run the emulators first, then:  node scripts/seed_emulator.js
// Roster (teachers + students) comes from scripts/_roster_export.json, a
// read-only snapshot of the real roster, so names/sections match production.
// sessionResults are synthetic sample data for development only.
// ============================================================================
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8081';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';

const admin = require('../functions/node_modules/firebase-admin');
admin.initializeApp({ projectId: 'readysetbag-da917' });
const auth = admin.auth();
const db = admin.firestore();

let roster;
try {
  roster = require('./_roster_export.json');
} catch (e) {
  // No production snapshot on this machine: fall back to a small made-up class so the
  // emulator can still be exercised end to end
  console.warn('No scripts/_roster_export.json found; seeding a small sample roster instead.');
  const sections = [['t_sample_roses', 'Maria', 'Santos', 'G6-Roses'], ['t_sample_tulips', 'Ana', 'Reyes', 'G6-Tulips']];
  roster = {
    teachers: sections.map(([id, firstName, lastName, section]) => ({
      id, firstName, lastName, section, email: `${firstName.toLowerCase()}@school.test`, status: 'active'
    })),
    students: []
  };
  const names = ['Juan Dela Cruz', 'Liza Soberano', 'Paolo Reyes', 'Bea Santos', 'Marco Lim', 'Ella Cruz'];
  sections.forEach(([teacherId, , , section], t) => {
    const code = section.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    names.forEach((name, i) => {
      const [firstName, ...rest] = name.split(' ');
      roster.students.push({
        id: `s_${code}_${i + 1}`, authUid: `u_${code}_${i + 1}`, teacherId, section,
        firstName, lastName: rest.join(' '), displayName: name,
        username: code + String(i + 1).padStart(3, '0'), studentNumber: i + 1
      });
    });
  });
}

// ---- deterministic pseudo-random so re-runs are stable ----
let _seed = 12345;
function rand() { _seed = (_seed * 1103515245 + 12345) & 0x7fffffff; return _seed / 0x7fffffff; }
function randInt(min, max) { return Math.floor(rand() * (max - min + 1)) + min; }
function pick(arr) { return arr[Math.floor(rand() * arr.length)]; }

const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'];
const now = Date.now();

function stageForScore(score) {
  if (score < 60) return 'Cognitive';
  if (score < 82) return 'Associative';
  return 'Autonomous';
}

async function upsertAuthUser({ uid, email, password }) {
  if (!email) return;
  try { await auth.getUser(uid); await auth.updateUser(uid, { email, password }); }
  catch { try { await auth.createUser({ uid, email, password }); } catch (e) { /* email may already exist under another uid */ } }
}

async function main() {
  const batchDeletes = ['sessionResults', 'sessions', 'accountSecrets'];
  for (const c of batchDeletes) {
    const snap = await db.collection(c).get();
    const b = db.batch();
    snap.forEach(d => b.delete(d.ref));
    await b.commit();
  }

  // ---- Admin login account (matches login.js hardcoded admin) ----
  await upsertAuthUser({ uid: 'admin_local_uid', email: 'admin@readysetbag.local', password: 'Admin@123' });
  await db.collection('admins').doc('admin_local_uid').set({ role: 'admin', createdAt: admin.firestore.FieldValue.serverTimestamp() });

  // ---- Teachers (auth + docs) ----
  // Passwords go only into the admin-only accountSecrets vault, as the dashboard does
  const FieldValue = admin.firestore.FieldValue;
  for (const t of roster.teachers) {
    const password = t.password || 'TempPass123!';
    await upsertAuthUser({ uid: t.id, email: t.email, password });
    await db.collection('teachers').doc(t.id).set({
      uid: t.id,
      firstName: t.firstName || '',
      lastName: t.lastName || '',
      email: t.email || '',
      section: t.section || '',
      status: t.status || 'active',
      password: FieldValue.delete(),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    if (t.email) await db.collection('accountSecrets').doc(t.id).set({ email: t.email, password, role: 'teacher' });
  }

  // ---- Students (auth + docs) ----
  // Same login email the game builds from the username: {username}@readysetbag.local
  for (const s of roster.students) {
    const password = s.password || 'Student@123';
    const authEmail = (s.username || s.id) + '@readysetbag.local';
    if (s.authUid) {
      await upsertAuthUser({ uid: s.authUid, email: authEmail, password });
      await db.collection('accountSecrets').doc(s.authUid).set({ email: authEmail, password, role: 'student' });
    }
    await db.collection('students').doc(s.id).set({
      authUid: s.authUid || '',
      teacherId: s.teacherId || '',
      section: s.section || '',
      firstName: s.firstName || '',
      lastName: s.lastName || '',
      displayName: s.displayName || `${s.firstName || ''} ${s.lastName || ''}`.trim(),
      username: s.username || '',
      authEmail,
      studentNumber: s.studentNumber || 0,
      password: FieldValue.delete(),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  }

  // ---- Sessions (a few per teacher) ----
  // Every teacher gets at least one session per difficulty. The dashboards no
  // longer offer an "all levels" option — the level filter always picks one
  // specific difficulty — so a teacher whose sessions happened to skip a
  // level would show an empty leaderboard/reports by default, which reads
  // exactly like "this teacher has no students."
  const teacherIds = roster.teachers.map(t => t.id);
  const sessionByTeacher = {};
  for (const t of roster.teachers) {
    sessionByTeacher[t.id] = [];
    const extra = randInt(0, 1);
    const diffsForTeacher = DIFFICULTIES.concat(
      Array.from({ length: extra }, () => pick(DIFFICULTIES))
    );
    for (let i = 0; i < diffsForTeacher.length; i++) {
      const code = Array.from({ length: 5 }, () => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[randInt(0, 29)]).join('');
      const createdAt = new Date(now - randInt(1, 20) * 86400000);
      const sessionDiff = diffsForTeacher[i];
      const ref = await db.collection('sessions').add({
        sessionCode: code,
        teacherId: t.id,
        difficulty: sessionDiff,
        playersJoined: randInt(3, 8),
        playersList: [],
        status: 'ended',
        createdAt: admin.firestore.Timestamp.fromDate(createdAt),
        startedAt: admin.firestore.Timestamp.fromDate(createdAt),
        endedAt: admin.firestore.Timestamp.fromDate(new Date(createdAt.getTime() + 20 * 60000)),
        updatedAt: admin.firestore.Timestamp.fromDate(createdAt)
      });
      sessionByTeacher[t.id].push({ id: ref.id, code, diff: sessionDiff });
    }
  }

  // ---- sessionResults (synthetic, realistic) ----
  // Leave a portion of students with NO results so completion rate < 100%.
  let resultCount = 0;
  const students = roster.students.slice();
  // Round-robin through a teacher's sessions instead of picking one at random
  // per result. A random pick can clump by chance and leave a session (and
  // therefore a whole difficulty) with zero results for that teacher; a
  // counter guarantees every session gets its share.
  const sessionCursor = {};
  for (let idx = 0; idx < students.length; idx++) {
    const s = students[idx];
    // ~15% of students have not played yet
    if (rand() < 0.15) continue;
    const teacherSessions = sessionByTeacher[s.teacherId] || [];
    if (!teacherSessions.length) continue;
    if (sessionCursor[s.teacherId] === undefined) sessionCursor[s.teacherId] = 0;

    const runs = randInt(1, 3);
    for (let r = 0; r < runs; r++) {
      // base ability per student (some students consistently need support)
      const ability = 45 + ((idx * 7) % 50); // 45..94 spread
      // Real scores come from 20 quiz questions worth 5 points each, so they
      // are always multiples of 5 — keep test data the same shape.
      const score = Math.max(30, Math.min(100, Math.round((ability + randInt(-12, 12)) / 5) * 5));
      const essentialsMax = 15;
      const essentials = Math.max(0, Math.min(essentialsMax, Math.round((score / 100) * essentialsMax + randInt(-2, 1))));
      const errors = Math.max(0, Math.round((100 - score) / 12) + randInt(0, 2));
      const completionTime = randInt(90, 300);
      const sess = teacherSessions[sessionCursor[s.teacherId] % teacherSessions.length];
      sessionCursor[s.teacherId]++;
      const createdAt = new Date(now - randInt(0, 18) * 86400000 - randInt(0, 20) * 3600000);
      await db.collection('sessionResults').add({
        sessionId: sess.id,
        sessionCode: sess.code,
        teacherId: s.teacherId,
        studentId: s.id,
        studentUid: s.authUid || '',
        studentName: s.displayName || `${s.firstName} ${s.lastName}`,
        section: s.section,
        score,
        completionTime,
        attempts: r + 1,
        stage: stageForScore(score),
        essentials,
        essentialsMax,
        errors,
        // Must match the session's own difficulty — a random level per result
        // scatters each student's runs across levels, which makes the
        // per-student averaging impossible to observe under a level filter.
        difficulty: sess.diff,
        createdAt: admin.firestore.Timestamp.fromDate(createdAt),
        updatedAt: admin.firestore.Timestamp.fromDate(createdAt)
      });
      resultCount++;
    }
  }

  console.log('Seed complete (EMULATOR ONLY):');
  console.log(`  admins: 1  |  teachers: ${roster.teachers.length}  |  students: ${roster.students.length}`);
  console.log(`  sessions: ${Object.values(sessionByTeacher).reduce((a, x) => a + x.length, 0)}  |  sessionResults: ${resultCount}`);
  console.log('\nLogins (emulator):');
  console.log('  Admin   -> username: admin / password: Admin@123');
  for (const t of roster.teachers) {
    console.log(`  Teacher -> ${t.email} / ${t.password || 'TempPass123!'}  (${t.section})`);
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
