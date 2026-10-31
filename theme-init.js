/* Runs before the page paints: applies the saved theme (no white flash for dark-mode users), and
 * lets the font stylesheets load without blocking the first paint. */
(function () {
  try {
    var choice = localStorage.getItem('expensetrack_theme') || 'system';
    var dark = choice === 'dark' || (choice === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.documentElement.classList.add('dark');
  } catch (e) { /* storage blocked: stay light */ }

  // The front door: the DIVYANSH portal (portal.html) is shown once per browser tab, before the app.
  // The installed app (?source=pwa) and its shortcuts (?action=...) open straight into the app.
  try {
    var onLoginPage = /\/login(\.html)?\/?$/.test(window.location.pathname);
    var skipPortal = /[?&](source=pwa|action=)/.test(window.location.search);
    if (onLoginPage) sessionStorage.setItem('et_portal_seen', '1'); // came in through sign-in: already past the front door
    if (!onLoginPage && !skipPortal && !sessionStorage.getItem('et_portal_seen')) {
      window.location.replace('portal.html');
      return;
    }
  } catch (e) { /* storage blocked: skip the portal */ }

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