/* ============================================================================
   SESSION MANAGER - Handle Firestore Session Operations
   ============================================================================ */

let currentSessionCode = null;
let currentSessionId = null;
let currentDifficulty = 'beginner';
// Which go-bag the class packs: 'standard' | 'small' | 'medium' (the game's bag order)
let currentBagType = 'standard';
let sessionListener = null;

// ---- SESSION STATES ----
// idle   → no code yet; difficulty changeable, generate enabled, launch disabled
// ready  → code generated; difficulty changeable, regenerate enabled, launch enabled
// active → launched; everything locked except Stop Session

function applySessionState(state) {
  // Bag options share the .diff-option styling, so they lock along with the difficulty
  const diffInputs      = document.querySelectorAll('input[name="difficulty"], input[name="bagType"]');
  const diffLabels      = document.querySelectorAll('.diff-option');
  const btnGenerate     = document.getElementById('btn-generate');
  const btnLaunch       = document.getElementById('btn-launch');
  const btnStop         = document.getElementById('btn-stop');
  const codeBox         = document.getElementById('code-box');
  const codePlaceholder = document.getElementById('code-placeholder');

  if (state === 'idle') {
    diffInputs.forEach(r => r.disabled = false);
    diffLabels.forEach(l => { l.classList.remove('locked'); l.style.opacity = ''; l.style.cursor = ''; });

    codeBox.style.display = 'none';
    codePlaceholder.style.display = '';
    btnGenerate.disabled = false;
    btnGenerate.style.opacity = '';
    btnGenerate.style.cursor = '';
    btnGenerate.textContent = '✨ GENERATE SESSION CODE';

    btnLaunch.style.display = '';
    btnLaunch.disabled = true;
    btnLaunch.style.opacity = '0.45';
    btnLaunch.style.cursor = 'not-allowed';
    btnStop.style.display = 'none';

  } else if (state === 'ready') {
    diffInputs.forEach(r => r.disabled = false);
    diffLabels.forEach(l => { l.classList.remove('locked'); l.style.opacity = ''; l.style.cursor = ''; });

    codeBox.style.display = '';
    codePlaceholder.style.display = 'none';
    btnGenerate.disabled = false;
    btnGenerate.style.opacity = '';
    btnGenerate.style.cursor = '';
    btnGenerate.textContent = '🔄 REGENERATE CODE';

    btnLaunch.style.display = '';
    btnLaunch.disabled = false;
    btnLaunch.style.opacity = '';
    btnLaunch.style.cursor = '';
    btnStop.style.display = 'none';

  } else if (state === 'active') {
    diffInputs.forEach(r => r.disabled = true);
    diffLabels.forEach(l => { l.classList.add('locked'); l.style.opacity = '0.5'; l.style.cursor = 'not-allowed'; });

    codeBox.style.display = '';
    codePlaceholder.style.display = 'none';
    btnGenerate.disabled = true;
    btnGenerate.style.opacity = '0.45';
    btnGenerate.style.cursor = 'not-allowed';

    btnLaunch.style.display = 'none';
    btnStop.style.display = '';
    btnStop.disabled = false;
  }
}

// Distinct students in a session's playersList. A student who leaves the join screen and
// comes back adds a second entry (each carries its own join time), so count them once.
function countJoinedPlayers(playersList) {
  if (!Array.isArray(playersList)) return 0;
  const seen = new Set();
  playersList.forEach((p) => {
    const key = p && typeof p === 'object' ? (p.studentId || p.uid || p.username) : p;
    if (key) seen.add(key);
  });
  return seen.size;
}

// Joined count shown against the teacher's class size (kept live by the dashboard's roster
// listener as window.teacherClassSize).
let lastJoinedCount = 0;

function updateJoinedDisplay(joinedCount) {
  if (typeof joinedCount === 'number') lastJoinedCount = joinedCount;
  const classSize = typeof window.teacherClassSize === 'number' ? window.teacherClassSize : null;

  document.getElementById('joined-count').textContent = lastJoinedCount;
  document.getElementById('joined-max').textContent = classSize === null ? '/—' : '/' + classSize;
  const pct = classSize ? Math.min(100, (lastJoinedCount / classSize) * 100) : 0;
  document.getElementById('joined-bar').style.width = pct + '%';
}

// Start in idle state on page load, then pick up a session this teacher left running
document.addEventListener('DOMContentLoaded', () => {
  applySessionState('idle');
  restoreOpenSession();
});

/**
 * On page open the Session page always starts blank: a code only appears after the
 * teacher clicks Generate.
 *
 * - A session that was generated but never launched (status 'waiting' - e.g. the tab was
 *   closed before Launch) is deleted. Otherwise its code would reappear on the next visit
 *   and, left lying around, would count against the section's 5-session cap.
 * - A LAUNCHED session ('active') is never shown automatically either. One launched more
 *   than STALE_SESSION_MS ago is over and gets ended (scores kept). One launched in the last
 *   few minutes might still have students playing, so a notice offers Resume / End it.
 */
async function restoreOpenSession() {
  try {
    const user = await window.authReadyPromise;
    const teacherId = sessionStorage.getItem('teacherId');
    if (!user || !teacherId || !window.db) return;

    const snap = await window.db.collection('sessions')
      .where('teacherId', '==', teacherId)
      .where('status', 'in', ['waiting', 'active'])
      .get();
    if (snap.empty || currentSessionId) return;

    // Discard never-launched sessions (they have no results to lose).
    const waiting = snap.docs.filter(d => d.data().status === 'waiting');
    for (const d of waiting) {
      await discardUnlaunchedSession(d.id);
    }

    // Launched sessions. Nothing ends a session except the teacher's Stop button, so one
    // that was launched and never stopped stays 'active' indefinitely. Past the longest game
    // (10 minutes) plus a margin it is certainly over: end it quietly. It is ENDED, not
    // deleted - it was played, so its scores are kept.
    const millis = (v) => (v && v.toMillis ? v.toMillis() : (v ? new Date(v).getTime() : 0));
    const now = Date.now();
    const live = [];
    for (const d of snap.docs.filter(x => x.data().status === 'active')) {
      const data = d.data();
      const started = millis(data.startedAt) || millis(data.createdAt);
      if (!started || now - started > STALE_SESSION_MS) {
        await window.db.collection('sessions').doc(d.id)
          .update({ status: 'ended', endedAt: new Date(), updatedAt: new Date() })
          .catch((e) => console.warn('Could not end stale session', d.id, e));
      } else {
        live.push(d);
      }
    }
    if (!live.length || currentSessionId) return;

    // A session launched in the last few minutes may genuinely still be running (e.g. the
    // teacher refreshed mid-game). The page still opens blank - it only offers to resume.
    const latest = live.slice().sort((a, b) => millis(b.data().createdAt) - millis(a.data().createdAt))[0];
    offerResumeSession(latest.id, latest.data());
  } catch (error) {
    console.warn('Could not restore the open session', error);
  }
}

// Longest game is 10 minutes (Beginner); anything launched longer ago than this is over.
const STALE_SESSION_MS = 30 * 60 * 1000;

function offerResumeSession(sessionId, s) {
  const bar = document.getElementById('resume-session-banner');
  if (!bar) return;
  const started = s.startedAt && s.startedAt.toDate ? s.startedAt.toDate() : null;
  document.getElementById('resume-session-text').textContent =
    'A session you launched' + (started ? ' at ' + started.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '') +
    ' may still be running.';
  bar.dataset.sessionId = sessionId;
  bar._session = s;
  bar.style.display = '';
}

function hideResumeBanner() {
  const bar = document.getElementById('resume-session-banner');
  if (bar) { bar.style.display = 'none'; bar._session = null; delete bar.dataset.sessionId; }
}

// Teacher chose to go back to the running session.
function resumeOpenSession() {
  const bar = document.getElementById('resume-session-banner');
  const sessionId = bar && bar.dataset.sessionId;
  const s = bar && bar._session;
  if (!sessionId || !s) return;
  hideResumeBanner();

  currentSessionId = sessionId;
  currentSessionCode = s.sessionCode || '';
  currentDifficulty = s.difficulty || 'beginner';
  currentBagType = s.bagType || 'standard';

  document.getElementById('session-code').textContent = currentSessionCode;
  document.getElementById('code-inline').textContent = currentSessionCode;
  checkOption('difficulty', currentDifficulty, '.diff-option:not(.bag-option)');
  checkOption('bagType', currentBagType, '.bag-option');

  listenToPlayerJoins();
  applySessionState('active');
}

// Teacher chose to close it instead. Ended, not deleted: it was played.
async function endOpenSession() {
  const bar = document.getElementById('resume-session-banner');
  const sessionId = bar && bar.dataset.sessionId;
  if (!sessionId) return;
  try {
    await window.db.collection('sessions').doc(sessionId)
      .update({ status: 'ended', endedAt: new Date(), updatedAt: new Date() });
    hideResumeBanner();
    showToast('Session ended.');
  } catch (error) {
    console.error('Error ending session:', error);
    showToast('Failed to end session', 'error');
  }
}

// A generated-but-never-launched session: delete it outright instead of marking it ended.
// Ending it would leave an empty "Created" session that still counts toward the section's
// 5-session cap - clicking Regenerate five times would then push real, played sessions
// (and their scores) out of the cap.
async function discardUnlaunchedSession(sessionId) {
  try {
    if (window.RSBSessions) {
      await window.RSBSessions.deleteSessionCascade(sessionId, { teacherId: sessionStorage.getItem('teacherId') });
    } else {
      await window.db.collection('sessions').doc(sessionId).delete();
    }
  } catch (e) {
    console.warn('Could not discard unlaunched session', sessionId, e);
  }
}

function checkOption(name, value, optionSelector) {
  const radio = document.querySelector(`input[name="${name}"][value="${value}"]`);
  if (!radio) return;
  radio.checked = true;
  document.querySelectorAll(optionSelector).forEach(o => o.classList.remove('selected'));
  radio.closest(optionSelector.split(':')[0]).classList.add('selected');
}

// ---- GENERATE CODE ----
async function generateCode() {
  try {
    hideResumeBanner();
    await window.authReadyPromise;

    // Regenerating replaces a code that was never launched, so drop that session entirely
    // (see discardUnlaunchedSession) rather than leaving an empty one behind.
    if (currentSessionId) {
      if (sessionListener) { sessionListener(); sessionListener = null; }
      await discardUnlaunchedSession(currentSessionId);
      currentSessionCode = null;
      currentSessionId = null;
    }

    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];

    const selectedDiff = document.querySelector('input[name="difficulty"]:checked');
    const difficulty = selectedDiff ? selectedDiff.value : 'beginner';
    const selectedBag = document.querySelector('input[name="bagType"]:checked');
    const bagType = selectedBag ? selectedBag.value : 'standard';
    const teacherId = sessionStorage.getItem('teacherId');
    const timestamp = new Date();

    const sessionRef = await window.db.collection('sessions').add({
      sessionCode: code,
      teacherId: teacherId,
      // Stored so the admin's Recent Activity can filter by section directly
      section: sessionStorage.getItem('teacherSection') || '',
      difficulty: difficulty,
      bagType: bagType,
      status: 'waiting',
      playersJoined: 0,
      playersList: [],
      createdAt: timestamp,
      updatedAt: timestamp
    });

    // Update teacher document with last session info so admin recent-activity can show it
    try {
      await window.db.collection('teachers').doc(teacherId).update({
        lastSessionCreatedAt: timestamp,
        updatedAt: timestamp
      });
    } catch (e) {
      // Non-fatal: ignore if teacher doc update fails
      console.warn('Failed to update teacher lastSessionCreatedAt', e);
    }

    currentSessionCode = code;
    currentSessionId = sessionRef.id;
    currentDifficulty = difficulty;
    currentBagType = bagType;

    document.getElementById('session-code').textContent = code;
    document.getElementById('code-inline').textContent = code;

    listenToPlayerJoins();
    applySessionState('ready');

    // Each section keeps only its 5 newest sessions: creating a 6th permanently deletes the
    // oldest one together with its students' scores. Runs after the UI is ready so a slow
    // or failed prune never delays the new code; it simply retries on the next creation.
    if (window.RSBSessions) {
      window.RSBSessions.pruneTeacherSessions(teacherId).then((removed) => {
        if (removed) showToast(`Oldest session${removed === 1 ? '' : 's'} removed (5-session limit).`);
      });
    }


  } catch (error) {
    console.error('Error creating session:', error);
    showToast('Failed to create session', 'error');
  }
}

// ---- LISTEN TO PLAYER JOINS ----
function listenToPlayerJoins() {
  if (!currentSessionId) return;
  if (sessionListener) sessionListener();

  sessionListener = window.db.collection('sessions').doc(currentSessionId).onSnapshot((doc) => {
    if (doc.exists) {
      const data = doc.data();
      const joinedCount = countJoinedPlayers(data.playersList);
      updateJoinedDisplay(joinedCount);

      // Only enable Launch once at least 1 student has joined
      const btnLaunch = document.getElementById('btn-launch');
      if (btnLaunch && btnLaunch.style.display !== 'none') {
        btnLaunch.disabled = joinedCount < 1;
        btnLaunch.style.opacity = joinedCount < 1 ? '0.45' : '';
        btnLaunch.style.cursor = joinedCount < 1 ? 'not-allowed' : '';
      }
    }
  });
}

// ---- SELECT DIFFICULTY ----
async function selectDiff(radio) {
  try {
    const difficulty = radio.value;
    currentDifficulty = difficulty;

    document.querySelectorAll('.diff-option:not(.bag-option)').forEach(o => o.classList.remove('selected'));
    radio.closest('.diff-option').classList.add('selected');

    if (currentSessionId) {
      await window.db.collection('sessions').doc(currentSessionId).update({
        difficulty: difficulty,
        updatedAt: new Date()
      });

    }
  } catch (error) {
    console.error('Error updating difficulty:', error);
  }
}

// ---- SELECT GO-BAG ----
// Like difficulty, it can change until the session is launched; the game reads it when
// the session starts.
async function selectBag(radio) {
  try {
    const bagType = radio.value;
    currentBagType = bagType;

    document.querySelectorAll('.bag-option').forEach(o => o.classList.remove('selected'));
    radio.closest('.bag-option').classList.add('selected');

    if (currentSessionId) {
      await window.db.collection('sessions').doc(currentSessionId).update({
        bagType: bagType,
        updatedAt: new Date()
      });
    }
  } catch (error) {
    console.error('Error updating go-bag:', error);
  }
}

// ---- LAUNCH SESSION ----
async function launchSession() {
  try {
    if (!currentSessionId) {
      showToast('Generate a session code first', 'error');
      return;
    }

    const joinedCount = parseInt(document.getElementById('joined-count').textContent, 10) || 0;
    if (joinedCount < 1) {
      showToast('At least 1 student must join before launching', 'error');
      return;
    }

    await window.db.collection('sessions').doc(currentSessionId).update({
      status: 'active',
      startedAt: new Date()
    });

    applySessionState('active');
    showToast('Session launched! ▶️');

    setTimeout(() => showToast('Loading game scene...'), 1000);
  } catch (error) {
    console.error('Error launching session:', error);
    showToast('Failed to launch session', 'error');
  }
}

// ---- STOP SESSION ----
async function stopSession() {
  try {
    if (!currentSessionId) return;

    const confirmed = confirm('Stop the current session? Students will be disconnected.');
    if (!confirmed) return;

    await window.db.collection('sessions').doc(currentSessionId).update({
      status: 'ended',
      endedAt: new Date()
    });

    if (sessionListener) { sessionListener(); sessionListener = null; }
    currentSessionCode = null;
    currentSessionId = null;

    updateJoinedDisplay(0);

    applySessionState('idle');
    showToast('Session stopped.');
  } catch (error) {
    console.error('Error stopping session:', error);
    showToast('Failed to stop session', 'error');
  }
}

// ---- COPY CODE ----
function copyCode() {
  if (!currentSessionCode) {
    showToast('No session code to copy', 'error');
    return;
  }
  navigator.clipboard.writeText(currentSessionCode).then(() =>
    showToast('Code copied: ' + currentSessionCode)
  );
}

// ---- END SESSION (alias for compatibility) ----
async function endSession() {
  await stopSession();
}
