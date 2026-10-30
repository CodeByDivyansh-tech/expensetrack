// Uses the REAL Firebase SDK and Google's sign-in popup (no stub), to prove the Content-Security-Policy
// in render.yaml does not break sign-in. Needs internet access; it skips itself without it.
const { test, expect } = require('@playwright/test');

async function online(request) {
  try {
    const r = await request.get('https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js', { timeout: 8000 });
    return r.ok();
  } catch (e) {
    return false;
  }
}

test.describe('Content-Security-Policy with the real Firebase SDK', () => {
  test('the login page loads the SDK and opens the Google popup with no policy violations', async ({ page, request }) => {
    test.skip(!(await online(request)), 'no internet access');
    test.setTimeout(60000);

    await page.addInitScript(() => {
      window.__csp = [];
      document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} -> ${e.blockedURI}`));
    });
    const consoleCsp = [];
    page.on('console', (m) => { if (/content security policy/i.test(m.text())) consoleCsp.push(m.text()); });

    await page.goto('/login');
    await page.waitForFunction(() => window.firebase && window.firebase.apps.length === 1 && window.FirebaseService && window.FirebaseService.auth);
    await expect(page.locator('#btn-google-signin')).toBeEnabled();

    const [popup] = await Promise.all([
      page.waitForEvent('popup', { timeout: 20000 }),
      page.locator('#btn-google-signin').click(),
    ]);
    await popup.waitForLoadState('domcontentloaded').catch(() => {});
    // Google's account chooser (or Firebase's handler on its way to it)
    await expect.poll(() => popup.url(), { timeout: 20000 }).toMatch(/accounts\.google\.com|firebaseapp\.com\/__\/auth\/handler/);
    await page.waitForTimeout(1500);
    await popup.close();

    expect(await page.evaluate(() => window.__csp)).toEqual([]);
    expect(consoleCsp).toEqual([]);
  });

  test('the integrity hash in index.html matches the file the real CDN serves', async ({ page, request }) => {
    test.skip(!(await online(request)), 'no internet access');
    const html = await (await page.request.get('/')).text();
    const tag = html.match(/<script[^>]+chart\.js[^>]*>/)[0];
    const url = tag.match(/src="([^"]+)"/)[1];
    const expected = tag.match(/integrity="sha384-([^"]+)"/)[1];
    const body = await (await request.get(url)).body();
    const actual = require('crypto').createHash('sha384').update(body).digest('base64');
    expect(actual).toBe(expected);
  });
});