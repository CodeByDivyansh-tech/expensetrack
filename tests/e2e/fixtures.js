const fs = require('fs');
const path = require('path');

const fakeFirestoreSource = fs.readFileSync(path.join(__dirname, '../helpers/fake-firestore.js'), 'utf8');

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Opens the built app with Firebase replaced by a stub that signs in a fake user.
 *   useFirestore: true  -> in-memory fake Firestore, exposed as window.__db
 *   useFirestore: false -> no firestore(), so the data layer uses its localStorage fallback
 *   seed: { localStorageKey: value } written once, before the app boots (legacy-format fixtures)
 */
async function openApp(page, { useFirestore = false, seed = {} } = {}) {
  await page.route('**/www.gstatic.com/firebasejs/**', (r) =>
    r.fulfill({ contentType: 'application/javascript', body: '/* stubbed */' }));
  await page.route('**/fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }));
  await page.route(/fonts\.gstatic\.com|ui-avatars\.com|googleusercontent\.com/, (r) => r.abort());

  await page.addInitScript(({ fakeSrc, useFirestore, seed }) => {
    if (!sessionStorage.getItem('__seeded')) {
      sessionStorage.setItem('__seeded', '1');
      Object.entries(seed).forEach(([k, v]) => localStorage.setItem(k, JSON.stringify(v)));
    }
    (0, eval)(fakeSrc);
    const db = window.FakeFirestore.createFakeFirestore();
    window.__db = db;
    const user = { uid: 'test-uid', displayName: 'Test Student', email: 'test@example.com', photoURL: '' };
    let listener = null;
    const authObj = {
      currentUser: user,
      setPersistence: () => Promise.resolve(),
      onAuthStateChanged(cb) {
        listener = cb;
        setTimeout(() => cb(sessionStorage.getItem('__signedOut') ? null : user), 0);
        return () => {};
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
  }, { fakeSrc: fakeFirestoreSource, useFirestore, seed });

  await page.goto('/');
  await page.waitForFunction(() => document.getElementById('auth-loading-overlay').style.display === 'none');
}

module.exports = { openApp, todayLocal };
