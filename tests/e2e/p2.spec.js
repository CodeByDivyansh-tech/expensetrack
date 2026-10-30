const { test, expect } = require('@playwright/test');
const { openApp, openLogin, installStubOnPage } = require('./fixtures');

const nav = (page, view) => page.evaluate((v) => window.ExpenseTrackApp.navigateTo(v), view);
const iso = (daysAgo) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const exp = (n, extra = {}) => ({ id: `p-${n}`, amount: 10 + n, category: 'food', date: iso(0), note: `Item ${n}`, createdAt: n, ...extra });
const FIXED = new Date(2026, 9, 20, 10, 0); // 20 October 2026
const settings = (over = {}) => ({ notify80: false, weeklyDigest: false, roommateAlert: false, ...over });
const brightness = (rgb) => rgb.match(/\d+/g).slice(0, 3).reduce((s, v) => s + Number(v), 0);

test.describe('P2.12 dark mode', () => {
  test('the Settings toggle switches the whole app, remembers it, and applies it before the page paints', async ({ page }) => {
    await openApp(page);
    const light = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await nav(page, 'profile-&-settings');
    await page.locator('[data-theme-choice="dark"]').click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect(page.locator('[data-theme-choice="dark"]')).toHaveAttribute('aria-pressed', 'true');
    const dark = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(brightness(light)).toBeGreaterThan(600);
    expect(brightness(dark)).toBeLessThan(120);
    expect(await page.evaluate(() => localStorage.getItem('expensetrack_theme'))).toBe('dark');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('expensetrack_settings')).theme)).toBe('dark');

    await page.reload({ waitUntil: 'domcontentloaded' });
    expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(true);
  });

  test('"Device setting" follows the system and reacts when it changes', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await openApp(page);
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).not.toHaveClass(/dark/);
  });

  test('a chosen theme wins over the system setting', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await openApp(page, { seed: { expensetrack_settings: settings({ theme: 'light' }) } });
    await expect(page.locator('html')).not.toHaveClass(/dark/);
  });

  test('charts are drawn again in the new colours', async ({ page }) => {
    await openApp(page, { seed: { expensetrack_expenses: [exp(1)] } });
    await nav(page, 'analytics');
    await page.waitForFunction(() => !!window.ExpenseTrackApp.getState().charts.categoryDonut);
    const legend = () => page.evaluate(() => window.ExpenseTrackApp.getState().charts.categoryDonut.options.plugins.legend.labels.color);
    const before = await legend();
    await nav(page, 'profile-&-settings');
    await page.locator('[data-theme-choice="dark"]').click();
    await nav(page, 'analytics');
    const after = await legend();
    expect(after).not.toBe(before);
    expect(brightness(after)).toBeGreaterThan(brightness(before));
  });

  test('the login page follows the saved theme', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('expensetrack_theme', 'dark'));
    await openLogin(page);
    await expect(page.locator('html')).toHaveClass(/dark/);
    expect(brightness(await page.evaluate(() => getComputedStyle(document.body).backgroundColor))).toBeLessThan(120);
  });
});

test.describe('P2.13 preferences', () => {
  test('the currency symbol changes everywhere, and back', async ({ page }) => {
    await openApp(page, { seed: { expensetrack_expenses: [exp(1, { amount: 1234.5 })] } });
    await expect(page.locator('#dash-total-spent')).toHaveText('₹1,234.50');
    await nav(page, 'profile-&-settings');
    await page.locator('#pref-currency').selectOption('USD');
    await nav(page, 'dashboard');
    await expect(page.locator('#dash-total-spent')).toHaveText('$1,234.50');
    await expect(page.locator('#dash-budget-cap')).toHaveText('$12,000');
    await expect(page.locator('#dash-transactions-list')).toContainText('$1,234.50');
    await nav(page, 'budget-setup');
    await expect(page.locator('label[for="cap-input-food"]')).toContainText('$');
    await expect(page.locator('#view-budget-setup')).not.toContainText('₹');
    await page.evaluate(() => window.ExpenseTrackApp.openAddExpenseModal());
    await expect(page.locator('label[for="expense-amount"]')).toContainText('($)');
    await page.keyboard.press('Escape');
    await nav(page, 'profile-&-settings');
    await page.locator('#pref-currency').selectOption('INR');
    await nav(page, 'dashboard');
    await expect(page.locator('#dash-total-spent')).toHaveText('₹1,234.50');
  });

  test('digit grouping follows the currency', async ({ page }) => {
    await openApp(page, { seed: { expensetrack_expenses: [exp(1, { amount: 1234567 })], expensetrack_budget: { overallCap: 2000000, categories: {} } } });
    await expect(page.locator('#dash-total-spent')).toHaveText('₹12,34,567');
    await nav(page, 'profile-&-settings');
    await page.locator('#pref-currency').selectOption('EUR');
    await nav(page, 'dashboard');
    await expect(page.locator('#dash-total-spent')).toHaveText('€1,234,567');
  });

  test('a budget month that starts on the 15th', async ({ page }) => {
    await page.clock.setFixedTime(FIXED);
    await openApp(page, {
      seed: {
        expensetrack_settings: settings({ monthStartDay: 15 }),
        expensetrack_expenses: [exp(1, { amount: 100, date: '2026-10-16' }), exp(2, { amount: 900, date: '2026-10-10' })],
      },
    });
    await expect(page.locator('#dash-total-spent')).toHaveText('₹100');
    await expect(page.locator('.dynamic-term-badge').first()).toHaveText('15 Oct to 14 Nov 2026');
    await nav(page, 'analytics');
    await expect(page.locator('#analytics-month-label')).toHaveText('15 Oct to 14 Nov 2026');
    await page.locator('#analytics-prev-month').click();
    await expect(page.locator('#analytics-month-label')).toHaveText('15 Sep to 14 Oct 2026');
    await expect(page.locator('#analytics-total-spent')).toHaveText('₹900');
  });

  test('changing the start day moves the whole app to the new month', async ({ page }) => {
    await page.clock.setFixedTime(FIXED);
    await openApp(page, { seed: { expensetrack_expenses: [exp(1, { amount: 100, date: '2026-10-16' }), exp(2, { amount: 900, date: '2026-10-05' })] } });
    await expect(page.locator('#dash-total-spent')).toHaveText('₹1,000');
    await nav(page, 'profile-&-settings');
    await page.locator('#pref-month-start').selectOption('15');
    await nav(page, 'dashboard');
    await expect(page.locator('#dash-total-spent')).toHaveText('₹100');
  });

  test('the first day of the week sets the weekly chart', async ({ page }) => {
    await page.clock.setFixedTime(FIXED);
    await openApp(page, { seed: { expensetrack_expenses: [exp(1, { date: '2026-10-05' })] } });
    await nav(page, 'profile-&-settings');
    await page.locator('#pref-week-start').selectOption('0');
    await nav(page, 'analytics');
    await page.waitForFunction(() => !!window.ExpenseTrackApp.getState().charts.monthlyBar);
    const labels = await page.evaluate(() => window.ExpenseTrackApp.getState().charts.monthlyBar.data.labels);
    expect(labels).toEqual(['1–3 Oct', '4–10 Oct', '11–17 Oct', '18–24 Oct', '25–31 Oct']);
    await nav(page, 'profile-&-settings');
    await page.locator('#pref-week-start').selectOption('1');
    await nav(page, 'analytics');
    expect(await page.evaluate(() => window.ExpenseTrackApp.getState().charts.monthlyBar.data.labels[0])).toBe('1–4 Oct');
  });

  test('the warning level decides when a budget is flagged', async ({ page }) => {
    const budget = { overallCap: 12000, categories: { food: 1000 } };
    await openApp(page, { seed: { expensetrack_settings: settings({ notify80: true }), expensetrack_budget: budget, expensetrack_expenses: [exp(1, { amount: 550 })] } });
    await expect(page.locator('#budget-warning-banner')).toBeHidden(); // 55% is below the default 80%
    await nav(page, 'profile-&-settings');
    await page.locator('#pref-warn-pct').selectOption('50');
    await nav(page, 'dashboard');
    await expect(page.locator('#budget-warning-banner')).toBeVisible();
    await expect(page.locator('#budget-warning-list')).toContainText('55%');
  });

  test('preferences are saved to the account (Firestore) and reloaded with it', async ({ page }) => {
    await openApp(page, { useFirestore: true });
    await nav(page, 'profile-&-settings');
    await page.locator('#pref-currency').selectOption('GBP');
    await page.locator('[data-theme-choice="dark"]').click();
    await expect.poll(() => page.evaluate(() => window.__db._store.get('users/test-uid').settings.currency)).toBe('GBP');
    const saved = await page.evaluate(() => window.__db._store.get('users/test-uid').settings);
    expect(saved).toMatchObject({ currency: 'GBP', theme: 'dark', weekStart: 1, monthStartDay: 1, alertWarnPct: 80 });
  });

  test('the controls are labelled and big enough to tap', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openApp(page);
    await nav(page, 'profile-&-settings');
    for (const id of ['pref-currency', 'pref-week-start', 'pref-month-start', 'pref-warn-pct']) {
      await expect(page.locator(`label[for="${id}"]`)).toHaveCount(1);
      expect((await page.locator(`#${id}`).boundingBox()).height).toBeGreaterThanOrEqual(43.5);
    }
    expect((await page.locator('[data-theme-choice="dark"]').boundingBox()).height).toBeGreaterThanOrEqual(43.5);
    expect((await page.locator('#btn-delete-account').boundingBox()).height).toBeGreaterThanOrEqual(43.5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
});

test.describe('P2.8 recurring expenses', () => {
  const rule = (over = {}) => ({ id: 'rule_1', name: 'Hostel rent', amount: 5000, category: 'personal', frequency: 'monthly', startDate: iso(75), active: true, createdAt: 1, ...over });

  test('what has fallen due is added when the app opens, once', async ({ page }) => {
    await openApp(page, { seed: { expensetrack_recurring: [rule()] } });
    await expect(page.locator('#toast-container')).toContainText(/Added \d recurring expense/);
    const rows = await page.evaluate(() => JSON.parse(localStorage.getItem('expensetrack_expenses')));
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.every((r) => r.id.startsWith('rec-rule_1-') && r.note === 'Hostel rent' && r.recurringId === 'rule_1')).toBe(true);
    await page.reload();
    await page.waitForFunction(() => document.getElementById('auth-loading-overlay').style.display === 'none');
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('expensetrack_expenses')).length)).toBe(rows.length);
  });

  test('you can add one from the manage screen and see what it will do first', async ({ page }) => {
    await openApp(page);
    await page.locator('aside nav a[data-path="recurring"]').click();
    await expect(page.locator('#rec-empty')).toBeVisible();
    await page.locator('#rec-add').click();
    await page.locator('#rec-name').fill('Spotify');
    await page.locator('#rec-amount').fill('119');
    await page.locator('#rec-start').fill(iso(40));
    await expect(page.locator('#rec-preview')).toContainText('Every month on the');
    await expect(page.locator('#rec-preview')).toContainText('past date');
    await page.locator('#rec-save').click();
    await expect(page.locator('#recurring-modal')).toBeHidden();
    await expect(page.locator('#rec-list')).toContainText('Spotify');
    await expect(page.locator('#rec-list')).toContainText('₹119');
    await expect(page.locator('#rec-list')).toContainText('Next:');
    const rows = await page.evaluate(() => JSON.parse(localStorage.getItem('expensetrack_expenses')));
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  test('a bad entry is explained inside the dialog', async ({ page }) => {
    await openApp(page);
    await nav(page, 'recurring');
    await page.locator('#rec-add').click();
    await page.locator('#rec-save').click();
    await expect(page.locator('#recurring-modal-error')).toContainText('name');
    await page.locator('#rec-name').fill('Gym');
    await page.locator('#rec-amount').fill('0');
    await page.locator('#rec-save').click();
    await expect(page.locator('#recurring-modal-error')).toContainText('amount');
    await expect(page.locator('#recurring-modal')).toBeVisible();
  });

  test('pause, resume, edit and delete', async ({ page }) => {
    await openApp(page, { seed: { expensetrack_recurring: [rule({ startDate: iso(10), lastGenerated: iso(0) })] } });
    await nav(page, 'recurring');
    await page.locator('[data-action="rec-toggle"]').click();
    await expect(page.locator('#rec-list')).toContainText('Paused');
    await page.locator('[data-action="rec-toggle"]').click();
    await expect(page.locator('#rec-list')).toContainText('Next:');
    await page.locator('[data-action="rec-edit"]').click();
    await page.locator('#rec-amount').fill('5500');
    await page.locator('#rec-save').click();
    await expect(page.locator('#rec-list')).toContainText('₹5,500');
    await page.locator('[data-action="rec-delete"]').click();
    await expect(page.locator('#confirm-modal-title')).toContainText('Hostel rent');
    await page.locator('#confirm-modal-ok').click();
    await expect(page.locator('#rec-empty')).toBeVisible();
  });

  test('it is reachable from Settings and uses names screen readers can read', async ({ page }) => {
    await openApp(page, { seed: { expensetrack_recurring: [rule({ startDate: iso(5), lastGenerated: iso(0) })] } });
    await nav(page, 'profile-&-settings');
    await page.getByRole('button', { name: 'Recurring expenses' }).click();
    await expect(page.locator('#view-recurring')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pause Hostel rent' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete Hostel rent' })).toBeVisible();
  });
});

test.describe('P2.10 savings goals', () => {
  test('create a goal, add money, see the ring move, take money out, and the dashboard shows it', async ({ page }) => {
    await openApp(page);
    await expect(page.locator('#dash-goal-card')).toBeHidden();
    await page.locator('aside nav a[data-path="goals"]').click();
    await expect(page.locator('#goal-empty')).toBeVisible();
    await page.locator('#goal-add').click();
    await page.locator('#goal-name').fill('New laptop');
    await page.locator('#goal-target').fill('60000');
    await page.locator('#goal-save').click();
    await expect(page.locator('#goal-list')).toContainText('New laptop');
    await expect(page.locator('#goal-list [role="img"]')).toHaveAttribute('aria-label', '0% saved');

    await page.locator('[data-action="goal-add-money"]').click();
    await expect(page.locator('#contrib-summary')).toContainText('₹0 of ₹60,000');
    await page.locator('#contrib-amount').fill('15000');
    await page.locator('#contrib-note').fill('Diwali money');
    await page.locator('#contrib-save').click();
    await expect(page.locator('#goal-list [role="img"]')).toHaveAttribute('aria-label', '25% saved');
    await expect(page.locator('#goal-list')).toContainText('₹15,000');
    await expect(page.locator('#goal-list')).toContainText('₹45,000 to go');
    await expect(page.locator('#goal-list')).toContainText('Diwali money');

    await page.locator('[data-action="goal-add-money"]').click();
    await page.locator('[data-contrib-kind="withdraw"]').click();
    await page.locator('#contrib-amount').fill('20000');
    await page.locator('#contrib-save').click();
    await expect(page.locator('#contrib-modal-error')).toContainText("can't take out more");
    await page.locator('#contrib-amount').fill('5000');
    await page.locator('#contrib-save').click();
    await expect(page.locator('#goal-list [role="img"]')).toHaveAttribute('aria-label', '16% saved');

    await nav(page, 'dashboard');
    await expect(page.locator('#dash-goal-card')).toBeVisible();
    await expect(page.locator('#dash-goal-name')).toHaveText('New laptop');
    await expect(page.locator('#dash-goal-text')).toContainText('₹10,000 of ₹60,000 saved');
  });

  test('a goal can be edited, reaches 100%, and can be deleted after a confirmation', async ({ page }) => {
    await openApp(page, { seed: { expensetrack_goals: [{ id: 'g1', name: 'Trip', target: 1000, saved: 900, contributions: [], createdAt: 1 }] } });
    await nav(page, 'goals');
    await page.locator('[data-action="goal-edit"]').click();
    await page.locator('#goal-target').fill('1500');
    await page.locator('#goal-save').click();
    await expect(page.locator('#goal-list')).toContainText('₹1,500');
    await page.locator('[data-action="goal-add-money"]').click();
    await page.locator('#contrib-amount').fill('600');
    await page.locator('#contrib-save').click();
    await expect(page.locator('#goal-list')).toContainText('Goal reached');
    await expect(page.locator('#goal-list [role="img"]')).toHaveAttribute('aria-label', '100% saved');
    await page.locator('[data-action="goal-delete"]').click();
    await page.locator('#confirm-modal-ok').click();
    await expect(page.locator('#goal-empty')).toBeVisible();
  });

  test('a validation message appears in the dialog and a target date in the past is refused', async ({ page }) => {
    await openApp(page);
    await nav(page, 'goals');
    await page.locator('#goal-add').click();
    await page.locator('#goal-save').click();
    await expect(page.locator('#goal-modal-error')).toContainText('name');
    await page.locator('#goal-name').fill('x');
    await page.locator('#goal-target').fill('100');
    await page.locator('#goal-deadline').evaluate((el) => { el.removeAttribute('min'); });
    await page.locator('#goal-deadline').fill('2020-01-01');
    await page.locator('#goal-save').click();
    await expect(page.locator('#goal-modal-error')).toContainText('future');
  });

  test('the Emergency category no longer pretends to be a savings fund', async ({ page }) => {
    await openApp(page);
    await nav(page, 'budget-setup');
    await expect(page.locator('#cat-card-emergency')).not.toContainText(/saved|auto/i);
  });
});

test.describe('P2.9 analytics: last month, six months, projection', () => {
  const data = [
    exp(1, { date: '2026-10-05', amount: 300, category: 'food' }),
    exp(2, { date: '2026-10-18', amount: 200, category: 'food' }),
    exp(3, { date: '2026-10-07', amount: 100, category: 'transport' }),
    exp(4, { date: '2026-09-10', amount: 250, category: 'food' }),
    exp(5, { date: '2026-09-12', amount: 400, category: 'groceries' }),
    exp(6, { date: '2026-07-01', amount: 999, category: 'food' }),
  ];

  test('compares each category with the month before and says who is up and down', async ({ page }) => {
    await page.clock.setFixedTime(FIXED);
    await openApp(page, { seed: { expensetrack_expenses: data } });
    await nav(page, 'analytics');
    const list = page.locator('#analytics-compare-list');
    await expect(page.locator('#analytics-compare-summary')).toContainText('₹600 so far against ₹650 last month: ₹50 less');
    await expect(list).toContainText('Food & Dining');
    await expect(list).toContainText('+₹250 (100%)');
    await expect(list).toContainText('Transport');
    await expect(list).toContainText('+₹100 (new)');
    await expect(list).toContainText('Groceries');
    await expect(list).toContainText('-₹400 (100%)');
  });

  test('draws a six month trend', async ({ page }) => {
    await page.clock.setFixedTime(FIXED);
    await openApp(page, { seed: { expensetrack_expenses: data } });
    await nav(page, 'analytics');
    await page.waitForFunction(() => !!window.ExpenseTrackApp.getState().charts.trend);
    const chart = await page.evaluate(() => ({ labels: window.ExpenseTrackApp.getState().charts.trend.data.labels, data: window.ExpenseTrackApp.getState().charts.trend.data.datasets[0].data }));
    expect(chart.labels).toEqual(['May 26', 'Jun 26', 'Jul 26', 'Aug 26', 'Sep 26', 'Oct 26']);
    expect(chart.data).toEqual([0, 0, 999, 0, 650, 600]);
  });

  test('projects the month-end at the current pace, against the budget, only for the running month', async ({ page }) => {
    await page.clock.setFixedTime(FIXED);
    await openApp(page, { seed: { expensetrack_expenses: data } });
    await nav(page, 'analytics');
    await expect(page.locator('#analytics-projection')).toHaveText('₹930'); // 600 in 20 days = 30 a day, 31 days
    await expect(page.locator('#analytics-projection-note')).toContainText('600 in 20 of 31 days');
    await expect(page.locator('#analytics-projection-cap')).toContainText('₹11,070 under your ₹12,000 budget');
    await page.locator('#analytics-prev-month').click();
    await expect(page.locator('#analytics-projection-card')).toBeHidden();
  });

  test('says so when there is nothing to compare', async ({ page }) => {
    await page.clock.setFixedTime(FIXED);
    await openApp(page, { seed: { expensetrack_expenses: [data[0]] } });
    await nav(page, 'analytics');
    await expect(page.locator('#analytics-compare-summary')).toContainText('nothing to compare');
  });
});

test.describe('P2.11 installable app', () => {
  test('the manifest describes an installable, maskable app with real icons', async ({ page }) => {
    const manifest = await (await page.request.get('/manifest.webmanifest')).json();
    expect(manifest).toMatchObject({ name: 'ExpenseTrack', display: 'standalone', start_url: expect.stringContaining('/'), theme_color: '#006948' });
    const purposes = manifest.icons.map((i) => `${i.sizes}:${i.purpose}`);
    expect(purposes).toEqual(expect.arrayContaining(['192x192:any', '512x512:any', '512x512:maskable']));
    for (const icon of manifest.icons) {
      const buf = await (await page.request.get(icon.src)).body();
      const size = Number(icon.sizes.split('x')[0]);
      expect([buf.readUInt32BE(16), buf.readUInt32BE(20)]).toEqual([size, size]);
    }
    for (const url of ['/', '/login']) {
      const html = await (await page.request.get(url)).text();
      expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest"/>');
      expect(html).toContain('apple-touch-icon');
    }
    const touch = await (await page.request.get('/apple-touch-icon.png')).body();
    expect([touch.readUInt32BE(16), touch.readUInt32BE(20)]).toEqual([180, 180]);
  });

  test('the service worker is served fresh and stamped with a build id', async ({ page }) => {
    const res = await page.request.get('/sw.js');
    expect(res.headers()['cache-control']).toContain('no-cache');
    const text = await res.text();
    expect(text).not.toContain('__BUILD_ID__');
    expect(text).toMatch(/["'][0-9a-f]{12}["']/);
  });

  test('Settings offers to install when the browser says it can, and uses the saved prompt', async ({ page }) => {
    await openApp(page);
    await nav(page, 'profile-&-settings');
    await expect(page.locator('#install-card')).toBeHidden();
    await page.evaluate(() => {
      window.__installPrompt = { prompt() { window.__prompted = true; }, userChoice: Promise.resolve({ outcome: 'accepted' }) };
      window.dispatchEvent(new Event('expensetrack:installable'));
    });
    await expect(page.locator('#install-card')).toBeVisible();
    await page.locator('#btn-install').click();
    await expect.poll(() => page.evaluate(() => window.__prompted)).toBe(true);
    await expect(page.locator('#install-card')).toBeHidden();
  });

  test('a waiting update is offered with a Reload button', async ({ page }) => {
    await openApp(page);
    let applied = false;
    await page.exposeFunction('markApplied', () => { applied = true; });
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('expensetrack:update', { detail: { apply: () => window.markApplied() } })));
    await expect(page.locator('#toast-container')).toContainText('new version');
    await page.locator('#toast-container button', { hasText: 'Reload' }).click();
    await expect.poll(() => applied).toBe(true);
  });

  test.describe('with the worker running', () => {
    test.use({ serviceWorkers: 'allow' });

    test('it caches the app and opens it with the network off', async ({ page, context }) => {
      test.setTimeout(60000);
      await page.goto('/login');
      await page.evaluate(() => navigator.serviceWorker.ready);
      await expect.poll(() => page.evaluate(async () => (await caches.keys()).some((k) => k.startsWith('expensetrack-shell-')))).toBe(true);
      await expect.poll(() => page.evaluate(async () => !!(await caches.match('/app.js')) && !!(await caches.match('/dist/styles.css')) && !!(await caches.match('/login')))).toBe(true);

      await context.setOffline(true);
      await page.reload();
      await expect(page.locator('h1')).toContainText('Welcome to ExpenseTrack');
      await context.setOffline(false);
    });
  });
});

test.describe('P2.13 delete my account', () => {
  const fsSeed = {
    'users/test-uid': { budget: { overallCap: 12000, categories: {} }, settings: {}, customCategories: {}, updatedAt: 1 },
    'users/test-uid/expenses/e1': { amount: 10, category: 'food', date: iso(1), note: 'a', createdAt: 1 },
    'users/test-uid/expenses/e2': { amount: 20, category: 'food', date: iso(2), note: 'b', createdAt: 2 },
    'users/test-uid/goals/g1': { name: 'Trip', target: 100, saved: 0, createdAt: 1 },
    'users/test-uid/recurring/r1': { name: 'Rent', amount: 5, category: 'food', frequency: 'monthly', startDate: iso(1), active: true, lastGenerated: iso(0), createdAt: 1 },
  };

  test('asks you to confirm, removes the data, then the sign-in, then leaves', async ({ page }) => {
    await openApp(page, { useFirestore: true, fsSeed });
    await nav(page, 'profile-&-settings');
    await page.locator('#btn-delete-account').click();
    await expect(page.locator('#confirm-modal-title')).toHaveText('Delete your account?');
    await expect(page.locator('#confirm-modal-ok')).toBeDisabled();
    await page.locator('#confirm-modal-input').fill('DELETE');
    await page.locator('#confirm-modal-ok').click();
    await page.waitForURL(/\/login(\.html)?$/);
    const flags = await page.evaluate(() => ({
      reauth: sessionStorage.getItem('__reauth'),
      deleted: sessionStorage.getItem('__userDeleted'),
      keys: JSON.parse(sessionStorage.getItem('__keysAtDelete')),
      cache: sessionStorage.getItem('__fsCalls'),
    }));
    expect(flags.reauth).toBe('1'); // the person was asked to confirm first
    expect(flags.deleted).toBe('1');
    expect(flags.keys).toEqual([]); // every document was gone before the sign-in was removed
    expect(flags.cache).toContain('terminate');
  });

  test('if you cancel the Google confirmation, nothing at all is deleted', async ({ page }) => {
    await openApp(page, { useFirestore: true, fsSeed });
    await page.evaluate(() => { window.__reauthError = 'auth/popup-closed-by-user'; });
    await nav(page, 'profile-&-settings');
    await page.locator('#btn-delete-account').click();
    await page.locator('#confirm-modal-input').fill('DELETE');
    await page.locator('#confirm-modal-ok').click();
    await expect(page.locator('#toast-container')).toContainText('Nothing was deleted');
    expect(await page.evaluate(() => window.__db._store.size)).toBe(5);
    expect(await page.evaluate(() => sessionStorage.getItem('__userDeleted'))).toBeNull();
    await expect(page.locator('#btn-delete-account')).toBeEnabled();
  });

  test('cancelling the first dialog does nothing', async ({ page }) => {
    await openApp(page, { useFirestore: true, fsSeed });
    await nav(page, 'profile-&-settings');
    await page.locator('#btn-delete-account').click();
    await page.locator('#confirm-modal-cancel').click();
    expect(await page.evaluate(() => window.__db._store.size)).toBe(5);
  });
});
