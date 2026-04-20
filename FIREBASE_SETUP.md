# Firebase Integration Setup Guide

This guide will help you set up Firebase for the Ready-Set-Bag Admin Dashboard.

## Prerequisites
- A Firebase account (create one at https://firebase.google.com/)
- Access to the Firebase Console
- ✅ Web app already added to your Firebase project

## Quick Setup (4 Steps)

### Step 1: Copy Your Firebase Configuration

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your **Ready-Set-Bag** project
3. Click the **Settings icon** (⚙️) → **Project settings**
4. Scroll to **Your apps** section
5. Find your **Web app** and click it
6. Copy the entire Firebase config object:

```javascript
{
  "apiKey": "AIzaSyD...",
  "authDomain": "ready-set-bag-xxxx.firebaseapp.com",
  "projectId": "ready-set-bag-xxxx",
  "storageBucket": "ready-set-bag-xxxx.appspot.com",
  "messagingSenderId": "123456789",
  "appId": "1:123456789:web:abcd1234efgh5678",
  "measurementId": "G-ABCDEFGHIJ"
}
```

### Step 2: Update firebase-config.js

1. Open `firebase-config.js` in the project root directory
2. Replace the placeholder config with your actual values:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID",
  measurementId: "YOUR_MEASUREMENT_ID"
};
```

**Example:**
```javascript
const firebaseConfig = {
  apiKey: "AIzaSyD1234567890abcdefghijklmnopqrstuv",
  authDomain: "ready-set-bag-demo.firebaseapp.com",
  projectId: "ready-set-bag-demo",
  storageBucket: "ready-set-bag-demo.appspot.com",
  messagingSenderId: "987654321098",
  appId: "1:987654321098:web:wxyz7890abcd1234",
  measurementId: "G-ABC1234DEF"
};
```

### Step 3: Configure Firestore Security Rules (Development)

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project → **Build > Firestore Database**
3. Click the **Rules** tab
4. Replace all content with these rules:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /teachers/{document=**} {
      allow read, write: if true;
    }
  }
}
```

5. Click **Publish**

⚠️ **Important**: These rules are for development only. For production, implement proper authentication and authorization.

### Step 4: Test the Integration

1. Open `admin/dashboard.html` in your browser
2. Go to the **TEACHERS** section
3. Click **+ ADD NEW TEACHER**
4. Fill in teacher details and click **CREATE TEACHER**
5. Check the [Firebase Console](https://console.firebase.google.com/) → Firestore Database → `teachers` collection
6. You should see the new teacher record there!

✅ **Success**: If you see the teacher in Firestore, everything is working!


## Step 5: Production Security Rules

Once your app is ready for production, implement proper rules like:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /teachers/{document=**} {
      allow read, write: if request.auth != null && request.auth.token.isAdmin == true;
    }
  }
}
```

This requires Firebase Authentication to be set up.

## Shared Database with Unity

Since both your web and Unity apps are registered to the same Firebase project, they share the same Firestore database. This means:

✅ Teachers added in the web admin dashboard will appear in your Unity app
✅ Teachers deleted in Unity will be removed from the web dashboard
✅ All changes sync in real-time across both platforms
✅ Single source of truth for your data

## Features Implemented

### Teacher Management Operations

All the following operations now sync with Firebase Firestore:

1. **Add Teacher**
   - Creates a new teacher record in Firestore
   - Stores: firstName, lastName, email, section, password, timestamps

2. **Edit Teacher**
   - Updates teacher information in Firestore
   - Modified records are updated in real-time
   - Timestamps are automatically updated

3. **Reset Password**
   - Changes teacher password in Firestore to a temporary password
   - Marks the record with `passwordReset: true`

4. **Delete Teacher**
   - Removes teacher from both the UI and Firestore database

## Firestore Database Structure

Teachers are stored in a `teachers` collection with the following structure:

```
Collection: teachers
Document: {teacherId}
{
  firstName: "Maria",
  lastName: "Santos",
  email: "m.santos@cees.edu.ph",
  section: "G6-Sampaguita",
  password: "TempPass123!",
  passwordReset: false,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

## Troubleshooting

### Teachers aren't saving to Firebase
1. Check browser console for error messages (F12 > Console)
2. Verify Firebase config values are correct in `firebase-config.js`
3. Check Firestore security rules allow write access
4. Ensure Firestore database is active and not in "locked" mode
5. Make sure you published the security rules

### Can't connect to Firestore
1. Verify internet connection
2. Check Firebase project is enabled
3. Clear browser cache and reload (Ctrl+Shift+Delete)
4. Check that the projectId in firebase-config.js matches your Firebase project
5. Verify the web app is registered in Firebase Console

### Firebase SDK not loading
1. Check browser console for network errors
2. Verify internet connection
3. Try refreshing the page
4. Check that firebase-config.js is loaded after the SDK scripts

### Password reset not working
1. Verify Firestore is active
2. Check that the teacher document exists in Firestore
3. Look for error messages in the browser console (F12 > Console)

## Common Issues

**"Cannot read properties of undefined (reading 'firestore')"**
- Ensure `firebase-config.js` is loaded AFTER the Firebase SDK scripts
- Check that all credentials in firebase-config.js are correct

**Teachers appear but don't save to Firestore**
- Check Firestore security rules (should allow write access)
- Check browser console for specific error messages

**Unity and Web apps not syncing**
- Verify both apps use the same Firebase project
- Check that the `teachers` collection name matches

## Next Steps

1. ✅ **Complete Step 1-4 above** to get started
2. **Add Authentication**: Implement Firebase Authentication for admin login
3. **Hash Passwords**: Instead of storing plain text, hash passwords before storing
4. **Email Notifications**: Integrate Firebase Cloud Functions to send welcome emails
5. **Activity Logging**: Track all admin actions for audit purposes
6. **Backup & Export**: Set up automated backups of your Firestore data
7. **Firebase Hosting**: Deploy the web app online (optional)

## Resources

- [Firebase Documentation](https://firebase.google.com/docs)
- [Firestore Guide](https://firebase.google.com/docs/firestore)
- [Firestore Security Rules](https://firebase.google.com/docs/firestore/security/start)
- [Firebase Console](https://console.firebase.google.com/)
- [Firebase Setup Video Tutorials](https://www.youtube.com/watch?v=sHLN73pDkEI)
