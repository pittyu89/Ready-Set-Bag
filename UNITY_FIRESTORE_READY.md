# Unity Firestore Ready Guide

This guide shows a ready-to-use Unity setup for the existing `sessionResults` collection.

## What this is for

Use this when your Unity game needs to:
- submit a student play result to Firestore
- load a teacher's recent session results
- keep the schema aligned with the app's admin and teacher dashboards

## Required Firestore fields

A `sessionResults` document should include:

- `sessionId`
- `sessionCode`
- `teacherId`
- `studentId`
- `studentName`
- `section`
- `score`
- `completionTime`
- `attempts`
- `stage`
- `essentials`
- `essentialsMax`
- `errors`
- `difficulty`
- `createdAt`
- `updatedAt`

## Recommended Unity package

Use the Firebase Unity SDK and include:

- Firebase Auth
- Firebase Firestore

## Drop-in Unity script

Create a script like `FirebaseSessionResults.cs`:

```csharp
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Firebase;
using Firebase.Auth;
using Firebase.Firestore;
using UnityEngine;

public class FirebaseSessionResults : MonoBehaviour
{
    private FirebaseFirestore db;
    private FirebaseAuth auth;

    async void Start()
    {
        var dependencyStatus = await FirebaseApp.CheckAndFixDependenciesAsync();
        if (dependencyStatus != DependencyStatus.Available)
        {
            Debug.LogError("Firebase dependencies are not available.");
            return;
        }

        db = FirebaseFirestore.DefaultInstance;
        auth = FirebaseAuth.DefaultInstance;
        Debug.Log("Firebase ready.");
    }

    [Serializable]
    public class SessionResultData
    {
        public string sessionId;
        public string sessionCode;
        public string teacherId;
        public string studentId;
        public string studentName;
        public string section;
        public int score;
        public float completionTime;
        public int attempts;
        public string stage;
        public int essentials;
        public int essentialsMax;
        public int errors;
        public string difficulty;
    }

    public async Task<string> SubmitSessionResultAsync(SessionResultData result)
    {
        if (db == null)
        {
            throw new InvalidOperationException("Firestore is not initialized.");
        }

        var payload = new Dictionary<string, object>
        {
            { "sessionId", result.sessionId },
            { "sessionCode", result.sessionCode },
            { "teacherId", result.teacherId },
            { "studentId", result.studentId },
            { "studentName", result.studentName },
            { "section", result.section },
            { "score", result.score },
            { "completionTime", result.completionTime },
            { "attempts", result.attempts },
            { "stage", result.stage },
            { "essentials", result.essentials },
            { "essentialsMax", result.essentialsMax },
            { "errors", result.errors },
            { "difficulty", result.difficulty },
            { "createdAt", Timestamp.Now },
            { "updatedAt", Timestamp.Now }
        };

        DocumentReference doc = await db.Collection("sessionResults").AddAsync(payload);
        Debug.Log($"Session result saved: {doc.Id}");
        return doc.Id;
    }

    public async Task<List<Dictionary<string, object>>> LoadTeacherResultsAsync(string teacherId, int limitCount = 50)
    {
        if (db == null)
        {
            throw new InvalidOperationException("Firestore is not initialized.");
        }

        Query query = db.Collection("sessionResults")
            .WhereEqualTo("teacherId", teacherId)
            .OrderByDescending("createdAt")
            .Limit(limitCount);

        QuerySnapshot snapshot = await query.GetSnapshotAsync();
        var results = new List<Dictionary<string, object>>();

        foreach (DocumentSnapshot doc in snapshot.Documents)
        {
            results.Add(doc.ToDictionary());
        }

        return results;
    }
}
```

## Example usage

```csharp
public async void SaveResult()
{
    var service = FindObjectOfType<FirebaseSessionResults>();

    var data = new FirebaseSessionResults.SessionResultData
    {
        sessionId = "session_001",
        sessionCode = "ABC12",
        teacherId = "teacher_uid",
        studentId = "student_uid",
        studentName = "Juan Dela Cruz",
        section = "Grade 6 - Sampaguita",
        score = 85,
        completionTime = 150,
        attempts = 1,
        stage = "Associative",
        essentials = 12,
        essentialsMax = 15,
        errors = 2,
        difficulty = "beginner"
    };

    await service.SubmitSessionResultAsync(data);
}
```

## Unity notes

- Make sure the player is signed in before writing if your Firestore rules require `request.auth != null`.
- If Unity will write directly from clients, keep rules tight and only allow the fields you expect.
- If you want stronger security, move the write behind a Cloud Function and let Unity call that instead.

## Recommended flow

1. Teacher starts a session in the dashboard.
2. Unity reads the `sessionCode`.
3. Student joins and plays.
4. Unity writes one `sessionResults` document per completed run.
5. Teacher/admin dashboards can read results for reports and exports.

## CSV export from Unity side

If you want a local CSV export in Unity too, use the same field order as the Firestore document and write the rows to `Application.persistentDataPath`.

## Indexes to keep

For the current app, keep this composite index for results queries:

- `sessionResults` with `teacherId` ascending and `createdAt` descending

If you query results by section across the school, Firestore may suggest a separate index later.
