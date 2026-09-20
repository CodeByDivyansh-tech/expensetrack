/**
 * ExpenseTrack - Firebase Authentication Configuration & Helper Utilities
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
    console.error('Firebase SDK not loaded. Please include firebase-app-compat.js and firebase-auth-compat.js');
  }

  const auth = typeof firebase !== 'undefined' ? firebase.auth() : null;

  // Set persistence to LOCAL (persists across page reloads & tabs)
  if (auth) {
    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(err => {
      console.warn('Auth persistence error:', err);
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
            displayName: user.displayName || user.phoneNumber || 'Student User',
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
     * Get cached user session from localStorage for instant initial render
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
     * Sign out user and clear local session
     */
    async signOut() {
      localStorage.removeItem('expensetrack_user_session');
      if (auth) {
        await auth.signOut();
      }
      window.location.href = 'login.html';
    }
  };

  window.FirebaseService = FirebaseService;
})();
