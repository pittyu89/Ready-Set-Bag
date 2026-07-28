/* ============================================================================
   READY-SET-BAG! — SHARED REPORTS ANALYTICS HELPER
   ----------------------------------------------------------------------------
   Pure, framework-free aggregation utilities used by BOTH the admin and teacher
   dashboards so every metric is computed the same way. No Firestore calls in
   here — the dashboards fetch sessionResults / students and pass the plain
   arrays in. Exposes window.RSBAnalytics.

   Data source: the "sessionResults" collection. Each result doc has:
     sessionId, sessionCode, teacherId, studentId, studentName, section,
     score (0-100), completionTime (seconds), attempts, stage
     ("Cognitive"|"Associative"|"Autonomous"), essentials, essentialsMax,
     errors, difficulty, createdAt.

   Completion rate definition (confirmed): students who have >= 1 result
   divided by total students in scope. The difficulty filter narrows the
   RESULTS but never the student roster, so once a specific level is always
   selected this reads as "% of the roster who played that level".

   Averaging rule: headline averages aggregate PER STUDENT, not per result
   row, so a student with 3 runs does not count 3x. Each student contributes
   the mean across their own runs, which keeps sectionAverages(),
   studentsNeedingSupport() and the school-average row consistent with each
   other by construction.
   ============================================================================ */
(function () {
  'use strict';

  var SUPPORT_THRESHOLD = 70; // avg score below this = "needs support"

  // The only difficulty values the dashboards filter on. A result carrying
  // anything else matches no filter and would silently vanish from every
  // report, so callers surface a count of these instead of hiding them.
  var KNOWN_LEVELS = ['beginner', 'intermediate', 'advanced'];

  // ---- small utilities -----------------------------------------------------
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }

  function round(v, d) {
    d = d || 0;
    var f = Math.pow(10, d);
    return Math.round(num(v) * f) / f;
  }

  // Escape text for safe innerHTML insertion.
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Seconds -> "m:ss" (e.g. 150 -> "2:30"). Returns "—" for no data.
  function formatTime(seconds) {
    var s = num(seconds);
    if (s <= 0) return '—';
    var m = Math.floor(s / 60);
    var r = Math.round(s % 60);
    if (r === 60) { m += 1; r = 0; }
    return m + ':' + (r < 10 ? '0' + r : r);
  }

  // Normalize a raw Firestore doc's data into a consistent result object.
  function normalizeResult(d) {
    d = d || {};
    var essMax = num(d.essentialsMax) || 15;
    return {
      sessionId: d.sessionId || '',
      sessionCode: d.sessionCode || '',
      teacherId: d.teacherId || '',
      studentId: d.studentId || '',
      studentName: d.studentName || '',
      section: d.section || 'Unknown',
      score: num(d.score),
      completionTime: num(d.completionTime),
      attempts: num(d.attempts),
      stage: d.stage || '',
      essentials: num(d.essentials),
      essentialsMax: essMax,
      errors: num(d.errors),
      difficulty: (d.difficulty || '').toLowerCase(),
      createdAt: d.createdAt && d.createdAt.toDate ? d.createdAt.toDate() : (d.createdAt || null)
    };
  }

  // Apply {section, difficulty} filters. Empty / "all" values mean no filter.
  function applyFilters(results, filters) {
    filters = filters || {};
    var section = (filters.section || '').trim();
    var difficulty = (filters.difficulty || '').trim().toLowerCase();
    var wantAllSection = !section || /^all/i.test(section);
    var wantAllDiff = !difficulty || /^all/i.test(difficulty);
    return results.filter(function (r) {
      if (!wantAllSection && r.section !== section) return false;
      if (!wantAllDiff && r.difficulty !== difficulty) return false;
      return true;
    });
  }

  function avg(arr, key) {
    if (!arr.length) return 0;
    var sum = 0;
    for (var i = 0; i < arr.length; i++) sum += num(arr[i][key]);
    return sum / arr.length;
  }

  // Fastest run for a student, ignoring 0/missing times. normalizeResult()
  // coerces a missing completionTime to 0, so a plain Math.min would return 0
  // and rank that student FIRST in fastest-time mode. Returns 0 when the
  // student has no usable time; formatTime(0) already renders "—".
  function fastestTime(runs) {
    var best = 0;
    for (var i = 0; i < runs.length; i++) {
      var t = num(runs[i].completionTime);
      if (t > 0 && (best === 0 || t < best)) best = t;
    }
    return best;
  }

  // Reduce results to one "best" row per student (highest score, tiebreak faster
  // time). Also carries per-student averages + run count. `errors` and
  // `essentials` deliberately are not surfaced here: scoring is quiz-based now,
  // so per-item counts no longer drive any reported number. They remain on the
  // raw docs and in the CSV exports.
  function perStudentBest(results) {
    var byStudent = {};
    results.forEach(function (r) {
      var key = r.studentId || r.studentName;
      if (!key) return;
      if (!byStudent[key]) {
        byStudent[key] = { runs: [], best: r };
      }
      byStudent[key].runs.push(r);
      var b = byStudent[key].best;
      if (r.score > b.score ||
        (r.score === b.score && num(r.completionTime) > 0 &&
          (num(b.completionTime) === 0 || r.completionTime < b.completionTime))) {
        byStudent[key].best = r;
      }
    });
    return Object.keys(byStudent).map(function (k) {
      var entry = byStudent[k];
      var runs = entry.runs;
      return {
        studentId: entry.best.studentId,
        studentName: entry.best.studentName,
        section: entry.best.section,
        bestScore: round(entry.best.score),
        bestTime: fastestTime(runs),
        avgScore: round(avg(runs, 'score')),
        avgTime: round(avg(runs, 'completionTime')),
        attempts: runs.length,
        stage: entry.best.stage,
        best: entry.best
      };
    });
  }

  // ---- headline metrics -----------------------------------------------------
  // students: array of student docs in scope (already scoped by caller, e.g.
  // by teacher). filters narrow the RESULTS (section/difficulty).
  function computeMetrics(rawResults, students, filters) {
    var results = applyFilters((rawResults || []).map(normalizeResult), filters);
    students = students || [];

    // Scope student roster to the section filter too (so "total students" and
    // completion rate reflect the chosen section).
    var section = (filters && filters.section || '').trim();
    var wantAllSection = !section || /^all/i.test(section);
    var scopedStudents = wantAllSection ? students
      : students.filter(function (s) { return s.section === section; });

    var totalStudents = scopedStudents.length;
    var studentIdsWithResults = {};
    results.forEach(function (r) { if (r.studentId) studentIdsWithResults[r.studentId] = true; });
    var playedCount = Object.keys(studentIdsWithResults).length;

    var sectionCount = {};
    scopedStudents.forEach(function (s) { if (s.section) sectionCount[s.section] = true; });

    // Average per student, not per result row (see header note).
    var perStudent = perStudentBest(results);

    return {
      totalStudents: totalStudents,
      sectionsCount: Object.keys(sectionCount).length,
      avgScore: perStudent.length ? round(avg(perStudent, 'avgScore')) : 0,
      avgTime: perStudent.length ? round(avg(perStudent, 'avgTime')) : 0,
      completionRate: totalStudents ? round((playedCount / totalStudents) * 100) : 0,
      playedCount: playedCount,
      resultCount: results.length,
      hasData: results.length > 0
    };
  }

  // Average score per section: [{section, avg, count, needsSupport}] sorted desc.
  // `count` is the number of STUDENTS in that section who have played, and each
  // student contributes their own mean once (see header note).
  function sectionAverages(rawResults, students, filters) {
    var results = applyFilters((rawResults || []).map(normalizeResult), filters);
    var bySection = {};
    perStudentBest(results).forEach(function (p) {
      if (!bySection[p.section]) bySection[p.section] = { section: p.section, total: 0, count: 0 };
      bySection[p.section].total += p.avgScore;
      bySection[p.section].count++;
    });
    var arr = Object.keys(bySection).map(function (k) {
      var s = bySection[k];
      var mean = s.count ? (s.total / s.count) : 0;
      return {
        section: s.section,
        avg: round(mean),
        count: s.count,
        needsSupport: mean < SUPPORT_THRESHOLD
      };
    });
    arr.sort(function (a, b) { return b.avg - a.avg; });
    return arr;
  }

  // Friendly display label for the learning stage. Data keeps the Fitts &
  // Posner names; teachers see the level vocabulary they already use.
  var STAGE_LABELS = {
    Cognitive: 'Beginner',
    Associative: 'Intermediate',
    Autonomous: 'Advanced'
  };

  function stageLabel(stage) {
    return STAGE_LABELS[stage] || '—';
  }

  // How many results carry a difficulty the filters cannot match. Every filter
  // is a specific level now, so these would otherwise disappear from reports
  // with no warning — callers show the count instead.
  function countUnknownLevel(rawResults) {
    var n = 0;
    (rawResults || []).forEach(function (d) {
      var diff = (d && d.difficulty ? String(d.difficulty) : '').toLowerCase();
      if (KNOWN_LEVELS.indexOf(diff) === -1) n++;
    });
    return n;
  }

  // Students who need support: per-student avg score below threshold, ascending.
  function studentsNeedingSupport(rawResults, filters, threshold) {
    threshold = threshold == null ? SUPPORT_THRESHOLD : threshold;
    var results = applyFilters((rawResults || []).map(normalizeResult), filters);
    var perStudent = perStudentBest(results);
    return perStudent
      .filter(function (s) { return s.avgScore < threshold; })
      .sort(function (a, b) { return a.avgScore - b.avgScore; });
  }

  // Leaderboard, one row per student. mode 'time' ranks by each student's
  // fastest run ascending (tiebreak higher score); anything else ranks by best
  // score (tiebreak faster time). Students with no usable time sort last
  // rather than first.
  function leaderboard(rawResults, filters, mode) {
    var results = applyFilters((rawResults || []).map(normalizeResult), filters);
    var perStudent = perStudentBest(results);
    if (mode === 'time') {
      perStudent.sort(function (a, b) {
        var at = a.bestTime || Infinity, bt = b.bestTime || Infinity;
        if (at !== bt) return at - bt;
        return b.bestScore - a.bestScore;
      });
    } else {
      perStudent.sort(function (a, b) {
        if (b.bestScore !== a.bestScore) return b.bestScore - a.bestScore;
        return (a.bestTime || Infinity) - (b.bestTime || Infinity);
      });
    }
    perStudent.forEach(function (s, i) { s.rank = i + 1; });
    return perStudent;
  }

  // Individual results, one aggregated row per student (best run), sorted by score desc.
  function individualRows(rawResults, filters) {
    var results = applyFilters((rawResults || []).map(normalizeResult), filters);
    var rows = perStudentBest(results);
    rows.sort(function (a, b) { return b.bestScore - a.bestScore; });
    return rows;
  }

  // Distinct sections present in results (for populating filter dropdowns).
  function distinctSections(rawResults, students) {
    var set = {};
    (rawResults || []).map(normalizeResult).forEach(function (r) { if (r.section) set[r.section] = true; });
    (students || []).forEach(function (s) { if (s.section) set[s.section] = true; });
    return Object.keys(set).sort();
  }

  window.RSBAnalytics = {
    SUPPORT_THRESHOLD: SUPPORT_THRESHOLD,
    KNOWN_LEVELS: KNOWN_LEVELS,
    esc: esc,
    formatTime: formatTime,
    stageLabel: stageLabel,
    countUnknownLevel: countUnknownLevel,
    normalizeResult: normalizeResult,
    computeMetrics: computeMetrics,
    sectionAverages: sectionAverages,
    studentsNeedingSupport: studentsNeedingSupport,
    leaderboard: leaderboard,
    individualRows: individualRows,
    distinctSections: distinctSections
  };
})();
