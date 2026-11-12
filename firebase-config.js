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

  // Inside the installed iPhone/iPad app a sign-in popup cannot hand its result back, so Google sign-in
  // uses a full-page redirect there. Safari only lets a redirect finish when the sign-in helper pages come
  // from the same address as the app, so the host forwards /__/auth/* to Firebase (see vercel.json and
  // render.yaml) and the app's own address is used as the auth domain. Everywhere else nothing changes.
  // 'expensetrack_auth_mode' = 'popup' (set by "Try the other way" on the sign-in page) turns this off.
  const platform = window.ExpenseTrackPlatform || {};
  const host = window.location.hostname;
  const localHost = host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || /\.(localhost|test)$/.test(host);
  let authMode = 'popup';
  try {
    if (platform.ios && platform.standalone && !localHost && window.location.protocol === 'https:' &&
        localStorage.getItem('expensetrack_auth_mode') !== 'popup') authMode = 'redirect';
  } catch (e) { /* storage blocked: keep the popup */ }
  const activeConfig = authMode === 'redirect' ? Object.assign({}, firebaseConfig, { authDomain: window.location.host }) : firebaseConfig;

  // Initialize Firebase if compat SDK is loaded
  if (typeof firebase !== 'undefined') {
    if (!firebase.apps.length) {
      firebase.initializeApp(activeConfig);
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
    /** 'redirect' inside the installed iPhone/iPad app, otherwise 'popup' */
    authMode,

    /** The outcome of a redirect sign-in, once the page is back from Google (null when there was none). */
    async finishRedirectSignIn() {
      if (!auth || authMode !== 'redirect') return null;
      const result = await auth.getRedirectResult();
      return result && result.user ? result : null;
    },

    /** Switch between the two ways of signing in and reload (used when one of them does not complete). */
    useOtherSignInWay() {
      try {
        if (authMode === 'redirect') localStorage.setItem('expensetrack_auth_mode', 'popup');
        else localStorage.removeItem('expensetrack_auth_mode');
      } catch (e) { /* storage blocked */ }
      window.location.reload();
    },

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
      if (authMode === 'redirect') {
        // The page leaves for Google and comes back to the sign-in page, where getRedirectResult() finishes
        await auth.signInWithRedirect(googleProvider);
        return new Promise(() => {}); // never resolves: the page is navigating away
      }
      const result = await auth.signInWithPopup(googleProvider);
      // Leave a session marker before the page moves on: the app's first script sends visitors without one to sign-in.
      try {
        const u = result && result.user;
        if (u) localStorage.setItem('expensetrack_user_session', JSON.stringify({ uid: u.uid, email: u.email || '', displayName: u.displayName || 'Student', photoURL: u.photoURL || '', phoneNumber: u.phoneNumber || '' }));
      } catch (e) { /* storage unavailable: the app's own listener will cope */ }
      return result;
    },

    /**
     * Ask the signed-in person to confirm it is them (a Google popup). Needed before deleting an
     * account, so the deletion cannot fail halfway for lack of a recent sign-in.
     */
    async reauthenticate() {
      if (!auth || !auth.currentUser || !googleProvider) {
        throw new Error('You are not signed in.');
      }
      if (authMode === 'redirect') {
        // A redirect would lose the place in the app; in the installed iPhone app this step is done in Safari
        throw Object.assign(new Error('To confirm it is you, open ExpenseTrack in Safari and do this there.'), { code: 'expensetrack/use-browser' });
      }
      return auth.currentUser.reauthenticateWithPopup(googleProvider);
    },

    /**
     * Remove the sign-in itself (the data is deleted separately), then leave through signOut so the
     * offline cache is cleared and the page returns to the login screen.
     */
    async deleteAccount() {
      if (!auth || !auth.currentUser) {
        throw new Error('You are not signed in.');
      }
      await auth.currentUser.delete();
      return this.signOut();
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
