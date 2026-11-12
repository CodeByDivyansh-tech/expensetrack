/* Runs before the page paints: applies the saved theme (no white flash for dark-mode users), and
 * lets the font stylesheets load without blocking the first paint. */
(function () {
  try {
    var choice = localStorage.getItem('expensetrack_theme') || 'system';
    var dark = choice === 'dark' || (choice === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.documentElement.classList.add('dark');
  } catch (e) { /* storage blocked: stay light */ }

  // What kind of device and window this is. iPhones and iPads cannot be asked to install an app from a
  // button, and inside an installed (home-screen) app Google sign-in has to work differently.
  (function () {
    var nav = window.navigator || {};
    var ua = nav.userAgent || '';
    // iPadOS calls itself a Mac; a "Mac" with a touch screen is an iPad
    var ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && nav.maxTouchPoints > 1);
    var standalone = nav.standalone === true ||
      (typeof window.matchMedia === 'function' && (window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: minimal-ui)').matches));
    var otherIosBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|GSA\//.test(ua);
    var embedded = /FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|Snapchat|Twitter|LinkedInApp|WhatsApp|; wv\)/i.test(ua);
    window.ExpenseTrackPlatform = {
      ios: ios,
      standalone: standalone,
      iosSafari: ios && !standalone && !otherIosBrowser && !embedded && /Safari/.test(ua),
      iosOtherBrowser: ios && !standalone && (otherIosBrowser || embedded || !/Safari/.test(ua)),
      embedded: embedded,
    };
    if (ios) document.documentElement.classList.add('is-ios');
    if (standalone) document.documentElement.classList.add('is-standalone');
  })();

  // Not signed in (this browser has no saved session)? Go straight to the sign-in page, before any of the
  // app's scripts are fetched. The sign-in page sends you back if you are in fact still signed in.
  try {
    var onLogin = /\/login(\.html)?\/?$/.test(window.location.pathname);
    if (!onLogin && !localStorage.getItem('expensetrack_user_session')) {
      window.location.replace('login.html');
      return;
    }
  } catch (e) { /* storage blocked: let the app decide */ }

  function ready() {
    document.documentElement.classList.add('icons-ready');
  }
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('link[data-async-css]').forEach(function (link) { link.media = 'all'; });
    // Icon names are shown as text until the icon font is there, so keep them invisible until then
    if (document.fonts && document.fonts.load) {
      document.fonts.load('24px "Material Symbols Outlined"', 'home').then(ready, ready);
      setTimeout(ready, 4000);
    } else {
      ready();
    }
  });
})();