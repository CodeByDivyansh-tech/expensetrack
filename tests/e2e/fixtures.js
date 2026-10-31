const fs = require('fs');
const path = require('path');

const fakeFirestoreSource = fs.readFileSync(path.join(__dirname, '../helpers/fake-firestore.js'), 'utf8');
const chartSource = fs.readFileSync(path.join(__dirname, '../node_modules/chart.js/dist/chart.umd.min.js'), 'utf8');

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Runs inside the page, before any page script. It replaces the Firebase SDK with a stub.
function installStub(options) {
  const { useFirestore, seed, signedOut, signInError, persistenceError, fsSeed, failReads } = options;
  if (!sessionStorage.getItem('__seeded')) {
    sessionStorage.setItem('__seeded', '1');
    if (signedOut) sessionStorage.setItem('__signedOut', '1');
    Object.entries(seed).forEach(([k, v]) => localStorage.setItem(k, JSON.stringify(v)));
  }
  // A signed-in browser has a saved session; without one the app sends you to the sign-in page at once
  // Tests open the app directly: count the DIVYANSH portal (the front door) as already passed
  if (!options.showPortal) sessionStorage.setItem('et_portal_seen', '1');
  if (!signedOut && !sessionStorage.getItem('__signedOut')) {
    localStorage.setItem('expensetrack_user_session', JSON.stringify({ uid: 'test-uid' }));
  }
  const db = window.FakeFirestore.createFakeFirestore();
  window.__db = db;
  Object.entries(fsSeed || {}).forEach(([k, v]) => db._store.set(k, v));
  if (failReads) db.failReads = new Error('unavailable');
  if (persistenceError) db.enablePersistence = () => Promise.reject({ code: persistenceError });
  const user = {
    uid: 'test-uid', displayName: 'Test Student', email: 'test@example.com', photoURL: '',
    reauthenticateWithPopup() {
      if (window.__reauthError) return Promise.reject({ code: window.__reauthError });
      sessionStorage.setItem('__reauth', '1');
      return Promise.resolve();
    },
    delete() {
      sessionStorage.setItem('__keysAtDelete', JSON.stringify([...window.__db._store.keys()]));
      sessionStorage.setItem('__userDeleted', '1');
      return Promise.resolve();
    },
  };
  let listener = null;
  const authObj = {
    currentUser: user,
    setPersistence: () => Promise.resolve(),
    onAuthStateChanged(cb) {
      listener = cb;
      setTimeout(() => cb(sessionStorage.getItem('__signedOut') ? null : user), 0);
      return () => {};
    },
    signInWithPopup() {
      if (signInError) return Promise.reject({ code: signInError, message: 'stub failure' });
      sessionStorage.removeItem('__signedOut');
      return Promise.resolve({ user });
    },
    signOut() {
      sessionStorage.setItem('__signedOut', '1');
      if (listener) listener(null);
      return Promise.resolve();
    },
  };
  window.__fireAuth = () => { if (listener) listener(user); };
  // Remember cache-clearing calls across the redirect to login.html
  ['terminate', 'clearPersistence'].forEach((name) => {
    const original = db[name];
    db[name] = () => {
      sessionStorage.setItem('__fsCalls', (sessionStorage.getItem('__fsCalls') || '') + name + ',');
      return original();
    };
  });
  const auth = () => authObj;
  auth.Auth = { Persistence: { LOCAL: 'local' } };
  auth.GoogleAuthProvider = function () { this.setCustomParameters = () => {}; };
  window.firebase = { apps: [], initializeApp() { this.apps.push({}); }, auth };
  if (useFirestore) window.firebase.firestore = () => db;
}

async function routeExternals(page) {
  await page.route('**/www.gstatic.com/firebasejs/**', (r) =>
    r.fulfill({ contentType: 'application/javascript', body: '/* stubbed */' }));
  // The pinned Chart.js file, served from the npm copy: also proves the SRI hash in index.html matches
  await page.route('**/cdn.jsdelivr.net/npm/chart.js@4.5.1/**', (r) =>
    r.fulfill({ contentType: 'application/javascript', body: chartSource }));
  await page.route('**/fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }));
  await page.route(/fonts\.gstatic\.com|googleusercontent\.com/, (r) => r.abort());
}

async function installStubOnPage(page, { useFirestore = false, seed = {}, signedOut = false, signInError = null, persistenceError = null, fsSeed = {}, failReads = false } = {}) {
  await routeExternals(page);
  // Added as plain script text (not eval), so it also works under the site's Content-Security-Policy
  const content = `${fakeFirestoreSource}\n;(${installStub.toString()})(${JSON.stringify({ useFirestore, seed, signedOut, signInError, persistenceError, fsSeed, failReads })});`;
  await page.addInitScript({ content });
}

/**
 * Opens the built app with Firebase replaced by a stub that signs in a fake user.
 *   useFirestore: true  -> in-memory fake Firestore, exposed as window.__db
 *   useFirestore: false -> no firestore(), so the data layer uses its localStorage fallback
 *   seed: { localStorageKey: value } written once, before the app boots (legacy-format fixtures)
 */
async function openApp(page, options = {}) {
  await installStubOnPage(page, options);
  await page.goto('/');
  await page.waitForFunction(() => document.getElementById('auth-loading-overlay').style.display === 'none');
}

/** Opens the login page with a signed-out stub. signInError: an auth error code the popup should fail with. */
async function openLogin(page, options = {}) {
  await installStubOnPage(page, { ...options, signedOut: true });
  await page.goto('/login');
}

module.exports = { openApp, openLogin, installStubOnPage, installStub, todayLocal };
