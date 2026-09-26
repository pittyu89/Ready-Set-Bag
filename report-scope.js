/* ============================================================================
   READY-SET-BAG! — REPORT SCOPE
   ----------------------------------------------------------------------------
   Shared by the admin and teacher dashboards. Decides WHICH session results the
   reports load, and loads them.

   Every result is kept (nothing is deleted to save reads any more). To stay
   inside the Firestore free plan's daily read quota, the reports start with
   each section's RECENT_SESSIONS latest launched sessions and fetch their
   results with one-time reads; older sessions are loaded only when someone
   asks for them ("Load older sessions") or opens one from Recent Activity.
   The CSV exports still read everything, because that is what they are for.

   Exposes window.RSBScope.
   ============================================================================ */
(function () {
  'use strict';

  var RECENT_SESSIONS = 5;

  // Firestore allows at most 30 values in one "in" filter
  var IN_LIMIT = 30;

  function millis(v) {
    if (!v) return 0;
    if (typeof v.toMillis === 'function') return v.toMillis();
    var t = new Date(v).getTime();
    return isNaN(t) ? 0 : t;
  }

  // When a session happened: launch time if it was launched, else creation time.
  function sessionTime(session) {
    return millis(session.startedAt) || millis(session.createdAt);
  }

  // Sessions students actually played. A code that was generated but never
  // launched has no results to load.
  function isLaunched(session) {
    return !!(session.startedAt || session.status === 'active' || session.endedAt);
  }

  /**
   * [{id, data}] -> the launched ones, newest first.
   */
  function launchedNewestFirst(entries) {
    return (entries || [])
      .filter(function (e) { return e && e.data && isLaunched(e.data); })
      .sort(function (a, b) { return sessionTime(b.data) - sessionTime(a.data); });
  }

  /**
   * The ids of the newest `perGroup` launched sessions in each group.
   * groupOf(entry) names the group (the section); pass none for a single group.
   */
  function recentSessionIds(entries, perGroup, groupOf) {
    var taken = {};
    var ids = [];
    launchedNewestFirst(entries).forEach(function (e) {
      var g = groupOf ? (groupOf(e) || '') : '';
      taken[g] = taken[g] || 0;
      if (taken[g] < perGroup) {
        taken[g]++;
        ids.push(e.id);
      }
    });
    return ids;
  }

  /**
   * One-time read of the results for the given sessions, in batches of 30.
   * `teacherId` must be passed from the teacher dashboard: the security rules only
   * let a teacher list results that are filtered to their own teacherId.
   * Resolves to { sessionId: [resultData, ...] } with an entry for every id asked
   * for, so a session with no results yet is remembered as loaded.
   */
  async function fetchResults(db, sessionIds, teacherId) {
    var out = {};
    var ids = Array.from(new Set(sessionIds || [])).filter(Boolean);
    ids.forEach(function (id) { out[id] = []; });

    var batches = [];
    for (var i = 0; i < ids.length; i += IN_LIMIT) {
      var chunk = ids.slice(i, i + IN_LIMIT);
      var q = db.collection('sessionResults');
      if (teacherId) q = q.where('teacherId', '==', teacherId);
      q = q.where('sessionId', 'in', chunk);
      batches.push(q.get());
    }

    var snaps = await Promise.all(batches);
    snaps.forEach(function (snap) {
      snap.forEach(function (doc) {
        var d = doc.data();
        if (out[d.sessionId]) out[d.sessionId].push(d);
      });
    });
    return out;
  }

  window.RSBScope = {
    RECENT_SESSIONS: RECENT_SESSIONS,
    sessionTime: sessionTime,
    isLaunched: isLaunched,
    launchedNewestFirst: launchedNewestFirst,
    recentSessionIds: recentSessionIds,
    fetchResults: fetchResults
  };
})();
