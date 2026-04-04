/* ============================================================================
   READY-SET-BAG! TEACHER DASHBOARD - SCRIPTS
   ============================================================================ */

/* ---- NAVIGATION ---- */
function navigate(page, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  if (btn) btn.classList.add('active');
}

/* ---- LOGOUT ---- */
function logout() {
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
function selectDiff(radio) {
  document.querySelectorAll('.diff-option').forEach(o => o.classList.remove('selected'));
  radio.closest('.diff-option').classList.add('selected');
}

/* ---- SESSION CODE ---- */
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  document.getElementById('session-code').textContent = code;
  document.getElementById('code-inline').textContent = code;
}

function copyCode() {
  const code = document.getElementById('session-code').textContent;
  navigator.clipboard.writeText(code).then(() => showToast('Code copied: ' + code));
}

/* ---- STUDENTS JOINED SIMULATION ---- */
let joinedCount = 0;
function simulateJoin() {
  if (joinedCount < 40) {
    joinedCount = Math.min(40, joinedCount + Math.floor(Math.random() * 5) + 1);
    document.getElementById('joined-count').textContent = joinedCount;
    document.getElementById('joined-bar').style.width = (joinedCount / 40 * 100) + '%';
    showToast(joinedCount + ' students joined!');
  }
}

function launchSession() {
  if (joinedCount === 0) {
    showToast('Wait for students to join first!', 'error');
    return;
  }
  showToast('🚀 Session launched with ' + joinedCount + ' students!');
  joinedCount = 0;
  document.getElementById('joined-count').textContent = '0';
  document.getElementById('joined-bar').style.width = '0%';
  generateCode();
}

/* ---- ADD STUDENTS MODAL ---- */
let nextNum = 41;

function openAddModal() {
  document.getElementById('modal-overlay').classList.add('open');
  document.getElementById('input-count').value = 0;
  document.getElementById('next-username').textContent = 'G6SAMP0' + nextNum;
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
}

function closeModalOutside(e) {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
}

function addStudents() {
  const count = parseInt(document.getElementById('input-count').value);
  if (!count || count < 1) { showToast('Enter a valid number.', 'error'); return; }
  const tbody = document.getElementById('student-tbody');
  for (let i = 0; i < count; i++) {
    const num = nextNum + i;
    const username = 'G6SAMP' + String(num).padStart(3, '0');
    const row = document.createElement('tr');
    row.innerHTML = `<td class="td-username">${username}</td><td>Student ${num}</td><td class="td-pass">••••••••</td><td><button class="btn-reset-pass" onclick="showToast('Password reset for Student ${num}')">Reset Password</button></td>`;
    tbody.appendChild(row);
  }
  nextNum += count;
  document.getElementById('next-username').textContent = 'G6SAMP0' + nextNum;
  updateStudentCount();
  closeModal();
  showToast(count + ' student(s) added successfully!');
}

function updateStudentCount() {
  const total = document.querySelectorAll('#student-tbody tr').length;
  document.getElementById('student-footer').textContent = `SHOWING ${total} STUDENTS`;
  document.getElementById('enrolled-count').textContent = total + ' students enrolled';
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

/* ---- INIT ---- */
generateCode();
