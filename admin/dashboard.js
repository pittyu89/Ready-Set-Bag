/* ============================================================================
   READY-SET-BAG! ADMIN DASHBOARD - SCRIPT
   ============================================================================ */

// Global variable to track Firestore listener
let teachersListener = null;
let adminRecentActivityListener = null;

// Store admin credentials for re-authentication after creating users
let adminCredentials = {
  email: sessionStorage.getItem('adminEmail') || 'admin@readysetbag.local',
  password: sessionStorage.getItem('adminPassword') || 'Admin@123'
};

// Helper function to restore admin authentication after creating a user
async function restoreAdminAuth() {
  if (!adminCredentials.email || !adminCredentials.password) {
    console.warn('Admin credentials not available:', adminCredentials);
    return;
  }

  try {
    // Check current user
    const currentUser = firebase.auth().currentUser;

    
    // Check if already authenticated as admin
    if (currentUser && currentUser.email === adminCredentials.email) {

      return;
    }


    const result = await firebase.auth().signInWithEmailAndPassword(adminCredentials.email, adminCredentials.password);

  } catch (err) {
    console.error('Failed to restore admin auth:', err.code, err.message);
    // Try to continue anyway - the session might still be valid
  }
}

async function getDocumentData(collectionName, documentId) {
  const snapshot = await window.db.collection(collectionName).doc(documentId).get();

  if (!snapshot.exists) {
    throw new Error('Record not found.');
  }

  return snapshot.data();
}

async function withSignedInAccount(email, password, action) {
  await firebase.auth().signInWithEmailAndPassword(email, password);

  try {
    return await action(firebase.auth().currentUser);
  } finally {
    await restoreAdminAuth();
  }
}


// ---- NAVIGATION ----
function navigate(page, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  if (btn) btn.classList.add('active');
  
  const titles = { 
    home: 'ADMIN DASHBOARD', 
    teachers: 'ADMIN DASHBOARD', 
    students: 'ADMIN DASHBOARD',
    reports: 'ADMIN DASHBOARD', 
    settings: 'ADMIN DASHBOARD' 
  };
  document.getElementById('topbar-title').textContent = titles[page] || 'ADMIN DASHBOARD';
  
  if (page === 'teachers') {
    loadTeachersFromFirebase();
  }
  if (page === 'students') {
    loadAdminStudentsFromFirebase();
  }
}

// ---- LOGOUT ----
function logout() {
  showToast('Logged out.');
  setTimeout(() => {
    window.location.href = '../index.html';
  }, 500);
}

// ---- AVATAR MENU ----
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

// ---- MODAL MANAGEMENT ----
function openModal() {
  document.getElementById('modal-overlay').classList.add('open');
  document.getElementById('input-first').value = '';
  document.getElementById('input-last').value = '';
  document.getElementById('input-email').value = '';
  document.getElementById('input-section').value = '';
  document.getElementById('input-pass').value = 'TempPass123!';
  document.getElementById('chk-welcome').checked = false;
  resetModalToCreate();
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  clearFieldHighlights();
}

function closeModalOutside(e) {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
}

// ---- LOAD TEACHERS FROM FIREBASE (REAL-TIME) ----
function loadTeachersFromFirebase() {
  if (typeof db === 'undefined') {
    showToast('Firebase is not initialized. Please refresh the page.', 'error');
    return;
  }

  // Clear existing listener if any
  if (teachersListener) {
    teachersListener();
  }

  // Clear the table
  const tbody = document.getElementById('teacher-tbody');
  tbody.innerHTML = '';

  // Set up real-time listener
  teachersListener = window.db.collection('teachers')
    .orderBy('createdAt', 'desc')
    .onSnapshot(
      (snapshot) => {
        // Clear table on each update
        tbody.innerHTML = '';
        
        // Add each teacher from Firestore
        snapshot.forEach((doc) => {
          const teacher = doc.data();
          const isActive = teacher.status !== 'inactive';
          const row = document.createElement('tr');
          row.setAttribute('data-teacher-id', doc.id);
          if (!isActive) row.style.opacity = '0.55';
          row.innerHTML = `
            <td class="td-name">${teacher.firstName} ${teacher.lastName}</td>
            <td class="td-email">${teacher.email}</td>
            <td class="td-section">${teacher.section}</td>
            <td class="td-status">
              <span class="status-badge ${isActive ? 'status-active' : 'status-inactive'}">
                ${isActive ? 'ACTIVE' : 'INACTIVE'}
              </span>
            </td>
            <td class="td-actions">
              <button class="btn-sm btn-edit" onclick="openEditModal(this)" ${!isActive ? 'disabled' : ''}>✏ EDIT</button>
              <button class="btn-sm btn-reset" onclick="resetPassword(this)" ${!isActive ? 'disabled' : ''}>↺ RESET</button>
              <button class="btn-sm ${isActive ? 'btn-deactivate' : 'btn-activate'}" onclick="toggleTeacherStatus(this)">
                ${isActive ? '⏸ DEACTIVATE' : '▶ ACTIVATE'}
              </button>
              <button class="btn-sm btn-delete" onclick="confirmDelete(this)">🗑 DELETE</button>
            </td>`;
          tbody.appendChild(row);
        });

        // Update count and home stats
        updateTeacherCount();
        updateHomeStats();
        
        if (snapshot.size === 0) {

        }
      },
      (error) => {
        console.error('Error loading teachers:', error);
        showToast('Error loading teachers: ' + error.message, 'error');
      }
    );
}

// ---- UPDATE HOME STATS ----
function updateHomeStats() {
  if (!window.db) return; // Firebase not ready yet, firebaseInitPromise handles timing

  updateSchoolDate();

  window.db.collection('teachers').get().then((snapshot) => {
    const teacherCount = snapshot.size;
    document.getElementById('home-teacher-count').textContent = teacherCount;
    document.getElementById('total-teachers-text').textContent = `TOTAL TEACHERS: ${teacherCount}`;
  });

  window.db.collection('students').get().then((snapshot) => {
    const studentCount = snapshot.size;
    document.getElementById('home-student-count').textContent = studentCount;

    window.db.collection('teachers').get().then((teacherSnapshot) => {
      const sections = new Set();
      teacherSnapshot.forEach((doc) => sections.add(doc.data().section));
      document.getElementById('home-section-count').textContent = sections.size + ' sections';
    });
  });
}

// ---- UPDATE SCHOOL DATE ----
function updateSchoolDate() {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  
  const today = new Date();
  const dayName = days[today.getDay()];
  const monthName = months[today.getMonth()];
  const date = today.getDate();
  const year = today.getFullYear();
  
  const dateString = `📅 ${dayName}, ${monthName} ${date}, ${year}`;
  document.getElementById('school-date').textContent = dateString;
}

// ---- FIELD VALIDATION HELPERS (NEG-2.3) ----
function highlightFields(fields) {
  fields.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.border = '2px solid #e74c3c';
  });
}

function clearFieldHighlights() {
  ['input-first', 'input-last', 'input-email', 'input-section', 'input-pass'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.border = '';
  });
}

// ---- TEACHER MANAGEMENT ----
async function createTeacher() {
  if (typeof db === 'undefined') {
    showToast('Firebase is not initialized.', 'error');
    return;
  }

  clearFieldHighlights();

  const first = document.getElementById('input-first').value.trim();
  const last = document.getElementById('input-last').value.trim();
  const email = document.getElementById('input-email').value.trim();
  const section = document.getElementById('input-section').value;
  const password = document.getElementById('input-pass').value;

  // NEG-2.3: Highlight empty fields and block submission
  const emptyFields = [];
  if (!first) emptyFields.push('input-first');
  if (!last) emptyFields.push('input-last');
  if (!email) emptyFields.push('input-email');
  if (!section) emptyFields.push('input-section');
  if (!password) emptyFields.push('input-pass');

  if (emptyFields.length > 0) {
    highlightFields(emptyFields);
    showToast('Please fill in all required fields.', 'error');
    return;
  }

  try {
    // 1. Create Firebase Auth account
    const userCredential = await firebase.auth().createUserWithEmailAndPassword(email, password);
    const uid = userCredential.user.uid;

    // 2. Restore admin authentication
    await restoreAdminAuth();

    // 3. Create Firestore document (use Auth UID as doc ID for easy lookup)
    await window.db.collection('teachers').doc(uid).set({
      uid: uid,
      firstName: first,
      lastName: last,
      email: email,
      section: section,
      password: password, // optional to keep for reference
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    closeModal();
    clearFieldHighlights();
    showToast('Teacher created successfully!');
  } catch (error) {
    console.error('Error creating teacher:', error);
    if (error.code === 'auth/email-already-in-use') {
      showToast('That email is already registered.', 'error');
    } else {
      showToast('Error: ' + error.message, 'error');
    }
  }
}

// Open edit modal with teacher data
function openEditModal(btn) {
  const row = btn.closest('tr');
  const teacherId = row.getAttribute('data-teacher-id');
  const name = row.querySelector('.td-name').textContent.split(' ');
  const email = row.querySelector('.td-email').textContent;
  const section = row.querySelector('.td-section').textContent;

  document.getElementById('modal-overlay').classList.add('open');
  document.getElementById('modal-title').textContent = 'EDIT TEACHER';
  document.getElementById('create-btn').textContent = 'UPDATE TEACHER';
  document.getElementById('input-first').value = name[0];
  document.getElementById('input-last').value = name[1] || '';
  document.getElementById('input-email').value = email;
  document.getElementById('input-section').value = section;
  document.getElementById('input-pass').value = '';
  document.getElementById('create-btn').onclick = () => updateTeacher(teacherId, btn);
}

// Update teacher in Firebase
async function updateTeacher(teacherId, btn) {
  if (typeof db === 'undefined') {
    showToast('Firebase is not initialized. Please refresh the page.', 'error');
    return;
  }

  clearFieldHighlights();

  const first = document.getElementById('input-first').value.trim();
  const last = document.getElementById('input-last').value.trim();
  const email = document.getElementById('input-email').value.trim();
  const section = document.getElementById('input-section').value;
  const newPassword = document.getElementById('input-pass').value.trim();

  // NEG-2.3: Highlight empty fields and block submission
  const emptyFields = [];
  if (!first) emptyFields.push('input-first');
  if (!last) emptyFields.push('input-last');
  if (!email) emptyFields.push('input-email');
  if (!section) emptyFields.push('input-section');

  if (emptyFields.length > 0) {
    highlightFields(emptyFields);
    showToast('Please fill in all required fields.', 'error');
    return;
  }

  try {
    const teacherData = await getDocumentData('teachers', teacherId);

    if (!teacherData.email || !teacherData.password) {
      throw new Error('Teacher credentials are missing.');
    }

    await withSignedInAccount(teacherData.email, teacherData.password, async (currentUser) => {
      if (email !== teacherData.email) {
        await currentUser.updateEmail(email);
      }

      if (newPassword) {
        await currentUser.updatePassword(newPassword);
      }
    });

    // Keep Firestore aligned with Auth so login continues to work after edits
    await window.db.collection('teachers').doc(teacherId).update({
      firstName: first,
      lastName: last,
      email: email,
      section: section,
      ...(newPassword ? { password: newPassword, passwordResetPending: false } : {}),
      updatedAt: new Date()
    });

    // The real-time listener will automatically update the table
    closeModal();
    resetModalToCreate();
    clearFieldHighlights();
    showToast('Teacher updated successfully!');
  } catch (error) {
    console.error('Error updating teacher:', error);
    showToast('Error updating teacher: ' + error.message, 'error');
  }
}

// Reset teacher password in Firebase
async function resetPassword(btn) {
  const row = btn.closest('tr');
  const teacherId = row.getAttribute('data-teacher-id');
  const name = row.querySelector('.td-name').textContent;
  const newPassword = 'TempPass123!';

  if (confirm(`Reset password for ${name} to "${newPassword}"?`)) {
    try {
      const teacherData = await getDocumentData('teachers', teacherId);

      if (!teacherData.email || !teacherData.password) {
        throw new Error('Teacher credentials are missing.');
      }

      await withSignedInAccount(teacherData.email, teacherData.password, async (currentUser) => {
        await currentUser.updatePassword(newPassword);
      });

      await window.db.collection('teachers').doc(teacherId).update({
        password: newPassword,
        passwordResetPending: true,
        updatedAt: new Date()
      });

      showToast(`Password reset for ${name}. They'll use "${newPassword}" at next login.`);
    } catch (error) {
      showToast('Error: ' + error.message, 'error');
    }
  }
}

// Reset modal to create mode
function resetModalToCreate() {
  document.getElementById('modal-title').textContent = 'ADD NEW TEACHER';
  document.getElementById('create-btn').textContent = 'CREATE TEACHER';
  document.getElementById('create-btn').onclick = () => createTeacher();
}

// Deactivate or reactivate a teacher (REQ-4)
async function toggleTeacherStatus(btn) {
  if (!window.db) {
    showToast('Firebase is not initialized.', 'error');
    return;
  }

  const row = btn.closest('tr');
  const teacherId = row.getAttribute('data-teacher-id');
  const name = row.querySelector('.td-name').textContent;
  const isCurrentlyActive = btn.classList.contains('btn-deactivate');
  const newStatus = isCurrentlyActive ? 'inactive' : 'active';
  const action = isCurrentlyActive ? 'deactivate' : 'reactivate';

  if (confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} ${name}? ${isCurrentlyActive ? 'They will no longer be able to log in.' : 'They will be able to log in again.'}`)) {
    try {
      await window.db.collection('teachers').doc(teacherId).update({
        status: newStatus,
        updatedAt: new Date()
      });
      showToast(`${name} ${newStatus === 'inactive' ? 'deactivated' : 'reactivated'} successfully.`);
    } catch (error) {
      console.error('Error updating teacher status:', error);
      showToast('Error: ' + error.message, 'error');
    }
  }
}

async function confirmDelete(btn) {
  if (typeof db === 'undefined') {
    showToast('Firebase is not initialized. Please refresh the page.', 'error');
    return;
  }

  const row = btn.closest('tr');
  const teacherId = row.getAttribute('data-teacher-id');
  const name = row.querySelector('.td-name').textContent;
  
  if (confirm(`Delete ${name}?`)) {
    try {
      const teacherData = await getDocumentData('teachers', teacherId);

      if (!teacherData.email || !teacherData.password) {
        throw new Error('Teacher credentials are missing.');
      }

      await withSignedInAccount(teacherData.email, teacherData.password, async (currentUser) => {
        await currentUser.delete();
      });

      // Remove the synced Firestore profile after deleting the Auth account
      await window.db.collection('teachers').doc(teacherId).delete();
      
      // The real-time listener will automatically remove the row from the table
      showToast(`${name} deleted.`);
    } catch (error) {
      console.error('Error deleting teacher:', error);
      showToast('Error deleting teacher: ' + error.message, 'error');
    }
  }
}

function filterTeachers(query) {
  const q = query.toLowerCase();
  document.querySelectorAll('#teacher-tbody tr').forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(q) ? '' : 'none';
  });
  updateTeacherCount();
}

function updateTeacherCount() {
  const visible = document.querySelectorAll('#teacher-tbody tr:not([style*="display: none"])').length;
  const total = document.querySelectorAll('#teacher-tbody tr').length;
  const footer = document.getElementById('teacher-footer');
  if (footer) {
    footer.textContent = `SHOWING ${visible} OF ${total} TEACHERS`;
  }
}

// ---- NOTIFICATIONS ----
let toastTimer;
function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  const isError = type === 'error';
  
  toast.textContent = msg;
  toast.style.borderColor = isError ? 'var(--accent-red)' : 'var(--accent-green)';
  toast.style.color = isError ? 'var(--accent-red)' : 'var(--accent-green)';
  toast.classList.add('show');
  
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

// ---- INITIALIZE ON PAGE LOAD ----
window.addEventListener('load', () => {
  initAuthGuard();
  window.firebaseInitPromise.then(async () => {
    // Restore admin authentication before loading data
    await restoreAdminAuth();
    
    // Add small delay to ensure auth is fully restored
    await new Promise(resolve => setTimeout(resolve, 500));
    
    updateHomeStats();
    loadTeachersFromFirebase();
    loadTotalSessionsCount();
    
    // Load analytics when reports page is viewed
    document.addEventListener('click', (e) => {
      if (e.target.closest('.nav-item') && e.target.closest('.nav-item').textContent.includes('REPORTS')) {
        loadAdminRecentActivity();
        flagBelowThresholdSections();
      }
    });
  });
});
/* ============================================================================
   ADMIN STUDENT MANAGEMENT
   ============================================================================ */

let adminStudentsListener = null;
let adminCsvData = [];
let sectionTeacherMap = {}; // section -> teacherId

// ---- OPEN/CLOSE STUDENT MODAL ----
function openStudentModal(tab) {
  document.getElementById('student-modal-overlay').classList.add('open');
  // Reset forms
  document.getElementById('s-input-first').value = '';
  document.getElementById('s-input-last').value = '';
  document.getElementById('s-csv-file').value = '';
  document.getElementById('s-csv-preview').style.display = 'none';
  document.getElementById('s-import-btn').disabled = true;
  adminCsvData = [];
  // Populate section dropdowns from Firestore teachers
  populateSectionDropdowns();
  switchStudentTab(tab || 'single');
}

function closeStudentModal() {
  document.getElementById('student-modal-overlay').classList.remove('open');
}

function closeStudentModalOutside(e) {
  if (e.target === document.getElementById('student-modal-overlay')) closeStudentModal();
}

function switchStudentTab(tab) {
  document.getElementById('student-single-form').style.display = tab === 'single' ? '' : 'none';
  document.getElementById('student-csv-form').style.display = tab === 'csv' ? '' : 'none';
  document.getElementById('stab-single').classList.toggle('active', tab === 'single');
  document.getElementById('stab-csv').classList.toggle('active', tab === 'csv');
}

// ---- POPULATE SECTION DROPDOWNS FROM TEACHERS ----
async function populateSectionDropdowns() {
  if (!window.db) return;
  try {
    const snap = await window.db.collection('teachers').get();
    const sections = [];
    sectionTeacherMap = {};
    snap.forEach(doc => {
      const t = doc.data();
      // Skip explicitly inactive teachers; include all others
      if (t.section && t.status !== 'inactive') {
        sections.push(t.section);
        sectionTeacherMap[t.section] = doc.id;
      }
    });
    sections.sort();

    ['s-input-section', 's-csv-section', 'admin-section-filter'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const isFilter = id === 'admin-section-filter';
      el.innerHTML = isFilter ? '<option value="">ALL SECTIONS</option>' : '<option value="">Select section...</option>';
      sections.forEach(sec => {
        const opt = document.createElement('option');
        opt.value = sec;
        opt.textContent = sec;
        el.appendChild(opt);
      });
    });
  } catch (e) {
    console.error('Error loading sections:', e);
  }
}

// ---- ADD SINGLE STUDENT ----
async function addSingleStudent() {
  if (!window.db) { showToast('Firebase not initialized.', 'error'); return; }

  const first = document.getElementById('s-input-first').value.trim();
  const last  = document.getElementById('s-input-last').value.trim();
  const section = document.getElementById('s-input-section').value;

  if (!first || !last || !section) {
    showToast('Please fill in all required fields.', 'error'); return;
  }

  const teacherId = sectionTeacherMap[section];
  if (!teacherId) {
    showToast('No active teacher found for that section.', 'error'); return;
  }

  try {
    // Disable listeners while creating student
    if (adminStudentsListener) {
      adminStudentsListener();
      adminStudentsListener = null;
    }
    if (teachersListener) {
      teachersListener();
      teachersListener = null;
    }

    const snap = await window.db.collection('students').where('teacherId', '==', teacherId).get();
    const numbers = snap.docs.map(d => d.data().studentNumber || 0);
    const nextNum = numbers.length ? Math.max(...numbers) + 1 : 1;

    // Build section code from section name (e.g. G6-Tulips → G6TULIPS)
    const sectionCode = section.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    const username = sectionCode + String(nextNum).padStart(3, '0');
    const password = 'Student@123';
    
    // Create Firebase Auth account for the student
    const studentEmail = `${username}@readysetbag.local`;
    const userCredential = await firebase.auth().createUserWithEmailAndPassword(studentEmail, password);
    const authUid = userCredential.user.uid;
    
    // Restore admin authentication
    await restoreAdminAuth();

    // Create Firestore document with auth UID
    await window.db.collection('students').add({
      authUid,
      teacherId,
      section,
      firstName: first,
      lastName: last,
      displayName: `${first} ${last}`,
      username,
      studentNumber: nextNum,
      password: password,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    closeStudentModal();
    showToast(`${first} ${last} added successfully!`);
    
    // Ensure admin is authenticated before reloading
    await restoreAdminAuth();
    
    // Reload table with fresh listener to show new student immediately
    loadAdminStudentsFromFirebase();
  } catch (err) {
    console.error(err);
    // Ensure admin auth is restored
    await restoreAdminAuth();
    
    // Reload table in case of error to maintain UI state
    loadAdminStudentsFromFirebase();
    
    if (err.code === 'auth/email-already-in-use') {
      showToast('That username is already registered.', 'error');
    } else {
      showToast('Error: ' + err.message, 'error');
    }
  }
}

// ---- CSV PREVIEW ----
function previewStudentCSV() {
  const file = document.getElementById('s-csv-file').files[0];
  if (!file) {
    document.getElementById('s-csv-preview').style.display = 'none';
    document.getElementById('s-import-btn').disabled = true;
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    const lines = e.target.result.trim().split('\n').filter(l => l.trim());
    adminCsvData = [];
    lines.forEach(line => {
      const [firstName, lastName] = line.split(',').map(s => s.trim());
      if (firstName && lastName) adminCsvData.push({ firstName, lastName });
    });
    if (!adminCsvData.length) {
      showToast('No valid students found in CSV.', 'error');
      document.getElementById('s-csv-preview').style.display = 'none';
      document.getElementById('s-import-btn').disabled = true;
      return;
    }
    document.getElementById('s-preview-list').innerHTML =
      adminCsvData.map((s, i) => `${i + 1}. ${s.firstName} ${s.lastName}`).join('<br>');
    document.getElementById('s-preview-count').textContent = adminCsvData.length;
    document.getElementById('s-csv-preview').style.display = '';
    document.getElementById('s-import-btn').disabled = false;
  };
  reader.readAsText(file);
}

// ---- IMPORT STUDENTS FROM CSV ----
async function importAdminStudentsFromCSV() {
  if (!window.db) { showToast('Firebase not initialized.', 'error'); return; }
  if (!adminCsvData.length) { showToast('Please select a CSV file first.', 'error'); return; }

  const section = document.getElementById('s-csv-section').value;
  if (!section) { showToast('Please select a section.', 'error'); return; }

  const teacherId = sectionTeacherMap[section];
  if (!teacherId) { showToast('No active teacher for that section.', 'error'); return; }

  try {
    // Disable listeners while importing to prevent permission errors
    if (adminStudentsListener) {
      adminStudentsListener();
      adminStudentsListener = null;
    }
    if (teachersListener) {
      teachersListener();
      teachersListener = null;
    }

    const snap = await window.db.collection('students').where('teacherId', '==', teacherId).get();
    const numbers = snap.docs.map(d => d.data().studentNumber || 0);
    let nextNum = numbers.length ? Math.max(...numbers) + 1 : 1;
    const sectionCode = section.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    const password = 'Student@123';
    let successCount = 0;

    const tbody = document.getElementById('admin-student-tbody');
    
    for (let i = 0; i < adminCsvData.length; i++) {
      const student = adminCsvData[i];
      const username = sectionCode + String(nextNum).padStart(3, '0');
      
      try {
        // Create Firebase Auth account for the student
        const studentEmail = `${username}@readysetbag.local`;
        const userCredential = await firebase.auth().createUserWithEmailAndPassword(studentEmail, password);
        const authUid = userCredential.user.uid;
        
        // Restore admin authentication
        await restoreAdminAuth();

        // Create Firestore document with auth UID
        const docRef = await window.db.collection('students').add({
          authUid,
          teacherId,
          section,
          firstName: student.firstName,
          lastName: student.lastName,
          displayName: `${student.firstName} ${student.lastName}`,
          username,
          studentNumber: nextNum,
          password: password,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        
        // Add row to table immediately (real-time feedback)
        const row = document.createElement('tr');
        row.setAttribute('data-student-id', docRef.id);
        row.innerHTML = `
          <td class="td-username">${username}</td>
          <td>${student.firstName} ${student.lastName}</td>
          <td>${section}</td>
          <td class="td-pass">••••••••</td>
          <td class="td-actions">
            <button class="btn-sm btn-reset" onclick="resetAdminStudentPassword(this)">↺ RESET</button>
            <button class="btn-sm btn-delete" onclick="deleteAdminStudent(this)">🗑 DELETE</button>
          </td>`;
        tbody.appendChild(row);
        
        // Show progress
        showToast(`Creating students... ${i + 1}/${adminCsvData.length}`, 'info');
        successCount++;
      } catch (err) {
        console.error(`Error creating student ${student.firstName} ${student.lastName}:`, err);
        // Continue with next student instead of stopping
      }
      nextNum++;
    }

    // Ensure admin is authenticated after import completes
    await restoreAdminAuth();
    
    closeStudentModal();
    showToast(`${successCount} of ${adminCsvData.length} student(s) imported successfully!`);
    
    // Now that auth is stable and all students are created, reload the table with fresh listener
    loadAdminStudentsFromFirebase();
  } catch (err) {
    console.error(err);
    showToast('Error: ' + err.message, 'error');
    // Ensure admin auth is restored
    await restoreAdminAuth();
  }
}

// ---- CSV EXPORT HELPERS ----
function downloadCsv(filename, csv) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });

  if (window.navigator && typeof window.navigator.msSaveOrOpenBlob === 'function') {
    window.navigator.msSaveOrOpenBlob(blob, filename);
    return;
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 1000);
}

async function exportTeachersCsv() {
  if (!window.db) { showToast('Firebase not initialized.', 'error'); return; }
  try {
    const snap = await window.db.collection('teachers').orderBy('lastName').get();
    const rows = [];
    rows.push(['uid','firstName','lastName','email','section','status','createdAt','updatedAt'].join(','));
    snap.forEach(doc => {
      const t = doc.data();
      const created = t.createdAt && t.createdAt.toDate ? t.createdAt.toDate().toISOString() : (t.createdAt? new Date(t.createdAt).toISOString() : '');
      const updated = t.updatedAt && t.updatedAt.toDate ? t.updatedAt.toDate().toISOString() : (t.updatedAt? new Date(t.updatedAt).toISOString() : '');
      rows.push([doc.id, t.firstName || '', t.lastName || '', t.email || '', t.section || '', t.status || '', created, updated].map(v => '"' + String(v).replace(/"/g,'""') + '"').join(','));
    });
    downloadCsv('teachers.csv', rows.join('\n'));
    showToast('Teachers CSV exported.');
  } catch (err) {
    console.error('Export teachers failed', err);
    showToast('Error exporting teachers: ' + err.message, 'error');
  }
}

async function exportAdminStudentsCsv() {
  if (!window.db) { showToast('Firebase not initialized.', 'error'); return; }
  try {
    const snap = await window.db.collection('students').orderBy('section').orderBy('studentNumber').get();
    const rows = [];
    rows.push(['id','authUid','username','displayName','section','teacherId','studentNumber','createdAt','updatedAt'].join(','));
    snap.forEach(doc => {
      const s = doc.data();
      const created = s.createdAt && s.createdAt.toDate ? s.createdAt.toDate().toISOString() : (s.createdAt? new Date(s.createdAt).toISOString() : '');
      const updated = s.updatedAt && s.updatedAt.toDate ? s.updatedAt.toDate().toISOString() : (s.updatedAt? new Date(s.updatedAt).toISOString() : '');
      rows.push([doc.id, s.authUid || '', s.username || '', s.displayName || '', s.section || '', s.teacherId || '', s.studentNumber || '', created, updated].map(v => '"' + String(v).replace(/"/g,'""') + '"').join(','));
    });
    downloadCsv('students.csv', rows.join('\n'));
    showToast('Students CSV exported.');
  } catch (err) {
    console.error('Export students failed', err);
    showToast('Error exporting students: ' + err.message, 'error');
  }
}

async function exportAdminSessionResultsCsv() {
  if (!window.db) { showToast('Firebase not initialized.', 'error'); return; }
  try {
    const snap = await window.db.collection('sessionResults').orderBy('createdAt', 'desc').get();
    const rows = [];
    rows.push(['id','sessionId','sessionCode','teacherId','studentId','studentName','section','score','completionTime','attempts','stage','essentials','essentialsMax','errors','difficulty','createdAt','updatedAt'].join(','));
    snap.forEach(doc => {
      const r = doc.data();
      const created = r.createdAt && r.createdAt.toDate ? r.createdAt.toDate().toISOString() : (r.createdAt ? new Date(r.createdAt).toISOString() : '');
      const updated = r.updatedAt && r.updatedAt.toDate ? r.updatedAt.toDate().toISOString() : (r.updatedAt ? new Date(r.updatedAt).toISOString() : '');
      rows.push([doc.id, r.sessionId || '', r.sessionCode || '', r.teacherId || '', r.studentId || '', r.studentName || '', r.section || '', r.score || 0, r.completionTime || 0, r.attempts || 0, r.stage || '', r.essentials || 0, r.essentialsMax || 0, r.errors || 0, r.difficulty || '', created, updated].map(v => '"' + String(v).replace(/"/g,'""') + '"').join(','));
    });
    downloadCsv('session-results.csv', rows.join('\n'));
    showToast('Session results CSV exported.');
  } catch (err) {
    console.error('Export session results failed', err);
    showToast('Error exporting session results: ' + err.message, 'error');
  }
}

// ---- LOAD ALL STUDENTS (REAL-TIME) ----
function loadAdminStudentsFromFirebase() {
  if (!window.db) return;
  if (adminStudentsListener) adminStudentsListener();

  populateSectionDropdowns();

  adminStudentsListener = window.db.collection('students')
    .orderBy('section', 'asc')
    .orderBy('studentNumber', 'asc')
    .onSnapshot((snapshot) => {
      const tbody = document.getElementById('admin-student-tbody');
      tbody.innerHTML = '';
      snapshot.forEach(doc => {
        const s = doc.data();
        const row = document.createElement('tr');
        row.setAttribute('data-student-id', doc.id);
        row.innerHTML = `
          <td class="td-username">${s.username}</td>
          <td>${s.displayName}</td>
          <td>${s.section}</td>
          <td class="td-pass">••••••••</td>
          <td class="td-actions">
            <button class="btn-sm btn-reset" onclick="resetAdminStudentPassword(this)">↺ RESET</button>
            <button class="btn-sm btn-delete" onclick="deleteAdminStudent(this)">🗑 DELETE</button>
          </td>`;
        tbody.appendChild(row);
      });
      updateAdminStudentCount();
      filterAdminStudents(document.getElementById('admin-search')?.value || '');
    }, err => {
      console.error(err);
      showToast('Error loading students: ' + err.message, 'error');
    });
}

// ---- RESET STUDENT PASSWORD ----
async function resetAdminStudentPassword(btn) {
  if (!window.db) { showToast('Firebase not initialized.', 'error'); return; }
  const row = btn.closest('tr');
  const id = row.getAttribute('data-student-id');
  const name = row.querySelector('td:nth-child(2)').textContent;
  if (confirm(`Reset password for ${name} to "Student@123"?`)) {
    try {
      const studentData = await getDocumentData('students', id);

      if (!studentData.username || !studentData.password) {
        throw new Error('Student credentials are missing.');
      }

      const studentEmail = `${studentData.username}@readysetbag.local`;

      await withSignedInAccount(studentEmail, studentData.password, async (currentUser) => {
        await currentUser.updatePassword('Student@123');
      });

      await window.db.collection('students').doc(id).update({ password: 'Student@123', updatedAt: new Date() });
      showToast(`Password reset for ${name}.`);
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
  }
}

// ---- DELETE STUDENT ----
async function deleteAdminStudent(btn) {
  if (!window.db) { showToast('Firebase not initialized.', 'error'); return; }
  const row = btn.closest('tr');
  const id = row.getAttribute('data-student-id');
  const name = row.querySelector('td:nth-child(2)').textContent;
  if (confirm(`Delete ${name}?`)) {
    try {
      const studentData = await getDocumentData('students', id);

      if (!studentData.username || !studentData.password) {
        throw new Error('Student credentials are missing.');
      }

      const studentEmail = `${studentData.username}@readysetbag.local`;

      await withSignedInAccount(studentEmail, studentData.password, async (currentUser) => {
        await currentUser.delete();
      });

      await window.db.collection('students').doc(id).delete();
      showToast(`${name} deleted.`);
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
  }
}

// ---- FILTER STUDENTS ----
function filterAdminStudents(query) {
  const q = (query || '').toLowerCase();
  const sectionFilter = document.getElementById('admin-section-filter')?.value || '';
  document.querySelectorAll('#admin-student-tbody tr').forEach(row => {
    const text = row.textContent.toLowerCase();
    const sectionMatch = !sectionFilter || row.querySelector('td:nth-child(3)')?.textContent === sectionFilter;
    row.style.display = (text.includes(q) && sectionMatch) ? '' : 'none';
  });
  updateAdminStudentCount();
}

function updateAdminStudentCount() {
  const total = document.querySelectorAll('#admin-student-tbody tr').length;
  const visible = document.querySelectorAll('#admin-student-tbody tr:not([style*="display: none"])').length;
  const footer = document.getElementById('admin-student-footer');
  if (footer) footer.textContent = `SHOWING ${visible} OF ${total} STUDENTS`;
  const countEl = document.getElementById('admin-student-count-text');
  if (countEl) countEl.textContent = total;
}

/* ============================================================================
   ADMIN ANALYTICS & REPORTING
   ============================================================================ */

// ---- LOAD TOTAL SESSIONS COUNT ----
function loadTotalSessionsCount() {
  if (!window.firebaseReady) {
    window.firebaseInitPromise.then(() => loadTotalSessionsCount());
    return;
  }
  
  if (!window.db) return;
  
  window.db.collection('sessions').onSnapshot((snapshot) => {
    const count = snapshot.size;
    const element = document.getElementById('total-sessions-count');
    if (element) {
      element.textContent = count;
    }
  });
}

// ---- FLAG BELOW-70% SECTIONS ----
function flagBelowThresholdSections() {
  if (!window.firebaseReady) {
    window.firebaseInitPromise.then(() => flagBelowThresholdSections());
    return;
  }
  
  if (!window.db) return;
  
  // Get all sessionResults and aggregate by section
  window.db.collection('sessionResults').onSnapshot((snapshot) => {
    const sectionStats = {};
    
    snapshot.forEach((doc) => {
      const result = doc.data();
      const section = result.section || 'Unknown';
      
      if (!sectionStats[section]) {
        sectionStats[section] = { totalScore: 0, count: 0 };
      }
      sectionStats[section].totalScore += result.score || 0;
      sectionStats[section].count++;
    });
    
    // Calculate averages and highlight below-70%
    const tbody = document.getElementById('section-report-tbody');
    if (!tbody) return;
    
    const rows = tbody.querySelectorAll('tr');
    rows.forEach((row, index) => {
      const sectionName = row.querySelector('td:first-child')?.textContent.trim();
      const scoreCell = row.querySelector('td:nth-child(2)');
      const statusCell = row.querySelector('td:nth-child(3)');
      
      if (sectionName && statusCell && sectionName !== 'SCHOOL AVG') {
        const score = parseInt(scoreCell?.textContent) || 0;
        
        if (score < 70) {
          row.style.backgroundColor = 'rgba(231, 76, 60, 0.15)';
          statusCell.innerHTML = '<span class="status-badge below-threshold">⚠ Needs Support</span>';
        } else {
          row.style.backgroundColor = '';
          statusCell.innerHTML = '<span class="status-badge">Good</span>';
        }
      }
    });
  });
}

// ---- LOAD ADMIN RECENT ACTIVITY ----
function loadAdminRecentActivity() {
  if (!window.firebaseReady) {
    window.firebaseInitPromise.then(() => loadAdminRecentActivity());
    return;
  }
  
  if (!window.db) return;
  
  const container = document.getElementById('admin-recent-activity');
  if (!container) return;

  if (adminRecentActivityListener) {
    adminRecentActivityListener();
    adminRecentActivityListener = null;
  }
  
  // Listen to sessions collection for recent activity
  adminRecentActivityListener = window.db.collection('sessions')
    .orderBy('createdAt', 'desc')
    .limit(5)
    .onSnapshot(async (snapshot) => {
      container.innerHTML = '';
      
      if (snapshot.empty) {
        container.innerHTML = '<div class="activity-item"><div class="activity-desc">No recent activity</div></div>';
        return;
      }

      // Gather teacherIds referenced in these sessions
      const teacherIds = Array.from(new Set(snapshot.docs.map(d => d.data().teacherId).filter(Boolean)));
      const teacherMap = {};
      try {
        if (teacherIds.length) {
          // Firestore 'in' query (safe for up to 10 ids)
          const tSnap = await window.db.collection('teachers').where(firebase.firestore.FieldPath.documentId(), 'in', teacherIds).get();
          tSnap.forEach(td => teacherMap[td.id] = td.data());
        }
      } catch (e) {
        // ignore lookup errors; we'll fallback to unknown
        console.warn('Failed to load teacher names for recent activity', e);
      }

      // Render each session with teacher name/section when available
      snapshot.forEach((doc) => {
        const session = doc.data();
        const date = session.createdAt ? new Date(session.createdAt.toDate()).toLocaleDateString('en-US', {month: 'short', day: 'numeric'}) : 'Unknown';
        const difficulty = session.difficulty || 'Unknown';
        const playerCount = session.playersList ? session.playersList.length : 0;
        const statusLabel = session.status === 'active' || session.startedAt ? 'Started' : 'Created';
        const teacher = teacherMap[session.teacherId] || null;
        const teacherLabel = teacher ? (`Teacher ${teacher.lastName || teacher.firstName || session.teacherId}`) : (session.teacherId || 'Unknown Teacher');
        const sectionLabel = teacher && teacher.section ? ` – ${teacher.section}` : '';

        const activityDiv = document.createElement('div');
        activityDiv.className = 'activity-item';
        activityDiv.innerHTML = `
          <div class="activity-date">${date}</div>
          <div class="activity-teacher">${teacherLabel}${sectionLabel}</div>
          <div class="activity-desc">${statusLabel} ${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)} Session<br>Code: ${session.sessionCode} (${playerCount} students)</div>
        `;
        container.appendChild(activityDiv);
      });
    });
}
