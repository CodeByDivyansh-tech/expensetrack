/**
 * ExpenseTrack service worker: lets the app open without a connection.
 *
 *  - Pages (HTML): network first, so you always get the newest version when online; the saved copy
 *    is used when the network is down.
 *  - Our own scripts, styles and images: served from the cache straight away and refreshed in the
 *    background.
 *  - A short list of third-party files the app cannot start without (Firebase and Chart.js scripts,
 *    fonts) is kept too. Your data never goes through here: Firestore and sign-in requests are
 *    left alone and handled by Firebase's own offline storage.
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

const CACHEABLE_THIRD_PARTY = [
  /^https:\/\/www\.gstatic\.com\/firebasejs\//,
  /^https:\/\/cdn\.jsdelivr\.net\/npm\/chart\.js@/,
  /^https:\/\/fonts\.googleapis\.com\//,
  /^https:\/\/fonts\.gstatic\.com\//,
];

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

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (url.pathname === '/sw.js') return; // always check the network for a new worker
    if (request.mode === 'navigate') {
      const fallback = url.pathname.startsWith('/login') ? ['/login', '/login.html', '/'] : ['/', '/index.html'];
      event.respondWith(networkFirst(request, SHELL_CACHE, fallback));
    } else {
      event.respondWith(staleWhileRevalidate(request, SHELL_CACHE));
    }
    return;
  }

  if (CACHEABLE_THIRD_PARTY.some((re) => re.test(request.url))) {
    event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
  }
  // Everything else (Firestore, sign-in, avatars) goes straight to the network
});
