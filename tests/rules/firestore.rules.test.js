// Firestore security rules tests.
//
//   cd tests/rules && npm install && npm test
//
// "npm test" starts the Firestore emulator under a demo project id, so these tests can never
// touch the real database.
const { test, before, after, beforeEach } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const {
  initializeTestEnvironment, assertSucceeds, assertFails
} = require('@firebase/rules-unit-testing');
const {
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, getDocs,
  arrayUnion, serverTimestamp, Timestamp, deleteField
} = require('firebase/firestore');

let env;

const TEACHER = 't1';
const OTHER_TEACHER = 't2';
const STUDENT_UID = 'u1';
const OTHER_STUDENT_UID = 'u2';

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-readysetbag',
    firestore: {
      rules: fs.readFileSync(path.join(__dirname, '..', '..', 'firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8081
    }
  });
});

after(async () => { await env.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'admins/admin1'), { role: 'admin' });
    await setDoc(doc(db, 'teachers', TEACHER), { uid: TEACHER, firstName: 'Maria', lastName: 'Santos', email: 'm@x.edu', section: 'G6-Roses', status: 'active' });
    await setDoc(doc(db, 'teachers', OTHER_TEACHER), { uid: OTHER_TEACHER, firstName: 'Ana', lastName: 'Reyes', email: 'a@x.edu', section: 'G6-Tulips', status: 'active' });
    await setDoc(doc(db, 'teachers/legacy'), { uid: 'legacy', email: 'l@x.edu', section: 'G6-Lilies', password: 'Old@123' });
    await setDoc(doc(db, 'students/s1'), { authUid: STUDENT_UID, teacherId: TEACHER, section: 'G6-Roses', displayName: 'Juan Dela Cruz', username: 'G6ROSES001' });
    await setDoc(doc(db, 'students/s2'), { authUid: OTHER_STUDENT_UID, teacherId: OTHER_TEACHER, section: 'G6-Tulips', displayName: 'Ben Cruz', username: 'G6TULIPS001' });
    await setDoc(doc(db, 'accountSecrets', STUDENT_UID), { email: 'G6ROSES001@readysetbag.local', password: 'Student@123', role: 'student' });
    await setDoc(doc(db, 'sessions/active1'), { sessionCode: 'ABCDE', teacherId: TEACHER, difficulty: 'beginner', status: 'active', playersList: [] });
    await setDoc(doc(db, 'sessions/waiting1'), { sessionCode: 'WAIT1', teacherId: TEACHER, difficulty: 'beginner', status: 'waiting', playersList: [{ studentId: 's9', username: 'X', uid: 'u9', joinedAt: Timestamp.now() }] });
    await setDoc(doc(db, 'sessions/endedOld'), { sessionCode: 'OLD11', teacherId: TEACHER, difficulty: 'beginner', status: 'ended', endedAt: Timestamp.fromMillis(Date.now() - 60 * 60 * 1000), playersList: [] });
    await setDoc(doc(db, 'sessions/endedJust'), { sessionCode: 'JUST1', teacherId: TEACHER, difficulty: 'beginner', status: 'ended', endedAt: Timestamp.fromMillis(Date.now() - 60 * 1000), playersList: [] });
    await setDoc(doc(db, 'sessionResults/active1_s1'), { sessionId: 'active1', teacherId: TEACHER, studentId: 's1', studentUid: STUDENT_UID, score: 80 });
    await setDoc(doc(db, 'sessionResults/other_s2'), { sessionId: 'other', teacherId: OTHER_TEACHER, studentId: 's2', studentUid: OTHER_STUDENT_UID, score: 70 });
  });
});

const as = (uid) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

function result(overrides = {}) {
  return {
    sessionId: 'endedJust', sessionCode: 'JUST1', teacherId: TEACHER, studentId: 's1', studentUid: STUDENT_UID,
    studentName: 'Juan Dela Cruz', section: 'G6-Roses', score: 85, completionTime: 312, attempts: 1,
    stage: 'Associative', essentials: 11, essentialsMax: 13, errors: 3, difficulty: 'beginner',
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...overrides
  };
}

// ---- passwords and profiles ----------------------------------------------------------

test('only admins can read the password vault', async () => {
  await assertSucceeds(getDoc(doc(as('admin1'), 'accountSecrets', STUDENT_UID)));
  await assertFails(getDoc(doc(as(STUDENT_UID), 'accountSecrets', STUDENT_UID)));
  await assertFails(getDoc(doc(as(TEACHER), 'accountSecrets', STUDENT_UID)));
});

test('teacher profiles are private to the teacher and admins', async () => {
  await assertSucceeds(getDoc(doc(as(TEACHER), 'teachers', TEACHER)));
  await assertFails(getDoc(doc(as(TEACHER), 'teachers', OTHER_TEACHER)));
  await assertFails(getDoc(doc(as(STUDENT_UID), 'teachers', TEACHER)));
  await assertFails(getDocs(collection(as(TEACHER), 'teachers')));
  await assertSucceeds(getDocs(collection(as('admin1'), 'teachers')));
  await assertFails(getDoc(doc(anon(), 'teachers', TEACHER)));
});

test('a password can no longer be written to a profile, but an old one can be removed', async () => {
  const admin = as('admin1');
  await assertFails(setDoc(doc(admin, 'teachers/t3'), { uid: 't3', email: 'x@x.edu', password: 'Secret1!' }));
  await assertSucceeds(setDoc(doc(admin, 'teachers/t3'), { uid: 't3', email: 'x@x.edu' }));
  await assertFails(updateDoc(doc(admin, 'teachers/legacy'), { password: 'New@123' }));
  await assertSucceeds(updateDoc(doc(admin, 'teachers/legacy'), { password: deleteField() }));
  await assertFails(setDoc(doc(admin, 'students/s3'), { authUid: 'u3', password: 'Student@123' }));
});

test('a teacher may only stamp activity times on their own profile', async () => {
  const t = as(TEACHER);
  await assertSucceeds(updateDoc(doc(t, 'teachers', TEACHER), { lastSessionCreatedAt: new Date(), updatedAt: new Date() }));
  await assertFails(updateDoc(doc(t, 'teachers', TEACHER), { section: 'G6-Tulips' }));
  await assertFails(updateDoc(doc(t, 'teachers', OTHER_TEACHER), { updatedAt: new Date() }));
});

test('students: a student sees only themselves, a teacher only their class', async () => {
  await assertSucceeds(getDocs(query(collection(as(STUDENT_UID), 'students'), where('authUid', '==', STUDENT_UID))));
  await assertFails(getDocs(query(collection(as(STUDENT_UID), 'students'), where('username', '==', 'G6ROSES001'))));
  await assertFails(getDoc(doc(as(STUDENT_UID), 'students/s2')));
  await assertSucceeds(getDocs(query(collection(as(TEACHER), 'students'), where('teacherId', '==', TEACHER))));
  await assertFails(getDocs(query(collection(as(TEACHER), 'students'), where('teacherId', '==', OTHER_TEACHER))));
  await assertFails(setDoc(doc(as(TEACHER), 'students/s9'), { authUid: 'u9', teacherId: TEACHER }));
});

test('admins: a user may check their own admin status, nobody else\'s', async () => {
  await assertSucceeds(getDoc(doc(as(STUDENT_UID), 'admins', STUDENT_UID)));
  await assertFails(getDoc(doc(as(STUDENT_UID), 'admins/admin1')));
  await assertFails(setDoc(doc(as(STUDENT_UID), 'admins', STUDENT_UID), { role: 'admin' }));
});

// ---- sessions -----------------------------------------------------------------------

test('only a teacher can open a session, for themselves', async () => {
  const fresh = { sessionCode: 'NEW11', teacherId: TEACHER, difficulty: 'beginner', bagType: 'small', status: 'waiting', playersList: [] };
  await assertSucceeds(setDoc(doc(as(TEACHER), 'sessions/new1'), fresh));
  await assertSucceeds(updateDoc(doc(as(TEACHER), 'sessions/new1'), { bagType: 'medium', updatedAt: new Date() }));
  await assertFails(updateDoc(doc(as(STUDENT_UID), 'sessions/new1'), { bagType: 'standard' }));
  await assertFails(setDoc(doc(as(TEACHER), 'sessions/new2'), { ...fresh, teacherId: OTHER_TEACHER }));
  await assertFails(setDoc(doc(as(STUDENT_UID), 'sessions/new3'), { ...fresh, teacherId: STUDENT_UID }));
});

test('only the owning teacher controls a session', async () => {
  await assertSucceeds(updateDoc(doc(as(TEACHER), 'sessions/waiting1'), { status: 'active', startedAt: new Date() }));
  await assertFails(updateDoc(doc(as(OTHER_TEACHER), 'sessions/active1'), { status: 'ended' }));
  await assertFails(updateDoc(doc(as(STUDENT_UID), 'sessions/active1'), { status: 'ended' }));
});

test('a student can add only themselves to a session', async () => {
  const me = { studentId: 's1', username: 'G6ROSES001', uid: STUDENT_UID, joinedAt: new Date() };
  await assertSucceeds(updateDoc(doc(as(STUDENT_UID), 'sessions/waiting1'), { playersList: arrayUnion(me) }));
  // First player into a brand-new session (empty playersList)
  await env.withSecurityRulesDisabled(async (ctx) => setDoc(doc(ctx.firestore(), 'sessions/empty1'),
    { sessionCode: 'EMPTY', teacherId: TEACHER, difficulty: 'beginner', bagType: 'standard', status: 'waiting', playersList: [], playersJoined: 0, createdAt: new Date(), updatedAt: new Date() }));
  await assertSucceeds(updateDoc(doc(as(STUDENT_UID), 'sessions/empty1'), { playersList: arrayUnion(me) }));
  await assertFails(updateDoc(doc(as(STUDENT_UID), 'sessions/active1'), { playersList: arrayUnion({ ...me, uid: OTHER_STUDENT_UID }) }));
  await assertFails(updateDoc(doc(as(STUDENT_UID), 'sessions/active1'), { playersList: arrayUnion(me), status: 'ended' }));
  await assertFails(updateDoc(doc(as(STUDENT_UID), 'sessions/active1'), { playersList: arrayUnion({ ...me, extra: true }) }));
  // Replacing the list (dropping classmates) is not a join
  await assertFails(updateDoc(doc(as(STUDENT_UID), 'sessions/waiting1'), { playersList: [me] }));
  await assertFails(updateDoc(doc(as(STUDENT_UID), 'sessions/endedOld'), { playersList: arrayUnion(me) }));
});

test('a joining student may add only their own uid to playerUids', async () => {
  const me = { studentId: 's1', username: 'G6ROSES001', uid: STUDENT_UID, joinedAt: new Date() };
  const db = as(STUDENT_UID);
  // The game adds both at once
  await assertSucceeds(updateDoc(doc(db, 'sessions/waiting1'), { playersList: arrayUnion(me), playerUids: arrayUnion(STUDENT_UID) }));
  // Someone else's uid, or playerUids on its own, is not a join
  await assertFails(updateDoc(doc(db, 'sessions/active1'), { playersList: arrayUnion(me), playerUids: arrayUnion(OTHER_STUDENT_UID) }));
  await assertFails(updateDoc(doc(db, 'sessions/active1'), { playerUids: arrayUnion(STUDENT_UID) }));
  // Replacing the list (dropping classmates) is refused
  await env.withSecurityRulesDisabled(async (ctx) => updateDoc(doc(ctx.firestore(), 'sessions/active1'), { playerUids: ['u9'] }));
  await assertFails(updateDoc(doc(db, 'sessions/active1'), { playersList: arrayUnion(me), playerUids: [STUDENT_UID] }));
  // Rejoining when already listed leaves playerUids unchanged
  await assertSucceeds(updateDoc(doc(db, 'sessions/waiting1'), { playersList: arrayUnion({ ...me, joinedAt: new Date(Date.now() + 1000) }), playerUids: arrayUnion(STUDENT_UID) }));
});

// ---- results ------------------------------------------------------------------------

test('a student can submit one valid result for a session', async () => {
  const db = as(STUDENT_UID);
  await assertSucceeds(setDoc(doc(db, 'sessionResults/endedJust_s1'), result()));
  // Second write to the same doc is an update, which students can't do
  await assertFails(setDoc(doc(db, 'sessionResults/endedJust_s1'), result({ score: 100 })));
});

test('results are rejected when they don\'t match the session, the student or the ranges', async () => {
  const db = as(STUDENT_UID);
  await assertFails(setDoc(doc(db, 'sessionResults/endedJust_s2'), result({ studentId: 's2' })));
  await assertFails(setDoc(doc(db, 'sessionResults/endedJust_s1'), result({ studentUid: OTHER_STUDENT_UID })));
  await assertFails(setDoc(doc(db, 'sessionResults/endedJust_s1'), result({ teacherId: OTHER_TEACHER })));
  await assertFails(setDoc(doc(db, 'sessionResults/endedJust_s1'), result({ difficulty: 'advanced' })));
  await assertFails(setDoc(doc(db, 'sessionResults/endedJust_s1'), result({ section: 'G6-Tulips' })));
  await assertFails(setDoc(doc(db, 'sessionResults/endedJust_s1'), result({ score: 150 })));
  await assertFails(setDoc(doc(db, 'sessionResults/endedJust_s1'), result({ score: 85.5 })));
  await assertFails(setDoc(doc(db, 'sessionResults/endedJust_s1'), result({ essentials: 14 })));
  await assertFails(setDoc(doc(db, 'sessionResults/endedJust_s1'), result({ attempts: 2 })));
  await assertFails(setDoc(doc(db, 'sessionResults/endedJust_s1'), result({ stage: 'Expert' })));
  await assertFails(setDoc(doc(db, 'sessionResults/endedJust_s1'), result({ bonus: 5 })));
  await assertFails(setDoc(doc(db, 'sessionResults/endedJust_s1'), result({ createdAt: new Date(2020, 1, 1) })));
  await assertFails(setDoc(doc(db, 'sessionResults/wrongid'), result()));
  // Session ended an hour ago
  await assertFails(setDoc(doc(db, 'sessionResults/endedOld_s1'), result({ sessionId: 'endedOld', sessionCode: 'OLD11' })));
  // Session never started
  await assertFails(setDoc(doc(db, 'sessionResults/waiting1_s1'), result({ sessionId: 'waiting1', sessionCode: 'WAIT1' })));
  await assertFails(setDoc(doc(anon(), 'sessionResults/endedJust_s1'), result()));
});

test('a result may carry the exact time left, within range', async () => {
  const db = as(STUDENT_UID);
  await assertFails(setDoc(doc(db, 'sessionResults/endedJust_s1'), result({ timeLeft: -1 })));
  await assertFails(setDoc(doc(db, 'sessionResults/endedJust_s1'), result({ timeLeft: 9000 })));
  await assertFails(setDoc(doc(db, 'sessionResults/endedJust_s1'), result({ timeLeft: '05:34.45' })));
  await assertSucceeds(setDoc(doc(db, 'sessionResults/endedJust_s1'), result({ timeLeft: 334.45 })));
});

test('results in an active session are accepted', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => deleteDoc(doc(ctx.firestore(), 'sessionResults/active1_s1')));
  await assertSucceeds(setDoc(doc(as(STUDENT_UID), 'sessionResults/active1_s1'),
    result({ sessionId: 'active1', sessionCode: 'ABCDE' })));
});

test('teachers read only their own results; students only their own', async () => {
  const t = as(TEACHER);
  await assertSucceeds(getDocs(query(collection(t, 'sessionResults'), where('teacherId', '==', TEACHER))));
  await assertSucceeds(getDocs(query(collection(t, 'sessionResults'), where('teacherId', '==', TEACHER), where('sessionId', '==', 'active1'))));
  await assertFails(getDocs(query(collection(t, 'sessionResults'), where('sessionId', '==', 'active1'))));
  await assertFails(getDocs(query(collection(t, 'sessionResults'), where('teacherId', '==', OTHER_TEACHER))));
  await assertSucceeds(getDoc(doc(as(STUDENT_UID), 'sessionResults/active1_s1')));
  await assertFails(getDoc(doc(as(STUDENT_UID), 'sessionResults/other_s2')));
  await assertSucceeds(getDocs(collection(as('admin1'), 'sessionResults')));
});

test('students who joined a session can read its leaderboard, nobody else can', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await updateDoc(doc(db, 'sessions/active1'), { playerUids: [STUDENT_UID, 'u3'] });
    await setDoc(doc(db, 'sessionResults/active1_s3'), { sessionId: 'active1', teacherId: TEACHER, studentId: 's3', studentUid: 'u3', score: 90 });
  });
  const leaderboard = (uid) => getDocs(query(collection(as(uid), 'sessionResults'), where('sessionId', '==', 'active1')));
  await assertSucceeds(leaderboard(STUDENT_UID));
  await assertSucceeds(getDoc(doc(as(STUDENT_UID), 'sessionResults/active1_s3')));
  // Not in the session
  await assertFails(leaderboard(OTHER_STUDENT_UID));
  await assertFails(getDoc(doc(as(OTHER_STUDENT_UID), 'sessionResults/active1_s3')));
  // Joining one session doesn't open up another session's results
  await assertFails(getDocs(collection(as(STUDENT_UID), 'sessionResults')));
  await assertFails(getDoc(doc(as(STUDENT_UID), 'sessionResults/other_s2')));
  await assertFails(leaderboard('u9'));
});

// ---- attempts (a drill in progress, for rejoining) ---------------------------------

function attempt(overrides = {}) {
  return {
    sessionId: 'active1', studentId: 's1', studentUid: STUDENT_UID, teacherId: TEACHER,
    status: 'playing', snapshot: '{"timeRemaining":480}',
    startedAt: serverTimestamp(), savedAt: serverTimestamp(), ...overrides
  };
}

test('a student can start their own attempt in a running session only', async () => {
  const db = as(STUDENT_UID);
  await assertFails(setDoc(doc(db, 'sessionAttempts/active1_s2'), attempt({ studentId: 's2' })));
  await assertFails(setDoc(doc(db, 'sessionAttempts/active1_s1'), attempt({ studentUid: OTHER_STUDENT_UID })));
  await assertFails(setDoc(doc(db, 'sessionAttempts/active1_s1'), attempt({ teacherId: OTHER_TEACHER })));
  await assertFails(setDoc(doc(db, 'sessionAttempts/active1_s1'), attempt({ status: 'finished' })));
  await assertFails(setDoc(doc(db, 'sessionAttempts/active1_s1'), attempt({ startedAt: new Date(2020, 1, 1) })));
  await assertFails(setDoc(doc(db, 'sessionAttempts/active1_s1'), attempt({ score: 100 })));
  await assertFails(setDoc(doc(db, 'sessionAttempts/active1_s1'), attempt({ snapshot: 42 })));
  await assertFails(setDoc(doc(db, 'sessionAttempts/wrongid'), attempt()));
  await assertFails(setDoc(doc(db, 'sessionAttempts/waiting1_s1'), attempt({ sessionId: 'waiting1' })));
  await assertFails(setDoc(doc(db, 'sessionAttempts/endedJust_s1'), attempt({ sessionId: 'endedJust' })));
  await assertFails(setDoc(doc(anon(), 'sessionAttempts/active1_s1'), attempt()));
  await assertSucceeds(setDoc(doc(db, 'sessionAttempts/active1_s1'), attempt()));
});

test('a student saves their attempt with the server\'s time, and nothing else about it changes', async () => {
  const db = as(STUDENT_UID);
  await assertSucceeds(setDoc(doc(db, 'sessionAttempts/active1_s1'), attempt()));
  const ref = doc(db, 'sessionAttempts/active1_s1');
  await assertSucceeds(updateDoc(ref, { snapshot: '{"timeRemaining":300}', savedAt: serverTimestamp() }));
  // Only the save time: how the game asks the server what time it is
  await assertSucceeds(updateDoc(ref, { savedAt: serverTimestamp() }));
  await assertFails(updateDoc(ref, { snapshot: '{}', savedAt: new Date(2020, 1, 1) }));
  await assertFails(updateDoc(ref, { startedAt: serverTimestamp(), savedAt: serverTimestamp() }));
  await assertFails(updateDoc(ref, { studentUid: OTHER_STUDENT_UID, savedAt: serverTimestamp() }));
  await assertFails(updateDoc(ref, { snapshot: 'x'.repeat(200001), savedAt: serverTimestamp() }));
  await assertFails(updateDoc(ref, { finishedAt: serverTimestamp(), savedAt: serverTimestamp() }));
  // Someone else can't touch it
  await assertFails(updateDoc(doc(as(OTHER_STUDENT_UID), 'sessionAttempts/active1_s1'), { savedAt: serverTimestamp() }));
});

test('finishing an attempt is final', async () => {
  const db = as(STUDENT_UID);
  await assertSucceeds(setDoc(doc(db, 'sessionAttempts/active1_s1'), attempt()));
  const ref = doc(db, 'sessionAttempts/active1_s1');
  await assertFails(updateDoc(ref, { status: 'finished', finishedAt: new Date(2020, 1, 1), savedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(ref, { status: 'finished', finishedAt: serverTimestamp(), savedAt: serverTimestamp() }));
  await assertFails(updateDoc(ref, { status: 'playing', savedAt: serverTimestamp() }));
  await assertFails(updateDoc(ref, { snapshot: '{}', savedAt: serverTimestamp() }));
});

test('an attempt can\'t be saved once its session has ended', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => setDoc(doc(ctx.firestore(), 'sessionAttempts/endedOld_s1'),
    { ...attempt({ sessionId: 'endedOld' }), startedAt: Timestamp.now(), savedAt: Timestamp.now() }));
  await assertFails(updateDoc(doc(as(STUDENT_UID), 'sessionAttempts/endedOld_s1'), { savedAt: serverTimestamp() }));
});

test('attempts are read by the student, their teacher and admins only', async () => {
  await assertSucceeds(setDoc(doc(as(STUDENT_UID), 'sessionAttempts/active1_s1'), attempt()));
  await assertSucceeds(getDoc(doc(as(STUDENT_UID), 'sessionAttempts/active1_s1')));
  await assertSucceeds(getDoc(doc(as(TEACHER), 'sessionAttempts/active1_s1')));
  await assertSucceeds(getDoc(doc(as('admin1'), 'sessionAttempts/active1_s1')));
  await assertFails(getDoc(doc(as(OTHER_STUDENT_UID), 'sessionAttempts/active1_s1')));
  await assertFails(getDoc(doc(as(OTHER_TEACHER), 'sessionAttempts/active1_s1')));
  // A teacher deletes their own session's attempts along with it
  await assertFails(deleteDoc(doc(as(STUDENT_UID), 'sessionAttempts/active1_s1')));
  await assertFails(deleteDoc(doc(as(OTHER_TEACHER), 'sessionAttempts/active1_s1')));
  await assertSucceeds(deleteDoc(doc(as(TEACHER), 'sessionAttempts/active1_s1')));
});

test('a drill that finished in time may upload its result after the session has closed', async () => {
  const endedAt = Date.now() - 60 * 60 * 1000;
  const finished = (finishedAtMillis) => env.withSecurityRulesDisabled(async (ctx) =>
    setDoc(doc(ctx.firestore(), 'sessionAttempts/endedOld_s1'), {
      ...attempt({ sessionId: 'endedOld' }), status: 'finished',
      startedAt: Timestamp.fromMillis(endedAt - 20 * 60 * 1000),
      savedAt: Timestamp.fromMillis(finishedAtMillis), finishedAt: Timestamp.fromMillis(finishedAtMillis)
    }));
  const late = result({ sessionId: 'endedOld', sessionCode: 'OLD11' });
  const db = as(STUDENT_UID);

  // Finished well after the session closed: no
  await finished(endedAt + 30 * 60 * 1000);
  await assertFails(setDoc(doc(db, 'sessionResults/endedOld_s1'), late));

  // Finished before it closed: yes, dated by the attempt's own finish time only
  await finished(endedAt - 2 * 60 * 1000);
  await assertFails(setDoc(doc(db, 'sessionResults/endedOld_s1'), { ...late, finishedAt: Timestamp.fromMillis(endedAt) }));
  await assertSucceeds(setDoc(doc(db, 'sessionResults/endedOld_s1'),
    { ...late, finishedAt: Timestamp.fromMillis(endedAt - 2 * 60 * 1000) }));
});

test('a result may carry its finish time only if its attempt has one', async () => {
  const db = as(STUDENT_UID);
  await assertFails(setDoc(doc(db, 'sessionResults/endedJust_s1'), result({ finishedAt: Timestamp.now() })));
  await assertSucceeds(setDoc(doc(db, 'sessionResults/endedJust_s1'), result()));
});

// Deleting a session by hand (the Delete button) removes its scores, so a
// teacher may delete results from their OWN sessions - never another section's, and a
// student never. Runs last: it removes fixtures the tests above read.
test('teachers delete only their own results; students cannot delete results', async () => {
  await assertFails(deleteDoc(doc(as(STUDENT_UID), 'sessionResults/active1_s1')));
  await assertFails(deleteDoc(doc(as(TEACHER), 'sessionResults/other_s2')));
  await assertSucceeds(deleteDoc(doc(as(TEACHER), 'sessionResults/active1_s1')));
  await assertSucceeds(deleteDoc(doc(as('admin1'), 'sessionResults/other_s2')));
});
