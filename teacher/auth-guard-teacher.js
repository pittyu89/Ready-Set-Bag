/* ============================================================================
   AUTH GUARD - Teacher Dashboard (REQ-2, REQ-3)
   Place in /teacher/ folder. Include as the FIRST script on dashboard.html.
   ============================================================================ */

// Session timeout: 30 minutes of inactivity
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

// How often to check for timeout (every 60 seconds)
const TIMEOUT_CHECK_INTERVAL_MS = 60 * 1000;

let _timeoutCheckInterval = null;
let _warningShown = false;

/* ---- CALLED ONCE ON DASHBOARD LOAD ---- */
function initAuthGuard() {
  const REQUIRED_ROLE = 'teacher';
  const role = sessionStorage.getItem('userRole');
  const loginTime = parseInt(sessionStorage.getItem('loginTime') || '0', 10);

  // REQ-2: Redirect if not logged in as teacher
  if (!role || role !== REQUIRED_ROLE) {
    sessionStorage.clear();
    window.location.href = getLoginPath();
    return;
  }

  // REQ-3: Reject immediately if session is already expired
  if (isSessionExpired(loginTime)) {
    handleTimeout();
    return;
  }

  // REQ-3: Refresh the loginTime on every page load so that
  // navigating between pages counts as activity
  sessionStorage.setItem('loginTime', Date.now().toString());

  // REQ-3: Start periodic timeout checks
  _timeoutCheckInterval = setInterval(checkTimeout, TIMEOUT_CHECK_INTERVAL_MS);

  // REQ-3: Also reset the timer on any user interaction
  ['click', 'keydown', 'mousemove', 'touchstart'].forEach(evt => {
    document.addEventListener(evt, resetActivityTimer, { passive: true });
  });
}

/* ---- ACTIVITY TIMER ---- */
function resetActivityTimer() {
  sessionStorage.setItem('loginTime', Date.now().toString());
  _warningShown = false; // clear warning flag on new activity
}

/* ---- TIMEOUT CHECKS ---- */
function isSessionExpired(loginTime) {
  return (Date.now() - loginTime) > SESSION_TIMEOUT_MS;
}

function checkTimeout() {
  const loginTime = parseInt(sessionStorage.getItem('loginTime') || '0', 10);

  if (isSessionExpired(loginTime)) {
    handleTimeout();
    return;
  }

  // Warn the user 2 minutes before expiry
  const timeLeft = SESSION_TIMEOUT_MS - (Date.now() - loginTime);
  if (timeLeft < 2 * 60 * 1000 && !_warningShown) {
    _warningShown = true;
    const stay = confirm(
      'Your session will expire in less than 2 minutes due to inactivity.\n\nClick OK to stay logged in, or Cancel to log out now.'
    );
    if (stay) {
      resetActivityTimer();
    } else {
      handleTimeout();
    }
  }
}

/* ---- HANDLE EXPIRY ---- */
function handleTimeout() {
  clearInterval(_timeoutCheckInterval);

  // Sign out of Firebase Auth if available
  if (typeof firebase !== 'undefined' && firebase.auth) {
    firebase.auth().signOut().catch(() => {});
  }

  sessionStorage.clear();
  alert('Your session has expired due to inactivity. Please log in again.');
  window.location.href = getLoginPath();
}

/* ---- HELPER: path back to login from /teacher/ ---- */
function getLoginPath() {
  return '../index.html';
}
