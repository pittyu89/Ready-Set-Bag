# Unity ↔ Firestore

How the Ready-Set-Bag! Unity game talks to this project's Firestore, and what the security
rules (`firestore.rules`) expect from it. The rules are tested in `tests/rules`
(`cd tests/rules && npm install && npm test`, emulator only).

## Student login

1. Sign in with Firebase Auth as `{username}@readysetbag.local`.
2. Load the profile with `students where authUid == <auth uid>` (limit 1). A student may only
   read their own profile, so a query by `username` is refused.
3. Keep `StudentId` (profile doc id), `StudentName`, `TeacherId` and `StudentSection`.

## Joining a session

- Look the session up with `sessions where sessionCode == <code>` (any signed-in user may).
- Append yourself with `playersList: ArrayUnion({ studentId, username, uid, joinedAt })`.
  `uid` must be the signed-in user's uid, the map may have no other keys, and nothing else
  in the document may change. Only sessions with status `waiting` or `active` accept joins.
- When the session turns `active`, keep its id (`SessionId`), code, difficulty and
  `teacherId` (`SessionTeacherId`) for the result.

## Sending a result (`SessionResultUploader.cs`)

Only teacher-session runs are sent, one per student per session. Write with `SetAsync` to
`sessionResults/{sessionId}_{studentId}`; a second write to the same id is refused.

| Field | Type | Rule |
| --- | --- | --- |
| `sessionId`, `sessionCode`, `teacherId`, `difficulty` | string | must match the session document |
| `studentId` | string | profile doc id; its `authUid` must be the caller |
| `studentUid` | string | the caller's uid |
| `studentName` | string | up to 120 characters |
| `section` | string | must match the student profile |
| `score` | int | 0–100 (the drill's final score) |
| `completionTime` | int | seconds used, 0–7200 |
| `attempts` | int | always 1 |
| `stage` | string | `Cognitive` (<70), `Associative` (70–87), `Autonomous` (88+) |
| `essentials`, `essentialsMax` | int | 0 ≤ essentials ≤ essentialsMax ≤ 100 |
| `errors` | int | unnecessary items + wrong answers + 1 if over weight |
| `createdAt`, `updatedAt` | server timestamp | must be `FieldValue.ServerTimestamp` |
| `timeLeft` | number | optional; exact seconds left, 0–7200 |
| `finishedAt` | timestamp | optional; must equal the attempt's `finishedAt` (below) |

No other fields are accepted. The session must be `active`, or have ended less than 10 minutes
ago (a run that finished as the teacher stopped it) - or the student's attempt must be
`finished` with a `finishedAt` inside that window. That last case is a result the game couldn't
send before it closed, sent on its next launch.

## Saving a drill in progress (`SessionDrillStore.cs`)

So a student who leaves or whose game closes carries on when they rejoin, on any device, the
game keeps their drill in `sessionAttempts/{sessionId}_{studentId}`.

| Field | Type | Rule |
| --- | --- | --- |
| `sessionId`, `studentId`, `studentUid`, `teacherId` | string | as for a result; fixed once created |
| `status` | string | `playing`, then `finished` once the results are up; `finished` is final |
| `snapshot` | string | the game's saved drill (JSON), up to 200,000 characters |
| `startedAt` | server timestamp | set on create only |
| `savedAt` | server timestamp | every write must set it to `FieldValue.ServerTimestamp` |
| `finishedAt` | server timestamp | set with `status: finished`, never before |

Created only while the session is `active`; saved while it is open (as for results). Writing
only `savedAt` is allowed: the game does that on rejoin to read the server's time, and measures
the time the student was away as the gap between the two `savedAt`s, so the device's clock
never counts. The student, their teacher and admins can read it; the teacher's session delete
removes it with the results.

## Indexes

Teacher reports query `sessionResults` by `teacherId` (plus `sessionId` for single-session
exports). Keep the `teacherId` + `createdAt` composite index in `firestore.indexes.json`.
