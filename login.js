/* ============================================================================
   READY-SET-BAG! LOGIN PAGE - SCRIPT
   ============================================================================ */

// Session timeout duration: 30 minutes (in milliseconds)
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

// ---- TOGGLE SWITCH (TEACHER/ADMIN MODE) ----
function switchRole(toggle) {
  if (toggle.checked) {
    document.body.classList.remove('admin-mode');
  } else {
    document.body.classList.add('admin-mode');
  }
}

const roleToggle = document.getElementById('role-toggle');
if (roleToggle) {
  roleToggle.addEventListener('change', function () {
    switchRole(this);
  });
}

// Start in admin mode (toggle unchecked = admin)
document.body.classList.add('admin-mode');

// ---- HELPERS ----
function clearPassword() {
  const pwField = document.getElementById('password');
  if (pwField) pwField.value = '';
}

// Shown in the card under the Log In button, not in a browser pop-up
function showLoginError(msg, keepPassword) {
  if (!keepPassword) clearPassword();
  const box = document.getElementById('login-error');
  if (!box) return;
  box.textContent = msg;
  box.hidden = false;
  // Restart the shake so a repeated error is still noticed
  box.classList.remove('shake');
  void box.offsetWidth;
  box.classList.add('shake');
}

function clearLoginError() {
  const box = document.getElementById('login-error');
  if (box) { box.hidden = true; box.textContent = ''; }
}

function setBusy(busy) {
  const btn = document.getElementById('btn-login');
  if (!btn) return;
  btn.disabled = busy;
  btn.textContent = busy ? 'Logging in…' : 'Log In';
}

// Sent back here by the dashboards' inactivity timeout
try {
  const reason = new URLSearchParams(location.search).get('reason');
  const REASONS = {
    expired: 'You were logged out after 30 minutes of inactivity. Please log in again.',
    inactive: 'This teacher account is inactive. Please contact your administrator.'
  };
  if (REASONS[reason]) {
    showLoginError(REASONS[reason], true);
    history.replaceState(null, '', location.pathname);
  }
} catch (e) {}

// Typing again clears the old message
['username', 'password'].forEach((id) => {
  const field = document.getElementById(id);
  if (field) field.addEventListener('input', clearLoginError);
});

function isOnline() {
  return navigator.onLine;
}

// ---- MAIN LOGIN HANDLER ----
async function handleLogin(event) {
  event.preventDefault();

  // REQ-1.2.3: Check network before doing anything
  clearLoginError();
  if (!isOnline()) {
    showLoginError('No internet connection. Connect to the internet and try again.', true);
    return;
  }

  const isTeacher = document.getElementById('role-toggle')?.checked;
  const role = isTeacher ? 'teacher' : 'admin';
  const email = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

  if (!email || !password) {
    showLoginError('Please fill in all fields.');
    return;
  }

  setBusy(true);
  try {
    if (role === 'teacher') {
      await authenticateTeacher(email, password);
    } else {
      await authenticateAdmin(email, password);
    }
  } catch (error) {
    console.error('Login error:', error);
    showLoginError('Login error: ' + error.message);
  } finally {
    // A successful login redirects away; anything else needs the button back
    setTimeout(() => setBusy(false), 400);
  }
}

// ---- TEACHER AUTHENTICATION ----
async function authenticateTeacher(email, password) {
  // Wait for Firebase before proceeding
  await window.firebaseInitPromise;

  if (!window.auth) {
    showLoginError('Something went wrong loading the page. Refresh and try again.', true);
    return;
  }

  // REQ-1.2.3: Double-check network right before the Firebase call
  if (!isOnline()) {
    showLoginError('Connection lost. Check your internet and try again.', true);
    return;
  }

  try {
    const userCredential = await window.auth.signInWithEmailAndPassword(email, password);
    const user = userCredential.user;

    // The teacher profile is keyed by Auth uid; the rules only let a teacher read their own
    const teacher = await window.db.collection('teachers').doc(user.uid).get();

    if (!teacher.exists) {
      // REQ-1.2.2: Clear password, show error
      showLoginError('Teacher profile not found. Please contact your administrator.');
      await window.auth.signOut();
      return;
    }

    const teacherData = teacher.data();

    if (teacherData.status && teacherData.status !== 'active') {
      showLoginError('This teacher account is inactive. Please contact your administrator.');
      await window.auth.signOut();
      return;
    }

    // REQ-3: Store login timestamp alongside session data
    sessionStorage.setItem('userRole', 'teacher');
    sessionStorage.setItem('username', teacherData.firstName + ' ' + teacherData.lastName);
    sessionStorage.setItem('teacherId', teacher.id);
    sessionStorage.setItem('teacherEmail', teacherData.email);
    sessionStorage.setItem('teacherSection', teacherData.section);
    sessionStorage.setItem('loginTime', Date.now().toString());

    // Debug: log stored session values before redirect
    try { console.log('Login (teacher) -> sessionStorage:', {
      userRole: sessionStorage.getItem('userRole'),
      teacherId: sessionStorage.getItem('teacherId'),
      teacherEmail: sessionStorage.getItem('teacherEmail'),
      loginTime: sessionStorage.getItem('loginTime')
    }); } catch (e) {}

    setTimeout(() => { window.location.href = './teacher/dashboard.html'; }, 50);

  } catch (error) {
    console.error('Teacher authentication error:', error);

    // REQ-1.2.2: Always clear the password field on failure
    clearPassword();

    // REQ-1.2.3: Distinguish network errors from bad credentials
    if (
      error.code === 'auth/network-request-failed' ||
      error.message?.toLowerCase().includes('network')
    ) {
      showLoginError("Couldn't reach the login server. Check your internet and try again.");
    } else if (
      error.code === 'auth/user-not-found' ||
      error.code === 'auth/wrong-password' ||
      error.code === 'auth/invalid-credential'
    ) {
      showLoginError('Wrong email or password. Please try again.');
    } else {
      showLoginError("Couldn't log in: " + error.message);
    }
  }
}

// ---- ADMIN AUTHENTICATION ----
// "admin" is shorthand for the school's admin account; any other value is used as the email.
const DEFAULT_ADMIN_EMAIL = 'admin@readysetbag.local';

async function authenticateAdmin(username, password) {
  // Wait for Firebase before proceeding
  await window.firebaseInitPromise;

  if (!window.auth) {
    showLoginError('Something went wrong loading the page. Refresh and try again.', true);
    return;
  }

  // Check network right before the Firebase call
  if (!isOnline()) {
    showLoginError('Connection lost. Check your internet and try again.', true);
    return;
  }

  try {
    const adminEmail = username.toLowerCase() === 'admin' ? DEFAULT_ADMIN_EMAIL : username;

    const userCredential = await window.auth.signInWithEmailAndPassword(adminEmail, password);
    const user = userCredential.user;

    // Being able to sign in is not enough: the account must be listed in /admins
    const adminDoc = await window.db.collection('admins').doc(user.uid).get();
    if (!adminDoc.exists) {
      await window.auth.signOut();
      showLoginError('This account is not an administrator.');
      return;
    }

    // REQ-3: Store login timestamp and admin info for session timeout enforcement
    sessionStorage.setItem('userRole', 'admin');
    sessionStorage.setItem('username', 'admin');
    sessionStorage.setItem('adminId', user.uid);
    sessionStorage.setItem('adminEmail', user.email);
    sessionStorage.setItem('loginTime', Date.now().toString());

    // Give a tiny tick to ensure storage is flushed then navigate
    setTimeout(() => { window.location.href = './admin/dashboard.html'; }, 50);

  } catch (error) {
    console.error('Admin authentication error:', error);
    clearPassword();

    // Distinguish network errors from credential errors
    if (
      error.code === 'auth/network-request-failed' ||
      error.message?.toLowerCase().includes('network')
    ) {
      showLoginError("Couldn't reach the login server. Check your internet and try again.");
    } else if (
      error.code === 'auth/user-not-found' ||
      error.code === 'auth/wrong-password' ||
      error.code === 'auth/invalid-credential'
    ) {
      showLoginError('Wrong username or password. Please try again.');
    } else {
      showLoginError("Couldn't log in: " + error.message);
    }
  }
}
