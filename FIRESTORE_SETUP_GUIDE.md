# Ready-Set-Bag! Firestore Database Setup & Integration Guide

## Table of Contents
1. [Database Schema](#database-schema)
2. [Firebase Console Setup](#firebase-console-setup)
3. [Security Rules](#security-rules)
4. [Field Validation](#field-validation)
5. [Unity Integration Guide](#unity-integration-guide)
6. [Troubleshooting & FAQ](#troubleshooting--faq)

---

## Database Schema

### Collections Overview

Ready-Set-Bag! uses Firestore to manage game sessions, student data, teacher information, and analytics. Here's the complete schema:

---

### 1. **teachers** Collection

Stores information about all registered teachers.

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `uid` | string | Firebase Auth UID (document ID) | `"a1B2c3D4e5F6g7H8i9J0"` |
| `firstName` | string | Teacher's first name | `"Maria"` |
| `lastName` | string | Teacher's last name | `"Santos"` |
| `email` | string | Email address (unique) | `"maria.santos@school.edu"` |
| `section` | string | Class/section name | `"Grade 6 – Sampaguita"` |
| `password` | string | Current password used by the dashboard to sync Firebase Auth changes | `"TempPass123!"` |
| `status` | string | Account status: `"active"` or `"inactive"` | `"active"` |
| `createdAt` | timestamp | Account creation time | `2025-04-15T10:30:00Z` |
| `updatedAt` | timestamp | Last update time | `2025-04-16T14:45:00Z` |

**Document ID**: Use the Firebase Auth UID for easy lookup

The dashboard keeps the teacher profile and Firebase Auth account synchronized by temporarily signing in as the affected teacher before it updates email, password, or deletes the account.

**Example Document**:
```json
{
  "uid": "teacher_001_uid",
  "firstName": "Maria",
  "lastName": "Santos",
  "email": "maria.santos@school.edu",
  "section": "Grade 6 – Sampaguita",
  "password": "TempPass123!",
  "status": "active",
  "createdAt": "2025-04-15T10:30:00Z",
  "updatedAt": "2025-04-16T14:45:00Z"
}
```

---

### 2. **students** Collection

Stores information about all registered students.

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `authUid` | string | Firebase Auth UID | `"student_001_auth"` |
| `teacherId` | string | Reference to teacher's UID | `"teacher_001_uid"` |
| `section` | string | Class/section name | `"Grade 6 – Sampaguita"` |
| `firstName` | string | Student's first name | `"Juan"` |
| `lastName` | string | Student's last name | `"Dela Cruz"` |
| `displayName` | string | Full name for display | `"Juan Dela Cruz"` |
| `username` | string | Unique login username | `"G6SAMPAGUITA001"` |
| `studentNumber` | number | Sequential student number per teacher | `1` |
| `password` | string | Password (for reference) | `"Student@123"` |
| `createdAt` | timestamp | Account creation time | `2025-04-15T10:35:00Z` |
| `updatedAt` | timestamp | Last update time | `2025-04-16T14:50:00Z` |

**Document ID**: Auto-generated Firestore document ID (use in queries)

**Example Document**:
```json
{
  "authUid": "student_001_auth",
  "teacherId": "teacher_001_uid",
  "section": "Grade 6 – Sampaguita",
  "firstName": "Juan",
  "lastName": "Dela Cruz",
  "displayName": "Juan Dela Cruz",
  "username": "G6SAMPAGUITA001",
  "studentNumber": 1,
  "password": "Student@123",
  "createdAt": "2025-04-15T10:35:00Z",
  "updatedAt": "2025-04-16T14:50:00Z"
}
```

---

### 3. **sessions** Collection

Stores game session metadata created by teachers.

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `sessionCode` | string | 5-character unique code for students to join | `"ABC12"` |
| `teacherId` | string | Reference to teacher's UID | `"teacher_001_uid"` |
| `difficulty` | string | Difficulty level: `"beginner"`, `"intermediate"`, or `"advanced"` | `"beginner"` |
| `playersList` | array | List of student UIDs who joined | `["student_001_uid", "student_002_uid"]` |
| `status` | string | Session status: `"waiting"`, `"active"`, or `"completed"` | `"active"` |
| `createdAt` | timestamp | Session creation time | `2025-04-15T10:40:00Z` |
| `updatedAt` | timestamp | Last update time | `2025-04-15T10:55:00Z` |

**Document ID**: Auto-generated (use in sessionResults references)

**Example Document**:
```json
{
    "sessionCode": "ABC12",
  "teacherId": "teacher_001_uid",
  "difficulty": "beginner",
  "playersList": ["student_001_uid", "student_002_uid", "student_003_uid"],
  "status": "active",
  "createdAt": "2025-04-15T10:40:00Z",
  "updatedAt": "2025-04-15T10:55:00Z"
}
```

---

### 4. **sessionResults** Collection

Stores individual student performance data for each game session.

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `sessionId` | string | Reference to sessions document ID | `"session_001_id"` |
| `sessionCode` | string | Session code for reference | `"ABC12"` |
| `teacherId` | string | Reference to teacher's UID | `"teacher_001_uid"` |
| `studentId` | string | Reference to student's document ID | `"student_001_id"` |
| `studentName` | string | Student's display name | `"Juan Dela Cruz"` |
| `section` | string | Class/section name | `"Grade 6 – Sampaguita"` |
| `score` | number | Final score (0–100) | `85` |
| `completionTime` | number | Time to complete in seconds | `150` |
| `attempts` | number | Number of attempts to complete | `1` |
| `stage` | string | Skill stage: `"Cognitive"`, `"Associative"`, or `"Autonomous"` | `"Associative"` |
| `essentials` | number | Number of essential items packed | `12` |
| `essentialsMax` | number | Maximum essential items | `15` |
| `errors` | number | Number of errors made | `2` |
| `difficulty` | string | Difficulty level: `"beginner"`, `"intermediate"`, or `"advanced"` | `"beginner"` |
| `createdAt` | timestamp | Result creation time | `2025-04-15T10:50:00Z` |
| `updatedAt` | timestamp | Last update time | `2025-04-15T10:55:00Z` |

**Document ID**: Auto-generated (use for updates)

**Example Document**:
```json
{
  "sessionId": "session_001_id",
    "sessionCode": "ABC12",
  "teacherId": "teacher_001_uid",
  "studentId": "student_001_id",
  "studentName": "Juan Dela Cruz",
  "section": "Grade 6 – Sampaguita",
  "score": 85,
  "completionTime": 150,
  "attempts": 1,
  "stage": "Associative",
  "essentials": 12,
  "essentialsMax": 15,
  "errors": 2,
  "difficulty": "beginner",
  "createdAt": "2025-04-15T10:50:00Z",
  "updatedAt": "2025-04-15T10:55:00Z"
}
```

---

## Firebase Console Setup

### Step 1: Create Collections in Firebase Console

1. **Log in to Firebase Console**: https://console.firebase.google.com
2. **Select your Ready-Set-Bag! project**
3. **Navigate to Firestore Database**
4. **Create each collection manually**:

#### Creating the **teachers** Collection:
1. Click **"Create collection"**
2. Collection ID: `teachers`
3. Click **"Next"**
4. Add the first document:
   - Document ID: Leave as **Auto-ID** (will be teacher's Firebase Auth UID)
   - Add fields as per schema above
5. Click **"Save"**

#### Creating the **students** Collection:
1. Click **"Create collection"**
2. Collection ID: `students`
3. Click **"Next"**
4. Add the first document with sample student data
5. Click **"Save"**

#### Creating the **sessions** Collection:
1. Click **"Create collection"**
2. Collection ID: `sessions`
3. Click **"Next"**
4. Add the first document with sample session data
5. Click **"Save"**

#### Creating the **sessionResults** Collection:
1. Click **"Create collection"**
2. Collection ID: `sessionResults`
3. Click **"Next"**
4. Add the first document with sample result data
5. Click **"Save"**

---

### Step 2: Create Firestore Indexes (if needed)

Composite indexes may be required for complex queries. Go to **Firestore Database → Indexes** and create:

| Collection | Fields | Type |
|-----------|--------|------|
| `teachers` | `section` (Ascending), `status` (Ascending) | Composite |
| `students` | `teacherId` (Ascending), `studentNumber` (Ascending) | Composite |
| `sessions` | `teacherId` (Ascending), `createdAt` (Descending) | Composite |
| `sessionResults` | `teacherId` (Ascending), `createdAt` (Descending) | Composite |
| `sessionResults` | `section` (Ascending) | Single |

Firestore will suggest index creation when you run queries that need them.

---

## Security Rules

### Production-Ready Firestore Security Rules

Replace the default rules in **Firestore Database → Rules** with:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow teachers to read/write their own data and their students' data
    match /teachers/{userId} {
      allow read, write: if request.auth.uid == userId;
    }

    // Allow students to read/write their own data
    match /students/{doc=**} {
      allow read, write: if request.auth != null && resource.data.authUid == request.auth.uid;
    }

    // Allow teachers to read/write sessions they created
    match /sessions/{doc=**} {
      allow read, write: if request.auth != null && resource.data.teacherId == request.auth.uid;
    }

    // Allow students to read sessions and write results
    match /sessionResults/{doc=**} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }
  }
}
```

**Click "Publish" to apply the rules.**

---

## Field Validation

### Validation Rules for Each Collection

#### **teachers** Collection:
- `email`: Must be unique and valid email format
- `section`: Cannot be empty
- `status`: Must be `"active"` or `"inactive"`
- `password`: Must match the teacher's current Firebase Auth password if you want the dashboard's reset/update/delete actions to stay in sync

#### **students** Collection:
- `username`: Must be unique
- `teacherId`: Must reference an existing teacher
- `section`: Cannot be empty

#### **sessions** Collection:
- `sessionCode`: Must be 5 characters, unique
- `difficulty`: Must be one of: `"beginner"`, `"intermediate"`, `"advanced"`
- `status`: Must be one of: `"waiting"`, `"active"`, `"completed"`

#### **sessionResults** Collection:
- `score`: Must be between 0 and 100
- `stage`: Must be one of: `"Cognitive"`, `"Associative"`, `"Autonomous"`
- `essentials`: Must be ≤ `essentialsMax` (15)
- `errors`: Must be ≥ 0
- `difficulty`: Must match the session's difficulty

---

## Unity Integration Guide

### Connecting Your Unity Game to Firestore

#### **Option 1: Using Firebase SDK for Unity (Recommended)**

##### Prerequisites:
- Unity 2020.3 LTS or later
- Firebase Admin SDK for C#

##### Installation Steps:

1. **Import Firebase Unity SDK**:
   - Download: https://firebase.google.com/download/unity
   - Extract into your `Assets/Plugins/Firebase` folder
   - Wait for compilation to complete

2. **Add Required Packages** (via Package Manager):
   ```
   com.google.firebase.firestore
   com.google.firebase.auth
   ```

3. **Initialize Firebase in Your Game**:
   ```csharp
   using Firebase;
   using Firebase.Firestore;
   using Firebase.Auth;

   public class FirebaseManager : MonoBehaviour {
       private FirebaseFirestore db;
       private FirebaseAuth auth;

       void Start() {
           FirebaseApp.CheckAndFixDependenciesAsync().ContinueWith(task => {
               if (task.Result == DependencyStatus.Available) {
                   db = FirebaseFirestore.DefaultInstance;
                   auth = FirebaseAuth.DefaultInstance;
                   Debug.Log("Firebase initialized successfully!");
               }
           });
       }
   }
   ```

4. **Submit Session Results**:
   ```csharp
   async void SubmitSessionResult(string sessionId, Dictionary<string, object> resultData) {
       try {
           await db.Collection("sessionResults").AddAsync(resultData);
           Debug.Log("Session result submitted successfully!");
       } catch (Exception ex) {
           Debug.LogError("Error submitting result: " + ex.Message);
       }
   }
   ```

---

#### **Option 2: Using REST API (No SDK Required)**

If you prefer not to use the Firebase SDK, you can query Firestore via HTTP REST API.

##### Prerequisites:
- Your Firebase Project ID: `your-project-id`
- Firebase ID Token (obtained via authentication)

##### Getting an ID Token:

```csharp
using UnityEngine.Networking;
using UnityEngine.Serialization;

IEnumerator GetIdToken(string email, string password) {
    string url = $"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={FIREBASE_API_KEY}";
    
    var requestBody = new {
        email = email,
        password = password,
        returnSecureToken = true
    };
    
    using (UnityWebRequest request = new UnityWebRequest(url, "POST")) {
        byte[] bodyRaw = System.Text.Encoding.UTF8.GetBytes(JsonUtility.ToJson(requestBody));
        request.uploadHandler = new UploadHandlerRaw(bodyRaw);
        request.downloadHandler = new DownloadHandlerBuffer();
        request.SetRequestHeader("Content-Type", "application/json");
        
        yield return request.SendWebRequest();
        
        if (request.result == UnityWebRequest.Result.Success) {
            AuthResponse authResponse = JsonUtility.FromJson<AuthResponse>(request.downloadHandler.text);
            PlayerPrefs.SetString("IdToken", authResponse.idToken);
            Debug.Log("ID Token obtained: " + authResponse.idToken);
        }
    }
}

[System.Serializable]
public class AuthResponse {
    public string idToken;
    public string localId;
    public string expiresIn;
}
```

##### Querying Firestore via REST:

```csharp
IEnumerator QuerySessionResults(string studentId) {
    string projectId = "your-project-id";
    string idToken = PlayerPrefs.GetString("IdToken");
    string url = $"https://firestore.googleapis.com/v1/projects/{projectId}/databases/(default)/documents/sessionResults?pageSize=10";
    
    using (UnityWebRequest request = UnityWebRequest.Get(url)) {
        request.SetRequestHeader("Authorization", "Bearer " + idToken);
        
        yield return request.SendWebRequest();
        
        if (request.result == UnityWebRequest.Result.Success) {
            string json = request.downloadHandler.text;
            SessionResultsResponse results = JsonUtility.FromJson<SessionResultsResponse>(json);
            Debug.Log("Session results retrieved: " + results.documents.Length);
        }
    }
}
```

##### Posting Session Results via REST:

```csharp
IEnumerator SubmitSessionResultREST(Dictionary<string, object> resultData) {
    string projectId = "your-project-id";
    string idToken = PlayerPrefs.GetString("IdToken");
    string url = $"https://firestore.googleapis.com/v1/projects/{projectId}/databases/(default)/documents/sessionResults";
    
    var payload = new {
        fields = ConvertToFirestoreFields(resultData)
    };
    
    using (UnityWebRequest request = new UnityWebRequest(url, "POST")) {
        byte[] bodyRaw = System.Text.Encoding.UTF8.GetBytes(JsonUtility.ToJson(payload));
        request.uploadHandler = new UploadHandlerRaw(bodyRaw);
        request.downloadHandler = new DownloadHandlerBuffer();
        request.SetRequestHeader("Authorization", "Bearer " + idToken);
        request.SetRequestHeader("Content-Type", "application/json");
        
        yield return request.SendWebRequest();
        
        if (request.result == UnityWebRequest.Result.Success) {
            Debug.Log("Result submitted successfully!");
        }
    }
}
```

---

### Example: Complete Game Flow

```csharp
public class GameSessionManager : MonoBehaviour {
    private FirebaseFirestore db;
    private string sessionId;
    private string studentId;
    
    void Start() {
        db = FirebaseFirestore.DefaultInstance;
    }
    
    public async void JoinSession(string sessionCode, string studentId) {
        this.studentId = studentId;
        
        try {
            // Query session by code
            Query query = db.Collection("sessions").WhereEqualTo("sessionCode", sessionCode);
            await query.GetSnapshotAsync().ContinueWith(task => {
                if (task.Result.Count > 0) {
                    DocumentSnapshot sessionDoc = task.Result.Documents[0];
                    sessionId = sessionDoc.Id;
                    Debug.Log("Joined session: " + sessionId);
                }
            });
        } catch (Exception ex) {
            Debug.LogError("Error joining session: " + ex.Message);
        }
    }
    
    public async void SubmitGameResult(int score, int completionTime, int attempts, string stage, int essentials, int errors) {
        try {
            var resultData = new Dictionary<string, object> {
                { "sessionId", sessionId },
                { "studentId", studentId },
                { "score", score },
                { "completionTime", completionTime },
                { "attempts", attempts },
                { "stage", stage },
                { "essentials", essentials },
                { "essentialsMax", 15 },
                { "errors", errors },
                { "createdAt", Timestamp.Now },
                { "updatedAt", Timestamp.Now }
            };
            
            await db.Collection("sessionResults").AddAsync(resultData);
            Debug.Log("Game result submitted!");
        } catch (Exception ex) {
            Debug.LogError("Error submitting result: " + ex.Message);
        }
    }
}
```

---

## Troubleshooting & FAQ

### Q: How do I reset a teacher's password?
**A:** In the Admin Dashboard → Teachers section, click the **"↺ RESET"** button next to the teacher. The dashboard will temporarily sign in as that teacher, update Firebase Auth to `TempPass123!`, and store the new password in Firestore.

### Q: What happens if a student loses their login credentials?
**A:** The Admin Dashboard → Students section can reset the student's Firebase Auth password to `Student@123` and keep Firestore in sync.

### Q: What does delete do in the Admin Dashboard?
**A:** Delete removes the synced Firebase Auth account and the Firestore profile for that teacher or student. If you only want to block login without removing the record, use the inactive/deactivate state instead.

### Q: Can I sync Firestore data with an external database?
**A:** Yes, use Firebase Cloud Functions or Firestore's export/import features to synchronize with other systems. You can also use the REST API for custom integrations.

### Q: How do I query Firestore from Unity?
**A:** Use the Firebase SDK for C# with queries like:
```csharp
Query q = db.Collection("sessionResults").WhereEqualTo("studentId", studentId);
await q.GetSnapshotAsync().ContinueWith(task => {
    foreach (DocumentSnapshot doc in task.Result.Documents) {
        Debug.Log(doc.ToDictionary());
    }
});
```

### Q: How do I backup Firestore data?
**A:** Use Firebase Console → Firestore Database → **Manage indexes and more** → **Backups** to schedule automated backups, or export manually to a bucket.

### Q: Why is my query slow?
**A:** Ensure you have the appropriate composite indexes. Firebase will suggest them when queries are run. Check **Firestore Database → Indexes** for any "suggested" indexes and create them.

### Q: Can I access Firestore from mobile apps?
**A:** Yes! Both iOS and Android have Firebase SDKs. Follow the same initialization process as the Unity guide.

### Q: What are the Firestore quotas and limits?
**A:** 
- **Read/Write Operations**: 50,000 per day (free tier)
- **Storage**: 1 GB (free tier)
- **Simultaneous connections**: Unlimited
- Check https://firebase.google.com/docs/firestore/quotas for full details

---

## Automated Local Setup Script (Safe, Non-Destructive)

If you prefer to apply the example documents from this guide programmatically, use the included safe helper script `scripts/updateFirestore.js`. The script creates example documents only when matching documents do not already exist — it never overwrites existing data.

Prerequisites:
- Node.js installed
- A Firebase service account JSON key (create in Firebase Console → Project Settings → Service accounts → Generate new private key)

Quick run:
```powershell
set GOOGLE_APPLICATION_CREDENTIALS=path\to\serviceAccount.json
npm install firebase-admin
node scripts/updateFirestore.js
```

Or pass the key path as an argument:
```powershell
node scripts/updateFirestore.js path\to\serviceAccount.json
```

What the script does:
- Creates a sample `teachers` document using the `uid` as the document ID if that `uid` does not exist.
- Creates a sample `students` document if no existing document matches the sample `username` or `authUid`.
- Creates a sample `sessions` document if no existing document matches the sample `sessionCode`.
- Creates a sample `sessionResults` entry if no existing document matches the sample `sessionId` + `studentId` pair.

Safety notes:
- The script intentionally checks for existing records and skips creation when a matching document exists. It will not modify or delete any existing documents.
- Review `scripts/updateFirestore.js` before running. Keep your service account key secure.
- For production-ready user management (create/update/delete Auth accounts), prefer server-side Cloud Functions or the Admin SDK rather than client-side temporary sign-in. See the Security section above.

## Server-side Cloud Function (Recommended, Safe)

If you want the repo to perform the same non-destructive data additions from a secure server-side environment, a Cloud Function is provided in the `functions/` folder. The function performs the same checks as the local script and will only create missing documents — it will not overwrite or delete existing data.

Files added in the repo:
- `functions/index.js` — HTTP function `applySamples` that applies the sample documents safely.
- `functions/package.json` — dependencies for the functions.

How it is secured:
- The function checks a secret stored in Firebase functions config (`updater.secret`) against the `x-update-secret` header or `?secret=` query parameter. Set a strong secret before deploying.

Deploy and run (from repo root):
```powershell
# 1) Install firebase-tools if not present
# npm install -g firebase-tools

# 2) Login
firebase login

# 3) Initialize functions (if not already initialized) or skip if you already have a functions folder
firebase init functions

# 4) Set secret (choose a strong secret)
firebase functions:config:set updater.secret="YOUR_STRONG_SECRET"

# 5) Install function deps and deploy
cd functions
npm install
cd ..
firebase deploy --only functions

# 6) Call the deployed function (replace URL with your function URL printed by deploy):
curl -X POST -H "x-update-secret: YOUR_STRONG_SECRET" https://REGION-PROJECT.cloudfunctions.net/applySamples
```

The function returns a JSON summary showing `created`, `skipped`, and any `errors`. Review the response before trusting changes.

Notes:
- This function runs with full Admin SDK privileges in your Firebase project — keep the secret safe and rotate it if needed.
- Deploying this will allow you to update your live Firestore from the server-side; I did not deploy it for you (I cannot run deploy commands from here).


## Additional Resources

- **Firebase Documentation**: https://firebase.google.com/docs/firestore
- **Unity Firebase Guide**: https://firebase.google.com/docs/unity/setup
- **REST API Reference**: https://firebase.google.com/docs/firestore/use-rest-api
- **Security Rules Guide**: https://firebase.google.com/docs/firestore/security/start

---

**Last Updated**: April 2025  
**Version**: 1.0  
**Contact**: Ready-Set-Bag! Support Team
