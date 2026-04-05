/* ============================================================================
   READY-SET-BAG! LOGIN PAGE - SCRIPT
   ============================================================================ */

function handleLogin(event) {
  event.preventDefault();

  const role = document.getElementById('role').value;
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;

  // Simple validation
  if (!role || !username || !password) {
    alert('Please fill in all fields!');
    return;
  }

  // Demo credentials
  const validCredentials = {
    teacher: { username: 'maria_santos', password: 'Teacher@123' },
    admin: { username: 'admin', password: 'Admin@123' }
  };

  const credentials = validCredentials[role];
  
  if (credentials && credentials.username === username && credentials.password === password) {
    // Store role in session storage
    sessionStorage.setItem('userRole', role);
    sessionStorage.setItem('username', username);

    // Redirect based on role
    if (role === 'teacher') {
      window.location.href = './teacher/dashboard.html';
    } else if (role === 'admin') {
      window.location.href = './admin/dashboard.html';
    }
  } else {
    alert('Invalid username or password!');
  }
}
