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

function showLoginError(msg) {
  clearPassword();
  alert(msg);
}

function isOnline() {
  return navigator.onLine;
}

// ---- MAIN LOGIN HANDLER ----
async function handleLogin(event) {
  event.preventDefault();

  // REQ-1.2.3: Check network before doing anything
  if (!isOnline()) {
    alert('No internet connection detected. A stable connection is required to log in. Please check your network and try again.');
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

  // Demo credentials for admin
  const adminCredentials = {
    username: 'admin',
    password: 'Admin@123'
  };

  try {
    if (role === 'teacher') {
      await authenticateTeacher(email, password);
    } else {
      if (email === adminCredentials.username && password === adminCredentials.password) {
        // REQ-3: Verify credentials, then authenticate with Firebase silently
        await authenticateAdmin();
      } else {
        // REQ-1.2.2: Show error and clear the password field
        showLoginError('Invalid credentials. Please check your username and password.');
      }
    }
  } catch (error) {
    console.error('Login error:', error);
    showLoginError('Login error: ' + error.message);
  }
}

// ---- TEACHER AUTHENTICATION ----
async function authenticateTeacher(email, password) {
  // Wait for Firebase before proceeding
  await window.firebaseInitPromise;

  if (!window.auth) {
    alert('System error: Firebase not initialized. Please refresh and try again.');
    return;
  }

  // REQ-1.2.3: Double-check network right before the Firebase call
  if (!isOnline()) {
    alert('Connection lost. A stable internet connection is required to authenticate. Please check your network and try again.');
    return;
  }

  try {
    const userCredential = await window.auth.signInWithEmailAndPassword(email, password);
    const user = userCredential.user;

    // Fetch teacher profile from Firestore (auth rules allow this now that user is signed in)
    const snapshot = await window.db.collection('teachers')
      .where('email', '==', email)
      .get();

    if (snapshot.empty) {
      // REQ-1.2.2: Clear password, show error
      showLoginError('Teacher profile not found. Please contact your administrator.');
      await window.auth.signOut();
      return;
    }

    const teacher = snapshot.docs[0];
    const teacherData = teacher.data();

    // REQ-3: Store login timestamp alongside session data
    sessionStorage.setItem('userRole', 'teacher');
    sessionStorage.setItem('username', teacherData.firstName + ' ' + teacherData.lastName);
    sessionStorage.setItem('teacherId', teacher.id);
    sessionStorage.setItem('teacherEmail', teacherData.email);
    sessionStorage.setItem('teacherSection', teacherData.section);
    sessionStorage.setItem('loginTime', Date.now().toString());

    window.location.href = './teacher/dashboard.html';

  } catch (error) {
    console.error('Teacher authentication error:', error);

    // REQ-1.2.2: Always clear the password field on failure
    clearPassword();

    // REQ-1.2.3: Distinguish network errors from bad credentials
    if (
      error.code === 'auth/network-request-failed' ||
      error.message?.toLowerCase().includes('network')
    ) {
      alert('Network error: Could not reach the authentication server. Please check your internet connection and try again.');
    } else if (
      error.code === 'auth/user-not-found' ||
      error.code === 'auth/wrong-password' ||
      error.code === 'auth/invalid-credential'
    ) {
      alert('Invalid email or password. Please try again.');
    } else {
      alert('Authentication error: ' + error.message);
    }
  }
}

// ---- ADMIN AUTHENTICATION ----
async function authenticateAdmin() {
  // Wait for Firebase before proceeding
  await window.firebaseInitPromise;

  if (!window.auth) {
    alert('System error: Firebase not initialized. Please refresh and try again.');
    return;
  }

  // Check network right before the Firebase call
  if (!isOnline()) {
    alert('Connection lost. A stable internet connection is required to authenticate. Please check your network and try again.');
    return;
  }

  try {
    // Fixed admin account email for Firebase (internal use only)
    const adminEmail = 'admin@readysetbag.local';
    const adminPassword = 'Admin@123';

    // Sign in with Firebase using the fixed admin account
    const userCredential = await window.auth.signInWithEmailAndPassword(adminEmail, adminPassword);
    const user = userCredential.user;

    // REQ-3: Store login timestamp and admin info for session timeout enforcement
    sessionStorage.setItem('userRole', 'admin');
    sessionStorage.setItem('username', 'admin');
    sessionStorage.setItem('adminId', user.uid);
    sessionStorage.setItem('adminEmail', user.email);
    // Store admin credentials for creating users in dashboard (needed for re-authentication)
    sessionStorage.setItem('adminPassword', adminPassword);
    sessionStorage.setItem('loginTime', Date.now().toString());

    window.location.href = './admin/dashboard.html';

  } catch (error) {
    console.error('Admin authentication error:', error);
    clearPassword();

    // Distinguish network errors from credential errors
    if (
      error.code === 'auth/network-request-failed' ||
      error.message?.toLowerCase().includes('network')
    ) {
      alert('Network error: Could not reach the authentication server. Please check your internet connection and try again.');
    } else if (
      error.code === 'auth/user-not-found' ||
      error.code === 'auth/wrong-password' ||
      error.code === 'auth/invalid-credential'
    ) {
      // This should not happen with hardcoded credentials, but handle it anyway
      alert('Admin account error. Please contact the system administrator.');
    } else {
      alert('Authentication error: ' + error.message);
    }
  }
}
