/* ============================================================================
   READY-SET-BAG! TEACHER DASHBOARD - SCRIPTS
   ============================================================================ */

// Global variables
let teacherId = null;
let teacherSection = null;

// Load teacher info on page load
window.addEventListener('load', () => {
  initAuthGuard();

  const username = sessionStorage.getItem('username');
  const section = sessionStorage.getItem('teacherSection');
  
  if (username && section) {
    // Update sidebar-user
    document.querySelector('.sidebar-user .name').textContent = username.toUpperCase();
    document.querySelector('.sidebar-user .section-tag').textContent = section;
    
    // Update welcome-card
    document.querySelector('.welcome-greeting').textContent = `👋 WELCOME BACK, TEACHER ${username.toUpperCase()}!`;
    document.querySelectorAll('.welcome-meta-item')[0].textContent = `🏫 ${section}`;
  }
  
  teacherId = sessionStorage.getItem('teacherId');
  teacherSection = section;
  
  // Load student count for this teacher
  loadTeacherStudentCount();
  
  // Load recent activity when reports page is viewed
  document.addEventListener('click', (e) => {
    if (e.target.closest('.nav-item') && e.target.closest('.nav-item').textContent.includes('REPORTS')) {
      loadTeacherRecentActivity();
    }
  });
});

// ---- LOAD STUDENT COUNT (REAL-TIME) ----
function loadTeacherStudentCount() {
  if (!window.firebaseReady) {
    window.firebaseInitPromise.then(() => loadTeacherStudentCount());
    return;
  }
  
  if (!teacherId) return;
  
  // Listen to students collection for this teacher
  window.db.collection('students').where('teacherId', '==', teacherId).onSnapshot((snapshot) => {
    const count = snapshot.size;
    const element = document.getElementById('welcome-student-count');
    if (element) {
      element.textContent = `${count} student${count !== 1 ? 's' : ''}`;
    }
  });
}

/* ---- NAVIGATION ---- */
function navigate(page, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  if (btn) btn.classList.add('active');
}

/* ---- LOGOUT ---- */
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

/* ---- AVATAR MENU ---- */
function toggleAvatarMenu() {
  const menu = document.getElementById('avatar-menu');
  menu.classList.toggle('show');
}

document.addEventListener('click', (e) => {
  const menu = document.getElementById('avatar-menu');
  const avatar = document.querySelector('.topbar-avatar');
  if (!avatar.contains(e.target) && !menu.contains(e.target)) {
    menu.classList.remove('show');
  }
});

/* ---- DIFFICULTY SELECTION ---- */
// Handled by session-manager.js

/* ---- SESSION CODE ---- */
// Handled by session-manager.js

/* ---- STUDENTS JOINED SIMULATION ---- */
// Handled by session-manager.js (real-time Firebase listener)

/* ---- TOAST ---- */
let toastTimer;
function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = 'toast' + (type === 'error' ? ' error' : '');
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

/* ---- FILTER INDIVIDUAL RESULTS ---- */
function filterResults(query) {
  const q = query.toLowerCase();
  const rows = document.querySelectorAll('#results-tbody tr');
  let visible = 0;
  rows.forEach(row => {
    const match = row.textContent.toLowerCase().includes(q);
    row.style.display = match ? '' : 'none';
    if (match) visible++;
  });
  const total = rows.length;
  const footer = document.getElementById('results-footer');
  if (footer) {
    footer.textContent = `SHOWING ${visible} OF ${total} STUDENTS`;
  }
}

/* ---- LOAD RECENT ACTIVITY ---- */
function loadTeacherRecentActivity() {
  if (!window.firebaseReady) {
    window.firebaseInitPromise.then(() => loadTeacherRecentActivity());
    return;
  }
  
  if (!teacherId) return;
  
  const container = document.getElementById('teacher-recent-activity');
  if (!container) return;
  
  // Listen to sessions collection for this teacher
  window.db.collection('sessions')
    .where('teacherId', '==', teacherId)
    .orderBy('createdAt', 'desc')
    .limit(5)
    .onSnapshot((snapshot) => {
      container.innerHTML = '';
      
      if (snapshot.empty) {
        container.innerHTML = '<div class="activity-item"><div class="activity-desc">No recent activity</div></div>';
        return;
      }
      
      snapshot.forEach((doc) => {
        const session = doc.data();
        const date = session.createdAt ? new Date(session.createdAt.toDate()).toLocaleDateString('en-US', {month: 'short', day: 'numeric'}) : 'Unknown';
        const difficulty = session.difficulty || 'Unknown';
        const playerCount = session.playersList ? session.playersList.length : 0;
        
        const activityDiv = document.createElement('div');
        activityDiv.className = 'activity-item';
        activityDiv.innerHTML = `
          <div class="activity-date">${date}</div>
          <div class="activity-teacher">${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)} Session</div>
          <div class="activity-desc">Session Code: ${session.sessionCode}<br>(${playerCount} students)</div>
        `;
        container.appendChild(activityDiv);
      });
    });
}
