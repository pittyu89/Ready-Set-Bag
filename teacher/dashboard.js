/* ============================================================================
   READY-SET-BAG! TEACHER DASHBOARD - SCRIPTS
   ============================================================================ */

// Global variables
let teacherId = null;
let teacherSection = null;
let studentsListener = null;
let csvData = [];

// Load teacher info on page load
window.addEventListener('load', () => {
  const username = sessionStorage.getItem('username');
  const section = sessionStorage.getItem('teacherSection');
  
  if (username && section) {
    // Update sidebar-user
    document.querySelector('.sidebar-user .name').textContent = username.toUpperCase();
    document.querySelector('.sidebar-user .section-tag').textContent = section;
    
    // Update welcome-card
    document.querySelector('.welcome-greeting').textContent = `👋 WELCOME BACK, TEACHER ${username.toUpperCase()}!`;
    document.querySelectorAll('.welcome-meta-item')[0].textContent = `🏫 ${section}`;
    
    // Update students-header-card
    document.querySelector('.students-class-name').textContent = section.toUpperCase();
  }
  
  teacherId = sessionStorage.getItem('teacherId');
  teacherSection = section;
  
  // Wait for Firebase to initialize, then load student count
  window.firebaseInitPromise.then(() => {
    if (window.db) {
      loadStudentsFromFirebase();
    } else {
      console.error('Firebase not initialized');
    }
  });
});

/* ---- NAVIGATION ---- */
function navigate(page, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  if (btn) btn.classList.add('active');
  
  // Load students from Firestore when navigating to students page
  if (page === 'students') {
    loadStudentsFromFirebase();
  }
}

/* ---- LOGOUT ---- */
function logout() {
  // Sign out from Firebase
  if (window.auth) {
    window.auth.signOut().catch(err => console.error('Sign out error:', err));
  }
  
  // Clear session storage
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

// Close dropdown when clicking outside
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

/* ---- IMPORT STUDENTS FROM CSV ---- */
function openAddModal() {
  document.getElementById('modal-overlay').classList.add('open');
  document.getElementById('csv-file').value = '';
  document.getElementById('csv-preview').style.display = 'none';
  document.getElementById('import-btn').disabled = true;
  csvData = [];
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
}

function closeModalOutside(e) {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
}

function previewCSV() {
  const fileInput = document.getElementById('csv-file');
  const file = fileInput.files[0];
  
  if (!file) {
    document.getElementById('csv-preview').style.display = 'none';
    document.getElementById('import-btn').disabled = true;
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const csv = e.target.result;
    const lines = csv.trim().split('\n').filter(line => line.trim());
    csvData = [];
    
    // Parse CSV
    lines.forEach(line => {
      const [firstName, lastName] = line.split(',').map(s => s.trim());
      if (firstName && lastName) {
        csvData.push({ firstName, lastName });
      }
    });

    if (csvData.length === 0) {
      showToast('No valid students found in CSV', 'error');
      document.getElementById('csv-preview').style.display = 'none';
      document.getElementById('import-btn').disabled = true;
      return;
    }

    // Show preview
    const previewList = document.getElementById('preview-list');
    previewList.innerHTML = csvData.map((s, i) => 
      `${i + 1}. ${s.firstName} ${s.lastName}`
    ).join('<br>');
    
    document.getElementById('preview-count').textContent = csvData.length;
    document.getElementById('csv-preview').style.display = 'block';
    document.getElementById('import-btn').disabled = false;
  };
  
  reader.readAsText(file);
}

async function importStudentsFromCSV() {
  if (csvData.length === 0) {
    showToast('Please select a CSV file first', 'error');
    return;
  }

  if (!window.db) {
    showToast('Firebase is not initialized. Please refresh the page.', 'error');
    return;
  }

  // Get teacher ID and section from session storage
  teacherId = sessionStorage.getItem('teacherId');
  teacherSection = sessionStorage.getItem('teacherEmail') || 'Unknown';

  if (!teacherId) {
    showToast('Teacher information not found. Please log in again.', 'error');
    return;
  }

  try {
    // Get highest student number for this teacher
    const snapshot = await window.db.collection('students')
      .where('teacherId', '==', teacherId)
      .get();

    let nextNum = 1;
    if (!snapshot.empty) {
      const numbers = snapshot.docs.map(doc => doc.data().studentNumber);
      nextNum = Math.max(...numbers) + 1;
    }

    // Generate section code (e.g., G6SAMP)
    const sectionCode = 'G6SAMP'; // Can be customized based on section
    
    // Add each student to Firestore
    for (let i = 0; i < csvData.length; i++) {
      const student = csvData[i];
      const studentNumber = nextNum + i;
      const username = sectionCode + String(studentNumber).padStart(3, '0');

      await window.db.collection('students').add({
        teacherId: teacherId,
        section: teacherSection,
        firstName: student.firstName,
        lastName: student.lastName,
        displayName: `${student.firstName} ${student.lastName}`,
        username: username,
        studentNumber: studentNumber,
        password: 'Student@123', // Default password
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }

    closeModal();
    showToast(`${csvData.length} student(s) imported successfully!`);
    
    // Reload students from Firestore
    loadStudentsFromFirebase();
    
  } catch (error) {
    console.error('Error importing students:', error);
    showToast('Error importing students: ' + error.message, 'error');
  }
}

// ---- LOAD STUDENTS FROM FIRESTORE (REAL-TIME) ----
function loadStudentsFromFirebase() {
  if (!window.db) {
    showToast('Firebase is not initialized. Please refresh the page.', 'error');
    return;
  }

  // Get teacher ID from session storage
  teacherId = sessionStorage.getItem('teacherId');
  
  if (!teacherId) {
    console.log('No teacher ID in session');
    return;
  }

  // Clear existing listener
  if (studentsListener) {
    studentsListener();
  }

  const tbody = document.getElementById('student-tbody');
  
  // Set up real-time listener
  studentsListener = window.db.collection('students')
    .where('teacherId', '==', teacherId)
    .orderBy('studentNumber', 'asc')
    .onSnapshot(
      (snapshot) => {
        tbody.innerHTML = '';
        
        snapshot.forEach((doc) => {
          const student = doc.data();
          const row = document.createElement('tr');
          row.setAttribute('data-student-id', doc.id);
          row.innerHTML = `
            <td class="td-username">${student.username}</td>
            <td>${student.displayName}</td>
            <td class="td-pass">••••••••</td>
            <td>
              <button class="btn-sm btn-reset-pass" onclick="resetStudentPassword(this)" style="margin-right:4px;">↺ RESET</button>
              <button class="btn-sm btn-delete" onclick="deleteStudent(this)">🗑 DELETE</button>
            </td>`;
          tbody.appendChild(row);
        });

        updateStudentCount();
      },
      (error) => {
        console.error('Error loading students:', error);
        showToast('Error loading students: ' + error.message, 'error');
      }
    );
}

async function resetStudentPassword(btn) {
  if (!window.db) {
    showToast('Firebase is not initialized.', 'error');
    return;
  }

  const row = btn.closest('tr');
  const studentId = row.getAttribute('data-student-id');
  const displayName = row.querySelector('td:nth-child(2)').textContent;
  const newPassword = 'Student@123';

  if (confirm(`Reset password for ${displayName} to "${newPassword}"?`)) {
    try {
      await window.db.collection('students').doc(studentId).update({
        password: newPassword,
        updatedAt: new Date()
      });

      showToast(`Password reset for ${displayName}`);
    } catch (error) {
      console.error('Error resetting password:', error);
      showToast('Error: ' + error.message, 'error');
    }
  }
}

async function deleteStudent(btn) {
  if (!window.db) {
    showToast('Firebase is not initialized.', 'error');
    return;
  }

  const row = btn.closest('tr');
  const studentId = row.getAttribute('data-student-id');
  const displayName = row.querySelector('td:nth-child(2)').textContent;

  if (confirm(`Delete ${displayName}?`)) {
    try {
      await window.db.collection('students').doc(studentId).delete();
      showToast(`${displayName} deleted`);
    } catch (error) {
      console.error('Error deleting student:', error);
      showToast('Error: ' + error.message, 'error');
    }
  }
}

function updateStudentCount() {
  const total = document.querySelectorAll('#student-tbody tr').length;
  const visible = document.querySelectorAll('#student-tbody tr:not([style*="display: none"])').length;
  document.getElementById('student-footer').textContent = `SHOWING ${visible} OF ${total} STUDENTS`;
  document.getElementById('enrolled-count').textContent = total + ' students enrolled';
  document.getElementById('welcome-student-count').textContent = total + ' students';
}

function filterStudents(query) {
  const q = query.toLowerCase();
  document.querySelectorAll('#student-tbody tr').forEach(row => {
    row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}

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
  document.getElementById('results-footer').textContent = `SHOWING ${visible} OF ${total} STUDENTS`;
}
