const { test, expect } = require('@playwright/test');
const { openApp, todayLocal } = require('./fixtures');

// Guards for the mobile performance work: what made phones lag must not come back.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const account = (n = 40) => {
  const fsSeed = { 'users/test-uid': { budget: { overallCap: 12000, categories: {} }, settings: {}, customCategories: {}, legacyImportHandled: true, updatedAt: 1 } };
  for (let i = 0; i < n; i++) fsSeed[`users/test-uid/expenses/e${i}`] = { id: 'e' + i, amount: 10 + i, category: 'food', date: todayLocal(), note: 'Item ' + i, createdAt: i };
  return { useFirestore: true, fsSeed };
};

test.describe('mobile performance', () => {
  test('a returning visitor sees the dashboard from the saved copy, with no server reads first', async ({ page }) => {
    await openApp(page, account());
    expect(await page.evaluate(() => window.ExpenseTrackDataLayer.wasLoadedFromCache())).toBe(true);
    expect(await page.evaluate(() => window.__db.serverReads)).toBe(0);
    await expect(page.locator('#dash-total-spent')).not.toHaveText('₹0');
  });

  test('a burst of updates from another device draws the screen once', async ({ page }) => {
    await openApp(page, account());
    const before = await page.evaluate(() => window.ExpenseTrackApp.getState().renderCounts.dashboard);
    await page.evaluate(async (date) => {
      const col = window.__db.collection('users').doc('test-uid').collection('expenses');
      for (let i = 0; i < 15; i++) await col.doc('r' + i).set({ id: 'r' + i, amount: 5, category: 'food', date, note: 'sync', createdAt: 100 + i });
    }, todayLocal());
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => window.ExpenseTrackApp.getState().renderCounts.dashboard);
    expect(after - before).toBeLessThanOrEqual(2);
  });

  test('a notification that changes nothing does not redraw', async ({ page }) => {
    await openApp(page, account());
    await page.waitForTimeout(300);
    const before = await page.evaluate(() => window.ExpenseTrackApp.getState().renderCounts.dashboard);
    await page.evaluate(() => window.__db.collection('users').doc('test-uid').collection('expenses').doc('e1').set({}, { merge: true }));
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.ExpenseTrackApp.getState().renderCounts.dashboard)).toBe(before);
  });

  test('editing an expense updates the month total straight away', async ({ page }) => {
    await openApp(page, account(1));
    await expect(page.locator('#dash-total-spent')).toHaveText('₹10');
    await page.evaluate(() => window.ExpenseTrackApp.openEditExpenseModal('e0'));
    await page.fill('#expense-amount', '250');
    await page.locator('#expense-modal-submit').click();
    await expect(page.locator('#dash-total-spent')).toHaveText('₹250');
  });

  test('no live blur on cards, no endless animations, nothing wider than the screen', async ({ page }) => {
    await openApp(page, account());
    for (const view of ['dashboard', 'transactions', 'income', 'budget-setup', 'goals', 'recurring', 'profile-&-settings']) {
      await page.evaluate((v) => window.ExpenseTrackApp.navigateTo(v), view);
      await page.waitForTimeout(700);
      const r = await page.evaluate(() => ({
        blurredCards: [...document.querySelectorAll('main *')].filter((e) => e.getClientRects().length && (getComputedStyle(e).backdropFilter || 'none') !== 'none').length,
        endless: document.getAnimations().filter((a) => a.effect && a.effect.getTiming().iterations === Infinity && !/pulse|spin|skel/.test(a.animationName || '')).map((a) => a.animationName),
        overflow: document.scrollingElement.scrollWidth - window.innerWidth,
      }));
      expect(r, view).toEqual({ blurredCards: 0, endless: [], overflow: 0 });
    }
  });

  test('controls are big enough to tap', async ({ page }) => {
    await openApp(page, account());
    for (const view of ['dashboard', 'budget-setup', 'profile-&-settings']) {
      await page.evaluate((v) => window.ExpenseTrackApp.navigateTo(v), view);
      const small = await page.evaluate(() => [...document.querySelectorAll('main .tap, header .tap')].filter((e) => e.getClientRects().length).map((e) => e.getBoundingClientRect()).filter((r) => r.height < 44).length);
      expect(small, view).toBe(0);
    }
  });
});
