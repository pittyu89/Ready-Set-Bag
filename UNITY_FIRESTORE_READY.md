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

No other fields are accepted. The session must be `active`, or have ended less than 10 minutes
ago (a run that finished as the teacher stopped it).

## Indexes

Teacher reports query `sessionResults` by `teacherId` (plus `sessionId` for single-session
exports). Keep the `teacherId` + `createdAt` composite index in `firestore.indexes.json`.
