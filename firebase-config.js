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

// Promise that resolves when Firebase is initialized.
// Polls for the CDN-loaded `firebase` global instead of gambling on a fixed
// delay: on a slow connection the SDK scripts can take longer than any fixed
// timeout to load, which previously left window.db/window.auth stuck null
// with no retry until the page was manually reloaded.
window.firebaseInitPromise = new Promise((resolve) => {
  const MAX_WAIT_MS = 15000;
  const POLL_INTERVAL_MS = 50;
  const startedAt = Date.now();

  function waitForSdk() {
    if (typeof firebase !== 'undefined') {
      init();
      return;
    }
    if (Date.now() - startedAt > MAX_WAIT_MS) {
      console.error('✗ Firebase SDK did not load within', MAX_WAIT_MS, 'ms (check network/CDN access).');
      resolve(); // resolve anyway so callers don't hang forever
      return;
    }
    setTimeout(waitForSdk, POLL_INTERVAL_MS);
  }

  function init() {
    try {
      if (firebase.apps && firebase.apps.length === 0) {
        firebase.initializeApp(firebaseConfig);
        window.db = firebase.firestore();
        window.auth = firebase.auth();

        // Point at local emulators when served from the Firebase Hosting emulator,
        // UNLESS ?firebase=prod is explicitly passed in the URL.
        const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
        const params = new URLSearchParams(window.location.search);
        if (params.get('firebase') === 'prod') {
          sessionStorage.setItem('firebaseMode', 'prod');
        } else if (params.get('firebase') === 'emulator') {
          sessionStorage.removeItem('firebaseMode');
        }
        // Persisted via sessionStorage so the mode survives page navigation
        // (e.g. login.js redirecting to admin/dashboard.html without the query string).
        const wantsProd = sessionStorage.getItem('firebaseMode') === 'prod';

        if (isLocal && !wantsProd) {
          window.db.useEmulator('localhost', 8081);
          window.auth.useEmulator('http://localhost:9099');
          window.firebaseUsingEmulator = true;
          console.log('Connected to Firebase EMULATORS (Firestore :8081, Auth :9099)');
        } else if (isLocal && wantsProd) {
          console.log('Connected to PRODUCTION Firebase (full read/write).');
        }

        // Try to enable IndexedDB persistence so clients reuse cached data
        try {
          firebase.firestore().enablePersistence().catch(function(err) {
            if (err && err.code === 'failed-precondition') {
              console.warn('Persistence failed: multiple tabs open.');
            } else if (err && err.code === 'unimplemented') {
              console.warn('Persistence is not available in this browser.');
            }
          });
        } catch (e) {
          console.warn('enablePersistence() error', e);
        }
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
  }

  waitForSdk();
});

/**
 * Resolves with the signed-in user (or null) once Firebase Auth has restored the saved
 * session. Every rule now depends on who is signed in, so pages must wait for this
 * before reading anything.
 */
window.authReadyPromise = window.firebaseInitPromise.then(() => new Promise((resolve) => {
  if (!window.auth) { resolve(null); return; }
  const unsubscribe = window.auth.onAuthStateChanged((user) => {
    unsubscribe();
    resolve(user);
  });
}));

/**
 * Auth for a second, private Firebase app. Creating a user, or signing in as one to change
 * their password, happens here so the person using the dashboard stays signed in on the
 * main app throughout. Nothing here is persisted: each operation signs in and back out.
 */
window.getAccountWorkerAuth = function () {
  if (window._accountWorkerAuth) return window._accountWorkerAuth;

  const existing = firebase.apps.find((app) => app.name === 'account-worker');
  const app = existing || firebase.initializeApp(firebaseConfig, 'account-worker');
  const workerAuth = app.auth();

  if (window.firebaseUsingEmulator) {
    workerAuth.useEmulator('http://localhost:9099');
  }
  workerAuth.setPersistence(firebase.auth.Auth.Persistence.NONE).catch(() => {});

  window._accountWorkerAuth = workerAuth;
  return workerAuth;
};
