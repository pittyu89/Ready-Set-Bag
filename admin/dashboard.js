/* ============================================================================
   READY-SET-BAG! ADMIN DASHBOARD - SCRIPT
   ============================================================================ */

// Global variable to track Firestore listener
let teachersListener = null;

// ---- NAVIGATION ----
function navigate(page, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  if (btn) btn.classList.add('active');
  
  const titles = { 
    home: 'ADMIN DASHBOARD', 
    teachers: 'ADMIN DASHBOARD', 
    reports: 'ADMIN DASHBOARD', 
    settings: 'ADMIN DASHBOARD' 
  };
  document.getElementById('topbar-title').textContent = titles[page];
  
  // Load teachers from Firestore when navigating to teachers page
  if (page === 'teachers') {
    loadTeachersFromFirebase();
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
          const row = document.createElement('tr');
          row.setAttribute('data-teacher-id', doc.id);
          row.innerHTML = `
            <td class="td-name">${teacher.firstName} ${teacher.lastName}</td>
            <td class="td-email">${teacher.email}</td>
            <td class="td-section">${teacher.section}</td>
            <td class="td-actions">
              <button class="btn-sm btn-edit" onclick="openEditModal(this)">✏ EDIT</button>
              <button class="btn-sm btn-reset" onclick="resetPassword(this)">↺ RESET</button>
              <button class="btn-sm btn-delete" onclick="confirmDelete(this)">🗑 DELETE</button>
            </td>`;
          tbody.appendChild(row);
        });

        // Update count and home stats
        updateTeacherCount();
        updateHomeStats();
        
        if (snapshot.size === 0) {
          console.log('No teachers in Firestore');
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

// ---- TEACHER MANAGEMENT ----
async function createTeacher() {
  if (typeof db === 'undefined') {
    showToast('Firebase is not initialized.', 'error');
    return;
  }

  const first = document.getElementById('input-first').value.trim();
  const last = document.getElementById('input-last').value.trim();
  const email = document.getElementById('input-email').value.trim();
  const section = document.getElementById('input-section').value;
  const password = document.getElementById('input-pass').value;

  if (!first || !last || !email || !section || !password) {
    showToast('Please fill in all required fields.', 'error');
    return;
  }

  try {
    // 1. Create Firebase Auth account
    const userCredential = await firebase.auth().createUserWithEmailAndPassword(email, password);
    const uid = userCredential.user.uid;

    // 2. Create Firestore document (use Auth UID as doc ID for easy lookup)
    await window.db.collection('teachers').doc(uid).set({
      uid: uid,
      firstName: first,
      lastName: last,
      email: email,
      section: section,
      password: password, // optional to keep for reference
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // 3. Sign back in as admin (creating a user auto-signs them in)
    await firebase.auth().signOut();

    closeModal();
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

  const first = document.getElementById('input-first').value.trim();
  const last = document.getElementById('input-last').value.trim();
  const email = document.getElementById('input-email').value.trim();
  const section = document.getElementById('input-section').value;

  if (!first || !last || !email || !section) {
    showToast('Please fill in all required fields.', 'error');
    return;
  }

  try {
    // Update Firestore document
    await window.db.collection('teachers').doc(teacherId).update({
      firstName: first,
      lastName: last,
      email: email,
      section: section,
      updatedAt: new Date()
    });

    // The real-time listener will automatically update the table
    closeModal();
    resetModalToCreate();
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
      // 1. Update Firebase Auth password via Admin-style reset
      //    (client SDK can't change OTHER users' passwords, so we store
      //     it in Firestore and handle it at next login)
      await db.collection('teachers').doc(teacherId).update({
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
      // Delete from Firestore
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
  window.firebaseInitPromise.then(() => {
    updateHomeStats();
    loadTeachersFromFirebase();
  });
});