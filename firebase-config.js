/* ============================================================================
   FIREBASE CONFIGURATION
   ============================================================================ */

// Initialize Firebase with your project credentials
// Get these values from your Firebase Console: Project Settings
const firebaseConfig = {
  apiKey: "AIzaSyASEaRXWLXJN32x0COm7RJ-FmUD64FahG0",
  authDomain: "readysetbag-da917.firebaseapp.com",
  projectId: "readysetbag-da917",
  storageBucket: "readysetbag-da917.firebasestorage.app",
  messagingSenderId: "975675266823",
  appId: "1:975675266823:web:e5a334026936e687ac57a2",
  measurementId: "G-4XVBLM5C0E"
};

// Initialize Firebase
let db;
let auth;

// Wait a moment to ensure all Firebase scripts are loaded
setTimeout(() => {
  try {
    if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length === 0) {
      firebase.initializeApp(firebaseConfig);
      db = firebase.firestore();
      auth = firebase.auth();
      console.log('✓ Firebase initialized successfully');
      console.log('✓ Firestore ready');
    } else if (firebase.apps && firebase.apps.length > 0) {
      db = firebase.firestore();
      auth = firebase.auth();
      console.log('✓ Firebase already initialized');
      console.log('✓ Firestore ready');
    }
  } catch (error) {
    console.error('✗ Firebase initialization error:', error);
  }
}, 500);
