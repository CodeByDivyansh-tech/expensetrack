const { test, expect } = require('@playwright/test');
const { openApp, installStubOnPage } = require('./fixtures');
const fs = require('fs');
const path = require('path');

// Installing on iPhone/iPad: Safari has no install prompt, so Settings shows a guide; the installed app
// reports "App installed"; Android and desktop keep the browser's own prompt.
const UA = {
  safari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  standalone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  crios: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1',
};
const settings = async (page) => { await page.evaluate(() => window.ExpenseTrackApp.navigateTo('profile-&-settings')); };
const asStandalone = (page) => page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true }));

test.describe('install on iPhone', () => {
  test.describe('in Safari', () => {
    test.use({ userAgent: UA.safari, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    test('Settings offers "Install on iPhone" and shows the five steps', async ({ page }) => {
      await openApp(page);
      await settings(page);
      await expect(page.locator('#install-card')).toHaveAttribute('data-state', 'ios-safari');
      await expect(page.locator('#btn-install')).toBeHidden();
      await page.locator('#btn-install-ios').click();
      await expect(page.locator('#ios-install-modal')).toBeVisible();
      await expect(page.locator('#ios-install-steps li')).toHaveCount(5);
      await expect(page.locator('#ios-install-steps')).toContainText('Add to Home Screen');
      await expect(page.locator('#ios-install-note')).toBeHidden();
      await page.keyboard.press('Escape');
      await expect(page.locator('#ios-install-modal')).toBeHidden();
    });
  });

  test.describe('in another iPhone browser', () => {
    test.use({ userAgent: UA.crios, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    test('the guide says to open Safari first', async ({ page }) => {
      await openApp(page);
      await settings(page);
      await expect(page.locator('#install-card')).toHaveAttribute('data-state', 'ios-other');
      await page.locator('#btn-install-ios').click();
      await expect(page.locator('#ios-install-note')).toBeVisible();
    });
  });

  test.describe('opened from the home screen', () => {
    test.use({ userAgent: UA.standalone, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    test('Settings says "App installed" and offers nothing to install', async ({ page }) => {
      await asStandalone(page);
      await openApp(page);
      await settings(page);
      await expect(page.locator('#install-title')).toHaveText('App installed');
      await expect(page.locator('#btn-install-ios')).toBeHidden();
      await expect(page.locator('#btn-install')).toBeHidden();
    });

    test('the sign-in page does not mistake the installed app for another app\'s browser', async ({ page }) => {
      await asStandalone(page);
      await installStubOnPage(page, { signedOut: true });
      await page.goto('/login');
      await expect(page.locator('#btn-google-signin')).toBeVisible();
      await expect(page.locator('#inapp-warning')).toBeHidden();
      // On a local address the popup is kept; the redirect is only used on the real https site
      expect(await page.evaluate(() => window.FirebaseService.authMode)).toBe('popup');
    });

    test('content keeps clear of the notch and the home indicator', async ({ page }) => {
      await asStandalone(page);
      await openApp(page);
      await page.evaluate(() => { const s = document.documentElement.style; s.setProperty('--safe-top', '59px'); s.setProperty('--safe-bottom', '34px'); });
      const m = await page.evaluate(() => {
        const r = (sel) => document.querySelector(sel).getBoundingClientRect();
        return { logoTop: r('.app-header img').top, tabBottom: r('.app-tabbar a').bottom, vh: window.innerHeight, overflow: document.scrollingElement.scrollWidth - window.innerWidth };
      });
      expect(m.logoTop).toBeGreaterThanOrEqual(59);
      expect(m.tabBottom).toBeLessThanOrEqual(m.vh - 34 + 0.5);
      expect(m.overflow).toBeLessThanOrEqual(0);
    });
  });

  test('Android and desktop: the browser prompt is used, then "App installed"', async ({ page }) => {
    await openApp(page);
    await settings(page);
    await expect(page.locator('#install-card')).toHaveAttribute('data-state', 'manual');
    await page.evaluate(() => { const e = new Event('beforeinstallprompt'); e.prompt = () => { window.__prompted = true; }; e.userChoice = Promise.resolve({ outcome: 'accepted' }); window.dispatchEvent(e); });
    await expect(page.locator('#btn-install')).toBeVisible();
    await expect(page.locator('#btn-install-ios')).toBeHidden();
    await page.locator('#btn-install').click();
    expect(await page.evaluate(() => window.__prompted)).toBe(true);
    await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
    await expect(page.locator('#install-title')).toHaveText('App installed');
  });

  test('the pages and manifest carry what iOS needs', async ({ page }) => {
    for (const url of ['/', '/login']) {
      const html = await (await page.request.get(url)).text();
      expect(html).toContain('viewport-fit=cover');
      expect(html).toContain('rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png"');
      expect(html).toContain('name="apple-mobile-web-app-capable" content="yes"');
    }
    const manifest = await (await page.request.get('/manifest.webmanifest')).json();
    expect(manifest).toMatchObject({ display: 'standalone', scope: '/', orientation: 'any' });
    for (const icon of manifest.icons) expect((await page.request.get(icon.src)).status(), icon.src).toBe(200);
    expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);
    const sw = fs.readFileSync(path.join(__dirname, '../../sw.js'), 'utf8');
    expect(sw).toContain("startsWith('/__/')");
  });
});
