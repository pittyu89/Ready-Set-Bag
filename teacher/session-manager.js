/* ============================================================================
   SESSION MANAGER - Handle Firestore Session Operations
   ============================================================================ */

let currentSessionCode = null;
let currentSessionId = null;
let currentDifficulty = 'beginner';
let sessionListener = null;

// ---- SESSION STATES ----
// idle   → no code yet; difficulty changeable, generate enabled, launch disabled
// ready  → code generated; difficulty changeable, regenerate enabled, launch enabled
// active → launched; everything locked except Stop Session

function applySessionState(state) {
  const diffInputs      = document.querySelectorAll('input[name="difficulty"]');
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

// Start in idle state on page load
document.addEventListener('DOMContentLoaded', () => {
  applySessionState('idle');
});

// ---- GENERATE CODE ----
async function generateCode() {
  try {
    if (!window.firebaseReady) {
      await window.firebaseInitPromise;
    }

    // End any previous pending session before creating a new one
    if (currentSessionId) {
      await window.db.collection('sessions').doc(currentSessionId).update({
        status: 'ended',
        endedAt: new Date()
      }).catch(() => {});
      if (sessionListener) { sessionListener(); sessionListener = null; }
      currentSessionCode = null;
      currentSessionId = null;
    }

    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];

    const selectedDiff = document.querySelector('input[name="difficulty"]:checked');
    const difficulty = selectedDiff ? selectedDiff.value : 'beginner';
    const teacherId = sessionStorage.getItem('teacherId');
    const timestamp = new Date();

    const sessionRef = await window.db.collection('sessions').add({
      sessionCode: code,
      teacherId: teacherId,
      difficulty: difficulty,
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

    document.getElementById('session-code').textContent = code;
    document.getElementById('code-inline').textContent = code;

    listenToPlayerJoins();
    applySessionState('ready');


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
      const joinedCount = data.playersList ? data.playersList.length : 0;
      document.getElementById('joined-count').textContent = joinedCount;
      document.getElementById('joined-bar').style.width = (joinedCount / 40 * 100) + '%';

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

    document.querySelectorAll('.diff-option').forEach(o => o.classList.remove('selected'));
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

    document.getElementById('joined-count').textContent = '0';
    document.getElementById('joined-bar').style.width = '0%';

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
