/**
 * ExpenseTrack - Login page controller
 */
(function () {
  'use strict';

  const alertBox = document.getElementById('auth-alert');
  const alertIcon = document.getElementById('auth-alert-icon');
  const alertText = document.getElementById('auth-alert-text');
  const googleBtn = document.getElementById('btn-google-signin');
  const googleBtnText = document.getElementById('google-btn-text');
  const inAppNotice = document.getElementById('inapp-warning');
  const copyLinkBtn = document.getElementById('btn-copy-link');

  const ERROR_MESSAGES = {
    'auth/popup-closed-by-user': 'Sign-in cancelled. Please try again.',
    'auth/cancelled-popup-request': 'Sign-in cancelled. Please try again.',
    'auth/popup-blocked': 'Your browser blocked the sign-in popup. Allow popups for this site and try again.',
    'auth/unauthorized-domain': 'This web address is not allowed to sign in yet. If you run your own copy, add its domain under Authentication > Settings > Authorized domains in the Firebase console.',
    'auth/network-request-failed': 'Could not reach Google. Check your internet connection and try again.',
    'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
    'auth/operation-not-supported-in-this-environment': 'Sign-in does not work in this browser. Open this page in Chrome or Safari.',
    'auth/web-storage-unsupported': 'Your browser is blocking storage that sign-in needs. Allow cookies and site data, or use another browser.',
    'auth/internal-error': 'Something went wrong on the sign-in service. Please try again in a moment.',
  };

  let redirecting = false;

  function goToApp() {
    if (redirecting) return;
    redirecting = true;
    window.location.replace('index.html');
  }

  function showAlert(msg, isError = true) {
    if (!alertBox || !alertText) return;
    alertText.textContent = msg;
    if (isError) {
      alertBox.className = 'p-3.5 rounded-2xl bg-error-container text-on-error-container text-label-md font-label-md flex items-center gap-2.5';
      alertIcon.textContent = 'error';
      alertBox.setAttribute('role', 'alert');
    } else {
      alertBox.className = 'p-3.5 rounded-2xl bg-primary-fixed text-on-primary-fixed text-label-md font-label-md flex items-center gap-2.5';
      alertIcon.textContent = 'check_circle';
      alertBox.setAttribute('role', 'status');
    }
    alertBox.style.display = 'flex';
  }

  function hideAlert() {
    if (alertBox) alertBox.style.display = 'none';
  }

  // Google refuses sign-in inside the embedded browsers of apps such as Instagram or WhatsApp.
  function isInAppBrowser(ua) {
    return /FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|Snapchat|Twitter|LinkedInApp|WhatsApp|GSA\/|; wv\)/i.test(ua) ||
      (/(iPhone|iPod|iPad)/.test(ua) && !/Safari/.test(ua));
  }

  if (inAppNotice && isInAppBrowser(navigator.userAgent || '')) {
    inAppNotice.classList.remove('hidden');
  }

  if (copyLinkBtn) {
    copyLinkBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(window.location.href);
        copyLinkBtn.textContent = 'Link copied';
      } catch (e) {
        copyLinkBtn.textContent = 'Copy it from the address bar';
      }
    });
  }

  if (!window.FirebaseService || !window.FirebaseService.auth) {
    showAlert('Sign-in could not load. Check your connection or turn off any blocker that stops Google scripts, then reload.');
    googleBtn.disabled = true;
    return;
  }

  // Already signed in: go straight to the app (only ever from the login page)
  window.FirebaseService.onAuthStateChanged(user => {
    if (user && user.uid) {
      const currentPath = window.location.pathname.toLowerCase();
      if (currentPath.endsWith('login.html') || currentPath.endsWith('/login') || currentPath === '/login') {
        goToApp();
      }
    }
  });

  googleBtn.addEventListener('click', async () => {
    hideAlert();
    googleBtnText.textContent = 'Signing in...';
    googleBtn.disabled = true;

    try {
      await window.FirebaseService.signInWithGoogle();
      showAlert('Signed in. Opening your dashboard...', false);
      goToApp();
    } catch (err) {
      console.error('Google Sign-in Error:', err);
      googleBtnText.textContent = 'Sign in with Google';
      googleBtn.disabled = false;
      showAlert(ERROR_MESSAGES[err && err.code] || 'Google sign-in failed. Please try again.');
    }
  });
})();
