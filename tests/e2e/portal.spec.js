const { test, expect } = require('@playwright/test');
const { installStubOnPage } = require('./fixtures');

// The DIVYANSH portal (portal.html) is the front door: shown once per browser tab before the app.

// A brand-new browser tab: the portal has not been seen yet (only for the first page load of the test)
async function freshTab(page) {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('__freshTab')) {
      sessionStorage.setItem('__freshTab', '1');
      sessionStorage.removeItem('et_portal_seen');
    }
  });
}

async function blockThirdParty(page) {
  await page.route(/fonts\.(googleapis|gstatic)\.com|www\.gstatic\.com|cdn\.jsdelivr\.net/, (r) => r.fulfill({ status: 200, body: '' }));
}

test.describe('DIVYANSH portal', () => {
  test('a new visitor to / sees the portal before any app code downloads', async ({ page }) => {
    const requested = [];
    page.on('request', (r) => requested.push(new URL(r.url()).pathname));
    await blockThirdParty(page);
    await page.goto('/');
    await page.waitForURL(/\/portal(\.html)?$/);
    await expect(page.locator('#portal')).toBeVisible();
    expect(requested).not.toContain('/app.js');
    expect(requested).not.toContain('/data-layer.js');
  });

  test('DIVYANSH is the only visible text on the page', async ({ page }) => {
    await blockThirdParty(page);
    await page.goto('/portal');
    await page.waitForTimeout(1500); // letters finish rising in
    const text = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, '');
    expect(text).toBe('DIVYANSH');
    await expect(page).toHaveTitle('DIVYANSH');
    expect(await page.locator('link[rel="icon"]').getAttribute('href')).toBe('assets/divyansh-logo.svg');
  });

  test('loads with no script errors and nothing blocked by the Content-Security-Policy', async ({ page }) => {
    const problems = [];
    page.on('pageerror', (e) => problems.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problems.push(m.text()); });
    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (e) => { window.__csp = (window.__csp || []).concat(e.violatedDirective + ' ' + e.blockedURI); });
    });
    await blockThirdParty(page);
    await page.goto('/portal');
    await page.hover('#portal');
    await page.waitForTimeout(800);
    expect(problems).toEqual([]);
    expect(await page.evaluate(() => window.__csp || [])).toEqual([]);
  });

  test('the door is a keyboard button: hover and focus light it up, Enter opens it', async ({ page }) => {
    await installStubOnPage(page, { signedOut: true });
    await freshTab(page);
    await page.goto('/portal');
    const door = page.locator('#portal');
    await expect(door).toHaveAttribute('aria-label', 'Enter');
    await door.hover();
    expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--hover'))).toBe('1');
    await door.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('body')).toHaveClass(/is-opening/);
    await expect(page.locator('body')).toHaveClass(/is-flashing/, { timeout: 2000 });
    // On to the app; signed out, so the app sends the visitor to sign-in (and not back to the portal)
    await page.waitForURL(/\/login(\.html)?$/, { timeout: 5000 });
    expect(await page.evaluate(() => sessionStorage.getItem('et_portal_seen'))).toBe('1');
  });

  test('after the portal, a signed-in visitor goes straight into the app', async ({ page }) => {
    await installStubOnPage(page);
    await freshTab(page);
    await page.goto('/');
    await page.waitForURL(/\/portal(\.html)?$/);
    await page.click('#portal');
    await page.waitForURL((url) => url.pathname === '/', { timeout: 5000 });
    await page.waitForFunction(() => !!window.ExpenseTrackApp);
    await expect(page.locator('#view-dashboard h1')).toHaveText('Spending Dashboard');
  });

  test('with reduced motion the door still opens, quickly', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await installStubOnPage(page, { signedOut: true });
    await freshTab(page);
    await page.goto('/portal');
    const started = Date.now();
    await page.click('#portal');
    await page.waitForURL(/\/login(\.html)?$/, { timeout: 3000 });
    expect(Date.now() - started).toBeLessThan(2500);
  });

  test('the installed app and its shortcuts skip the portal', async ({ page }) => {
    await installStubOnPage(page);
    await freshTab(page);
    await page.goto('/?source=pwa');
    await page.waitForFunction(() => !!window.ExpenseTrackApp);
    expect(new URL(page.url()).pathname).toBe('/');
  });

  test('coming in through the sign-in page counts as having passed the portal', async ({ page }) => {
    await blockThirdParty(page);
    await page.goto('/login');
    expect(await page.evaluate(() => sessionStorage.getItem('et_portal_seen'))).toBe('1');
  });

  test('the destination is set in one place', async ({ page }) => {
    const config = await (await page.request.get('/portal-config.js')).text();
    expect(config).toContain('FUTURE_SITE_URL');
  });
});

test.describe('animated letters', () => {
  test('page titles keep their exact text and accessible name while animating', async ({ page }) => {
    const { openApp } = require('./fixtures');
    await openApp(page);
    const h1 = page.locator('#view-dashboard h1');
    await expect(h1).toHaveText('Spending Dashboard');
    await expect(h1).toHaveAttribute('aria-label', 'Spending Dashboard');
    expect(await h1.locator('.fx-ch').count()).toBe('SpendingDashboard'.length);
    await expect(page.getByRole('heading', { name: 'Spending Dashboard' })).toBeVisible();
  });

  test('no letter animation when the person asks for reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const { openApp } = require('./fixtures');
    await openApp(page);
    expect(await page.locator('.fx-ch').count()).toBe(0);
  });
});
