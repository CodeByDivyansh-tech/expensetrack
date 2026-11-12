/**
 * ExpenseTrack service worker: lets the app open without a connection.
 *
 *  - The app itself (pages, scripts, styles, images) is served from the copy saved on the device, so it
 *    opens at once even on a slow connection and nothing is downloaded again on every visit. Each build
 *    has its own cache (see BUILD): when a new version is deployed the browser finds a changed sw.js,
 *    saves the whole new version alongside, and the app offers to switch to it. Pages and scripts
 *    therefore always come from the same build.
 *  - Third-party files with a version in their address (Firebase and Chart.js scripts, font files) never
 *    change, so they are also served from the saved copy. The small font stylesheet is refreshed in the
 *    background. Your data never goes through here: Firestore and sign-in requests are left alone and
 *    handled by Firebase's own offline storage.
 */
const BUILD = '__BUILD_ID__'; // replaced with a hash of the site files by build.js
const SHELL_CACHE = `expensetrack-shell-${BUILD}`;
const RUNTIME_CACHE = `expensetrack-runtime-${BUILD}`;

const SHELL_FILES = [
  '/', '/login', '/index.html', '/login.html', '/404.html',
  '/app.js', '/data-layer.js', '/budget-calculator.js', '/expense-tools.js', '/firebase-config.js',
  '/login.js', '/theme-init.js', '/pwa.js', '/text-fx.js', '/dist/styles.css',
  '/assets/logo.svg', '/favicon.svg', '/favicon.ico', '/manifest.webmanifest',
  '/assets/icons/icon-192.png', '/assets/icons/icon-512.png',
];

// Same-origin-looking files from other hosts that the app needs to run
const THIRD_PARTY_FILES = [
  { url: 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js', mode: 'no-cors' },
  { url: 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth-compat.js', mode: 'no-cors' },
  { url: 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore-compat.js', mode: 'no-cors' },
  { url: 'https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js', mode: 'cors' },
];

// Addresses that include a version or a content hash: the file behind them never changes
const IMMUTABLE_THIRD_PARTY = [
  /^https:\/\/www\.gstatic\.com\/firebasejs\/\d/,
  /^https:\/\/cdn\.jsdelivr\.net\/npm\/chart\.js@\d/,
  /^https:\/\/fonts\.gstatic\.com\//,
];
// Small and may change: answered from the saved copy and refreshed in the background
const REFRESHED_THIRD_PARTY = [
  /^https:\/\/fonts\.googleapis\.com\//,
];
// Addresses that open the app or the sign-in page
const APP_PAGES = { '/': '/', '/index.html': '/', '/dashboard': '/', '/login': '/login', '/login.html': '/login' };

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL_CACHE);
    // One missing file must not stop the whole install
    await Promise.all(SHELL_FILES.map((url) => shell.add(new Request(url, { cache: 'reload' })).catch(() => {})));
    const runtime = await caches.open(RUNTIME_CACHE);
    await Promise.all(THIRD_PARTY_FILES.map(async ({ url, mode }) => {
      try { await runtime.put(url, await fetch(url, { mode })); } catch (e) { /* offline during install: cached on first use instead */ }
    }));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL_CACHE, RUNTIME_CACHE]);
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith('expensetrack-') && !keep.has(n)).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

async function networkFirst(request, cacheName, fallbackUrls) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    for (const url of fallbackUrls) {
      const fallback = await cache.match(url);
      if (fallback) return fallback;
    }
    throw err;
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const refresh = fetch(request).then((response) => {
    if (response && (response.ok || response.type === 'opaque')) cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  return cached || (await refresh) || Response.error();
}

// The saved copy if there is one; the network (saving the answer) only when there is not
async function cacheFirst(request, cacheName, alternateUrl) {
  const cache = await caches.open(cacheName);
  const cached = (await cache.match(request)) || (alternateUrl ? await cache.match(alternateUrl) : null);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && (response.ok || response.type === 'opaque')) cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (url.pathname === '/sw.js') return; // always check the network for a new worker
    if (request.mode === 'navigate') {
      const page = APP_PAGES[url.pathname];
      if (page) {
        // Opening the app: straight from the device. A new version arrives through a new service worker.
        event.respondWith(cacheFirst(request, SHELL_CACHE, page).catch(() => networkFirst(request, SHELL_CACHE, [page, '/'])));
      } else {
        event.respondWith(networkFirst(request, SHELL_CACHE, ['/', '/index.html']));
      }
    } else {
      event.respondWith(cacheFirst(request, SHELL_CACHE));
    }
    return;
  }

  if (IMMUTABLE_THIRD_PARTY.some((re) => re.test(request.url))) {
    event.respondWith(cacheFirst(request, RUNTIME_CACHE));
  } else if (REFRESHED_THIRD_PARTY.some((re) => re.test(request.url))) {
    event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
  }
  // Everything else (Firestore, sign-in, avatars) goes straight to the network
});
