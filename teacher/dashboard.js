/* ============================================================================
   READY-SET-BAG! TEACHER DASHBOARD - SCRIPTS
   ============================================================================ */

// Global variables
let teacherId = null;
let teacherSection = null;
let teacherRecentActivityListener = null;

// Reports/analytics state
let teacherResultsCache = [];
let teacherStudentsCache = [];
let teacherResultsListener = null;
let teacherSessionsCount = null;

// Load teacher info on page load
window.addEventListener('load', () => {
  // Debug: log session + firebase state early
  try { console.log('Teacher dashboard load - session:', {
    userRole: sessionStorage.getItem('userRole'),
    teacherId: sessionStorage.getItem('teacherId'),
    teacherSection: sessionStorage.getItem('teacherSection'),
    teacherLastPage: sessionStorage.getItem('teacherLastPage')
  }, 'firebaseReady=', window.firebaseReady); } catch (e) {}

  window.addEventListener('error', (ev) => {
    console.error('Unhandled error on teacher dashboard:', ev.error || ev.message, ev);
    try { showToast('Error: ' + (ev.error?.message || ev.message), 'error'); } catch (e) {}
  });

  initAuthGuard();
  // Pre-paint restore: if head script set an initial page, apply it now and clear restoring marker
  try {
    const initial = document.documentElement.getAttribute('data-teacher-initial');
    if (initial) {
      const navs = document.querySelectorAll('.nav-item');
      let btn = null;
      for (let i=0;i<navs.length;i++){
        const on = navs[i].getAttribute('onclick') || '';
        if (on.indexOf("'"+initial+"'")!==-1 || on.indexOf('\"'+initial+'\"')!==-1) { btn = navs[i]; break; }
      }
      if (document.getElementById('page-' + initial)) {
        navigate(initial, btn);
      }
      document.documentElement.classList.remove('js-restoring');
      document.documentElement.removeAttribute('data-teacher-initial');
    }
  } catch (e) { console.warn('prepaint teacher restore failed', e); } finally {
    // Always clear restoring marker to avoid leaving the page hidden
    try { document.documentElement.classList.remove('js-restoring'); document.documentElement.removeAttribute('data-teacher-initial'); } catch (_) {}
  }

  teacherId = sessionStorage.getItem('teacherId');
  teacherSection = sessionStorage.getItem('teacherSection');

  // Show what login saved straight away; the live profile listener replaces it once loaded
  renderTeacherProfile({
    name: sessionStorage.getItem('username') || '',
    section: teacherSection || '',
    status: 'active'
  });

  // Every read is checked against the signed-in teacher: with no Firebase session there is
  // nothing to show, so go back to the login page
  if (window.authReadyPromise) {
    window.authReadyPromise.then((user) => {
      if (window.auth && (!user || user.uid !== teacherId)) {
        sessionStorage.clear();
        window.location.href = '../index.html';
      }
    });
  }

  // Live teacher profile (name, section, status)
  loadTeacherProfile();

  // Live class roster: student count, class size for joins, and the reports' roster
  loadTeacherStudentCount();

  // Load analytics for Home quick-stats + Reports (metrics, leaderboard, results)
  loadTeacherReports();
  
  // Load recent activity when reports page is viewed
  document.addEventListener('click', (e) => {
    if (e.target.closest('.nav-item') && e.target.closest('.nav-item').textContent.includes('REPORTS')) {
      loadTeacherRecentActivity();
    }
  });

  // If Firebase doesn't initialize within a short time, show offline placeholders
  setTimeout(() => {
    try {
      if (!window.db) showTeacherOfflineFallback();
    } catch (e) { /* ignore */ }
  }, 1500);
});

// Ensure a page is visible even if navigation didn't run
setTimeout(() => {
  try {
    if (!document.querySelector('.page.active')) {
      const firstNav = document.querySelector('.nav-item');
      if (document.getElementById('page-home')) navigate('home', firstNav);
    }
  } catch (e) { console.warn('forced nav fallback failed', e); }
}, 200);

function showTeacherOfflineFallback() {
  try {
    const countEl = document.getElementById('welcome-student-count');
    if (countEl) countEl.textContent = '0 students';
    const container = document.getElementById('teacher-recent-activity');
    if (container) container.innerHTML = '<div class="activity-item"><div class="activity-desc">Offline: recent activity unavailable.</div></div>';
    showToast('Firebase not available. Showing offline placeholders.', 'info');
  } catch (e) { console.warn('showTeacherOfflineFallback failed', e); }
}

// ---- TEACHER PROFILE (REAL-TIME) ----
// Name, section and status come from the teacher's own Firestore profile, so an admin's
// edits show up without the teacher having to log in again.
function renderTeacherProfile(profile) {
  const name = (profile.name || '').trim();
  const section = profile.section || '';
  const active = profile.status !== 'inactive';

  const nameEl = document.querySelector('.sidebar-user .name');
  if (nameEl) nameEl.textContent = name.toUpperCase();
  const sectionEl = document.querySelector('.sidebar-user .section-tag');
  if (sectionEl) sectionEl.textContent = section;

  const greeting = document.querySelector('.welcome-greeting');
  if (greeting) greeting.textContent = name ? `👋 WELCOME BACK, TEACHER ${name.toUpperCase()}!` : '👋 WELCOME BACK!';
  setTeacherText('welcome-section', section ? `🏫 ${section}` : '🏫 —');
  setTeacherText('welcome-status-text', active ? 'ACTIVE' : 'INACTIVE');

  const avatar = document.getElementById('teacher-avatar');
  if (avatar) avatar.textContent = name.split(/\s+/).map(w => w[0] || '').slice(0, 2).join('').toUpperCase();
}

function loadTeacherProfile() {
  (async () => {
    if (window.authReadyPromise) await window.authReadyPromise;
    if (!teacherId || !window.db) return;

    window.db.collection('teachers').doc(teacherId).onSnapshot((doc) => {
      if (!doc.exists) return;
      const t = doc.data();
      const name = `${t.firstName || ''} ${t.lastName || ''}`.trim();

      teacherSection = t.section || '';
      try {
        sessionStorage.setItem('username', name);
        sessionStorage.setItem('teacherSection', teacherSection);
      } catch (e) { /* ignore */ }

      renderTeacherProfile({ name: name, section: teacherSection, status: t.status });

      // Deactivated by an admin while signed in: same outcome as trying to log in
      if (t.status === 'inactive') {
        alert('This teacher account is inactive. Please contact your administrator.');
        logout();
      }
    }, (err) => console.warn('teacher profile listener error', err));
  })();
}

// ---- CLASS ROSTER (REAL-TIME) ----
// One live listener feeds the welcome count, the class size shown when students join a
// session, and the roster the reports use for completion rate.
function loadTeacherStudentCount() {
  (async () => {
    // Reads are checked against the signed-in teacher, so wait for Auth, not just the SDK
    if (window.authReadyPromise) {
      await window.authReadyPromise;
    }

    if (!teacherId) return;
    if (!window.db) {
      console.warn('loadTeacherStudentCount: Firebase not ready');
      return;
    }

    window.db.collection('students').where('teacherId', '==', teacherId).onSnapshot((snapshot) => {
      const count = snapshot.size;
      setTeacherText('welcome-student-count', `${count} student${count !== 1 ? 's' : ''}`);

      window.teacherClassSize = count;
      if (typeof updateJoinedDisplay === 'function') updateJoinedDisplay();

      teacherStudentsCache = snapshot.docs.map(d => d.data());
      renderTeacherReports();
    }, (err) => console.warn('teacher roster listener error', err));
  })();
}

/* ---- NAVIGATION ---- */
function navigate(page, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  if (btn) btn.classList.add('active');
  try { sessionStorage.setItem('teacherLastPage', page); } catch (e) { /* ignore */ }
  // If navigating to reports, ensure recent activity attaches even if Firebase init was delayed
  if (page === 'reports') {
    loadTeacherRecentActivity();
    setTimeout(() => {
      try {
        // If listener didn't attach, try again
        if (!teacherRecentActivityListener && window.db) loadTeacherRecentActivity();
      } catch (e) { /* ignore */ }
    }, 900);
  }
}

/* ---- LOGOUT ---- */
function logout() {
  if (window.auth) {
    window.auth.signOut().catch(err => console.error('Sign out error:', err));
  }
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
  const footer = document.getElementById('results-footer');
  if (footer) {
    footer.textContent = `SHOWING ${visible} OF ${total} STUDENTS`;
  }
}

/* ---- LOAD RECENT ACTIVITY ---- */
function loadTeacherRecentActivity() {
  (async () => {
    // Reads are checked against the signed-in teacher, so wait for Auth, not just the SDK
    if (window.authReadyPromise) {
      await window.authReadyPromise;
    }

    if (!teacherId) return;
    const container = document.getElementById('teacher-recent-activity');
    if (!container) return;

    // show loader immediately while listener initializes
    try {
      container.innerHTML = '<div class="gif-loader"><img src="/images/loading.gif" class="gif-loader-image" width="72" height="72" style="width:72px;height:72px;" onerror="this.src=\'../images/loading.gif\'"/><div class="gif-loader-text">LOADING…</div></div>';
    } catch (e) { console.warn('show teacher loader failed', e); }

    if (!window.db) {
      console.warn('loadTeacherRecentActivity: Firebase not ready');
      return;
    }

    if (teacherRecentActivityListener) {
      teacherRecentActivityListener();
      teacherRecentActivityListener = null;
    }

    // Listen to sessions collection for this teacher
    teacherRecentActivityListener = window.db.collection('sessions')
      .where('teacherId', '==', teacherId)
      .orderBy('createdAt', 'desc')
      .limit(5)
      .onSnapshot((snapshot) => {
        container.innerHTML = '';

        const rows = snapshot.docs
          .map(doc => ({ id: doc.id, data: doc.data() }))
          .filter(entry => entry.data.startedAt || entry.data.status === 'active' || entry.data.endedAt);

        if (!rows.length) {
          container.innerHTML = '<div class="activity-item"><div class="activity-desc">No recent activity</div></div>';
          return;
        }

        const esc = (window.RSBAnalytics && window.RSBAnalytics.esc) || ((v) => v);

        // Cached so "export these 5" doesn't have to re-query.
        teacherRecentSessions = rows.map((entry) => ({
          id: entry.id,
          code: entry.data.sessionCode || '',
          difficulty: entry.data.difficulty || ''
        }));

        container.innerHTML = rows.map((entry) => {
          const session = entry.data;
          const dateSource = session.startedAt || session.updatedAt || session.createdAt;
          const date = dateSource ? new Date(dateSource.toDate()).toLocaleDateString('en-US', {month: 'short', day: 'numeric'}) : 'Unknown';
          const difficulty = session.difficulty || 'Unknown';
          const playerCount = countJoinedPlayers(session.playersList);
          const started = session.status === 'active' || !!session.startedAt;
          const statusLabel = started ? 'Started' : 'Created';
          const meta = teacherSection || 'Unknown section';
          // Sessions from before the bag picker used the standard bag
          const bagLabel = { small: 'Small Bag', medium: 'Medium Bag' }[session.bagType] || 'Standard Bag';

          return `<div class="session-card${started ? '' : ' is-created'}">
            <div class="session-card-date">\u25cf ${esc(date)}</div>
            <div class="session-card-who">${esc(meta)}</div>
            <div class="session-card-title">${statusLabel} ${esc(difficulty.charAt(0).toUpperCase() + difficulty.slice(1))} Session</div>
            <div class="session-card-meta">Code: <b>${esc(session.sessionCode || '')}</b> (${playerCount} student${playerCount === 1 ? '' : 's'}) &middot; ${esc(bagLabel)}</div>
            <div class="session-card-actions">
              <button class="session-link" onclick="viewTeacherSessionReport('${jsArg(entry.id)}','${jsArg(session.sessionCode || '')}','${jsArg(difficulty)}','${jsArg(meta)}')">\u25a4 Click to view report for this session</button>
              <button class="session-export" onclick="exportSingleTeacherSessionCsv('${jsArg(entry.id)}','${jsArg(session.sessionCode || '')}')">\u2b07 EXPORT CSV</button>
            </div>
          </div>`;
        }).join('');
      });
  })();
}

/* ---- SESSION-SCOPED REPORTS ----
   Clicking a session card narrows the whole reports page to that one drill
   run. Scope is kept separate from the level dropdown so both still apply. */
let teacherSessionScope = null;
let teacherRecentSessions = [];

// Values interpolated into an inline onclick are parsed as HTML *then* as JS,
// so HTML-escaping alone is not enough: "&#39;" decodes back to a real quote
// and closes the string literal early. Escape for JS first, then for HTML.
function jsArg(value) {
  const esc = (window.RSBAnalytics && window.RSBAnalytics.esc) || ((v) => String(v));
  return esc(String(value == null ? '' : value).replace(/\\/g, '\\\\').replace(/'/g, "\\'"));
}


function viewTeacherSessionReport(sessionId, code, difficulty, meta) {
  teacherSessionScope = { sessionId: sessionId, code: code || '', meta: meta || '' };
  const level = document.getElementById('tr-level-filter');
  // A session runs at one difficulty; matching the filter to it avoids an
  // empty report when the session isn't the level currently selected.
  if (level && difficulty && window.RSBAnalytics &&
      window.RSBAnalytics.KNOWN_LEVELS.indexOf(String(difficulty).toLowerCase()) !== -1) {
    level.value = String(difficulty).toLowerCase();
  }
  syncTeacherSessionScopeBanner();
  renderTeacherReports();
  document.querySelector('.main')?.scrollTo({ top: 0, behavior: 'smooth' });
}

function clearTeacherSessionScope() {
  teacherSessionScope = null;
  syncTeacherSessionScopeBanner();
  renderTeacherReports();
}

function syncTeacherSessionScopeBanner() {
  const bar = document.getElementById('teacher-session-scope');
  if (!bar) return;
  if (!teacherSessionScope) { bar.style.display = 'none'; return; }
  bar.style.display = '';
  setTeacherText('teacher-session-scope-code', teacherSessionScope.code || teacherSessionScope.sessionId);
  setTeacherText('teacher-session-scope-meta', teacherSessionScope.meta || '');
}

/* ============================================================================
   TEACHER REPORTS ENGINE
   Teacher-scoped analytics via window.RSBAnalytics. Feeds the Home quick-stats,
   the Reports metric cards (avg score / completion / avg time), the class
   leaderboard, and the individual results table. Re-renders on filter change.
   ============================================================================ */
function loadTeacherReports() {
  (async () => {
    // Reads are checked against the signed-in teacher, so wait for Auth, not just the SDK
    if (window.authReadyPromise) {
      await window.authReadyPromise;
    }
    if (!teacherId || !window.db || !window.RSBAnalytics) return;

    // The roster (for total students + completion rate) comes from the live listener in
    // loadTeacherStudentCount.

    // Sessions run (Home quick-stat), live. Only sessions that were actually launched count,
    // the same ones Recent Activity lists. The latest one also picks the level the Reports
    // filter opens on, until the teacher chooses one themselves.
    window.db.collection('sessions').where('teacherId', '==', teacherId)
      .onSnapshot((snap) => {
        const run = snap.docs.map(d => d.data()).filter(s => s.startedAt || s.status === 'active');
        teacherSessionsCount = run.length;
        applyDefaultLevelFilter(run);
        renderTeacherReports();
      }, (err) => console.warn('teacher reports: sessions listener error', err));

    // Live results listener
    if (teacherResultsListener) { teacherResultsListener(); teacherResultsListener = null; }
    teacherResultsListener = window.db.collection('sessionResults')
      .where('teacherId', '==', teacherId).limit(1000)
      .onSnapshot((snap) => { teacherResultsCache = snap.docs.map(d => d.data()); renderTeacherReports(); },
        (err) => console.warn('teacher reports: results listener error', err));
  })();
}

// Set once the teacher picks a level themselves; after that the filter is theirs.
let levelFilterChosen = false;

function applyDefaultLevelFilter(launchedSessions) {
  const select = document.getElementById('tr-level-filter');
  if (!select || levelFilterChosen || !launchedSessions.length || !window.RSBAnalytics) return;

  const millis = (s) => {
    const v = s.startedAt || s.createdAt;
    return v && v.toMillis ? v.toMillis() : (v ? new Date(v).getTime() : 0);
  };
  const latest = launchedSessions.slice().sort((a, b) => millis(b) - millis(a))[0];
  const level = String(latest.difficulty || '').toLowerCase();
  if (window.RSBAnalytics.KNOWN_LEVELS.indexOf(level) !== -1) select.value = level;
}

function getTeacherFilters() {
  return {
    difficulty: (document.getElementById('tr-level-filter')?.value) || '',
    sessionId: teacherSessionScope ? teacherSessionScope.sessionId : ''
  };
}

function renderTeacherReports() {
  const A = window.RSBAnalytics;
  if (!A) return;
  const filters = getTeacherFilters();
  const m = A.computeMetrics(teacherResultsCache, teacherStudentsCache, filters);

  // Reports metric cards — scoped to the level chosen in the Reports filter
  setTeacherText('tr-avg-score', m.hasData ? m.avgScore + '/100' : '—');
  setTeacherText('tr-completion', m.totalStudents ? m.completionRate + '%' : '—');
  setTeacherText('tr-avg-time', m.hasData ? A.formatTime(m.avgTime) : '—');

  // Home quick-stats deliberately ignore the Reports filter: the cards are
  // labelled for the whole class, and that dropdown lives on another page
  // where the teacher cannot see what it is set to.
  const all = A.computeMetrics(teacherResultsCache, teacherStudentsCache, {});
  setTeacherText('home-my-students', all.totalStudents || 0);
  setTeacherText('home-sessions-run', typeof teacherSessionsCount === 'number' ? teacherSessionsCount : '—');
  setTeacherText('home-avg-score', all.hasData ? all.avgScore : '—');
  setTeacherText('home-completion', all.totalStudents ? all.completionRate + '%' : '—');

  renderTeacherLeaderboard();
  renderTeacherIndividualResults();
  renderTeacherCharts(filters);
}

/* ---- REPORT CHARTS ----
   Drawn by dashboard-charts.js (hand-rolled HTML/SVG — no charting library in
   this project on purpose) and fed entirely from RSBAnalytics, so no chart can
   disagree with the stat card above it. */
function renderTeacherCharts(filters) {
  const A = window.RSBAnalytics;
  const C = window.RSBCharts;
  if (!A || !C) return;

  // 1. Proficiency tiers for the class.
  const tiers = A.readinessTiers(teacherResultsCache, filters);
  setTeacherText('tr-chart-proficiency-tag', tiers.evaluated + ' EVALUATED');
  C.donut('tr-chart-proficiency', {
    segments: [
      { label: 'Mastered (90-100%)', value: tiers.mastered, color: 'var(--chart-good)' },
      { label: 'Proficient (70-89%)', value: tiers.proficient, color: 'var(--chart-warn)' },
      { label: 'Needs Support (<70%)', value: tiers.needsSupport, color: 'var(--chart-bad)' }
    ],
    centerValue: tiers.onTrackPct + '%',
    centerLabel: 'On Track',
    emptyText: 'NO STUDENTS EVALUATED YET'
  });

  // 2. Speed vs score. Fast-and-wrong looks very different from slow-and-right,
  // and a table of two numbers per student hides that completely.
  const points = A.scoreTimePoints(teacherResultsCache, filters);
  const maxTime = Math.max(60, ...points.map(p => p.time));
  const tierColor = {
    mastered: 'var(--chart-good)',
    proficient: 'var(--chart-warn)',
    needsSupport: 'var(--chart-bad)'
  };
  C.scatter('tr-chart-matrix', {
    points: points.map(p => ({
      x: p.time,
      y: p.score,
      color: tierColor[p.tier],
      label: `${p.studentName} — ${p.score} pts in ${A.formatTime(p.time)}`
    })),
    xMax: Math.ceil(maxTime / 30) * 30,
    yMax: 100,
    xTicks: [0, Math.round(maxTime / 2), Math.ceil(maxTime / 30) * 30],
    yTicks: [0, 25, 50, 75, 100],
    xAxisLabel: 'Drill time (seconds)  \u2192   score on the vertical axis',
    legend: [
      { label: 'Ready', color: 'var(--chart-good)' },
      { label: 'Getting there', color: 'var(--chart-warn)' },
      { label: 'Needs support', color: 'var(--chart-bad)' }
    ],
    emptyText: 'NO TIMED RUNS YET'
  });

  // 3. Packing accuracy — the go-bag step on its own, separate from the quiz
  // score, so a class that packs badly but guesses well is still visible.
  const packing = A.packingAccuracy(teacherResultsCache, filters);
  setTeacherText('tr-chart-packing-tag', packing.avgAccuracyPct + '% AVG ACCURACY');
  const maxBucket = Math.max(1, packing.high, packing.moderate, packing.low);
  C.hBars('tr-chart-packing', {
    rows: [
      { label: 'High (90-100%)', pct: (packing.high / maxBucket) * 100, display: packing.high, color: 'var(--chart-good)' },
      { label: 'Moderate (70-89%)', pct: (packing.moderate / maxBucket) * 100, display: packing.moderate, color: 'var(--chart-warn)' },
      { label: 'Low (<70%)', pct: (packing.low / maxBucket) * 100, display: packing.low, color: 'var(--chart-bad)' }
    ],
    labelWidth: 136,
    emptyText: 'NO PACKING DATA YET'
  });
  setTeacherText('tr-avg-essentials', packing.runs ? `${packing.avgEssentials}/${packing.avgEssentialsMax}` : '—');
  setTeacherText('tr-avg-errors', packing.runs ? packing.avgErrors : '—');

  // 4. Trend across drill days. Each series is scaled by its own max, so score
  // and time share a plot: what is comparable is the SHAPE, not the height.
  const trend = A.progressionOverTime(teacherResultsCache, filters, 12);
  C.lines('tr-chart-progression', {
    labels: trend.map(t => t.label),
    series: [
      { name: 'Avg score (%)', color: 'var(--chart-good)', values: trend.map(t => t.avgScore), max: 100 },
      { name: 'Avg time (s)', color: 'var(--chart-neutral)', values: trend.map(t => t.avgTime), dashed: true,
        format: (v) => A.formatTime(v) }
    ],
    emptyText: 'NEEDS AT LEAST ONE DRILL DAY'
  });
}

function renderTeacherLeaderboard() {
  const A = window.RSBAnalytics;
  if (!A) return;
  const mode = document.getElementById('lb-sort')?.value || 'score';
  const timeLed = mode === 'time';
  const board = A.leaderboard(teacherResultsCache, getTeacherFilters(), mode);
  const podium = document.getElementById('lb-podium');
  const emptyMsg = document.getElementById('lb-empty');
  if (!podium) return;

  if (!board.length) {
    podium.innerHTML = '';
    if (emptyMsg) {
      emptyMsg.style.display = '';
      emptyMsg.textContent = 'No results yet — run a session to populate the leaderboard.';
    }
    return;
  }
  if (emptyMsg) emptyMsg.style.display = 'none';

  // Top 3 only, displayed 2nd–1st–3rd for the classic podium feel. The full
  // ranked list was removed per the revision board — publicly ranking a whole
  // class from best to worst is not what this panel is for, and every student's
  // own numbers are still in Individual Results below.
  const medals = ['🥇', '🥈', '🥉'];
  const cls = ['first', 'second', 'third'];
  const top = board.slice(0, 3);
  const disp = [top[1], top[0], top[2]].filter(Boolean);
  podium.innerHTML = disp.map((s) => {
    const i = s.rank - 1;
    // Headline value follows whatever the board is ranked by.
    return `<div class="lb-podium-card ${cls[i] || ''}">
      <div class="lb-podium-medal">${medals[i] || '🏅'}</div>
      <div class="lb-podium-name">${A.esc(s.studentName)}</div>
      <div class="lb-podium-score">${timeLed ? A.formatTime(s.bestTime) : s.bestScore}</div>
      <div class="lb-podium-sub">${timeLed ? s.bestScore + ' PTS' : A.formatTime(s.bestTime)}</div>
    </div>`;
  }).join('');
}

function renderTeacherIndividualResults() {
  const A = window.RSBAnalytics;
  if (!A) return;
  const rows = A.individualRows(teacherResultsCache, getTeacherFilters());
  const tbody = document.getElementById('results-tbody');
  const footer = document.getElementById('results-footer');
  if (!tbody) return;

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--text-muted);padding:18px;">No results yet</td></tr>';
    if (footer) footer.textContent = '';
    return;
  }
  // Skill tier / attempts / mistakes were dropped from this table per the
  // revision board: they are diagnostic detail that belongs in the charts and
  // the CSV export, not in the at-a-glance class roster.
  tbody.innerHTML = rows.map((r) => {
    return `<tr>
      <td>${A.esc(r.studentName)}</td>
      <td>${r.bestScore}</td>
      <td class="td-time">${A.formatTime(r.bestTime)}</td>
    </tr>`;
  }).join('');
  if (footer) footer.innerHTML = teacherFooterText(rows.length);
}

// Footer text plus a warning when results carry a level the filters cannot
// match — without this they would vanish from every report silently.
function teacherFooterText(shown) {
  const A = window.RSBAnalytics;
  const excluded = A.countUnknownLevel(teacherResultsCache);
  let html = `SHOWING ${shown} STUDENT${shown === 1 ? '' : 'S'}`;
  if (excluded) {
    html += `<span class="table-footer-warn">⚠ ${excluded} RESULT${excluded === 1 ? '' : 'S'} NOT SHOWN (MISSING LEVEL)</span>`;
  }
  return html;
}

function setTeacherText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

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

function formatCsvValue(value) {
  return '"' + String(value ?? '').replace(/"/g, '""') + '"';
}

function formatDateValue(value) {
  if (!value) return '';
  if (value.toDate) return value.toDate().toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
}

// Helper: export a query in pages to CSV to avoid loading entire collections at once
async function exportQueryToCsvPaged_Teacher(filename, headerRow, baseQuery, rowMapper, batchSize = 500) {
  const rows = [headerRow];
  let lastDoc = null;
  while (true) {
    let q = baseQuery.limit(batchSize);
    if (lastDoc) q = q.startAfter(lastDoc);
    const snap = await q.get();
    if (snap.empty) break;
    snap.forEach(doc => rows.push(rowMapper(doc)));
    if (snap.size < batchSize) break;
    lastDoc = snap.docs[snap.docs.length - 1];
  }
  downloadCsv(filename, rows.join('\n'));
}

async function exportTeacherSessionResultsCsv() {
  if (!window.db || !teacherId) {
    showToast('Firebase not initialized.', 'error');
    return;
  }

  try {
    const header = ['id','sessionId','sessionCode','teacherId','studentId','studentName','section','score','completionTime','attempts','stage','essentials','essentialsMax','errors','difficulty','createdAt','updatedAt'].join(',');
    const baseQuery = window.db.collection('sessionResults')
      .where('teacherId', '==', teacherId)
      .orderBy('createdAt', 'desc');
    await exportQueryToCsvPaged_Teacher('teacher-session-results.csv', header, baseQuery, (doc) => {
      const result = doc.data();
      return [
        formatCsvValue(doc.id),
        formatCsvValue(result.sessionId || ''),
        formatCsvValue(result.sessionCode || ''),
        formatCsvValue(result.teacherId || teacherId || ''),
        formatCsvValue(result.studentId || ''),
        formatCsvValue(result.studentName || ''),
        formatCsvValue(result.section || teacherSection || ''),
        formatCsvValue(result.score || 0),
        formatCsvValue(result.completionTime || 0),
        formatCsvValue(result.attempts || 0),
        formatCsvValue(result.stage || ''),
        formatCsvValue(result.essentials || 0),
        formatCsvValue(result.essentialsMax || 0),
        formatCsvValue(result.errors || 0),
        formatCsvValue(result.difficulty || ''),
        formatCsvValue(formatDateValue(result.createdAt)),
        formatCsvValue(formatDateValue(result.updatedAt))
      ].join(',');
    });
    showToast('Teacher CSV exported.');
  } catch (err) {
    console.error('Export teacher CSV failed', err);
    showToast('Error exporting CSV: ' + err.message, 'error');
  }
}

// After Firebase initializes, if the restored page is REPORTS, load recent
// activity. This used to sit at the bottom of exportTeacherSessionResultsCsv(),
// where it only ran if the teacher happened to click Export.
if (window.authReadyPromise) {
  window.authReadyPromise.then(() => {
    try {
      const isReports = document.getElementById('page-reports')?.classList.contains('active');
      if (isReports) loadTeacherRecentActivity();
    } catch (e) { console.warn('post-init teacher restore', e); }
  });
}

/* ============================================================================
   SESSION EXPORTS + PRINTABLE REPORT
   ============================================================================ */
const TEACHER_RESULT_CSV_HEADER = ['id','sessionId','sessionCode','teacherId','studentId','studentName','section','score','completionTime','attempts','stage','essentials','essentialsMax','errors','difficulty','createdAt','updatedAt'].join(',');

function teacherResultCsvRow(doc) {
  const r = doc.data();
  return [
    formatCsvValue(doc.id),
    formatCsvValue(r.sessionId || ''),
    formatCsvValue(r.sessionCode || ''),
    formatCsvValue(r.teacherId || teacherId || ''),
    formatCsvValue(r.studentId || ''),
    formatCsvValue(r.studentName || ''),
    formatCsvValue(r.section || teacherSection || ''),
    formatCsvValue(r.score || 0),
    formatCsvValue(r.completionTime || 0),
    formatCsvValue(r.attempts || 0),
    formatCsvValue(r.stage || ''),
    formatCsvValue(r.essentials || 0),
    formatCsvValue(r.essentialsMax || 0),
    formatCsvValue(r.errors || 0),
    formatCsvValue(r.difficulty || ''),
    formatCsvValue(formatDateValue(r.createdAt)),
    formatCsvValue(formatDateValue(r.updatedAt))
  ].join(',');
}

// One session's results. Keyed on sessionId rather than sessionCode because
// codes are short and get reused across terms.
async function exportSingleTeacherSessionCsv(sessionId, sessionCode) {
  if (!window.db) { showToast('Firebase not initialized.', 'error'); return; }
  try {
    // The teacherId filter is required: the rules only let a teacher query their own results
    const snap = await window.db.collection('sessionResults')
      .where('teacherId', '==', teacherId)
      .where('sessionId', '==', sessionId).get();
    if (snap.empty) { showToast('No results recorded for this session yet.', 'error'); return; }
    const rows = [TEACHER_RESULT_CSV_HEADER];
    snap.forEach(doc => rows.push(teacherResultCsvRow(doc)));
    downloadCsv(`session-${(sessionCode || sessionId)}-results.csv`, rows.join('\n'));
    showToast('Session CSV exported.');
  } catch (err) {
    console.error('Export session CSV failed', err);
    showToast('Error exporting session: ' + err.message, 'error');
  }
}

// The five sessions currently listed in Recent Activity, in one file — the
// panel's answer to its own archive warning.
async function exportRecentTeacherSessionsCsv() {
  if (!window.db) { showToast('Firebase not initialized.', 'error'); return; }
  const ids = teacherRecentSessions.map(s => s.id).filter(Boolean);
  if (!ids.length) { showToast('No recent sessions to export yet.', 'error'); return; }
  try {
    // Firestore caps an 'in' query at 10 values; this list is capped at 5.
    const snap = await window.db.collection('sessionResults')
      .where('teacherId', '==', teacherId)
      .where('sessionId', 'in', ids).get();
    if (snap.empty) { showToast('No results recorded for these sessions yet.', 'error'); return; }
    const rows = [TEACHER_RESULT_CSV_HEADER];
    snap.forEach(doc => rows.push(teacherResultCsvRow(doc)));
    downloadCsv('recent-5-sessions-results.csv', rows.join('\n'));
    showToast('Recent sessions CSV exported.');
  } catch (err) {
    console.error('Export recent sessions CSV failed', err);
    showToast('Error exporting sessions: ' + err.message, 'error');
  }
}

// Stamps the print letterhead with what is actually on screen, so a saved PDF
// says whose class it covers and at which level.
function printTeacherReport() {
  const teacher = sessionStorage.getItem('username') || 'Teacher';
  const filters = getTeacherFilters();
  const scope = [
    teacherSection || 'Class',
    filters.difficulty ? filters.difficulty.charAt(0).toUpperCase() + filters.difficulty.slice(1) + ' level' : '',
    teacherSessionScope ? 'Session ' + (teacherSessionScope.code || teacherSessionScope.sessionId) : ''
  ].filter(Boolean).join('  \u00b7  ');
  const generated = new Date().toLocaleString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit'
  });
  setTeacherText('teacher-print-class', `Caruhatan East Elementary School  \u00b7  ${teacherSection || ''}`);
  setTeacherText('teacher-print-meta', `Teacher: ${teacher}     Scope: ${scope}     Generated: ${generated}`);
  // The archive panel lives on HOME but printing prints the ACTIVE page, so
  // make sure the reports page is the one on screen before the dialog opens.
  const reportsPage = document.getElementById('page-reports');
  if (reportsPage && !reportsPage.classList.contains('active')) {
    navigate('reports', document.querySelectorAll('.nav-item')[2]);
  }
  // Let the DOM paint the stamped header before the print dialog freezes it.
  setTimeout(() => window.print(), 120);
}
