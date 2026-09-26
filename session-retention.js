/* ============================================================================
   READY-SET-BAG! — SESSION DELETION
   ----------------------------------------------------------------------------
   Shared by the admin and teacher dashboards.

     deleteSessionCascade() — permanently delete ONE session together with
     every student result recorded in it. Used by the Delete buttons on both
     dashboards, and to discard a code that was generated but never launched.

   Sessions are no longer deleted automatically to save database reads. Every
   result is kept; the reports load only the latest few sessions by default
   instead (see report-scope.js).
   Exposes window.RSBSessions.
   ============================================================================ */
(function () {
  'use strict';

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

  window.RSBSessions = {
    deleteSessionCascade: deleteSessionCascade
  };
})();
