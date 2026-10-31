const { test, expect } = require('@playwright/test');
const { openApp, openLogin } = require('./fixtures');

const nav = (page, view) => page.evaluate((v) => window.ExpenseTrackApp.navigateTo(v), view);
const iso = (daysAgo) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const get = async (page, url) => (await page.request.get(url)).text();

test.describe('page weight and loading order', () => {
  test('scripts do not block the first paint, and nothing loads that the page does not need', async ({ page }) => {
    for (const url of ['/', '/login']) {
      const html = await get(page, url);
      const blocking = [...html.matchAll(/<script\b[^>]*\ssrc="([^"]+)"[^>]*>/g)].filter((m) => !/\sdefer\b/.test(m[0])).map((m) => m[1]);
      expect(blocking, `${url} has scripts that block rendering`).toEqual(['theme-init.js']);
    }
    const login = await get(page, '/login');
    expect(login).not.toContain('firebase-firestore-compat'); // the sign-in page never touches the database
    expect(await get(page, '/')).not.toContain('chart.js');
  });

  test('the icon font is a small subset, not the 4 MB full font', async ({ page }) => {
    for (const url of ['/', '/login']) {
      const html = await get(page, url);
      const link = html.match(/<link rel="stylesheet" href="([^"]*Material\+Symbols[^"]*)"/)[1];
      expect(link).toContain('icon_names=');
      expect(link).toContain('GRAD@24,400,0,0');
      expect(link).not.toContain('..');
    }
  });

  test('the stylesheet only holds what the pages use', async ({ page }) => {
    const css = await page.request.get('/dist/styles.css');
    expect((await css.body()).length).toBeLessThan(80 * 1024);
  });

  test('a signed-out visitor is sent to sign-in before the app is downloaded', async ({ page }) => {
    const requested = [];
    page.on('request', (r) => requested.push(new URL(r.url()).pathname));
    await page.route('**/www.gstatic.com/**', (r) => r.abort());
    await page.addInitScript(() => sessionStorage.setItem('et_portal_seen', '1')); // already through the portal
    await page.goto('/');
    await page.waitForURL(/\/login(\.html)?$/);
    expect(requested).not.toContain('/app.js');
    expect(requested).not.toContain('/data-layer.js');
  });

  test('a browser with a saved session goes straight into the app', async ({ page }) => {
    await openApp(page);
    await expect(page).toHaveURL(/\/$/);
    expect(await page.evaluate(() => !!window.ExpenseTrackApp)).toBe(true);
  });

  test('robots.txt is valid', async ({ page }) => {
    const res = await page.request.get('/robots.txt');
    expect(res.status()).toBe(200);
    expect(await res.text()).toMatch(/User-agent: \*\s+Allow: \//);
  });

  test('the dashboard does not jump around while it loads', async ({ page }) => {
    await page.addInitScript(() => {
      window.__cls = 0;
      new PerformanceObserver((list) => list.getEntries().forEach((e) => { if (!e.hadRecentInput) window.__cls += e.value; })).observe({ type: 'layout-shift', buffered: true });
    });
    const expenses = Array.from({ length: 20 }, (_, i) => ({ id: `e${i}`, amount: 50 + i, category: ['food', 'groceries', 'transport'][i % 3], date: iso(i), note: `Item ${i}`, createdAt: i }));
    await openApp(page, { seed: { expensetrack_expenses: expenses, expensetrack_goals: [{ id: 'g', name: 'Laptop', target: 1000, saved: 100, contributions: [], createdAt: 1 }] } });
    await page.waitForTimeout(800);
    const cls = await page.evaluate(() => window.__cls);
    expect(cls, `layout shift score ${cls.toFixed(3)}`).toBeLessThan(0.1);
  });
});

test.describe('the icon subset covers every icon the app can show', () => {
  const allowed = async (page) => {
    const html = await get(page, '/');
    const names = html.match(/icon_names=([^&"]+)/)[1].split(',');
    return new Set(names);
  };

  const iconsOnScreen = (page) => page.evaluate(() =>
    [...document.querySelectorAll('.material-symbols-outlined')].map((e) => e.textContent.trim()).filter(Boolean));

  test('every view, dialog and toast', async ({ page }) => {
    test.setTimeout(90000);
    const want = await allowed(page);
    const seen = new Set();
    const collect = async () => (await iconsOnScreen(page)).forEach((n) => seen.add(n));

    const expenses = [
      { id: 'a', amount: 900, category: 'food', date: iso(1), note: 'big', createdAt: 1, paymentMethod: 'UPI' },
      { id: 'b', amount: 40, category: 'mystery', date: iso(2), note: 'odd', createdAt: 2 },
      { id: 'c', amount: 40, category: 'transport', date: iso(35), note: 'old', createdAt: 3 },
    ];
    const doc = ({ id, ...rest }) => rest;
    await openApp(page, {
      useFirestore: true,
      fsSeed: {
        'users/test-uid': {
          budget: { overallCap: 1000, categories: { food: 500, transport: 100 } },
          settings: { notify80: true },
          customCategories: { custom_1: { id: 'custom_1', name: 'Gym', icon: 'fitness_center', color: '#006948', defaultCap: 500, isDefault: false, isArchived: false } },
          legacyImportHandled: true,
          updatedAt: 1,
        },
        ...Object.fromEntries(expenses.map((e) => [`users/test-uid/expenses/${e.id}`, doc(e)])),
        'users/test-uid/goals/g': { name: 'Laptop', target: 1000, saved: 100, contributions: [{ id: 'c1', date: iso(1), amount: 100 }], createdAt: 1 },
        'users/test-uid/recurring/r': { name: 'Rent', amount: 5, category: 'personal', frequency: 'monthly', startDate: iso(3), lastGenerated: iso(0), active: true, createdAt: 1 },
      },
    });    await collect();

    for (const view of ['transactions', 'budget-setup', 'analytics', 'goals', 'recurring', 'profile-&-settings', 'dashboard']) {
      await nav(page, view);
      await page.waitForTimeout(250);
      await collect();
    }

    // every dialog
    await page.evaluate(() => window.ExpenseTrackApp.openAddExpenseModal());
    await collect();
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.ExpenseTrackApp.openBudgetModal());
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.ExpenseTrackApp.openAddCustomCategoryModal());
    await collect();
    await page.keyboard.press('Escape');
    await nav(page, 'recurring');
    await page.locator('#rec-add').click();
    await page.keyboard.press('Escape');
    await nav(page, 'goals');
    await page.locator('#goal-add').click();
    await page.keyboard.press('Escape');
    await page.locator('[data-action="goal-add-money"]').click();
    await collect();
    await page.keyboard.press('Escape');

    // sync states and every kind of toast
    await context(page, seen, collect);

    const missing = [...seen].filter((n) => !want.has(n));
    expect(missing, `icons used on screen but missing from the font subset: ${missing.join(', ')}`).toEqual([]);
    expect(seen.size).toBeGreaterThan(30);
  });

  async function context(page, seen, collect) {
    // success toast, info toast (delete), warning toast (threshold), error toast (failed write)
    await nav(page, 'dashboard');
    await page.evaluate(() => window.ExpenseTrackApp.openAddExpenseModal());
    await page.locator('#expense-amount').fill('100');
    await page.locator('#expense-modal-submit').click();
    await page.waitForTimeout(200);
    await collect();
    await page.locator('#dash-transactions-list [aria-label="Delete Expense"]').first().click();
    await page.waitForTimeout(200);
    await collect();
    await page.evaluate(() => { window.__db.failWrites = new Error('Missing or insufficient permissions.'); });
    await page.evaluate(() => window.ExpenseTrackApp.openAddExpenseModal());
    await page.locator('#expense-amount').fill('5');
    await page.locator('#expense-modal-submit').click();
    await page.waitForTimeout(200);
    await collect();
    await page.keyboard.press('Escape');
    await page.evaluate(() => { window.__db.failWrites = null; });
    await page.evaluate(() => { window.__db.hang = true; window.ExpenseTrackDataLayer.addExpense({ amount: 1, category: 'food' }); });
    await page.waitForTimeout(100);
    await collect(); // "Saving" icon
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await page.context().setOffline(true);
    await page.waitForTimeout(150);
    await collect(); // "Offline" icon and banner
    await page.context().setOffline(false);
  }

  test('the sign-in page', async ({ page }) => {
    const want = await allowed(page);
    await openLogin(page, { signInError: 'auth/unauthorized-domain' });
    await page.locator('#btn-google-signin').click();
    await expect(page.locator('#auth-alert')).toBeVisible();
    const names = await iconsOnScreen(page);
    expect(names.filter((n) => !want.has(n))).toEqual([]);
  });
});
