/* ============================================================================
   READY-SET-BAG! LOGIN PAGE - SCRIPT
   ============================================================================ */

async function handleLogin(event) {
  event.preventDefault();

  const role = document.getElementById('role').value;
  const email = document.getElementById('username').value;
  const password = document.getElementById('password').value;

  // Simple validation
  if (!role || !email || !password) {
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
    } else if (role === 'admin') {
      // Authenticate admin with demo credentials
      if (email === adminCredentials.username && password === adminCredentials.password) {
        // Store role in session storage
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
  // Check if Firebase is initialized
  if (typeof db === 'undefined') {
    alert('System error: Firebase not initialized. Please refresh the page.');
    return;
  }

  try {
    // Query Firestore for matching teacher
    const snapshot = await db.collection('teachers')
      .where('email', '==', email)
      .get();

    if (snapshot.empty) {
      alert('Teacher not found!');
      return;
    }

    // Check password
    const teacher = snapshot.docs[0];
    const teacherData = teacher.data();

    if (teacherData.password === password) {
      // Store role and teacher info in session storage
      sessionStorage.setItem('userRole', 'teacher');
      sessionStorage.setItem('username', teacherData.firstName + ' ' + teacherData.lastName);
      sessionStorage.setItem('teacherId', teacher.id);
      sessionStorage.setItem('teacherEmail', teacherData.email);
      sessionStorage.setItem('teacherSection', teacherData.section);

      // Redirect to teacher dashboard
      window.location.href = './teacher/dashboard.html';
    } else {
      alert('Invalid password!');
    }
  } catch (error) {
    console.error('Teacher authentication error:', error);
    alert('Authentication error: ' + error.message);
  }
}
