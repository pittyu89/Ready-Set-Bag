/* ============================================================================
   READY-SET-BAG! — SESSION RETENTION
   ----------------------------------------------------------------------------
   Shared by the admin and teacher dashboards. Two jobs:

     1. deleteSessionCascade() — permanently delete ONE session together with
        every student result recorded in it. Used by the Delete buttons on both
        dashboards and by the automatic cap below.
     2. pruneTeacherSessions() — keep each section to its MAX_SESSIONS most
        recent sessions. Called right after a teacher creates a session, so
        creating a 6th deletes the oldest (and its scores) for good.

   A section has one teacher, so "a section's sessions" is queried as "this
   teacher's sessions" (sessions are keyed by teacherId, and the Firestore
   rules only let a teacher delete their own).

   Deletion is permanent by design (confirmed requirement): results removed
   here disappear from Reports, the charts and the master CSV as well.
   Exposes window.RSBSessions.
   ============================================================================ */
(function () {
  'use strict';

  var MAX_SESSIONS = 5;

  function millis(v) {
    if (!v) return 0;
    if (typeof v.toMillis === 'function') return v.toMillis();
    var t = new Date(v).getTime();
    return isNaN(t) ? 0 : t;
  }

  /**
   * Delete a session and all of its results.
   * opts.teacherId — REQUIRED when called by a teacher: the results query must
   * be constrained to their own teacherId or the security rules reject it
   * (rules can't be proven for an unconstrained query). Admins omit it.
   * Resolves to the number of results deleted.
   */
  async function deleteSessionCascade(sessionId, opts) {
    opts = opts || {};
    var db = window.db;
    if (!db || !sessionId) throw new Error('Firebase not initialized.');

    var q = db.collection('sessionResults').where('sessionId', '==', sessionId);
    if (opts.teacherId) q = q.where('teacherId', '==', opts.teacherId);
    var snap = await q.get();

    // One batch holds 500 writes. A session has at most a class's worth of
    // results, so this is normally a single atomic batch with the session doc
    // in it; the loop only matters for an unusually large session.
    var refs = snap.docs.map(function (d) { return d.ref; });
    var sessionRef = db.collection('sessions').doc(sessionId);
    var CHUNK = 450;
    for (var i = 0; i < refs.length; i += CHUNK) {
      var batch = db.batch();
      refs.slice(i, i + CHUNK).forEach(function (r) { batch.delete(r); });
      // Delete the session itself in the LAST batch, so a failure part-way
      // leaves the session visible (and deletable again) rather than
      // orphaning results nobody can reach from the dashboard.
      if (i + CHUNK >= refs.length) batch.delete(sessionRef);
      await batch.commit();
    }
    if (!refs.length) await sessionRef.delete();
    return refs.length;
  }

  /**
   * Keep only the newest MAX_SESSIONS sessions for this teacher's section.
   * Anything older is deleted with its results. Resolves to the number of
   * sessions removed. Never throws — a failed prune must not break the
   * session the teacher just created; it retries on the next creation.
   */
  async function pruneTeacherSessions(teacherId) {
    var db = window.db;
    if (!db || !teacherId) return 0;
    try {
      // Sorted client-side so this needs no composite index.
      var snap = await db.collection('sessions').where('teacherId', '==', teacherId).get();
      var docs = snap.docs.slice().sort(function (a, b) {
        return millis(b.data().createdAt) - millis(a.data().createdAt);
      });
      var extra = docs.slice(MAX_SESSIONS);
      for (var i = 0; i < extra.length; i++) {
        await deleteSessionCascade(extra[i].id, { teacherId: teacherId });
      }
      return extra.length;
    } catch (e) {
      console.warn('Session prune failed; will retry on the next new session.', e);
      return 0;
    }
  }

  window.RSBSessions = {
    MAX_SESSIONS: MAX_SESSIONS,
    deleteSessionCascade: deleteSessionCascade,
    pruneTeacherSessions: pruneTeacherSessions
  };
})();
