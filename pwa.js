/**
 * ExpenseTrack - registers the service worker, offers updates, and captures the install prompt.
 * The app listens for the events below (see app.js).
 */
(function () {
  'use strict';

  window.__installPrompt = null;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // keep it for the Install button in Settings
    window.__installPrompt = e;
    window.dispatchEvent(new Event('expensetrack:installable'));
  });

  window.addEventListener('appinstalled', () => {
    window.__installPrompt = null;
    window.dispatchEvent(new Event('expensetrack:installed'));
  });

  if (!('serviceWorker' in navigator)) return;

  // The very first worker takes control without a reload; only a replacement worker should reload the page
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    window.location.reload();
  });

  function offerUpdate(registration) {
    window.dispatchEvent(new CustomEvent('expensetrack:update', {
      detail: { apply: () => registration.waiting && registration.waiting.postMessage({ type: 'SKIP_WAITING' }) },
    }));
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((registration) => {
      if (registration.waiting && navigator.serviceWorker.controller) offerUpdate(registration);
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(registration);
        });
      });
    }).catch((err) => console.info('Offline support is not available:', err && err.message));
  });
})();
