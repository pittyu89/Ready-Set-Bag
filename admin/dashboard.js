/* ============================================================================
   READY-SET-BAG! ADMIN DASHBOARD - SCRIPT
   ============================================================================ */

// Global variable to track Firestore listener
let teachersListener = null;
let adminRecentActivityListener = null;
let lastStudentCountFetch = 0; // timestamp to throttle student count reads
let adminStudentEditId = null;
let adminStudentModalMode = 'create';

async function getDocumentData(collectionName, documentId) {
  const snapshot = await window.db.collection(collectionName).doc(documentId).get();

  if (!snapshot.exists) {
    throw new Error('Record not found.');
  }

  return snapshot.data();
}

/* ---- ACCOUNT VAULT ----
   Without Cloud Functions the browser can only change or delete someone else's login by
   signing in as them, so their password has to be kept somewhere. It lives in
   /accountSecrets/{authUid}, which the Firestore rules let only admins read — never on the
   teacher/student profile, which the teacher and the student themselves can read.

   Every sign-in as another account happens on a separate "worker" Firebase app, so the
   admin's own session is never touched. */
async function saveAccountSecret(uid, email, password, role) {
  await window.db.collection('accountSecrets').doc(uid).set({
    email: email,
    password: password,
    role: role,
    updatedAt: new Date()
  }, { merge: true });
}

async function getAccountSecret(uid) {
  if (!uid) return null;
  const snap = await window.db.collection('accountSecrets').doc(uid).get();
  return snap.exists ? snap.data() : null;
}

async function deleteAccountSecret(uid) {
  if (!uid) return;
  await window.db.collection('accountSecrets').doc(uid).delete().catch(() => {});
}

/** Creates a Firebase Auth login without signing the admin out. Returns the new uid. */
async function createAuthAccount(email, password) {
  const worker = window.getAccountWorkerAuth();
  const credential = await worker.createUserWithEmailAndPassword(email, password);
  const uid = credential.user.uid;
  await worker.signOut().catch(() => {});
  return uid;
}

/**
 * Signs in as the account on the worker app and runs action(user, secret). Throws a clear
 * error when no password is saved for it (accounts created before the vault existed and
 * never migrated), since then the login can't be changed from the browser at all.
 */
async function withAccount(uid, fallbackEmail, action) {
  const secret = await getAccountSecret(uid);
  if (!secret || !secret.password) {
    throw new Error('No saved password for this account, so its login can\'t be changed from the dashboard.');
  }

  const worker = window.getAccountWorkerAuth();
  const credential = await worker.signInWithEmailAndPassword(secret.email || fallbackEmail, secret.password);
  try {
    return await action(credential.user, secret);
  } finally {
    await worker.signOut().catch(() => {});
  }
}

/**
 * Deletes an account's login. When no password is saved to do that with, asks whether to
 * remove just the profile instead: without its profile the leftover login can't read any
 * data. Returns false if the admin backs out.
 */
async function deleteLoginOrConfirm(uid, fallbackEmail, name) {
  const secret = await getAccountSecret(uid);
  if (!secret || !secret.password) {
    return confirm(`There's no saved password for ${name}, so their login can't be deleted from here.\n\n` +
      'Remove their profile anyway? The leftover login won\'t be able to see any data.');
  }

  await withAccount(uid, fallbackEmail, (user) => user.delete());
  return true;
}

/**
 * One-time cleanup: profiles created before the vault stored their password in plain text,
 * readable by far more people than it should be. Move each into the vault and strip it from
 * the profile. Safe to run on every load; once done, the queries simply come back empty.
 */
async function moveProfilePasswordsToVault() {
  const removeField = firebase.firestore.FieldValue.delete();
  let moved = 0;
  let skipped = 0;

  // orderBy on a field only returns documents that have it
  const teachers = await window.db.collection('teachers').orderBy('password').get();
  for (const doc of teachers.docs) {
    const t = doc.data();
    if (t.password) await saveAccountSecret(doc.id, t.email || '', t.password, 'teacher');
    await doc.ref.update({ password: removeField });
    moved++;
  }

  const students = await window.db.collection('students').orderBy('password').get();
  for (const doc of students.docs) {
    const s = doc.data();
    if (!s.authUid) { skipped++; continue; }
    if (s.password) await saveAccountSecret(s.authUid, getStudentAuthEmail(s), s.password, 'student');
    await doc.ref.update({ password: removeField });
    moved++;
  }

  if (moved) console.info(`Moved ${moved} stored password(s) into the admin-only vault.`);
  if (skipped) console.warn(`${skipped} student profile(s) still hold a password but have no authUid to file it under.`);
}

/**
 * One-time repair: teachers created by an early version of this dashboard got a random
 * document id instead of their Firebase Auth uid. Login, the Firestore rules and every
 * teacher-owned record (students, sessions, results) now go by the uid, so those teachers
 * could sign in but never find their profile or their class.
 *
 * For each such teacher: learn the uid by signing in with the vaulted password (on the
 * worker app), copy the profile to teachers/{uid}, repoint their students, sessions and
 * results, move the vault entry, then delete the old profile. Profiles already keyed by
 * uid are left alone, so this does nothing once every teacher has been moved.
 */
async function rekeyTeachersByLoginId() {
  const teachers = await window.db.collection('teachers').get();
  const fixed = [];
  const failed = [];

  for (const doc of teachers.docs) {
    const data = doc.data();
    if (data.uid === doc.id) continue;

    const name = `${data.firstName || ''} ${data.lastName || ''}`.trim() || data.email || doc.id;
    try {
      const secret = await getAccountSecret(doc.id);
      if (!secret || !secret.password || !(secret.email || data.email)) {
        failed.push(`${name} (no saved password)`);
        continue;
      }

      const worker = window.getAccountWorkerAuth();
      const credential = await worker.signInWithEmailAndPassword(secret.email || data.email, secret.password);
      const uid = credential.user.uid;
      await worker.signOut().catch(() => {});

      if (uid === doc.id) {
        await doc.ref.update({ uid: uid, updatedAt: new Date() });
        continue;
      }

      const { password, ...profile } = data;   // never copy a plaintext password forward
      await window.db.collection('teachers').doc(uid).set({ ...profile, uid: uid, updatedAt: new Date() });

      for (const collection of ['students', 'sessions', 'sessionResults']) {
        await repointTeacherId(collection, doc.id, uid);
      }

      await saveAccountSecret(uid, secret.email || data.email, secret.password, 'teacher');
      await deleteAccountSecret(doc.id);
      await doc.ref.delete();
      fixed.push(name);
    } catch (err) {
      console.warn(`Couldn't move ${name} to their login id`, err);
      failed.push(`${name} (${err.code || err.message})`);
    }
  }

  if (fixed.length) {
    console.info('Moved teachers to their login id:', fixed.join(', '));
    showToast(`Updated ${fixed.length} teacher account(s) so they can log in.`);
  }
  if (failed.length) {
    console.warn('Teachers still not keyed by login id:', failed.join('; '));
    showToast(`${failed.length} teacher account(s) couldn't be updated. See the console for details.`, 'error');
  }
}

const DEFAULT_STUDENT_PASSWORD = 'Student@123';

/**
 * The next student number for a new username ({sectionCode}{number}) that no student holds
 * yet. Starts after the teacher's highest number (or at `from`), then skips any username
 * already taken: a student who moved section keeps their old username, so the number after
 * the "highest" can still be in use.
 */
async function nextFreeStudentNumber(teacherId, sectionCode, from = 0) {
  let next = from;
  if (!next) {
    const roster = await window.db.collection('students').where('teacherId', '==', teacherId).get();
    let highest = 0;
    roster.forEach(d => {
      const s = d.data() || {};
      const n = s.studentNumber || parseInt(String(s.username || '').replace(/\D/g, ''), 10) || 0;
      if (n > highest) highest = n;
    });
    next = highest + 1;
  }

  for (;;) {
    const username = sectionCode + String(next).padStart(3, '0');
    const taken = await window.db.collection('students').where('username', '==', username).limit(1).get();
    if (taken.empty) return next;
    next++;
  }
}

/**
 * Creates a student's login under the first free username from `startNumber` on, and
 * returns { number, username, email, authUid }. A username with no student profile can
 * still have a login left behind (a student deleted without their saved password), so
 * "already in use" moves on to the next number instead of failing.
 */
async function createStudentLogin(teacherId, sectionCode, startNumber, password) {
  let number = startNumber;
  for (let attempt = 0; attempt < 25; attempt++) {
    number = await nextFreeStudentNumber(teacherId, sectionCode, number);
    const username = sectionCode + String(number).padStart(3, '0');
    const email = `${username}@readysetbag.local`;
    try {
      const authUid = await createAuthAccount(email, password);
      return { number, username, email, authUid };
    } catch (err) {
      if (err.code !== 'auth/email-already-in-use') throw err;
      number++;
    }
  }
  throw new Error('Couldn\'t find a free username for this section.');
}

/**
 * One-time repair for student logins. Students added before logins were linked have no
 * authUid, so neither the game (which finds a student by authUid) nor the Firestore rules can
 * tell who they are, and the early versions didn't create a login for them at all. For each:
 * sign in as {username}@readysetbag.local with their stored password to find the login, or
 * create it if there is none; then record authUid, move the password into the vault and
 * remove it from the profile.
 *
 * It also restores usernames that an earlier edit form renamed on a section change without
 * changing the login, so what the student types matches their login again.
 */
async function repairStudentLogins() {
  const removeField = firebase.firestore.FieldValue.delete();
  const students = await window.db.collection('students').get();
  const worker = window.getAccountWorkerAuth();
  let linked = 0, created = 0, renamed = 0;
  const failed = [];

  for (const doc of students.docs) {
    const s = doc.data();
    const updates = {};

    // The login email is the source of truth for the username
    if (s.authEmail && s.username) {
      const loginName = s.authEmail.split('@')[0];
      if (loginName.toLowerCase() !== String(s.username).toLowerCase()) {
        updates.username = loginName.toUpperCase();
        renamed++;
      }
    }

    if (!s.authUid) {
      const email = getStudentAuthEmail(s);
      const name = s.displayName || s.username || doc.id;
      if (!email) { failed.push(`${name} (no username)`); continue; }

      const password = s.password || DEFAULT_STUDENT_PASSWORD;
      let uid = null;
      try {
        uid = (await worker.signInWithEmailAndPassword(email, password)).user.uid;
        linked++;
      } catch (err) {
        if (err.code === 'auth/too-many-requests') {
          failed.push('stopped early: Firebase is rate-limiting sign-ins, reload later to continue');
          break;
        }
        // No login yet (with email enumeration protection on, a missing account and a wrong
        // password both come back as invalid-credential; creating tells them apart)
        try {
          uid = await createAuthAccount(email, password);
          created++;
        } catch (createErr) {
          if (createErr.code === 'auth/too-many-requests') {
            failed.push('stopped early: Firebase is rate-limiting new accounts, reload later to continue');
            await worker.signOut().catch(() => {});
            break;
          }
          failed.push(createErr.code === 'auth/email-already-in-use'
            ? `${name} (has a login, but not with the stored password)`
            : `${name} (${createErr.code || createErr.message})`);
        }
      } finally {
        await worker.signOut().catch(() => {});
      }
      if (!uid) continue;

      await saveAccountSecret(uid, email, password, 'student');
      updates.authUid = uid;
      updates.authEmail = email;
      if ('password' in s) updates.password = removeField;
    }

    if (Object.keys(updates).length) {
      updates.updatedAt = new Date();
      await doc.ref.update(updates);
    }
  }

  if (linked || created || renamed) {
    console.info(`Student logins: ${linked} linked, ${created} created, ${renamed} username(s) restored.`);
    showToast(`Fixed logins for ${linked + created} student(s)` + (renamed ? `, restored ${renamed} username(s)` : '') + '.');
  }
  if (failed.length) {
    console.warn('Student logins that still need attention:', failed.join('; '));
    showToast(`${failed.length} student login(s) couldn't be fixed. See the console for details.`, 'error');
  }
}

/** Changes teacherId from oldId to newId on every document in a collection, in batches. */
async function repointTeacherId(collection, oldId, newId) {
  const snap = await window.db.collection(collection).where('teacherId', '==', oldId).get();
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += 400) {
    const batch = window.db.batch();
    docs.slice(i, i + 400).forEach(d => batch.update(d.ref, { teacherId: newId }));
    await batch.commit();
  }
}


// ---- NAVIGATION ----
function navigate(page, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  if (btn) btn.classList.add('active');
  // persist last-open admin page so refresh restores it
  try { sessionStorage.setItem('adminLastPage', page); } catch (e) { /* ignore */ }
  
  const titles = { 
    home: 'ADMIN DASHBOARD', 
    teachers: 'ADMIN DASHBOARD', 
    students: 'ADMIN DASHBOARD',
    reports: 'ADMIN DASHBOARD'
  };
  document.getElementById('topbar-title').textContent = titles[page] || 'ADMIN DASHBOARD';
  
  if (page === 'teachers') {
    loadTeachersFromFirebase();
  }
  if (page === 'students') {
    loadAdminStudentsFromFirebase();
    // If Firebase wasn't ready when navigate ran, retry once after a short delay
    setTimeout(() => {
      try {
        if (!adminStudentsListener && window.db) loadAdminStudentsFromFirebase();
      } catch (e) { /* ignore */ }
    }, 800);
  }
}

// ---- LOGOUT ----
function logout() {
  if (window.auth) {
    window.auth.signOut().catch(err => console.error('Sign out error:', err));
  }
  sessionStorage.clear();
  showToast('Logged out.');
  setTimeout(() => {
    window.location.href = '../index.html';
  }, 500);
}

// ---- CHANGE OWN PASSWORD ----
function openPasswordModal() {
  document.getElementById('avatar-menu').classList.remove('show');
  ['pw-current', 'pw-new', 'pw-confirm'].forEach(id => {
    const el = document.getElementById(id);
    el.value = '';
    el.style.border = '';
  });
  document.getElementById('password-modal-overlay').classList.add('open');
}

function closePasswordModal() {
  document.getElementById('password-modal-overlay').classList.remove('open');
}

function closePasswordModalOutside(e) {
  if (e.target === document.getElementById('password-modal-overlay')) closePasswordModal();
}

async function changeAdminPassword() {
  const current = document.getElementById('pw-current').value;
  const next = document.getElementById('pw-new').value;
  const confirmNext = document.getElementById('pw-confirm').value;
  const user = window.auth && window.auth.currentUser;

  if (!user) { showToast('You are not signed in. Please log in again.', 'error'); return; }
  if (!current || !next || !confirmNext) {
    highlightFields(['pw-current', 'pw-new', 'pw-confirm'].filter(id => !document.getElementById(id).value));
    showToast('Please fill in all fields.', 'error');
    return;
  }
  if (next.length < 8) { showToast('The new password must be at least 8 characters.', 'error'); return; }
  if (next !== confirmNext) { showToast('The new passwords don\'t match.', 'error'); return; }

  const button = document.getElementById('pw-submit-btn');
  button.disabled = true;
  try {
    // Firebase requires a recent sign-in before a password change
    const credential = firebase.auth.EmailAuthProvider.credential(user.email, current);
    await user.reauthenticateWithCredential(credential);
    await user.updatePassword(next);
    closePasswordModal();
    showToast('Password updated.');
  } catch (error) {
    if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
      showToast('Your current password is incorrect.', 'error');
    } else if (error.code === 'auth/weak-password') {
      showToast('That password is too weak. Try a longer one.', 'error');
    } else {
      showToast('Error: ' + error.message, 'error');
    }
  } finally {
    button.disabled = false;
  }
}

/* ---- SAMPLE DATA CLEANUP ----
   Before the game could report results, scripts filled the live database with made-up
   sessions and results so the dashboards had something to show
   (scripts/fix_orphans_and_seed_results.js, scripts/updateFirestore.js). Mixed in with real
   runs they skew every average and chart, so this finds them by fingerprint and deletes
   them once the admin confirms. */
const SAMPLE_SESSION_LENGTH_MS = 20 * 60 * 1000;   // the seed script's fixed endedAt offset

function millisOf(value) {
  if (!value) return null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * Results without studentUid did not come from the game: it always sends one, and it
 * didn't send results at all before studentUid existed. Sessions are sample data when they
 * carry the seed script's shape (ended exactly 20 minutes after creation, never started) or
 * the old fixed sample codes, and no real result points at them.
 */
async function findSampleData() {
  const [resultsSnap, sessionsSnap] = await Promise.all([
    window.db.collection('sessionResults').get(),
    window.db.collection('sessions').get()
  ]);

  const sampleResults = resultsSnap.docs.filter(d => !d.data().studentUid);
  const realSessionIds = new Set(resultsSnap.docs
    .filter(d => d.data().studentUid)
    .map(d => d.data().sessionId));

  const sampleSessions = sessionsSnap.docs.filter(d => {
    if (realSessionIds.has(d.id)) return false;
    const s = d.data();
    const created = millisOf(s.createdAt);
    const ended = millisOf(s.endedAt);
    const seededShape = s.status === 'ended' && !s.startedAt
      && created !== null && ended !== null && ended - created === SAMPLE_SESSION_LENGTH_MS;
    const fixedSample = s.sessionCode === 'ABC12' || d.id === 'session_001_id';
    return seededShape || fixedSample;
  });

  return { results: sampleResults, sessions: sampleSessions };
}

async function removeSampleData() {
  document.getElementById('avatar-menu').classList.remove('show');
  if (!window.db) { showToast('Firebase not initialized.', 'error'); return; }

  try {
    showToast('Looking for sample data...', 'info');
    const { results, sessions } = await findSampleData();

    if (!results.length && !sessions.length) {
      showToast('No sample data found.');
      return;
    }

    const ok = confirm(
      `Found ${results.length} sample result(s) and ${sessions.length} sample session(s) ` +
      'that were not created by students playing the game.\n\n' +
      'Delete them permanently? This cannot be undone. Export the CSVs first if you want a copy.');
    if (!ok) return;

    const refs = results.concat(sessions).map(d => d.ref);
    for (let i = 0; i < refs.length; i += 400) {
      const batch = window.db.batch();
      refs.slice(i, i + 400).forEach(ref => batch.delete(ref));
      await batch.commit();
    }

    showToast(`Removed ${results.length} sample result(s) and ${sessions.length} sample session(s).`);
    loadAdminReports();
    loadAdminRecentActivity();
  } catch (error) {
    console.error('Removing sample data failed', error);
    showToast('Error removing sample data: ' + error.message, 'error');
  }
}

// ---- AVATAR MENU ----
function toggleAvatarMenu() {
  const menu = document.getElementById('avatar-menu');
  menu.classList.toggle('show');
}

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
  const menu = document.getElementById('avatar-menu');
  const avatar = document.querySelector('.topbar-avatar');
  if (!avatar.contains(e.target) && !menu.contains(e.target)) {
    menu.classList.remove('show');
  }
});

// ---- MODAL MANAGEMENT ----
function openModal() {
  document.getElementById('modal-overlay').classList.add('open');
  document.getElementById('input-first').value = '';
  document.getElementById('input-last').value = '';
  document.getElementById('input-email').value = '';
  document.getElementById('input-section').value = '';
  document.getElementById('input-pass').value = 'TempPass123!';
  document.getElementById('chk-welcome').checked = false;
  resetModalToCreate();
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  clearFieldHighlights();
}

function closeModalOutside(e) {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
}

// Prompt admin to add a new section name and append it to all section selects
function promptAddSection() {
  const name = prompt('Enter new section name (e.g. G6-NewSection):');
  if (!name) return;
  const sectionName = name.trim();
  if (!sectionName) return;

  // Targets to update
  const ids = ['input-section', 's-input-section', 's-csv-section', 'admin-section-filter'];
  let added = false;
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;

    // Check if option already exists (case-insensitive)
    const exists = Array.from(el.options).some(o => o.value.toLowerCase() === sectionName.toLowerCase());
    if (!exists) {
      const opt = document.createElement('option');
      opt.value = sectionName;
      opt.textContent = sectionName;
      el.appendChild(opt);
      added = true;
    }

    // Select the newly added/selected option where appropriate (for input fields)
    if (id === 'input-section' || id === 's-input-section' || id === 's-csv-section') {
      el.value = sectionName;
    }
  });

  if (added) {
    showToast('Section "' + sectionName + '" added.');
  } else {
    showToast('Section already exists.', 'info');
  }

  // Update local mapping if we have teacher data available (no teacherId for new section yet)
  // populateSectionDropdowns will refresh mappings from teachers later when needed.
}

// ---- LOAD TEACHERS FROM FIREBASE (REAL-TIME) ----
async function loadTeachersFromFirebase() {
  // Reads are checked against the signed-in admin, so wait for Auth, not just the SDK
  if (window.authReadyPromise) {
    await window.authReadyPromise;
  }
  if (!window.db) {
    // Still not available; nothing to do
    console.warn('loadTeachersFromFirebase: Firebase not ready');
    return;
  }

  // Clear existing listener if any
  if (teachersListener) {
    teachersListener();
  }

  // Clear the table
  const tbody = document.getElementById('teacher-tbody');
  tbody.innerHTML = '';

  // Set up real-time listener (limit initial load to reduce reads)
  teachersListener = window.db.collection('teachers')
    .orderBy('createdAt', 'desc')
    .limit(200)
    .onSnapshot(
      (snapshot) => {
        // Clear table on each update
        tbody.innerHTML = '';

        // Collect sections set while rendering to avoid extra reads
        const sectionsSet = new Set();

        // Add each teacher from Firestore
        snapshot.forEach((doc) => {
          const teacher = doc.data();
          const isActive = teacher.status !== 'inactive';
          const row = document.createElement('tr');
          row.setAttribute('data-teacher-id', doc.id);
          if (!isActive) row.style.opacity = '0.55';
          row.innerHTML = `
            <td class="td-name">${teacher.firstName} ${teacher.lastName}</td>
            <td class="td-email">${teacher.email}</td>
            <td class="td-section">${teacher.section}</td>
            <td class="td-status">
              <span class="status-badge ${isActive ? 'status-active' : 'status-inactive'}">
                ${isActive ? 'ACTIVE' : 'INACTIVE'}
              </span>
            </td>
            <td class="td-actions">
              <button class="btn-sm btn-edit" onclick="openEditModal(this)" ${!isActive ? 'disabled' : ''}>✏ EDIT</button>
              <button class="btn-sm btn-reset" onclick="resetPassword(this)" ${!isActive ? 'disabled' : ''}>↺ RESET</button>
              <button class="btn-sm btn-delete" onclick="confirmDelete(this)">🗑 DELETE</button>
            </td>`;
          tbody.appendChild(row);
          if (teacher.section) sectionsSet.add(teacher.section);
        });

        // Update count and home stats (use snapshot data to avoid extra reads)
        updateTeacherCount();
        updateHomeStats(snapshot.size, sectionsSet.size);
      },
      (error) => {
        console.error('Error loading teachers:', error);
        showToast('Error loading teachers: ' + error.message, 'error');
      }
    );
}

// ---- UPDATE HOME STATS ----
function updateHomeStats(teacherCount = null, sectionCount = null) {
  if (!window.db) return; // Firebase not ready yet

  updateSchoolDate();

  // If teacherCount was provided by the snapshot, use it to avoid an extra read
  if (typeof teacherCount === 'number') {
    document.getElementById('home-teacher-count').textContent = teacherCount;
    document.getElementById('total-teachers-text').textContent = `TOTAL TEACHERS: ${teacherCount}`;
  }

  // If sectionCount was provided, use it
  if (typeof sectionCount === 'number') {
    document.getElementById('home-section-count').textContent = sectionCount + ' sections';
  }

  // Throttled student count fetch: run at most once every 5 minutes
  const now = Date.now();
  if (now - lastStudentCountFetch > 5 * 60 * 1000) {
    lastStudentCountFetch = now;
    window.db.collection('students').get().then((snapshot) => {
      const studentCount = snapshot.size;
      document.getElementById('home-student-count').textContent = studentCount;
    }).catch(e => console.warn('Student count fetch failed', e));
  }
}

// ---- UPDATE SCHOOL DATE ----
function updateSchoolDate() {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  
  const today = new Date();
  const dayName = days[today.getDay()];
  const monthName = months[today.getMonth()];
  const date = today.getDate();
  const year = today.getFullYear();
  
  const dateString = `📅 ${dayName}, ${monthName} ${date}, ${year}`;
  document.getElementById('school-date').textContent = dateString;
}

// ---- FIELD VALIDATION HELPERS (NEG-2.3) ----
function highlightFields(fields) {
  fields.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.border = '2px solid #e74c3c';
  });
}

function clearFieldHighlights() {
  ['input-first', 'input-last', 'input-email', 'input-section', 'input-pass'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.border = '';
  });
}

function getStudentAuthEmail(studentData) {
  if (!studentData) return '';
  if (studentData.authEmail) return studentData.authEmail;
  if (studentData.username) return `${studentData.username}@readysetbag.local`;
  return '';
}

// ---- TEACHER MANAGEMENT ----
async function createTeacher() {
  if (typeof db === 'undefined') {
    showToast('Firebase is not initialized.', 'error');
    return;
  }

  clearFieldHighlights();

  const first = document.getElementById('input-first').value.trim();
  const last = document.getElementById('input-last').value.trim();
  const email = document.getElementById('input-email').value.trim();
  const section = document.getElementById('input-section').value;
  const password = document.getElementById('input-pass').value;

  // NEG-2.3: Highlight empty fields and block submission
  const emptyFields = [];
  if (!first) emptyFields.push('input-first');
  if (!last) emptyFields.push('input-last');
  if (!email) emptyFields.push('input-email');
  if (!section) emptyFields.push('input-section');
  if (!password) emptyFields.push('input-pass');

  if (emptyFields.length > 0) {
    highlightFields(emptyFields);
    showToast('Please fill in all required fields.', 'error');
    return;
  }

  const wasListening = !!teachersListener;
  if (wasListening) {
    teachersListener();
    teachersListener = null;
  }

  try {
    // 1. Create Firebase Auth account (on the worker app, so the admin stays signed in)
    const uid = await createAuthAccount(email, password);

    // 2. Create Firestore document (use Auth UID as doc ID for easy lookup)
    await window.db.collection('teachers').doc(uid).set({
      uid: uid,
      firstName: first,
      lastName: last,
      email: email,
      section: section,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // 3. Keep the password where only admins can read it
    await saveAccountSecret(uid, email, password, 'teacher');

    closeModal();
    clearFieldHighlights();
    showToast('Teacher created successfully!');
  } catch (error) {
    console.error('Error creating teacher:', error);
    if (error.code === 'auth/email-already-in-use') {
      showToast('That email is already registered.', 'error');
    } else {
      showToast('Error: ' + error.message, 'error');
    }
  } finally {
    if (wasListening) {
      loadTeachersFromFirebase();
    }
  }
}

// Open edit modal with teacher data
function openEditModal(btn) {
  const row = btn.closest('tr');
  const teacherId = row.getAttribute('data-teacher-id');
  const name = row.querySelector('.td-name').textContent.split(' ');
  const email = row.querySelector('.td-email').textContent;
  const section = row.querySelector('.td-section').textContent;

  document.getElementById('modal-overlay').classList.add('open');
  document.getElementById('modal-title').textContent = 'EDIT TEACHER';
  document.getElementById('create-btn').textContent = 'UPDATE TEACHER';
  document.getElementById('input-first').value = name[0];
  document.getElementById('input-last').value = name[1] || '';
  document.getElementById('input-email').value = email;
  document.getElementById('input-section').value = section;
  document.getElementById('input-pass').value = '';
  document.getElementById('create-btn').onclick = () => updateTeacher(teacherId, btn);
}

// Update teacher in Firebase
async function updateTeacher(teacherId, btn) {
  if (typeof db === 'undefined') {
    showToast('Firebase is not initialized. Please refresh the page.', 'error');
    return;
  }

  clearFieldHighlights();

  const first = document.getElementById('input-first').value.trim();
  const last = document.getElementById('input-last').value.trim();
  const email = document.getElementById('input-email').value.trim();
  const section = document.getElementById('input-section').value;
  const newPassword = document.getElementById('input-pass').value.trim();

  // NEG-2.3: Highlight empty fields and block submission
  const emptyFields = [];
  if (!first) emptyFields.push('input-first');
  if (!last) emptyFields.push('input-last');
  if (!email) emptyFields.push('input-email');
  if (!section) emptyFields.push('input-section');

  if (emptyFields.length > 0) {
    highlightFields(emptyFields);
    showToast('Please fill in all required fields.', 'error');
    return;
  }

  try {
    const teacherData = await getDocumentData('teachers', teacherId);

    // Only touch the login itself when the email or password actually changes
    if (email !== teacherData.email || newPassword) {
      await withAccount(teacherId, teacherData.email, async (currentUser, secret) => {
        if (email !== teacherData.email) {
          await currentUser.updateEmail(email);
        }

        if (newPassword) {
          await currentUser.updatePassword(newPassword);
        }

        await saveAccountSecret(teacherId, email, newPassword || secret.password, 'teacher');
      });
    }

    // Keep Firestore aligned with Auth so login continues to work after edits
    await window.db.collection('teachers').doc(teacherId).update({
      firstName: first,
      lastName: last,
      email: email,
      section: section,
      ...(newPassword ? { passwordResetPending: false } : {}),
      updatedAt: new Date()
    });

    // The real-time listener will automatically update the table
    closeModal();
    resetModalToCreate();
    clearFieldHighlights();
    showToast('Teacher updated successfully!');
  } catch (error) {
    console.error('Error updating teacher:', error);
    showToast('Error updating teacher: ' + error.message, 'error');
  }
}

// Reset teacher password in Firebase
async function resetPassword(btn) {
  const row = btn.closest('tr');
  const teacherId = row.getAttribute('data-teacher-id');
  const name = row.querySelector('.td-name').textContent;
  const newPassword = 'TempPass123!';

  if (confirm(`Reset password for ${name} to "${newPassword}"?`)) {
    try {
      const teacherData = await getDocumentData('teachers', teacherId);

      await withAccount(teacherId, teacherData.email, async (currentUser, secret) => {
        await currentUser.updatePassword(newPassword);
        await saveAccountSecret(teacherId, secret.email || teacherData.email, newPassword, 'teacher');
      });

      await window.db.collection('teachers').doc(teacherId).update({
        passwordResetPending: true,
        updatedAt: new Date()
      });

      showToast(`Password reset for ${name}. They'll use "${newPassword}" at next login.`);
    } catch (error) {
      showToast('Error: ' + error.message, 'error');
    }
  }
}

// Reset modal to create mode
function resetModalToCreate() {
  document.getElementById('modal-title').textContent = 'ADD NEW TEACHER';
  document.getElementById('create-btn').textContent = 'CREATE TEACHER';
  document.getElementById('create-btn').onclick = () => createTeacher();
}

async function confirmDelete(btn) {
  if (typeof db === 'undefined') {
    showToast('Firebase is not initialized. Please refresh the page.', 'error');
    return;
  }

  const row = btn.closest('tr');
  const teacherId = row.getAttribute('data-teacher-id');
  const name = row.querySelector('.td-name').textContent;
  
  if (confirm(`Delete ${name}?`)) {
    try {
      const teacherData = await getDocumentData('teachers', teacherId);

      if (!(await deleteLoginOrConfirm(teacherId, teacherData.email, name))) return;

      // Remove the synced Firestore profile after deleting the Auth account. Without it the
      // login (if it survived) can no longer reach the teacher dashboard or any data.
      await window.db.collection('teachers').doc(teacherId).delete();
      await deleteAccountSecret(teacherId);
      
      // The real-time listener will automatically remove the row from the table
      showToast(`${name} deleted.`);
    } catch (error) {
      console.error('Error deleting teacher:', error);
      showToast('Error deleting teacher: ' + error.message, 'error');
    }
  }
}

function filterTeachers(query) {
  const q = query.toLowerCase();
  document.querySelectorAll('#teacher-tbody tr').forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(q) ? '' : 'none';
  });
  updateTeacherCount();
}

function updateTeacherCount() {
  const visible = document.querySelectorAll('#teacher-tbody tr:not([style*="display: none"])').length;
  const total = document.querySelectorAll('#teacher-tbody tr').length;
  const footer = document.getElementById('teacher-footer');
  if (footer) {
    footer.textContent = `SHOWING ${visible} OF ${total} TEACHERS`;
  }
}

// ---- NOTIFICATIONS ----
let toastTimer;
function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  const isError = type === 'error';
  
  toast.textContent = msg;
  toast.style.borderColor = isError ? 'var(--accent-red)' : 'var(--accent-green)';
  toast.style.color = isError ? 'var(--accent-red)' : 'var(--accent-green)';
  toast.classList.add('show');
  
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

// ---- INITIALIZE ON PAGE LOAD ----
window.addEventListener('load', () => {
  window.addEventListener('error', (ev) => {
    console.error('Unhandled error on admin dashboard:', ev.error || ev.message, ev);
    try {
      const rawMsg = ev.error?.message || ev.message || '';
      // If Firestore returned a long console URL or 'requires an index' message,
      // avoid showing the raw URL to the user. Log full details and show concise toast.
      if (/console\.firebase\.google\.com|requires an index|index creation/i.test(rawMsg)) {
        showToast('A Firestore query requires an index. See console for details.', 'error');
      } else if (rawMsg.length > 200) {
        showToast('An error occurred. See console for details.', 'error');
      } else {
        showToast('Error: ' + rawMsg, 'error');
      }
    } catch (e) {}
  });

  initAuthGuard();
  // If pre-paint set a specific initial page, restore it synchronously to avoid flash
  try {
    const initial = document.documentElement.getAttribute('data-admin-initial');
    if (initial) {
      // find nav button that references this page
      const navs = document.querySelectorAll('.nav-item');
      let btn = null;
      for (let i=0;i<navs.length;i++){
        const on = navs[i].getAttribute('onclick') || '';
        if (on.indexOf("'"+initial+"'")!==-1 || on.indexOf('\"'+initial+'\"')!==-1) { btn = navs[i]; break; }
      }
      if (document.getElementById('page-' + initial)) {
        navigate(initial, btn);
      }
      // remove restoring class so normal styles apply
      document.documentElement.classList.remove('js-restoring');
      document.documentElement.removeAttribute('data-admin-initial');
    }
  } catch (e) {
    console.warn('prepaint admin restore failed', e);
  } finally {
    // Ensure the restoring class is always cleared to avoid leaving the page hidden
    try {
      document.documentElement.classList.remove('js-restoring');
      document.documentElement.removeAttribute('data-admin-initial');
    } catch (er) { /* ignore */ }
  }
  window.authReadyPromise.then(async (user) => {
    // Every read below is checked against the signed-in admin, so without a Firebase session
    // there is nothing to show: send them back to log in
    if (window.auth && !user) {
      sessionStorage.clear();
      window.location.href = '../index.html';
      return;
    }

    if (window.db) {
      // The re-key reads passwords from the vault, so it runs after they've been moved there
      moveProfilePasswordsToVault()
        .catch(e => console.warn('Moving stored passwords to the vault failed', e))
        .then(() => rekeyTeachersByLoginId())
        .catch(e => console.warn('Moving teachers to their login id failed', e))
        .then(() => repairStudentLogins())
        .catch(e => console.warn('Repairing student logins failed', e));
    }

    // Always update top-level stats and session count (or show offline fallback)
    if (!window.db) {
      console.warn('Firebase not available after init; showing offline fallback');
      showAdminOfflineFallback();
    } else {
      updateHomeStats();
      loadTotalSessionsCount();
      // Reports engine feeds BOTH the Home school-wide panel/skill bars and the
      // Reports page, so load it regardless of which page is active.
      loadAdminReports();
    }

    // After Firebase is ready, ensure the *active* page has its data loaders attached.
    try {
      const active = document.querySelector('.page.active')?.id || 'page-home';
      if (active === 'page-home') {
        // Home needs recent activity and teachers summary
        loadTeachersFromFirebase();
        loadAdminRecentActivity();
      } else if (active === 'page-teachers') {
        loadTeachersFromFirebase();
      } else if (active === 'page-students') {
        // Ensure students listener is attached after firebase init
        loadAdminStudentsFromFirebase();
      } else if (active === 'page-reports') {
        // Reports page: load analytics + recent activity
        flagBelowThresholdSections();
        loadAdminRecentActivity();
      } else {
        // Default: ensure teachers listener is available
        loadTeachersFromFirebase();
      }
    } catch (e) { console.warn('post-init admin restore check', e); }
    
    // Load analytics when reports page is viewed
    document.addEventListener('click', (e) => {
      if (e.target.closest('.nav-item') && e.target.closest('.nav-item').textContent.includes('REPORTS')) {
        loadAdminRecentActivity();
        flagBelowThresholdSections();
      }
    });
  });
});
// Ensure a page is visible even if navigation didn't run
setTimeout(() => {
  try {
    if (!document.querySelector('.page.active')) {
      const firstNav = document.querySelector('.nav-item');
      if (document.getElementById('page-home')) navigate('home', firstNav);
    }
  } catch (e) { console.warn('forced nav fallback failed', e); }
}, 200);
/* ============================================================================
   ADMIN STUDENT MANAGEMENT
   ============================================================================ */

// Offline fallback: populate safe placeholders when Firebase is unavailable
function showAdminOfflineFallback() {
  try {
    // Populate some safe defaults
    const teacherCountEl = document.getElementById('home-teacher-count');
    if (teacherCountEl) teacherCountEl.textContent = '0';
    const studentCountEl = document.getElementById('home-student-count');
    if (studentCountEl) studentCountEl.textContent = '0';
    const sectionCountEl = document.getElementById('home-section-count');
    if (sectionCountEl) sectionCountEl.textContent = '0 sections';
    const sessionsEl = document.getElementById('total-sessions-count');
    if (sessionsEl) sessionsEl.textContent = '0';

    // Show a notice in recent activity container
    const rec = document.getElementById('admin-recent-activity');
    if (rec) {
      rec.innerHTML = '<div class="activity-item"><div class="activity-desc">Offline: unable to load recent activity.</div></div>';
    }

    // Teachers table placeholder
    const tbody = document.getElementById('teacher-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="color:#ccc;padding:18px;text-align:center;">Offline — teachers unavailable</td></tr>';

    const stbody = document.getElementById('admin-student-tbody');
    if (stbody) stbody.innerHTML = '<tr><td colspan="5" style="color:#ccc;padding:18px;text-align:center;">Offline — students unavailable</td></tr>';

    showToast('Firebase not available. Showing offline placeholders.', 'info');
  } catch (e) { console.warn('showAdminOfflineFallback failed', e); }
}

let adminStudentsListener = null;
let adminStudentsLastDoc = null;
// Large enough to fetch the whole roster in a single query at this app's scale,
// so sections that sort late alphabetically (e.g. Roses, Tulips) aren't cut off
// until "Load more" is clicked.
let adminStudentsPageSize = 300;
let adminStudentsHasMore = true;
let adminStudentsShowAllLoaded = false;
let adminStudentPaginationControls = null;
let adminStudentLoadMoreBtn = null;
let adminStudentShowMoreBtn = null;
let adminStudentShowLessBtn = null;
let adminCsvData = [];
let sectionTeacherMap = {}; // section -> teacherId

// ---- OPEN/CLOSE STUDENT MODAL ----
async function openStudentModal(tab) {
  document.getElementById('student-modal-overlay').classList.add('open');
  adminStudentEditId = null;
  // Reset forms
  document.getElementById('s-input-first').value = '';
  document.getElementById('s-input-last').value = '';
  document.getElementById('s-csv-file').value = '';
  document.getElementById('s-csv-preview').style.display = 'none';
  document.getElementById('s-import-btn').disabled = true;
  adminCsvData = [];
  setStudentModalMode('create');
  // Populate section dropdowns from Firestore teachers
  await populateSectionDropdowns();
  switchStudentTab(tab || 'single');
}

function setStudentModalMode(mode) {
  adminStudentModalMode = mode;

  const tabs = document.getElementById('student-modal-tabs');
  const csvForm = document.getElementById('student-csv-form');
  const singleForm = document.getElementById('student-single-form');
  const title = document.getElementById('student-modal-title');
  const submitBtn = document.getElementById('s-single-submit-btn');
  const sectionSelect = document.getElementById('s-input-section');
  const addSectionBtn = document.querySelector('#student-single-form .btn-add');
  const formNote = document.getElementById('s-form-note');

  if (!tabs || !csvForm || !singleForm || !title || !submitBtn || !sectionSelect) return;

  if (mode === 'edit') {
    tabs.style.display = 'none';
    csvForm.style.display = 'none';
    singleForm.style.display = '';
    title.textContent = 'EDIT STUDENT';
    submitBtn.textContent = 'UPDATE STUDENT';
    submitBtn.onclick = updateAdminStudent;
    sectionSelect.disabled = false;
    if (addSectionBtn) addSectionBtn.disabled = false;
    if (formNote) formNote.innerHTML = 'Editing student details. Changing section updates their section and teacher only; login stays the same.';
    return;
  }

  tabs.style.display = '';
  title.textContent = 'ADD NEW STUDENT';
  submitBtn.textContent = 'CREATE STUDENT';
  submitBtn.onclick = addSingleStudent;
  sectionSelect.disabled = false;
  if (addSectionBtn) addSectionBtn.disabled = false;
  if (formNote) formNote.innerHTML = '&#9888; Default password is Student@123. Username will be auto-generated.';
}

function closeStudentModal() {
  document.getElementById('student-modal-overlay').classList.remove('open');
}

function closeStudentModalOutside(e) {
  if (e.target === document.getElementById('student-modal-overlay')) closeStudentModal();
}

function switchStudentTab(tab) {
  if (adminStudentModalMode === 'edit') tab = 'single';
  document.getElementById('student-single-form').style.display = tab === 'single' ? '' : 'none';
  document.getElementById('student-csv-form').style.display = tab === 'csv' ? '' : 'none';
  document.getElementById('stab-single').classList.toggle('active', tab === 'single');
  document.getElementById('stab-csv').classList.toggle('active', tab === 'csv');
}

async function openEditStudentModal(btn) {
  if (!window.db) { showToast('Firebase not initialized.', 'error'); return; }

  const row = btn.closest('tr');
  const studentId = row.getAttribute('data-student-id');

  try {
    const studentData = await getDocumentData('students', studentId);
    await openStudentModal('single');
    adminStudentEditId = studentId;
    setStudentModalMode('edit');

    const fullName = (studentData.displayName || '').trim();
    const nameParts = fullName ? fullName.split(/\s+/) : [];
    const firstName = studentData.firstName || nameParts.shift() || '';
    const lastName = studentData.lastName || nameParts.join(' ') || '';

    document.getElementById('s-input-first').value = firstName;
    document.getElementById('s-input-last').value = lastName;
    document.getElementById('s-input-section').value = studentData.section || '';
  } catch (err) {
    showToast('Error loading student: ' + err.message, 'error');
  }
}

// ---- POPULATE SECTION DROPDOWNS FROM TEACHERS ----
async function populateSectionDropdowns() {
  if (!window.db) return;
  try {
    // Load all teachers so section dropdown includes every section
    const snap = await window.db.collection('teachers').get();
    const sections = [];
    sectionTeacherMap = {};
    snap.forEach(doc => {
      const t = doc.data();
      if (t.section) {
        sections.push(t.section);
        sectionTeacherMap[t.section] = doc.id;
      }
    });
    sections.sort();

    ['s-input-section', 's-csv-section', 'admin-section-filter'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const isFilter = id === 'admin-section-filter';
      el.innerHTML = isFilter ? '<option value="">ALL SECTIONS</option>' : '<option value="">Select section...</option>';
      sections.forEach(sec => {
        const opt = document.createElement('option');
        opt.value = sec;
        opt.textContent = sec;
        el.appendChild(opt);
      });
    });
  } catch (e) {
    console.error('Error loading sections:', e);
  }
}

// ---- ADD SINGLE STUDENT ----
async function addSingleStudent() {
  if (!window.db) { showToast('Firebase not initialized.', 'error'); return; }

  const first = document.getElementById('s-input-first').value.trim();
  const last  = document.getElementById('s-input-last').value.trim();
  const section = document.getElementById('s-input-section').value;

  if (!first || !last || !section) {
    showToast('Please fill in all required fields.', 'error'); return;
  }

  const teacherId = sectionTeacherMap[section];
  if (!teacherId) {
    showToast('No active teacher found for that section.', 'error'); return;
  }

  try {
    // Disable listeners while creating student
    if (adminStudentsListener) {
      adminStudentsListener();
      adminStudentsListener = null;
    }
    if (teachersListener) {
      teachersListener();
      teachersListener = null;
    }

    // Build section code from section name (e.g. G6-Tulips → G6TULIPS)
    const sectionCode = section.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    const password = DEFAULT_STUDENT_PASSWORD;

    // Create Firebase Auth account for the student, under the first free username
    const startNum = await nextFreeStudentNumber(teacherId, sectionCode);
    const { number: nextNum, username, email: studentEmail, authUid } =
      await createStudentLogin(teacherId, sectionCode, startNum, password);

    // Create Firestore document with auth UID
    await window.db.collection('students').add({
      authUid,
      teacherId,
      section,
      firstName: first,
      lastName: last,
      displayName: `${first} ${last}`,
      username,
      authEmail: studentEmail,
      studentNumber: nextNum,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    await saveAccountSecret(authUid, studentEmail, password, 'student');

    closeStudentModal();
    showToast(`${first} ${last} added successfully!`);

    // Reload table with fresh listener to show new student immediately
    loadAdminStudentsFromFirebase();
  } catch (err) {
    console.error(err);

    // Reload table in case of error to maintain UI state
    loadAdminStudentsFromFirebase();
    
    if (err.code === 'auth/email-already-in-use') {
      showToast('That username is already registered.', 'error');
    } else {
      showToast('Error: ' + err.message, 'error');
    }
  }
}

// ---- CSV PREVIEW ----
function previewStudentCSV() {
  const file = document.getElementById('s-csv-file').files[0];
  if (!file) {
    document.getElementById('s-csv-preview').style.display = 'none';
    document.getElementById('s-import-btn').disabled = true;
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    const lines = e.target.result.trim().split('\n').filter(l => l.trim());
    adminCsvData = [];
    lines.forEach(line => {
      const [firstName, lastName] = line.split(',').map(s => s.trim());
      if (firstName && lastName) adminCsvData.push({ firstName, lastName });
    });
    if (!adminCsvData.length) {
      showToast('No valid students found in CSV.', 'error');
      document.getElementById('s-csv-preview').style.display = 'none';
      document.getElementById('s-import-btn').disabled = true;
      return;
    }
    document.getElementById('s-preview-list').innerHTML =
      adminCsvData.map((s, i) => `${i + 1}. ${s.firstName} ${s.lastName}`).join('<br>');
    document.getElementById('s-preview-count').textContent = adminCsvData.length;
    document.getElementById('s-csv-preview').style.display = '';
    document.getElementById('s-import-btn').disabled = false;
  };
  reader.readAsText(file);
}

// ---- IMPORT STUDENTS FROM CSV ----
async function importAdminStudentsFromCSV() {
  if (!window.db) { showToast('Firebase not initialized.', 'error'); return; }
  if (!adminCsvData.length) { showToast('Please select a CSV file first.', 'error'); return; }

  const section = document.getElementById('s-csv-section').value;
  if (!section) { showToast('Please select a section.', 'error'); return; }

  const teacherId = sectionTeacherMap[section];
  if (!teacherId) { showToast('No active teacher for that section.', 'error'); return; }

  try {
    // Disable listeners while importing to prevent permission errors
    if (adminStudentsListener) {
      adminStudentsListener();
      adminStudentsListener = null;
    }
    if (teachersListener) {
      teachersListener();
      teachersListener = null;
    }

    const sectionCode = section.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    let nextNum = await nextFreeStudentNumber(teacherId, sectionCode);
    const password = DEFAULT_STUDENT_PASSWORD;
    let successCount = 0;

    const tbody = document.getElementById('admin-student-tbody');

    for (let i = 0; i < adminCsvData.length; i++) {
      const student = adminCsvData[i];

      try {
        // Create Firebase Auth account for the student, under the first free username
        const login = await createStudentLogin(teacherId, sectionCode, nextNum, password);
        nextNum = login.number;
        const { username, email: studentEmail, authUid } = login;

        // Create Firestore document with auth UID
        const docRef = await window.db.collection('students').add({
          authUid,
          teacherId,
          section,
          firstName: student.firstName,
          lastName: student.lastName,
          displayName: `${student.firstName} ${student.lastName}`,
          username,
          authEmail: studentEmail,
          studentNumber: nextNum,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        await saveAccountSecret(authUid, studentEmail, password, 'student');
        
        // Add row to table immediately (real-time feedback)
        const row = document.createElement('tr');
        row.setAttribute('data-student-id', docRef.id);
        row.innerHTML = `
          <td class="td-username">${username}</td>
          <td>${student.firstName} ${student.lastName}</td>
          <td>${section}</td>
          <td class="td-pass">••••••••</td>
          <td class="td-actions">
            <button class="btn-sm btn-edit" onclick="openEditStudentModal(this)">✏ EDIT</button>
            <button class="btn-sm btn-delete" onclick="deleteAdminStudent(this)">🗑 DELETE</button>
          </td>`;
        tbody.appendChild(row);
        
        // Show progress
        showToast(`Creating students... ${i + 1}/${adminCsvData.length}`, 'info');
        successCount++;
      } catch (err) {
        console.error(`Error creating student ${student.firstName} ${student.lastName}:`, err);
        // Continue with next student instead of stopping
      }
      nextNum++;
    }

    closeStudentModal();
    showToast(`${successCount} of ${adminCsvData.length} student(s) imported successfully!`);
    
    // Now that auth is stable and all students are created, reload the table with fresh listener
    loadAdminStudentsFromFirebase();
  } catch (err) {
    console.error(err);
    showToast('Error: ' + err.message, 'error');
  }
}

// ---- CSV EXPORT HELPERS ----
function downloadCsv(filename, csv) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });

  if (window.navigator && typeof window.navigator.msSaveOrOpenBlob === 'function') {
    window.navigator.msSaveOrOpenBlob(blob, filename);
    return;
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 1000);
}

// Helper: export a query in pages to CSV to avoid loading entire collections at once
async function exportQueryToCsvPaged(filename, headerRow, baseQuery, rowMapper, batchSize = 500) {
  const rows = [headerRow];
  let lastDoc = null;
  while (true) {
    let q = baseQuery.limit(batchSize);
    if (lastDoc) q = q.startAfter(lastDoc);
    const snap = await q.get();
    if (snap.empty) break;
    snap.forEach(doc => rows.push(rowMapper(doc)));
    if (snap.size < batchSize) break;
    lastDoc = snap.docs[snap.docs.length - 1];
  }
  downloadCsv(filename, rows.join('\n'));
}

async function exportTeachersCsv() {
  if (!window.db) { showToast('Firebase not initialized.', 'error'); return; }
  try {
    const header = ['uid','firstName','lastName','email','section','status','createdAt','updatedAt'].join(',');
    const baseQuery = window.db.collection('teachers').orderBy('lastName');
    await exportQueryToCsvPaged('teachers.csv', header, baseQuery, (doc) => {
      const t = doc.data();
      const created = t.createdAt && t.createdAt.toDate ? t.createdAt.toDate().toISOString() : (t.createdAt? new Date(t.createdAt).toISOString() : '');
      const updated = t.updatedAt && t.updatedAt.toDate ? t.updatedAt.toDate().toISOString() : (t.updatedAt? new Date(t.updatedAt).toISOString() : '');
      return [doc.id, t.firstName || '', t.lastName || '', t.email || '', t.section || '', t.status || '', created, updated].map(v => '"' + String(v).replace(/"/g,'""') + '"').join(',');
    });
    showToast('Teachers CSV exported.');
  } catch (err) {
    console.error('Export teachers failed', err);
    showToast('Error exporting teachers: ' + err.message, 'error');
  }
}

async function exportAdminStudentsCsv() {
  if (!window.db) { showToast('Firebase not initialized.', 'error'); return; }
  try {
    const header = ['id','authUid','username','displayName','section','teacherId','studentNumber','createdAt','updatedAt'].join(',');
    const baseQuery = window.db.collection('students').orderBy('section').orderBy('studentNumber');
    await exportQueryToCsvPaged('students.csv', header, baseQuery, (doc) => {
      const s = doc.data();
      const created = s.createdAt && s.createdAt.toDate ? s.createdAt.toDate().toISOString() : (s.createdAt? new Date(s.createdAt).toISOString() : '');
      const updated = s.updatedAt && s.updatedAt.toDate ? s.updatedAt.toDate().toISOString() : (s.updatedAt? new Date(s.updatedAt).toISOString() : '');
      return [doc.id, s.authUid || '', s.username || '', s.displayName || '', s.section || '', s.teacherId || '', s.studentNumber || '', created, updated].map(v => '"' + String(v).replace(/"/g,'""') + '"').join(',');
    });
    showToast('Students CSV exported.');
  } catch (err) {
    console.error('Export students failed', err);
    showToast('Error exporting students: ' + err.message, 'error');
  }
}

async function exportAdminSessionResultsCsv() {
  if (!window.db) { showToast('Firebase not initialized.', 'error'); return; }
  try {
    const header = ['id','sessionId','sessionCode','teacherId','studentId','studentName','section','score','completionTime','attempts','stage','essentials','essentialsMax','errors','difficulty','createdAt','updatedAt'].join(',');
    const baseQuery = window.db.collection('sessionResults').orderBy('createdAt', 'desc');
    await exportQueryToCsvPaged('session-results.csv', header, baseQuery, (doc) => {
      const r = doc.data();
      const created = r.createdAt && r.createdAt.toDate ? r.createdAt.toDate().toISOString() : (r.createdAt ? new Date(r.createdAt).toISOString() : '');
      const updated = r.updatedAt && r.updatedAt.toDate ? r.updatedAt.toDate().toISOString() : (r.updatedAt ? new Date(r.updatedAt).toISOString() : '');
      return [doc.id, r.sessionId || '', r.sessionCode || '', r.teacherId || '', r.studentId || '', r.studentName || '', r.section || '', r.score || 0, r.completionTime || 0, r.attempts || 0, r.stage || '', r.essentials || 0, r.essentialsMax || 0, r.errors || 0, r.difficulty || '', created, updated].map(v => '"' + String(v).replace(/"/g,'""') + '"').join(',');
    });
    showToast('Session results CSV exported.');
  } catch (err) {
    console.error('Export session results failed', err);
    showToast('Error exporting session results: ' + err.message, 'error');
  }
}

// ---- LOAD ALL STUDENTS (REAL-TIME) ----
async function loadAdminStudentsFromFirebase() {
  // Reads are checked against the signed-in admin, so wait for Auth, not just the SDK
  if (window.authReadyPromise) {
    await window.authReadyPromise;
  }
  if (!window.db) {
    console.warn('loadAdminStudentsFromFirebase: Firebase not ready');
    return;
  }

  if (adminStudentsListener) adminStudentsListener();

  await populateSectionDropdowns();

  // Paginated students loading to avoid large reads
  adminStudentsLastDoc = null;
  adminStudentsHasMore = true;

  // ensure load-more button exists
  let loadMoreBtn = document.getElementById('admin-load-more-students');
  if (!loadMoreBtn) {
    loadMoreBtn = document.createElement('button');
    loadMoreBtn.id = 'admin-load-more-students';
    loadMoreBtn.className = 'btn-sm';
    loadMoreBtn.textContent = 'Load more students';
    loadMoreBtn.style.display = 'none';
    loadMoreBtn.addEventListener('click', () => loadAdminStudentsPage(false));
    const container = document.getElementById('admin-students-container') || document.getElementById('admin-student-tbody')?.parentNode;
    if (container && container.parentNode) container.parentNode.appendChild(loadMoreBtn);
  }

  // Provide a no-op unsubscribe compatible with earlier code that calls adminStudentsListener()
  adminStudentsListener = function() {
    adminStudentsLastDoc = null;
    adminStudentsHasMore = false;
    if (document.getElementById('admin-load-more-students')) document.getElementById('admin-load-more-students').style.display = 'none';
  };

  // Load first page
  await loadAdminStudentsPage(true);
}

// ---- RESET STUDENT PASSWORD ----
async function resetAdminStudentPassword(btn) {
  if (!window.db) { showToast('Firebase not initialized.', 'error'); return; }
  const row = btn.closest('tr');
  const id = row.getAttribute('data-student-id');
  const name = row.querySelector('td:nth-child(2)').textContent;
  if (confirm(`Reset password for ${name} to "Student@123"?`)) {
    try {
      const studentData = await getDocumentData('students', id);
      const studentEmail = getStudentAuthEmail(studentData);

      await withAccount(studentData.authUid, studentEmail, async (currentUser, secret) => {
        await currentUser.updatePassword('Student@123');
        await saveAccountSecret(studentData.authUid, secret.email || studentEmail, 'Student@123', 'student');
      });

      await window.db.collection('students').doc(id).update({ updatedAt: new Date() });
      showToast(`Password reset for ${name}.`);
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
  }
}

// Append a single student row to the admin table (used by paginated loader)
function appendAdminStudentRow(doc) {
  const s = doc.data();
  const tbody = document.getElementById('admin-student-tbody');
  if (!tbody) return;
  const row = document.createElement('tr');
  row.setAttribute('data-student-id', doc.id);
  row.innerHTML = `
    <td class="td-username">${s.username}</td>
    <td>${s.displayName}</td>
    <td>${s.section}</td>
    <td class="td-pass">••••••••</td>
    <td class="td-actions">
      <button class="btn-sm btn-edit" onclick="openEditStudentModal(this)">✏ EDIT</button>
      <button class="btn-sm btn-delete" onclick="deleteAdminStudent(this)">🗑 DELETE</button>
    </td>`;
  tbody.appendChild(row);
}

// Load a page of admin students. If reset=true, clears table and restarts pagination.
async function loadAdminStudentsPage(reset = false) {
  if (!window.db) return;
  if (reset) {
    adminStudentsLastDoc = null;
    adminStudentsHasMore = true;
    adminStudentsShowAllLoaded = false;
    const tbody = document.getElementById('admin-student-tbody');
    if (tbody) tbody.innerHTML = '';
  }

  if (!adminStudentsHasMore) return;

  const sectionFilter = document.getElementById('admin-section-filter')?.value || '';
  let baseQuery;
  if (sectionFilter) {
    baseQuery = window.db.collection('students').where('section', '==', sectionFilter).orderBy('studentNumber', 'asc');
  } else {
    baseQuery = window.db.collection('students').orderBy('section', 'asc').orderBy('studentNumber', 'asc');
  }

  let q = baseQuery.limit(adminStudentsPageSize);
  if (adminStudentsLastDoc) q = q.startAfter(adminStudentsLastDoc);

  try {
    let snap;
    try {
      snap = await q.get();
    } catch (err) {
      // Firestore often returns a 'requires an index' error with a console link.
      if (err && err.message && /index/i.test(err.message)) {
        console.warn('Firestore query requires an index; falling back to unsorted fetch:', err);
        try {
          showToast('Firestore requires an index for this filter. Showing unsorted results as fallback.', 'error');
        } catch (e) { /* ignore */ }

        // Fallback: fetch matching documents without ordering, then sort client-side by studentNumber
        const fallbackQuery = sectionFilter
          ? window.db.collection('students').where('section', '==', sectionFilter)
          : window.db.collection('students');
        const fallbackSnap = await fallbackQuery.get();
        if (fallbackSnap.empty) {
          adminStudentsHasMore = false;
        } else {
          // clear any existing rows if reset was requested earlier
          fallbackSnap.forEach(doc => appendAdminStudentRow(doc));
          adminStudentsHasMore = false; // disable pagination for fallback
        }
        updateAdminStudentPaginationControls();
        return;
      }
      throw err;
    }

    if (snap.empty) {
      adminStudentsHasMore = false;
    } else {
      snap.forEach(doc => appendAdminStudentRow(doc));
      adminStudentsLastDoc = snap.docs[snap.docs.length - 1];
      adminStudentsHasMore = snap.size === adminStudentsPageSize;
    }
    updateAdminStudentPaginationControls();
  } catch (err) {
    console.error('Error loading student page:', err);
    showToast('Error loading students: ' + err.message, 'error');
  }
}

function getAdminStudentRows() {
  return Array.from(document.querySelectorAll('#admin-student-tbody tr[data-student-id]'));
}

function getAdminStudentFilteredRows() {
  return getAdminStudentRows().filter(row => row.style.display !== 'none-filtered');
}

function updateAdminStudentPaginationControls() {
  if (!adminStudentPaginationControls) {
    adminStudentPaginationControls = document.createElement('div');
    adminStudentPaginationControls.id = 'admin-student-pagination-controls';
    adminStudentPaginationControls.className = 'admin-pagination-controls';

    const table = document.getElementById('admin-student-tbody')?.parentNode;
    if (table && table.insertAdjacentElement) {
      table.insertAdjacentElement('afterend', adminStudentPaginationControls);
    } else {
      const container = document.getElementById('admin-students-container') || document.getElementById('admin-student-tbody')?.parentNode;
      if (container && container.parentNode) container.parentNode.appendChild(adminStudentPaginationControls);
    }

    adminStudentLoadMoreBtn = document.createElement('button');
    adminStudentLoadMoreBtn.type = 'button';
    adminStudentLoadMoreBtn.className = 'btn-sm admin-pagination-btn admin-pagination-load-more';
    adminStudentLoadMoreBtn.textContent = 'Load more';
    adminStudentLoadMoreBtn.addEventListener('click', async () => {
      adminStudentsShowAllLoaded = true;
      await loadAdminStudentsPage(false);
      renderAdminStudentRows();
    });

    adminStudentShowMoreBtn = document.createElement('button');
    adminStudentShowMoreBtn.type = 'button';
    adminStudentShowMoreBtn.className = 'btn-sm admin-pagination-btn admin-pagination-show-more';
    adminStudentShowMoreBtn.textContent = 'Show more';
    adminStudentShowMoreBtn.addEventListener('click', () => {
      adminStudentsShowAllLoaded = true;
      renderAdminStudentRows();
    });

    adminStudentShowLessBtn = document.createElement('button');
    adminStudentShowLessBtn.type = 'button';
    adminStudentShowLessBtn.className = 'btn-sm admin-pagination-btn admin-pagination-show-less';
    adminStudentShowLessBtn.textContent = 'Show less';
    adminStudentShowLessBtn.addEventListener('click', () => {
      adminStudentsShowAllLoaded = false;
      renderAdminStudentRows();
    });

    adminStudentPaginationControls.appendChild(adminStudentLoadMoreBtn);
    adminStudentPaginationControls.appendChild(adminStudentShowMoreBtn);
    adminStudentPaginationControls.appendChild(adminStudentShowLessBtn);
  }

  renderAdminStudentRows();
}

function renderAdminStudentRows() {
  const rows = getAdminStudentRows();
  const q = (document.getElementById('admin-search')?.value || '').toLowerCase();
  const sectionFilter = document.getElementById('admin-section-filter')?.value || '';
  const matchingRows = [];

  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    const sectionText = row.querySelector('td:nth-child(3)')?.textContent || '';
    const matchesSearch = text.includes(q);
    const matchesSection = !sectionFilter || sectionText === sectionFilter;
    const matches = matchesSearch && matchesSection;
    row.style.display = matches ? '' : 'none';
    if (matches) matchingRows.push(row);
  });

  if (!adminStudentsShowAllLoaded) {
    matchingRows.forEach((row, index) => {
      row.style.display = index < 15 ? '' : 'none';
    });
  }

  updateAdminStudentCount();
  updateAdminStudentPaginationControlsVisibility(matchingRows.length);
}

function updateAdminStudentPaginationControlsVisibility(matchingCount = 0) {
  const controls = adminStudentPaginationControls || document.getElementById('admin-student-pagination-controls');
  if (!controls) return;
  const hasOverflow = matchingCount > 15;
  const showMoreVisible = hasOverflow && !adminStudentsShowAllLoaded;
  const showLessVisible = hasOverflow && adminStudentsShowAllLoaded;
  const loadMoreVisible = adminStudentsHasMore && (!hasOverflow || adminStudentsShowAllLoaded);

  if (adminStudentLoadMoreBtn) adminStudentLoadMoreBtn.style.display = loadMoreVisible ? 'inline-flex' : 'none';
  if (adminStudentShowMoreBtn) adminStudentShowMoreBtn.style.display = showMoreVisible ? 'inline-flex' : 'none';
  if (adminStudentShowLessBtn) adminStudentShowLessBtn.style.display = showLessVisible ? 'inline-flex' : 'none';

  controls.style.display = (adminStudentLoadMoreBtn?.style.display === 'none' && adminStudentShowMoreBtn?.style.display === 'none' && adminStudentShowLessBtn?.style.display === 'none') ? 'none' : 'flex';
}

async function updateAdminStudent() {
  if (!window.db) { showToast('Firebase not initialized.', 'error'); return; }
  if (!adminStudentEditId) { showToast('No student selected.', 'error'); return; }

  clearFieldHighlights();

  const first = document.getElementById('s-input-first').value.trim();
  const last = document.getElementById('s-input-last').value.trim();
  const section = document.getElementById('s-input-section').value;

  const emptyFields = [];
  if (!first) emptyFields.push('s-input-first');
  if (!last) emptyFields.push('s-input-last');
  if (!section) emptyFields.push('s-input-section');

  if (emptyFields.length > 0) {
    highlightFields(emptyFields);
    showToast('Please fill in all required fields.', 'error');
    return;
  }

  try {
    const studentData = await getDocumentData('students', adminStudentEditId);
    const newTeacherId = sectionTeacherMap[section];
    if (!newTeacherId) {
      throw new Error('No active teacher found for the selected section.');
    }

    // The username is the student's login (the game signs in as {username}@readysetbag.local)
    // and the login email can't be changed from the browser, so a section change keeps both.
    // Renaming it here used to lock students out after moving section.
    await window.db.collection('students').doc(adminStudentEditId).update({
      firstName: first,
      lastName: last,
      displayName: `${first} ${last}`,
      section,
      teacherId: newTeacherId,
      authEmail: getStudentAuthEmail(studentData),
      updatedAt: new Date()
    });

    adminStudentEditId = null;
    setStudentModalMode('create');
    closeStudentModal();
    showToast(`${studentData.displayName || 'Student'} updated successfully!`);
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

// ---- DELETE STUDENT ----
async function deleteAdminStudent(btn) {
  if (!window.db) { showToast('Firebase not initialized.', 'error'); return; }
  const row = btn.closest('tr');
  const id = row.getAttribute('data-student-id');
  const name = row.querySelector('td:nth-child(2)').textContent;
  if (confirm(`Delete ${name}?`)) {
    try {
      const studentData = await getDocumentData('students', id);

      if (!(await deleteLoginOrConfirm(studentData.authUid, getStudentAuthEmail(studentData), name))) return;

      await window.db.collection('students').doc(id).delete();
      await deleteAccountSecret(studentData.authUid);
      showToast(`${name} deleted.`);
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
  }
}

// ---- FILTER STUDENTS ----
function filterAdminStudents(query) {
  renderAdminStudentRows();
}

function updateAdminStudentCount() {
  const total = getAdminStudentRows().length;
  const visible = getAdminStudentRows().filter(row => row.style.display !== 'none').length;
  const footer = document.getElementById('admin-student-footer');
  if (footer) footer.textContent = `SHOWING ${visible} OF ${total} STUDENTS`;
  const countEl = document.getElementById('admin-student-count-text');
  if (countEl) countEl.textContent = total;
}

/* ============================================================================
   ADMIN ANALYTICS & REPORTING
   ============================================================================ */

// ---- LOAD TOTAL SESSIONS COUNT ----
function loadTotalSessionsCount() {
  if (!window.auth || !window.auth.currentUser) {
    window.authReadyPromise.then((user) => { if (user) loadTotalSessionsCount(); });
    return;
  }

  if (!window.db) return;

  window.db.collection('sessions').onSnapshot((snapshot) => {
    const count = snapshot.size;
    const element = document.getElementById('total-sessions-count');
    if (element) element.textContent = count;
  });
}

/* ============================================================================
   SCHOOL-WIDE REPORTS ENGINE
   Uses window.RSBAnalytics for all aggregation so the numbers match the
   teacher dashboard. Reads the full sessionResults + students collections
   (school-wide, admin scope) once via a live listener, caches them, and
   re-renders whenever the section/level filters change.
   ============================================================================ */
let adminResultsCache = [];
let adminStudentsCache = [];
let adminResultsListener = null;
let adminReportsFiltersPopulated = false;

function loadAdminReports() {
  if (!window.auth || !window.auth.currentUser) {
    window.authReadyPromise.then((user) => { if (user) loadAdminReports(); });
    return;
  }
  if (!window.db || !window.RSBAnalytics) return;

  // Fetch the roster once (students rarely change during a reports view).
  window.db.collection('students').get().then((snap) => {
    adminStudentsCache = snap.docs.map(d => d.data());
    populateAdminSectionFilter();
    renderAdminReports();
  }).catch(e => console.warn('admin reports: students fetch failed', e));

  // Live listener on results so numbers update as the game feeds data.
  if (adminResultsListener) { adminResultsListener(); adminResultsListener = null; }
  adminResultsListener = window.db.collection('sessionResults').limit(2000)
    .onSnapshot((snap) => {
      adminResultsCache = snap.docs.map(d => d.data());
      populateAdminSectionFilter();
      renderAdminReports();
    }, (err) => console.warn('admin reports: results listener error', err));
}

function populateAdminSectionFilter() {
  if (adminReportsFiltersPopulated) return;
  const sel = document.getElementById('reports-section-filter');
  if (!sel || !window.RSBAnalytics) return;
  const sections = window.RSBAnalytics.distinctSections(adminResultsCache, adminStudentsCache);
  if (!sections.length) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">ALL SECTIONS</option>' +
    sections.map(s => `<option value="${window.RSBAnalytics.esc(s)}">${window.RSBAnalytics.esc(s)}</option>`).join('');
  sel.value = current;
  adminReportsFiltersPopulated = true;
}

function getAdminReportFilters() {
  return {
    section: (document.getElementById('reports-section-filter')?.value) || '',
    difficulty: (document.getElementById('reports-level-filter')?.value) || '',
    sessionId: adminSessionScope ? adminSessionScope.sessionId : ''
  };
}

/* ---- SESSION-SCOPED REPORTS ----
   Clicking a session card in Recent Activity opens the reports page filtered
   to that one drill run. The scope lives here rather than in the dropdowns so
   the section/level filters still work inside it. */
let adminSessionScope = null;

function viewAdminSessionReport(sessionId, code, difficulty, meta) {
  adminSessionScope = { sessionId: sessionId, code: code || '', meta: meta || '' };
  const level = document.getElementById('reports-level-filter');
  // A session runs at one difficulty; matching the filter to it avoids an
  // empty report when the session isn't the level currently selected.
  if (level && difficulty && window.RSBAnalytics &&
      window.RSBAnalytics.KNOWN_LEVELS.indexOf(String(difficulty).toLowerCase()) !== -1) {
    level.value = String(difficulty).toLowerCase();
  }
  const reportsNav = document.querySelectorAll('.nav-item')[3];
  navigate('reports', reportsNav);
  syncAdminSessionScopeBanner();
  renderAdminReports();
  document.querySelector('.main')?.scrollTo({ top: 0, behavior: 'smooth' });
}

function clearAdminSessionScope() {
  adminSessionScope = null;
  syncAdminSessionScopeBanner();
  renderAdminReports();
}

function syncAdminSessionScopeBanner() {
  const bar = document.getElementById('admin-session-scope');
  if (!bar) return;
  if (!adminSessionScope) { bar.style.display = 'none'; return; }
  bar.style.display = '';
  setText('admin-session-scope-code', adminSessionScope.code || adminSessionScope.sessionId);
  setText('admin-session-scope-meta', adminSessionScope.meta || '');
}

function renderAdminReports() {
  const A = window.RSBAnalytics;
  if (!A) return;
  const filters = getAdminReportFilters();
  const results = adminResultsCache;
  const students = adminStudentsCache;

  const metrics = A.computeMetrics(results, students, filters);
  const sections = A.sectionAverages(results, students, filters);

  // --- Reports stat cards ---
  const scopeSub = (filters.section || 'all sections') +
    (filters.difficulty ? ' · ' + filters.difficulty : '');
  setText('reports-total-students', metrics.totalStudents);
  setText('reports-total-students-sub', metrics.sectionsCount + (metrics.sectionsCount === 1 ? ' section' : ' sections'));
  setText('reports-avg-score', metrics.hasData ? metrics.avgScore + '/100' : '—');
  setText('reports-avg-score-sub', scopeSub);
  setText('reports-completion', metrics.totalStudents ? metrics.completionRate + '%' : '—');
  setText('reports-completion-sub', metrics.playedCount + '/' + metrics.totalStudents);

  // --- Home School-wide statistics panel ---
  // Computed unfiltered on purpose: the panel is labelled school-wide, and the
  // Reports dropdowns that would otherwise scope it live on a different page
  // where an admin looking at Home cannot see what they are set to.
  const swide = A.computeMetrics(results, students, {});
  setText('sw-avg-score', swide.hasData ? swide.avgScore + '/100' : '—');
  setText('sw-completion', swide.totalStudents ? swide.completionRate + '%' : '—');

  // --- Average scores by section table ---
  const tbody = document.getElementById('section-report-tbody');
  if (tbody) {
    if (!sections.length) {
      tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--text-muted);padding:18px;">No results yet</td></tr>';
    } else {
      let html = sections.map(s => {
        const badge = s.needsSupport
          ? '<span class="status-badge below-threshold">⚠ Needs Support</span>'
          : '<span class="status-badge">Good</span>';
        const rowStyle = s.needsSupport ? ' style="background-color:rgba(231,76,60,0.15);"' : '';
        return `<tr${rowStyle}><td>${A.esc(s.section)}</td><td class="td-avg">${s.avg}</td><td>${badge}</td></tr>`;
      }).join('');
      // School average row
      const schoolAvg = metrics.hasData ? metrics.avgScore : 0;
      html += `<tr style="border-top:2px solid #444;"><td class="td-school-avg">SCHOOL AVG</td><td class="td-avg td-school-avg">${schoolAvg}</td><td><span class="status-badge${schoolAvg < A.SUPPORT_THRESHOLD ? ' below-threshold' : ''}">${schoolAvg < A.SUPPORT_THRESHOLD ? '⚠ Needs Support' : 'Good'}</span></td></tr>`;
      tbody.innerHTML = html;
    }
  }

  // --- Needs support (students below threshold) ---
  const needsList = document.getElementById('needs-support-list');
  if (needsList) {
    const strugglers = A.studentsNeedingSupport(results, filters).slice(0, 6);
    needsList.innerHTML = strugglers.length
      ? strugglers.map(s => `<div class="needs-support-item"><div class="needs-support-name">${A.esc(s.studentName)} – ${s.avgScore}/100</div><div class="needs-support-note">${A.esc(s.section)} · CONSIDER ADDITIONAL TRAINING</div></div>`).join('')
      : '<div class="needs-support-item"><div class="needs-support-name" style="color:var(--accent-green);">✓ All students on track</div><div class="needs-support-note">No students below ' + A.SUPPORT_THRESHOLD + '%</div></div>';
  }

  // --- Visual diagnostics ---
  renderAdminCharts(results, students, filters, sections);

  // --- Individual results table ---
  renderAdminIndividualResults();
}

/* ---- REPORT CHARTS ----
   All four read from RSBAnalytics, so every bar agrees with the table under
   it by construction. Drawn by dashboard-charts.js (hand-rolled HTML/SVG —
   there is no charting library in this project on purpose). */
function renderAdminCharts(results, students, filters, sections) {
  const A = window.RSBAnalytics;
  const C = window.RSBCharts;
  if (!A || !C) return;

  // 1. Section performance against the 70% support threshold.
  setText('chart-sections-tag', sections.length + (sections.length === 1 ? ' SECTION' : ' SECTIONS'));
  C.hBars('chart-section-performance', {
    rows: sections.map(sec => ({
      label: sec.section,
      pct: sec.avg,
      display: sec.avg,
      color: sec.needsSupport ? 'var(--chart-bad)' : 'var(--chart-good)'
    })),
    benchmark: { pct: A.SUPPORT_THRESHOLD, label: '70%' },
    axis: ['0', '20', '40', '60', '80', '100'],
    labelWidth: 116,
    emptyText: 'NO SECTION RESULTS YET'
  });

  // 2. Readiness tiers.
  const tiers = A.readinessTiers(results, filters);
  setText('chart-readiness-tag', tiers.evaluated + ' EVALUATED');
  C.donut('chart-readiness', {
    segments: [
      { label: 'Mastered (90-100%)', value: tiers.mastered, color: 'var(--chart-good)' },
      { label: 'Proficient (70-89%)', value: tiers.proficient, color: 'var(--chart-warn)' },
      { label: 'Needs Support (<70%)', value: tiers.needsSupport, color: 'var(--chart-bad)' }
    ],
    centerValue: tiers.onTrackPct + '%',
    centerLabel: 'On Track',
    emptyText: 'NO STUDENTS EVALUATED YET'
  });

  // 3. Participation: how much of each section's roster has actually drilled.
  const participation = A.participationRates(results, students, filters);
  C.hBars('chart-participation', {
    rows: participation.map(p => ({
      label: p.section,
      pct: p.pct,
      display: p.pct + '%',
      color: 'var(--chart-neutral)'
    })),
    axis: ['0', '20', '40', '60', '80', '100'],
    labelWidth: 116,
    emptyText: 'NO ROSTER DATA YET'
  });

  // 4. Curriculum progression across the three difficulty tiers. Student
  // counts are scaled against the largest tier so the shorter bars still read;
  // scores are already a 0-100 scale.
  const levels = A.levelProgression(results, filters);
  const maxStudents = Math.max(1, ...levels.map(l => l.students));
  C.groupedBars('chart-level-progression', {
    legend: [
      { label: 'Students Attempted', color: 'var(--chart-neutral)' },
      { label: 'Avg Score (%)', color: 'var(--chart-good)' }
    ],
    groups: levels.map(l => ({
      label: l.label,
      sub: l.students + ' student' + (l.students === 1 ? '' : 's') + ' \u00b7 avg ' + l.avgScore,
      bars: [
        { pct: (l.students / maxStudents) * 100, display: l.students, color: 'var(--chart-neutral)' },
        { pct: l.avgScore, display: l.avgScore, color: 'var(--chart-good)' }
      ]
    })),
    emptyText: 'NO LEVEL DATA YET'
  });
}

function renderAdminIndividualResults() {
  const A = window.RSBAnalytics;
  if (!A) return;
  const tbody = document.getElementById('admin-individual-tbody');
  const footer = document.getElementById('admin-individual-footer');
  if (!tbody) return;

  const filters = getAdminReportFilters();
  let rows = A.individualRows(adminResultsCache, filters);
  const q = (document.getElementById('admin-individual-search')?.value || '').trim().toLowerCase();
  if (q) rows = rows.filter(r => (r.studentName || '').toLowerCase().includes(q) || (r.section || '').toLowerCase().includes(q));

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:18px;">No results yet</td></tr>';
    if (footer) footer.textContent = '';
    return;
  }
  // Skill tier / attempts / mistakes were dropped from this table per the
  // revision board: they are diagnostic detail that belongs in the charts and
  // the CSV export, not in the at-a-glance roster view.
  tbody.innerHTML = rows.map(r => {
    return `<tr>
      <td>${A.esc(r.studentName)}</td>
      <td>${A.esc(r.section)}</td>
      <td>${r.bestScore}</td>
      <td class="td-time">${A.formatTime(r.bestTime)}</td>
    </tr>`;
  }).join('');
  if (footer) {
    // Flag results whose level no filter can match, rather than dropping them
    // out of every report with no trace.
    const excluded = A.countUnknownLevel(adminResultsCache);
    let html = `SHOWING ${rows.length} STUDENT${rows.length === 1 ? '' : 'S'} WITH RESULTS`;
    if (excluded) {
      html += `<span class="table-footer-warn">⚠ ${excluded} RESULT${excluded === 1 ? '' : 'S'} NOT SHOWN (MISSING LEVEL)</span>`;
    }
    footer.innerHTML = html;
  }
}

// Small DOM helpers
function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

// Backwards-compatible alias (init + nav still call this name)
function flagBelowThresholdSections() { loadAdminReports(); }

// ---- LOAD ADMIN RECENT ACTIVITY ----
function loadAdminRecentActivity() {
  if (!window.auth || !window.auth.currentUser) {
    window.authReadyPromise.then((user) => { if (user) loadAdminRecentActivity(); });
    return;
  }
  
  if (!window.db) return;
  
  const container = document.getElementById('admin-recent-activity');
  if (!container) return;

  // show loader immediately while snapshot listener initializes
  try {
    container.innerHTML = '<div class="gif-loader"><img src="/images/loading.gif" class="gif-loader-image" width="72" height="72" style="width:72px;height:72px;" onerror="this.src=\'../images/loading.gif\'"/><div class="gif-loader-text">LOADING…</div></div>';
  } catch (e) { console.warn('show admin loader failed', e); }

  if (adminRecentActivityListener) {
    adminRecentActivityListener();
    adminRecentActivityListener = null;
  }
  
  // Listen to sessions collection for recent activity
  adminRecentActivityListener = window.db.collection('sessions')
    .orderBy('createdAt', 'desc')
    .limit(5)
    .onSnapshot(async (snapshot) => {
      if (snapshot.empty) {
        container.innerHTML = '<div class="activity-item"><div class="activity-desc">No recent activity</div></div>';
        return;
      }

      // Gather teacherIds referenced in these sessions
      const teacherIds = Array.from(new Set(snapshot.docs.map(d => d.data().teacherId).filter(Boolean)));
      const teacherMap = {};
      try {
        if (teacherIds.length) {
          // Firestore 'in' query (safe for up to 10 ids)
          const tSnap = await window.db.collection('teachers').where(firebase.firestore.FieldPath.documentId(), 'in', teacherIds).get();
          tSnap.forEach(td => teacherMap[td.id] = td.data());
        }
      } catch (e) {
        // ignore lookup errors; we'll fallback to unknown
        console.warn('Failed to load teacher names for recent activity', e);
      }

      // Render each session with teacher name/section when available
      const recentSessions = snapshot.docs
        .map((doc) => ({ id: doc.id, data: doc.data() }))
        .filter((entry) => entry.data.startedAt || entry.data.status === 'active' || entry.data.endedAt)
        .sort((left, right) => {
          const leftTime = left.data.startedAt?.toDate?.() || left.data.updatedAt?.toDate?.() || left.data.createdAt?.toDate?.() || new Date(0);
          const rightTime = right.data.startedAt?.toDate?.() || right.data.updatedAt?.toDate?.() || right.data.createdAt?.toDate?.() || new Date(0);
          return rightTime - leftTime;
        });

      // Build the whole list, then write it in one assignment. Appending in a
      // loop after the `await` above let two overlapping invocations each add
      // their own five rows, so the panel showed every session twice.
      const esc = (window.RSBAnalytics && window.RSBAnalytics.esc) || ((s) => s);

      // Cached so the "export these 5" button doesn't have to re-query.
      adminRecentSessions = recentSessions.map((entry) => {
        const session = entry.data;
        const teacher = teacherMap[session.teacherId] || null;
        return {
          id: entry.id,
          code: session.sessionCode || '',
          difficulty: session.difficulty || '',
          section: (teacher && teacher.section) || '',
          teacherLabel: teacher
            ? `Teacher ${teacher.lastName || teacher.firstName || session.teacherId}`
            : (session.teacherId || 'Unknown Teacher')
        };
      });

      container.innerHTML = recentSessions.map((entry) => {
        const session = entry.data;
        const dateSource = session.startedAt || session.updatedAt || session.createdAt;
        const date = dateSource ? new Date(dateSource.toDate()).toLocaleDateString('en-US', {month: 'short', day: 'numeric'}) : 'Unknown';
        const difficulty = session.difficulty || 'Unknown';
        // Distinct students: rejoining the join screen appends a second entry for the same one
        const playerCount = new Set((session.playersList || [])
          .map(p => (p && typeof p === 'object') ? (p.studentId || p.uid || p.username) : p)
          .filter(Boolean)).size;
        const started = session.status === 'active' || !!session.startedAt;
        const statusLabel = started ? 'Started' : 'Created';
        const teacher = teacherMap[session.teacherId] || null;
        const teacherLabel = teacher ? (`Teacher ${teacher.lastName || teacher.firstName || session.teacherId}`) : (session.teacherId || 'Unknown Teacher');
        const sectionLabel = teacher && teacher.section ? ` – ${teacher.section}` : '';
        const meta = `${teacherLabel}${sectionLabel}`;

        return `<div class="session-card${started ? '' : ' is-created'}">
          <div class="session-card-date">● ${esc(date)}</div>
          <div class="session-card-who">${esc(meta)}</div>
          <div class="session-card-title">${statusLabel} ${esc(difficulty.charAt(0).toUpperCase() + difficulty.slice(1))} Session</div>
          <div class="session-card-meta">Code: <b>${esc(session.sessionCode)}</b> (${playerCount} student${playerCount === 1 ? '' : 's'})</div>
          <div class="session-card-actions">
            <button class="session-link" onclick="viewAdminSessionReport('${jsArg(entry.id)}','${jsArg(session.sessionCode || '')}','${jsArg(difficulty)}','${jsArg(meta)}')">▤ Click to view report for this session</button>
            <button class="session-export" onclick="exportSingleSessionCsv('${jsArg(entry.id)}','${jsArg(session.sessionCode || '')}')">⬇ EXPORT CSV</button>
          </div>
        </div>`;
      }).join('');
    });
}

/* ============================================================================
   SESSION EXPORTS + PRINTABLE REPORT
   ============================================================================ */
let adminRecentSessions = [];

// Values interpolated into an inline onclick are parsed as HTML *then* as JS,
// so HTML-escaping alone is not enough: "&#39;" decodes back to a real quote
// and closes the string literal early. Escape for JS first, then for HTML.
function jsArg(value) {
  const esc = (window.RSBAnalytics && window.RSBAnalytics.esc) || ((v) => String(v));
  return esc(String(value == null ? '' : value).replace(/\\/g, '\\\\').replace(/'/g, "\\'"));
}


const SESSION_RESULT_CSV_HEADER = ['id','sessionId','sessionCode','teacherId','studentId','studentName','section','score','completionTime','attempts','stage','essentials','essentialsMax','errors','difficulty','createdAt','updatedAt'].join(',');

function sessionResultCsvRow(doc) {
  const r = doc.data();
  const created = r.createdAt && r.createdAt.toDate ? r.createdAt.toDate().toISOString() : (r.createdAt ? new Date(r.createdAt).toISOString() : '');
  const updated = r.updatedAt && r.updatedAt.toDate ? r.updatedAt.toDate().toISOString() : (r.updatedAt ? new Date(r.updatedAt).toISOString() : '');
  return [doc.id, r.sessionId || '', r.sessionCode || '', r.teacherId || '', r.studentId || '', r.studentName || '',
    r.section || '', r.score || 0, r.completionTime || 0, r.attempts || 0, r.stage || '', r.essentials || 0,
    r.essentialsMax || 0, r.errors || 0, r.difficulty || '', created, updated]
    .map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',');
}

// One session's results. Keyed on sessionId rather than sessionCode because
// codes are short and get reused across terms.
async function exportSingleSessionCsv(sessionId, sessionCode) {
  if (!window.db) { showToast('Firebase not initialized.', 'error'); return; }
  try {
    const snap = await window.db.collection('sessionResults').where('sessionId', '==', sessionId).get();
    if (snap.empty) { showToast('No results recorded for this session yet.', 'error'); return; }
    const rows = [SESSION_RESULT_CSV_HEADER];
    snap.forEach(doc => rows.push(sessionResultCsvRow(doc)));
    downloadCsv(`session-${(sessionCode || sessionId)}-results.csv`, rows.join('\n'));
    showToast('Session CSV exported.');
  } catch (err) {
    console.error('Export session CSV failed', err);
    showToast('Error exporting session: ' + err.message, 'error');
  }
}

// The five sessions currently listed in Recent Activity, in one file. This is
// the panel's answer to its own archive warning.
async function exportRecentSessionsCsv() {
  if (!window.db) { showToast('Firebase not initialized.', 'error'); return; }
  const ids = adminRecentSessions.map(s => s.id).filter(Boolean);
  if (!ids.length) { showToast('No recent sessions to export yet.', 'error'); return; }
  try {
    // Firestore caps an 'in' query at 10 values; this list is capped at 5.
    const snap = await window.db.collection('sessionResults').where('sessionId', 'in', ids).get();
    if (snap.empty) { showToast('No results recorded for these sessions yet.', 'error'); return; }
    const rows = [SESSION_RESULT_CSV_HEADER];
    snap.forEach(doc => rows.push(sessionResultCsvRow(doc)));
    downloadCsv('recent-5-sessions-results.csv', rows.join('\n'));
    showToast('Recent sessions CSV exported.');
  } catch (err) {
    console.error('Export recent sessions CSV failed', err);
    showToast('Error exporting sessions: ' + err.message, 'error');
  }
}

// Stamps the print letterhead with what is actually on screen before handing
// off to the browser, so a saved PDF says which scope it covers.
function printAdminReport() {
  const filters = getAdminReportFilters();
  const scope = [
    filters.section || 'All sections',
    filters.difficulty ? filters.difficulty.charAt(0).toUpperCase() + filters.difficulty.slice(1) + ' level' : '',
    adminSessionScope ? 'Session ' + (adminSessionScope.code || adminSessionScope.sessionId) : ''
  ].filter(Boolean).join('  \u00b7  ');
  const generated = new Date().toLocaleString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit'
  });
  setText('admin-print-meta', `Scope: ${scope}     Generated: ${generated}`);
  // Let the DOM paint the stamped header before the print dialog freezes it.
  setTimeout(() => window.print(), 60);
}
