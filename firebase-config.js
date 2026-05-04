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
window.db = null;
window.auth = null;
window.firebaseReady = false;

// Promise that resolves when Firebase is initialized
window.firebaseInitPromise = new Promise((resolve) => {
  // Wait a moment to ensure all Firebase scripts are loaded
  setTimeout(() => {
    try {
      if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length === 0) {
        firebase.initializeApp(firebaseConfig);
        window.db = firebase.firestore();
        window.auth = firebase.auth();
        window.firebaseReady = true;

        resolve();
      } else if (firebase.apps && firebase.apps.length > 0) {
        window.db = firebase.firestore();
        window.auth = firebase.auth();
        window.firebaseReady = true;

        resolve();
      }
    } catch (error) {
      console.error('✗ Firebase initialization error:', error);
      resolve(); // Still resolve to avoid blocking
    }
  }, 500);
});
