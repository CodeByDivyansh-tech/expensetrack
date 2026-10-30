const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { openApp, openLogin, installStubOnPage } = require('./fixtures');
const { readRenderConfig } = require('../helpers/static-server');

const get = async (page, url) => (await page.request.get(url)).text();

test.describe('B20: Chart.js is pinned and integrity-checked', () => {
  test('the script tag names an exact version and an SRI hash', async ({ page }) => {
    const html = await get(page, '/');
    const tag = html.match(/<script[^>]+chart\.js[^>]*>/)[0];
    expect(tag).toMatch(/chart\.js@\d+\.\d+\.\d+\/dist\/chart\.umd\.min\.js/);
    expect(tag).toMatch(/integrity="sha384-[A-Za-z0-9+/=]+"/);
    expect(tag).toContain('crossorigin="anonymous"');
  });

  test('the browser accepts the file under that hash, so charts can draw', async ({ page }) => {
    await openApp(page);
    expect(await page.evaluate(() => typeof Chart)).toBe('function');
  });
});

test.describe('B21: the offline cache being unavailable is not a warning', () => {
  test('a second tab holding the cache logs no warning or error', async ({ page }) => {
    const noisy = [];
    page.on('console', (m) => { if (['warning', 'error'].includes(m.type()) && /persistence|offline cache/i.test(m.text())) noisy.push(m.text()); });
    await openApp(page, { useFirestore: true, persistenceError: 'failed-precondition' });
    expect(noisy).toEqual([]);
  });
});

test.describe('B22: no third-party images', () => {
  test('nothing is requested from an avatar service or a stock-photo host', async ({ page }) => {
    const external = [];
    page.on('request', (r) => { if (/ui-avatars\.com|lh3\.googleusercontent\.com\/aida/.test(r.url())) external.push(r.url()); });
    await openApp(page);
    expect(external).toEqual([]);
    const html = await get(page, '/');
    expect(html).not.toMatch(/lh3\.googleusercontent\.com|ui-avatars\.com/);
  });

  test('a user without a photo gets a locally drawn initial', async ({ page }) => {
    await openApp(page);
    const src = await page.locator('#header-user-avatar').getAttribute('src');
    expect(src.startsWith('data:image/svg+xml,')).toBe(true);
    expect(decodeURIComponent(src)).toContain('>T<'); // "Test Student"
  });
});

test.describe('B23: share-card metadata', () => {
  for (const [name, url, canonical] of [['app', '/', 'https://expensetrack-app.onrender.com/'], ['login', '/login', 'https://expensetrack-app.onrender.com/login']]) {
    test(`${name} page has absolute Open Graph and Twitter tags`, async ({ page }) => {
      const html = await get(page, url);
      expect(html).toContain('<meta property="og:image" content="https://expensetrack-app.onrender.com/assets/og-image.png"/>');
      expect(html).toContain(`<meta property="og:url" content="${canonical}"/>`);
      expect(html).toContain('<meta name="twitter:card" content="summary_large_image"/>');
      expect(html).toContain('<meta name="twitter:image" content="https://expensetrack-app.onrender.com/assets/og-image.png"/>');
      expect(html).toContain(`<link rel="canonical" href="${canonical}"/>`);
    });
  }

  test('the share image is a 1200x630 PNG', async ({ page }) => {
    const res = await page.request.get('/assets/og-image.png');
    expect(res.status()).toBe(200);
    const buf = await res.body();
    expect(buf.subarray(1, 4).toString()).toBe('PNG');
    expect(buf.readUInt32BE(16)).toBe(1200);
    expect(buf.readUInt32BE(20)).toBe(630);
  });
});

test.describe('B24: icon font does not flash its names', () => {
  for (const url of ['/', '/login']) {
    test(`${url} asks Google Fonts for display=block`, async ({ page }) => {
      const html = await get(page, url);
      const links = html.match(/<link[^>]+Material\+Symbols[^>]*>/g);
      expect(links.length).toBeGreaterThanOrEqual(1);
      links.forEach((l) => expect(l).toContain('display=block'));
      expect(html).toMatch(/<link rel="preload" as="style" href="[^"]*Material\+Symbols/);
    });
  }
});

test.describe('B25: headers, routes, 404', () => {
  test('every header in render.yaml is sent, and the policy is strict', async ({ page }) => {
    const res = await page.request.get('/');
    const sent = res.headers();
    const headers = readRenderConfig().headers.filter((h) => h.path === '/*');
    const wanted = ['x-frame-options', 'x-content-type-options', 'referrer-policy', 'permissions-policy', 'content-security-policy'];
    wanted.forEach((n) => expect(headers.some((h) => h.name.toLowerCase() === n), `render.yaml lacks ${n}`).toBe(true));
    headers.forEach((h) => expect(sent[h.name.toLowerCase()]).toBe(h.value));
    const csp = sent['content-security-policy'];
    const scriptSrc = csp.match(/script-src ([^;]+)/)[1];
    expect(scriptSrc).not.toContain('unsafe-inline');
    expect(scriptSrc).not.toContain('unsafe-eval');
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
  });

  test('the service name matches the live site, and /login and /dashboard are rewritten', async ({ page }) => {
    expect(fs.readFileSync(path.join(__dirname, '../../render.yaml'), 'utf8')).toMatch(/name: expensetrack-app\b/);
    const { rewrites } = readRenderConfig();
    expect(rewrites).toEqual({ '/login': '/login.html', '/dashboard': '/index.html' });
    expect(await get(page, '/login')).toContain('Welcome to ExpenseTrack');
    expect(await get(page, '/dashboard')).toContain('Spending Dashboard');
  });

  test('an unknown address gets the 404 page with status 404', async ({ page }) => {
    const res = await page.request.get('/no/such/page');
    expect(res.status()).toBe(404);
    expect(await res.text()).toContain('That page does not exist');
  });

  test('the pages use no inline scripts or handlers, which the policy would block', async ({ page }) => {
    for (const url of ['/', '/login']) {
      const html = await get(page, url);
      expect(html, `${url} has an inline handler`).not.toMatch(/\son(click|change|input|submit|load)=/i);
      expect(html, `${url} has an inline script`).not.toMatch(/<script(?![^>]*\ssrc=)[^>]*>/i);
    }
  });

  test('the whole app runs without a single Content-Security-Policy violation', async ({ page }) => {
    await page.addInitScript(() => {
      window.__csp = [];
      document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
    });
    await openApp(page, { seed: { expensetrack_expenses: [{ id: 'e1', amount: 40, category: 'food', date: new Date().toISOString().slice(0, 10), note: 'x', createdAt: 1 }] } });
    for (const v of ['analytics', 'budget-setup', 'profile-&-settings', 'dashboard']) {
      await page.evaluate((view) => window.ExpenseTrackApp.navigateTo(view), v);
    }
    await page.locator('aside a[data-path="add-expense"]').click();
    await page.keyboard.press('Escape');
    await page.locator('#open-budget-modal').click({ force: true }).catch(() => {});
    await page.evaluate(() => window.ExpenseTrackApp.openAddCustomCategoryModal());
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__csp)).toEqual([]);
  });
});

test.describe('B28: login page', () => {
  const googleBtn = (page) => page.locator('#btn-google-signin');

  for (const [code, text] of [
    ['auth/unauthorized-domain', /not allowed to sign in/],
    ['auth/network-request-failed', /Could not reach Google/],
    ['auth/popup-closed-by-user', /cancelled/],
    ['auth/popup-blocked', /blocked the sign-in popup/],
    ['auth/something-new', /sign-in failed/],
  ]) {
    test(`${code} shows a friendly message and lets you retry`, async ({ page }) => {
      await openLogin(page, { signInError: code });
      await googleBtn(page).click();
      await expect(page.locator('#auth-alert-text')).toHaveText(text);
      await expect(googleBtn(page)).toBeEnabled();
      await expect(page.locator('#google-btn-text')).toHaveText('Sign in with Google');
    });
  }

  test('a successful sign-in navigates to the app exactly once', async ({ page }) => {
    await openLogin(page);
    const navs = [];
    page.on('framenavigated', (f) => { if (f === page.mainFrame()) navs.push(f.url()); });
    await googleBtn(page).click();
    await page.waitForURL(/\/(index\.html)?$/);
    await page.waitForTimeout(1200); // the old code redirected a second time after 500 ms
    expect(navs.filter((u) => /\/(index\.html)?$/.test(u))).toHaveLength(1);
  });

  test('the sign-in script loads from a file, not inline', async ({ page }) => {
    await openLogin(page);
    await expect(page.locator('script[src="login.js"]')).toHaveCount(1);
  });

  test.describe('inside another app', () => {
    test.use({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0.0.0' });
    test('a notice tells the user to open Chrome or Safari', async ({ page }) => {
      await openLogin(page);
      await expect(page.locator('#inapp-warning')).toBeVisible();
      await expect(page.locator('#inapp-warning')).toContainText('Chrome or Safari');
    });
  });

  test.describe('in a normal browser', () => {
    test('no in-app notice is shown', async ({ page }) => {
      await openLogin(page);
      await expect(page.locator('#inapp-warning')).toBeHidden();
    });
  });
});
