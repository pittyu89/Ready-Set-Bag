/* ============================================================================
   SESSION MANAGER - Handle Firestore Session Operations
   ============================================================================ */

let currentSessionCode = null;
let currentSessionId = null;
let currentDifficulty = 'beginner';
let sessionListener = null;

// Initialize session when teacher loads dashboard
async function initializeSession() {
  const teacherId = sessionStorage.getItem('teacherId');
  if (!teacherId) {
    console.error('Teacher ID not found');
    return;
  }
}

// Generate code and create session in Firestore
async function generateCode() {
  try {
    // Wait for Firebase to be initialized
    if (!window.firebaseReady) {
      console.log('Waiting for Firebase to initialize...');
      await window.firebaseInitPromise;
    }

    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
    
    const teacherId = sessionStorage.getItem('teacherId');
    const timestamp = new Date();

    console.log('Generating session code:', code);

    // Create session document in Firestore
    const sessionRef = await window.db.collection('sessions').add({
      sessionCode: code,
      teacherId: teacherId,
      difficulty: 'beginner',
      status: 'waiting', // waiting, active, ended
      playersJoined: 0,
      playersList: [],
      createdAt: timestamp,
      updatedAt: timestamp
    });

    console.log('Session created with ID:', sessionRef.id);

    currentSessionCode = code;
    currentSessionId = sessionRef.id;
    currentDifficulty = 'beginner';

    // Update UI
    document.getElementById('session-code').textContent = code;
    document.getElementById('code-inline').textContent = code;

    // Start listening to player joins
    listenToPlayerJoins();

    console.log('Session created:', code, sessionRef.id);
  } catch (error) {
    console.error('Error creating session:', error);
    showToast('Failed to create session');
  }
}

// Listen to real-time player joins
function listenToPlayerJoins() {
  if (!currentSessionId) return;

  if (sessionListener) sessionListener();

  console.log('Starting to listen to player joins for session:', currentSessionId);

  sessionListener = window.db.collection('sessions').doc(currentSessionId).onSnapshot((doc) => {
    if (doc.exists) {
      const data = doc.data();
      const joinedCount = data.playersList ? data.playersList.length : 0;
      
      console.log('Players joined count:', joinedCount);
      
      // Update joined count in UI
      document.getElementById('joined-count').textContent = joinedCount;
      document.getElementById('joined-bar').style.width = (joinedCount / 40 * 100) + '%';
    }
  });
}

// Update difficulty in Firestore
async function selectDiff(radio) {
  try {
    const difficulty = radio.value;
    currentDifficulty = difficulty;

    document.querySelectorAll('.diff-option').forEach(o => o.classList.remove('selected'));
    radio.closest('.diff-option').classList.add('selected');

    // Update in Firestore
    if (currentSessionId) {
      await window.db.collection('sessions').doc(currentSessionId).update({
        difficulty: difficulty,
        updatedAt: new Date()
      });
      console.log('Difficulty updated:', difficulty);
    }
  } catch (error) {
    console.error('Error updating difficulty:', error);
  }
}

// Launch session - set status to active
async function launchSession() {
  try {
    if (!currentSessionId) {
      showToast('No active session');
      return;
    }

    await window.db.collection('sessions').doc(currentSessionId).update({
      status: 'active',
      startedAt: new Date()
    });

    console.log('Session launched:', currentSessionCode);
    showToast('Session launched! ▶️');

    // Redirect to GameScene after brief delay
    setTimeout(() => {
      // Send difficulty to Unity or navigate
      // For now, just show the message
      showToast('Loading game scene...');
    }, 1000);
  } catch (error) {
    console.error('Error launching session:', error);
    showToast('Failed to launch session');
  }
}

// Copy session code to clipboard
function copyCode() {
  if (!currentSessionCode) {
    showToast('No session code');
    return;
  }
  navigator.clipboard.writeText(currentSessionCode).then(() => 
    showToast('Code copied: ' + currentSessionCode)
  );
}

// Simulate join (for testing) - TODO: Remove after testing
let joinedCount = 0;
function simulateJoin() {
  if (joinedCount < 40) {
    joinedCount = Math.min(40, joinedCount + Math.floor(Math.random() * 5) + 1);
    document.getElementById('joined-count').textContent = joinedCount;
    document.getElementById('joined-bar').style.width = (joinedCount / 40 * 100) + '%';
  }
}

// End session
async function endSession() {
  try {
    if (!currentSessionId) return;

    await window.db.collection('sessions').doc(currentSessionId).update({
      status: 'ended',
      endedAt: new Date()
    });

    if (sessionListener) sessionListener();
    currentSessionCode = null;
    currentSessionId = null;

    console.log('Session ended');
    showToast('Session ended');
  } catch (error) {
    console.error('Error ending session:', error);
  }
}
