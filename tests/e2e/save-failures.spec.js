const { test, expect } = require('@playwright/test');
const { openApp } = require('./fixtures');

const failWrites = (page) => page.evaluate(() => { window.__db.failWrites = new Error('Missing or insufficient permissions.'); });

async function quickLog(page, amount) {
  await page.evaluate(() => window.ExpenseTrackApp.openAddExpenseModal());
  await page.locator('#expense-amount').fill(String(amount));
  await page.locator('#expense-modal-submit').click();
}

test.describe('B4: the UI reports failed saves instead of success', () => {
  test('a successful expense shows the success toast and is stored', async ({ page }) => {
    await openApp(page, { useFirestore: true });
    await quickLog(page, 75);
    await expect(page.locator('#toast-container')).toContainText('logged successfully');
    await expect(page.locator('#expense-modal')).toBeHidden();
    expect(await page.evaluate(() => [...window.__db._store.keys()].filter((k) => k.includes('/expenses/')).length)).toBe(1);
  });

  test('a failed expense save shows an error, keeps the modal open and adds nothing', async ({ page }) => {
    await openApp(page, { useFirestore: true });
    await failWrites(page);
    await quickLog(page, 75);
    await expect(page.locator('#toast-container')).toContainText(/couldn.?t save/i);
    await expect(page.locator('#toast-container')).toContainText(/don't have permission/i); // not the raw Firebase text
    await expect(page.locator('#toast-container')).not.toContainText(/insufficient permissions|permission-denied/i);
    await expect(page.locator('#toast-container')).not.toContainText('logged successfully');
    await expect(page.locator('#expense-modal')).toBeVisible();
    expect(await page.evaluate(() => window.ExpenseTrackApp.getExpenses().length)).toBe(0);
    await expect(page.locator('#dash-transactions-list')).toBeEmpty();
  });

  test('a failed budget save shows an error and restores the old cap', async ({ page }) => {
    await openApp(page, { useFirestore: true });
    await failWrites(page);
    await page.evaluate(() => window.ExpenseTrackApp.openBudgetModal());
    await page.locator('#overall-cap-input').fill('20000');
    await page.locator('#save-budget-modal').click();
    await expect(page.locator('#toast-container')).toContainText(/couldn.?t save/i);
    await expect(page.locator('#dash-budget-cap')).toHaveText('₹12,000');
  });

  test('a failed category save shows the error inside the modal', async ({ page }) => {
    await openApp(page, { useFirestore: true });
    await failWrites(page);
    await page.evaluate(() => window.ExpenseTrackApp.openAddCustomCategoryModal());
    await page.locator('#custom-category-name').fill('Gym');
    await page.locator('#custom-category-cap').fill('500');
    await page.locator('#custom-category-form button[type="submit"]').click();
    await expect(page.locator('#custom-category-error-text')).toContainText(/don't have permission/i);
    await expect(page.locator('#custom-category-modal')).toBeVisible();
  });

  test('a failed delete keeps the expense and shows an error', async ({ page }) => {
    await openApp(page, { useFirestore: true });
    await quickLog(page, 40);
    await expect(page.locator('#expense-modal')).toBeHidden();
    await failWrites(page);
    page.once('dialog', (d) => d.accept());
    await page.locator('#dash-transactions-list [aria-label="Delete Expense"]').click();
    await expect(page.locator('#toast-container')).toContainText(/couldn.?t delete/i);
    expect(await page.evaluate(() => window.ExpenseTrackApp.getExpenses().length)).toBe(1);
  });

  test('offline: the save is accepted and the toast says it will sync later', async ({ page, context }) => {
    await openApp(page, { useFirestore: true });
    await page.evaluate(() => { window.__db.hang = true; });
    await context.setOffline(true);
    await quickLog(page, 15);
    await expect(page.locator('#toast-container')).toContainText(/offline/i);
    await expect(page.locator('#expense-modal')).toBeHidden();
  });
});
