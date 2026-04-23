/* ============================================================================
   READY-SET-BAG! LOGIN PAGE - SCRIPT
   ============================================================================ */

// ---- TOGGLE SWITCH (TEACHER/ADMIN MODE) ----
function switchRole(toggle) {
  if (toggle.checked) {
    // Teacher mode
    document.body.classList.remove('admin-mode');
  } else {
    // Admin mode
    document.body.classList.add('admin-mode');
  }
}

const roleToggle = document.getElementById('role-toggle');
if (roleToggle) {
  roleToggle.addEventListener('change', function() {
    switchRole(this);
  });
}

// Start in admin mode (toggle unchecked = admin)
document.body.classList.add('admin-mode');

async function handleLogin(event) {
  event.preventDefault();

  const isTeacher = document.getElementById('role-toggle')?.checked;
  const role = isTeacher ? 'teacher' : 'admin';
  const email = document.getElementById('username').value;
  const password = document.getElementById('password').value;

  // Simple validation
  if (!email || !password) {
    alert('Please fill in all fields!');
    return;
  }

  // Demo credentials for admin
  const adminCredentials = {
    username: 'admin',
    password: 'Admin@123'
  };

  try {
    if (role === 'teacher') {
      // Authenticate teacher from Firestore
      await authenticateTeacher(email, password);
    } else {
      // Authenticate admin with demo credentials
      if (email === adminCredentials.username && password === adminCredentials.password) {
        sessionStorage.setItem('userRole', 'admin');
        sessionStorage.setItem('username', adminCredentials.username);
        window.location.href = './admin/dashboard.html';
      } else {
        alert('Invalid admin credentials!');
      }
    }
  } catch (error) {
    console.error('Login error:', error);
    alert('Login error: ' + error.message);
  }
}

async function authenticateTeacher(email, password) {
  if (!window.auth) {
    alert('System error: Firebase not initialized.');
    return;
  }

  try {
    // Firebase Auth handles the credential check — no Firestore read needed
    const userCredential = await window.auth.signInWithEmailAndPassword(email, password);
    const user = userCredential.user;

    // Now fetch teacher profile (user is authenticated, so rules pass)
    const snapshot = await window.db.collection('teachers')
      .where('email', '==', email)
      .get();

    if (snapshot.empty) {
      alert('Teacher profile not found.');
      await window.auth.signOut();
      return;
    }

    const teacher = snapshot.docs[0];
    const teacherData = teacher.data();

    sessionStorage.setItem('userRole', 'teacher');
    sessionStorage.setItem('username', teacherData.firstName + ' ' + teacherData.lastName);
    sessionStorage.setItem('teacherId', teacher.id);
    sessionStorage.setItem('teacherEmail', teacherData.email);
    sessionStorage.setItem('teacherSection', teacherData.section);

    window.location.href = './teacher/dashboard.html';

  } catch (error) {
    console.error('Teacher authentication error:', error);
    if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
      alert('Invalid email or password.');
    } else {
      alert('Authentication error: ' + error.message);
    }
  }
}
