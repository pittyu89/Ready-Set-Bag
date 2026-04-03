/* ============================================================================
   READY-SET-BAG! ADMIN DASHBOARD - SCRIPT
   ============================================================================ */

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
}

// ---- MODAL MANAGEMENT ----
function openModal() {
  document.getElementById('modal-overlay').classList.add('open');
  document.getElementById('input-first').value = '';
  document.getElementById('input-last').value = '';
  document.getElementById('input-email').value = '';
  document.getElementById('input-section').value = '';
  document.getElementById('input-pass').value = 'TempPass123!';
  document.getElementById('chk-welcome').checked = false;
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
}

function closeModalOutside(e) {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
}

// ---- TEACHER MANAGEMENT ----
function createTeacher() {
  const first = document.getElementById('input-first').value.trim();
  const last = document.getElementById('input-last').value.trim();
  const email = document.getElementById('input-email').value.trim();
  const section = document.getElementById('input-section').value;
  
  if (!first || !last || !email || !section) {
    showToast('Please fill in all required fields.', 'error');
    return;
  }

  const row = document.createElement('tr');
  row.innerHTML = `
    <td class="td-name">${first} ${last}</td>
    <td class="td-email">${email}</td>
    <td class="td-section">${section}</td>
    <td class="td-actions">
      <button class="btn-sm btn-edit">✏ EDIT</button>
      <button class="btn-sm btn-reset">↺ RESET</button>
      <button class="btn-sm btn-delete" onclick="confirmDelete(this)">🗑 DELETE</button>
    </td>`;
  
  document.getElementById('teacher-tbody').appendChild(row);
  updateTeacherCount();
  closeModal();
  showToast('Teacher created successfully!');
}

function updateTeacherCount() {
  const visible = document.querySelectorAll('#teacher-tbody tr:not([style*="display: none"])').length;
  const total = document.querySelectorAll('#teacher-tbody tr').length;
  document.getElementById('teacher-footer').textContent = `SHOWING ${visible} OF ${total} TEACHERS`;
}

function confirmDelete(btn) {
  const row = btn.closest('tr');
  const name = row.querySelector('.td-name').textContent;
  if (confirm(`Delete ${name}?`)) {
    row.remove();
    updateTeacherCount();
    showToast(`${name} deleted.`);
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