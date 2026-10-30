/**
 * ExpenseTrack - Firebase Authentication & Firestore Configuration & Helper Utilities
 */

(function () {
  'use strict';

  // Web app's Firebase configuration
  const firebaseConfig = {
    apiKey: "AIzaSyCbF0W5mSTRGzSiHIZ4QFShPcq19muQbFQ",
    authDomain: "expensetrack-bff94.firebaseapp.com",
    projectId: "expensetrack-bff94",
    storageBucket: "expensetrack-bff94.firebasestorage.app",
    messagingSenderId: "664406341321",
    appId: "1:664406341321:web:25db94e44432cf1b1e3f18",
    measurementId: "G-LEYQ3Y08JC"
  };

  // Initialize Firebase if compat SDK is loaded
  if (typeof firebase !== 'undefined') {
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
  } else {
    console.error('Firebase SDK not loaded. Please include firebase-app-compat.js, firebase-auth-compat.js, and firebase-firestore-compat.js');
  }

  const auth = typeof firebase !== 'undefined' ? firebase.auth() : null;
  const db = typeof firebase !== 'undefined' && typeof firebase.firestore === 'function' ? firebase.firestore() : null;

  // Set persistence to LOCAL (persists across page reloads & tabs)
  if (auth) {
    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(err => {
      console.warn('Auth persistence error:', err);
    });
  }

  // Enable Firestore offline persistence
  if (db) {
    db.enablePersistence({ synchronizeTabs: true }).catch(err => {
      // Expected situations, not problems: the app works fine without the offline cache.
      if (err.code === 'failed-precondition') {
        console.info('Firestore offline cache is limited because another tab is using it.');
      } else if (err.code === 'unimplemented') {
        console.info('Firestore offline cache is not supported by this browser.');
      } else {
        console.warn('Firestore persistence error:', err);
      }
    });
  }

  // Google Auth Provider instance
  const googleProvider = typeof firebase !== 'undefined' ? new firebase.auth.GoogleAuthProvider() : null;
  if (googleProvider) {
    googleProvider.setCustomParameters({ prompt: 'select_account' });
  }

  // Helper Methods
  const FirebaseService = {
    auth,
    db,

    /**
     * Listen for authentication state changes
     */
    onAuthStateChanged(callback) {
      if (!auth) return () => {};
      return auth.onAuthStateChanged(user => {
        if (user) {
          localStorage.setItem('expensetrack_user_session', JSON.stringify({
            uid: user.uid,
            email: user.email || '',
            displayName: user.displayName || user.phoneNumber || 'Student',
            photoURL: user.photoURL || '',
            phoneNumber: user.phoneNumber || ''
          }));
        } else {
          localStorage.removeItem('expensetrack_user_session');
        }
        callback(user);
      });
    },

    /**
     * Get current active user
     */
    getCurrentUser() {
      return auth ? auth.currentUser : null;
    },

    /**
     * Get cached user session from localStorage
     */
    getCachedSession() {
      try {
        const item = localStorage.getItem('expensetrack_user_session');
        return item ? JSON.parse(item) : null;
      } catch (e) {
        return null;
      }
    },

    /**
     * Sign in with Google Popup
     */
    async signInWithGoogle() {
      if (!auth || !googleProvider) {
        throw new Error('Firebase Auth not initialized.');
      }
      return auth.signInWithPopup(googleProvider);
    },

    /**
     * Sign out user, clear all in-memory state and localStorage, and redirect to login.html
     */
    async signOut() {
      try {
        if (window.ExpenseTrackDataLayer && typeof window.ExpenseTrackDataLayer.clearUserData === 'function') {
          window.ExpenseTrackDataLayer.clearUserData();
        }
      } catch (e) {
        console.warn('Error clearing data layer state on sign out:', e);
      }

      // Clear any leftover local storage keys
      try {
        localStorage.removeItem('expensetrack_user_session');
        localStorage.removeItem('expensetrack_expenses');
        localStorage.removeItem('expensetrack_budget');
        localStorage.removeItem('expensetrack_settings');
        localStorage.removeItem('expensetrack_custom_categories');
      } catch (e) {
        console.warn('Error clearing localStorage on sign out:', e);
      }

      // Firestore keeps an offline copy of the data in IndexedDB. Remove it so the next person
      // on a shared computer cannot find this account's data in the browser profile. This runs
      // before auth.signOut(), because that triggers the auth listener, which redirects the page.
      if (db) {
        try {
          await db.terminate();
          await db.clearPersistence();
        } catch (e) {
          console.warn('Could not clear the offline data cache on sign out:', e);
        }
      }

      if (auth) {
        await auth.signOut();
      }
      window.location.replace('login.html');
    }
  };

  window.FirebaseService = FirebaseService;
})();
