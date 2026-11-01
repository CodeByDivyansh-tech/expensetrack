const { test, expect } = require('@playwright/test');
const { openApp, todayLocal } = require('./fixtures');

const nav = (page, view) => page.evaluate((v) => window.ExpenseTrackApp.navigateTo(v), view);
const incomeDocs = (page) => page.evaluate(() => [...window.__db._store.entries()].filter(([k]) => k.includes('/income/')).map(([, v]) => v));
const seed = (extra = {}) => ({
  useFirestore: true,
  fsSeed: {
    'users/test-uid': { budget: { overallCap: 12000, categories: {} }, settings: {}, customCategories: {}, legacyImportHandled: true, updatedAt: 1 },
    'users/test-uid/expenses/e1': { id: 'e1', amount: 1200, category: 'food', date: todayLocal(), note: 'Mess fee', createdAt: 1 },
    ...extra,
  },
});

test.describe('money received', () => {
  test('log allowance from the dashboard; the card shows received, spent and what is left', async ({ page }) => {
    await openApp(page, seed());
    await expect(page.locator('#dash-income-received')).toHaveText('₹0');
    await expect(page.locator('#dash-income-spent')).toHaveText('₹1,200');
    await page.locator('#dash-income-add').click();
    await expect(page.locator('#income-modal')).toBeVisible();
    await expect(page.locator('[data-income-source="parents"]')).toHaveAttribute('aria-pressed', 'true');
    await page.fill('#income-amount', '5000');
    await page.fill('#income-from', 'Papa');
    await page.locator('[data-income-pay="UPI"]').click();
    await page.fill('#income-note', 'November allowance');
    await page.locator('#income-save').click();
    await expect(page.locator('#income-modal')).toBeHidden();
    const [doc] = await incomeDocs(page);
    expect(doc).toMatchObject({ amount: 5000, source: 'parents', from: 'Papa', paymentMethod: 'UPI', note: 'November allowance', date: todayLocal() });
    await expect(page.locator('#dash-income-received')).toHaveText('₹5,000');
    await expect(page.locator('#dash-income-balance')).toHaveText('₹3,800');
    await expect(page.locator('#dash-income-balance-label')).toHaveText('Left');
  });

  test('the Money received page lists entries by month with a breakdown by source', async ({ page }) => {
    await openApp(page, seed({
      'users/test-uid/income/a': { id: 'a', amount: 5000, source: 'parents', from: 'Papa', date: todayLocal(), createdAt: 2 },
      'users/test-uid/income/b': { id: 'b', amount: 1500.5, source: 'scholarship', date: todayLocal(), createdAt: 1 },
    }));
    await page.locator('aside [data-path="income"]').click();
    await expect(page.locator('#view-income h1')).toHaveText('Money received');
    await expect(page.locator('#income-total-received')).toHaveText('₹6,500.50');
    await expect(page.locator('#income-total-balance')).toHaveText('₹5,300.50');
    await expect(page.locator('#income-source-list')).toContainText('Parents / family');
    await expect(page.locator('#income-source-list')).toContainText('Scholarship');
    await expect(page.locator('#income-list')).toContainText('Parents / family · Papa');
    await expect(page.locator('#income-empty')).toBeHidden();
  });

  test('edit keeps the id; delete offers Undo', async ({ page }) => {
    await openApp(page, seed({ 'users/test-uid/income/a': { id: 'a', amount: 5000, source: 'parents', date: todayLocal(), createdAt: 1 } }));
    await nav(page, 'income');
    await page.locator('[data-action="income-edit"][data-id="a"]').click();
    await expect(page.locator('#income-amount')).toHaveValue('5000');
    await page.fill('#income-amount', '6000');
    await page.locator('[data-income-source="gift"]').click();
    await page.locator('#income-save').click();
    await expect.poll(async () => (await incomeDocs(page))[0]).toMatchObject({ id: 'a', amount: 6000, source: 'gift' });
    await page.locator('[data-action="income-delete"][data-id="a"]').click();
    await expect.poll(async () => (await incomeDocs(page)).length).toBe(0);
    await page.locator('#toast-container button', { hasText: 'Undo' }).click();
    await expect.poll(async () => (await incomeDocs(page)).map((d) => d.id)).toEqual(['a']);
  });

  test('bad input is refused in the form with a plain message', async ({ page }) => {
    await openApp(page, seed());
    await page.evaluate(() => window.ExpenseTrackApp.openIncomeModal());
    await page.fill('#income-amount', '0');
    await page.locator('#income-save').click();
    await expect(page.locator('#income-modal-error')).toContainText('greater than');
    expect(await incomeDocs(page)).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(page.locator('#income-modal')).toBeHidden();
  });

  test('spending more than received shows "Over by" in red', async ({ page }) => {
    await openApp(page, seed({ 'users/test-uid/income/a': { id: 'a', amount: 500, source: 'gift', date: todayLocal(), createdAt: 1 } }));
    await expect(page.locator('#dash-income-balance-label')).toHaveText('Over by');
    await expect(page.locator('#dash-income-balance')).toHaveText('₹700');
    await expect(page.locator('#dash-income-balance')).toHaveClass(/text-error/);
  });

  test('if the database rules refuse money received, expenses still work and the page explains', async ({ page }) => {
    await openApp(page, { ...seed(), denyPaths: ['/income(/|$)'] });
    await expect(page.locator('#dash-income-spent')).toHaveText('₹1,200');
    await nav(page, 'income');
    await expect(page.locator('#income-sync-error')).toBeVisible();
    await expect(page.locator('#income-sync-error')).toContainText('database rules');
  });

  test('user text is shown as text, never run', async ({ page }) => {
    await openApp(page, seed({ 'users/test-uid/income/x': { id: 'x', amount: 1, source: 'gift', from: '<img src=x onerror=window.__x=1>', note: '<svg onload=window.__x=2>', date: todayLocal(), createdAt: 1 } }));
    await nav(page, 'income');
    await expect(page.locator('#income-list')).toContainText('<img src=x');
    expect(await page.evaluate(() => window.__x)).toBeUndefined();
  });
});
