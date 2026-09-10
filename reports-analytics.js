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

  // Apply {section, difficulty, sessionId} filters. Empty / "all" values mean
  // no filter. sessionId narrows to a single drill run, which is what the
  // "view report for this session" links in Recent Activity pass in.
  function applyFilters(results, filters) {
    filters = filters || {};
    var section = (filters.section || '').trim();
    var difficulty = (filters.difficulty || '').trim().toLowerCase();
    var sessionId = (filters.sessionId || '').trim();
    var wantAllSection = !section || /^all/i.test(section);
    var wantAllDiff = !difficulty || /^all/i.test(difficulty);
    return results.filter(function (r) {
      if (!wantAllSection && r.section !== section) return false;
      if (!wantAllDiff && r.difficulty !== difficulty) return false;
      if (sessionId && r.sessionId !== sessionId) return false;
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

  /* ==========================================================================
     CHART FEEDS
     Everything below returns plain numbers/arrays for the hand-rolled SVG
     charts on the two dashboards. They all go through the same
     normalize -> filter -> aggregate -> round path as the tables above, so a
     chart can never disagree with the number printed next to it.
     ========================================================================== */

  // Readiness tiers by per-student average score.
  //   mastered   >= 90
  //   proficient 70-89
  //   needsSupport < 70 (same threshold as the tables)
  // onTrackPct is (mastered + proficient) / evaluated - the headline the donut
  // prints in its hole.
  function readinessTiers(rawResults, filters) {
    var perStudent = perStudentBest(applyFilters((rawResults || []).map(normalizeResult), filters));
    var mastered = 0, proficient = 0, needsSupport = 0;
    perStudent.forEach(function (p) {
      if (p.avgScore >= 90) mastered++;
      else if (p.avgScore >= SUPPORT_THRESHOLD) proficient++;
      else needsSupport++;
    });
    var evaluated = perStudent.length;
    return {
      mastered: mastered,
      proficient: proficient,
      needsSupport: needsSupport,
      evaluated: evaluated,
      onTrackPct: evaluated ? round(((mastered + proficient) / evaluated) * 100) : 0
    };
  }

  // Per-section participation: what share of the section roster has at least
  // one result in scope. Unlike sectionAverages() this needs the roster, since
  // the students who never played are exactly the point.
  function participationRates(rawResults, students, filters) {
    var results = applyFilters((rawResults || []).map(normalizeResult), filters);
    var rosterBySection = {};
    var anon = 0;
    (students || []).forEach(function (s) {
      var sec = s.section || 'Unknown';
      if (!rosterBySection[sec]) rosterBySection[sec] = {};
      var key = s.id || s.authUid || s.username || s.displayName || ('anon-' + (anon++));
      rosterBySection[sec][key] = true;
    });
    var playedBySection = {};
    results.forEach(function (r) {
      if (!r.studentId) return;
      if (!playedBySection[r.section]) playedBySection[r.section] = {};
      playedBySection[r.section][r.studentId] = true;
    });
    var sections = Object.keys(rosterBySection);
    // A section can appear in results without a matching roster entry (imported
    // results, renamed section). Show it rather than dropping it silently.
    Object.keys(playedBySection).forEach(function (sec) {
      if (sections.indexOf(sec) === -1) sections.push(sec);
    });
    return sections.map(function (sec) {
      var total = Object.keys(rosterBySection[sec] || {}).length;
      var played = Object.keys(playedBySection[sec] || {}).length;
      return {
        section: sec,
        played: played,
        total: total,
        pct: total ? round((played / total) * 100) : (played ? 100 : 0)
      };
    }).sort(function (a, b) { return b.pct - a.pct; });
  }

  // Curriculum progression: for each difficulty level, how many distinct
  // students attempted it and what they averaged. Deliberately ignores the
  // difficulty filter - comparing the three levels IS the chart.
  function levelProgression(rawResults, filters) {
    var scoped = {};
    Object.keys(filters || {}).forEach(function (k) {
      if (k !== 'difficulty') scoped[k] = filters[k];
    });
    var results = applyFilters((rawResults || []).map(normalizeResult), scoped);
    return KNOWN_LEVELS.map(function (level) {
      var forLevel = results.filter(function (r) { return r.difficulty === level; });
      var perStudent = perStudentBest(forLevel);
      return {
        level: level,
        label: level.charAt(0).toUpperCase() + level.slice(1),
        students: perStudent.length,
        avgScore: perStudent.length ? round(avg(perStudent, 'avgScore')) : 0
      };
    });
  }

  // Go-bag packing accuracy: how close students came to a full essentials set.
  // Buckets are per RUN (a student can pack well once and badly the next time,
  // and both runs are real evidence about the packing step).
  function packingAccuracy(rawResults, filters) {
    var results = applyFilters((rawResults || []).map(normalizeResult), filters);
    var high = 0, moderate = 0, low = 0, essSum = 0, errSum = 0, maxSum = 0;
    results.forEach(function (r) {
      var max = r.essentialsMax || 15;
      var pct = max ? (r.essentials / max) * 100 : 0;
      if (pct >= 90) high++;
      else if (pct >= SUPPORT_THRESHOLD) moderate++;
      else low++;
      essSum += r.essentials;
      errSum += r.errors;
      maxSum += max;
    });
    var n = results.length;
    return {
      high: high,
      moderate: moderate,
      low: low,
      runs: n,
      avgEssentials: n ? round(essSum / n, 1) : 0,
      avgEssentialsMax: n ? round(maxSum / n) : 15,
      avgErrors: n ? round(errSum / n, 1) : 0,
      avgAccuracyPct: maxSum ? round((essSum / maxSum) * 100) : 0
    };
  }

  // One point per student for the speed-vs-score scatter: their best score
  // against their fastest time. Students with no usable time are dropped -
  // there is nowhere honest to plot them on a time axis.
  function scoreTimePoints(rawResults, filters) {
    return perStudentBest(applyFilters((rawResults || []).map(normalizeResult), filters))
      .filter(function (p) { return p.bestTime > 0; })
      .map(function (p) {
        var tier = p.bestScore >= 90 ? 'mastered'
          : p.bestScore >= SUPPORT_THRESHOLD ? 'proficient' : 'needsSupport';
        return {
          studentName: p.studentName,
          section: p.section,
          score: p.bestScore,
          time: p.bestTime,
          tier: tier
        };
      });
  }

  // Trend over time: average score and average completion time per calendar
  // day that has results, oldest first. Buckets by local date so a teacher
  // sees the days they actually ran drills.
  function progressionOverTime(rawResults, filters, maxBuckets) {
    var results = applyFilters((rawResults || []).map(normalizeResult), filters)
      .filter(function (r) { return r.createdAt instanceof Date && !isNaN(r.createdAt.getTime()); });
    var buckets = {};
    results.forEach(function (r) {
      var d = r.createdAt;
      var key = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
      if (!buckets[key]) buckets[key] = { key: key, date: d, scores: 0, times: 0, timeCount: 0, runs: 0 };
      buckets[key].scores += r.score;
      buckets[key].runs++;
      if (r.completionTime > 0) { buckets[key].times += r.completionTime; buckets[key].timeCount++; }
    });
    var arr = Object.keys(buckets).sort().map(function (k) {
      var b = buckets[k];
      return {
        key: b.key,
        date: b.date,
        label: b.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        avgScore: round(b.scores / b.runs),
        avgTime: b.timeCount ? round(b.times / b.timeCount) : 0,
        runs: b.runs
      };
    });
    if (maxBuckets && arr.length > maxBuckets) arr = arr.slice(arr.length - maxBuckets);
    return arr;
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
    distinctSections: distinctSections,
    readinessTiers: readinessTiers,
    participationRates: participationRates,
    levelProgression: levelProgression,
    packingAccuracy: packingAccuracy,
    scoreTimePoints: scoreTimePoints,
    progressionOverTime: progressionOverTime
  };
})();
