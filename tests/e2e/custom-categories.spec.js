const { test, expect } = require('@playwright/test');
const { openApp, todayLocal } = require('./fixtures');

const goBudget = (page) => page.locator('aside nav a[data-path="budget-setup"]').click();

test.describe('B1: add / edit custom category through the real form', () => {
  test('saving a new category closes the modal, shows a toast and keeps the cap', async ({ page }) => {
    await openApp(page);
    await goBudget(page);
    await page.locator('#btn-budget-add-category').click();
    await page.locator('#custom-category-name').fill('Gym');
    await page.locator('#custom-category-cap').fill('1500');
    await page.locator('#custom-category-form button[type="submit"]').click();

    await expect(page.locator('#custom-category-modal')).toBeHidden();
    await expect(page.locator('#toast-container')).toContainText('Gym');
    const cats = await page.evaluate(() => JSON.parse(localStorage.getItem('expensetrack_custom_categories')));
    const budget = await page.evaluate(() => JSON.parse(localStorage.getItem('expensetrack_budget')));
    const id = Object.keys(cats)[0];
    expect(cats[id].name).toBe('Gym');
    expect(budget.categories[id]).toBe(1500);
  });

  test('a duplicate name shows the validation message inside the modal', async ({ page }) => {
    await openApp(page);
    await goBudget(page);
    await page.locator('#btn-budget-add-category').click();
    await page.locator('#custom-category-name').fill('Groceries');
    await page.locator('#custom-category-cap').fill('100');
    await page.locator('#custom-category-form button[type="submit"]').click();
    await expect(page.locator('#custom-category-error')).toBeVisible();
    await expect(page.locator('#custom-category-error-text')).toContainText('already exists');
    await expect(page.locator('#custom-category-modal')).toBeVisible();
  });

  test('editing a category updates its name and cap', async ({ page }) => {
    await openApp(page);
    await goBudget(page);
    await page.locator('#btn-budget-add-category').click();
    await page.locator('#custom-category-name').fill('Gym');
    await page.locator('#custom-category-cap').fill('1500');
    await page.locator('#custom-category-form button[type="submit"]').click();
    await expect(page.locator('#custom-category-modal')).toBeHidden();

    await page.locator('#custom-category-cards-container [aria-label="Edit Category"]').click();
    await page.locator('#custom-category-name').fill('Gym & Pool');
    await page.locator('#custom-category-cap').fill('2000');
    await page.locator('#custom-category-form button[type="submit"]').click();
    await expect(page.locator('#custom-category-modal')).toBeHidden();

    await expect(page.locator('#custom-category-cards-container')).toContainText('Gym & Pool');
    const cats = await page.evaluate(() => JSON.parse(localStorage.getItem('expensetrack_custom_categories')));
    const budget = await page.evaluate(() => JSON.parse(localStorage.getItem('expensetrack_budget')));
    const id = Object.keys(cats)[0];
    expect(cats[id].name).toBe('Gym & Pool');
    expect(budget.categories[id]).toBe(2000);
  });
});

test.describe('B2: custom categories appear on Budget Setup', () => {
  test('a new category gets a card with its cap', async ({ page }) => {
    await openApp(page);
    await goBudget(page);
    await page.locator('#btn-budget-add-category').click();
    await page.locator('#custom-category-name').fill('Laundry');
    await page.locator('#custom-category-cap').fill('400');
    await page.locator('#custom-category-form button[type="submit"]').click();
    const card = page.locator('#custom-category-cards-container > div');
    await expect(card).toHaveCount(1);
    await expect(card).toContainText('Laundry');
    await expect(card).toContainText('400');
  });

  test('a category saved in the old format (no isCustom flag) is shown', async ({ page }) => {
    await openApp(page, {
      seed: {
        expensetrack_custom_categories: {
          custom_1700000000000_1: {
            id: 'custom_1700000000000_1', name: 'Legacy Rent', icon: 'home', color: '#006948',
            iconBgClass: 'bg-surface-container text-primary', badgeBgClass: 'bg-primary-fixed text-on-primary-fixed',
            desc: 'Custom category', defaultCap: 5000, minCap: 100, maxCap: 10000, step: 50,
            isDefault: false, isArchived: false,
          },
        },
      },
    });
    await goBudget(page);
    await expect(page.locator('#custom-category-cards-container')).toContainText('Legacy Rent');
  });

  test('an archived category is not shown as an active card', async ({ page }) => {
    await openApp(page, {
      seed: {
        expensetrack_custom_categories: {
          custom_9: { id: 'custom_9', name: 'Old Hobby', icon: 'home', color: '#006948', defaultCap: 100, isDefault: false, isArchived: true },
        },
      },
    });
    await goBudget(page);
    await expect(page.locator('#custom-category-cards-container')).not.toContainText('Old Hobby');
  });
});

test.describe('B3: stored XSS through category and expense fields', () => {
  const payload = '<img src=x onerror=window.__xss=1>';
  const seed = {
    expensetrack_custom_categories: {
      custom_evil: {
        id: 'custom_evil', name: payload, icon: `x"><img src=x onerror=window.__xss=1>`, color: '#006948',
        iconBgClass: `x"><img src=x onerror=window.__xss=1>`, badgeBgClass: 'x', desc: payload,
        defaultCap: 500, minCap: 100, maxCap: 1000, step: 50, isDefault: false, isArchived: false,
      },
    },
    expensetrack_expenses: [
      { id: 'exp-1', amount: 10, category: 'custom_evil', date: todayLocal(), note: payload, createdAt: 1 },
      { id: 'exp-2', amount: 20, category: payload, date: todayLocal(), note: 'odd', createdAt: 2 },
    ],
  };

  for (const view of ['dashboard', 'budget-setup', 'analytics', 'profile-&-settings']) {
    test(`no script runs on ${view}`, async ({ page }) => {
      await openApp(page, { seed });
      await page.evaluate((v) => window.ExpenseTrackApp.navigateTo(v), view);
      await page.waitForTimeout(150);
      expect(await page.evaluate(() => window.__xss)).toBeUndefined();
      expect(await page.locator('img[src="x"]').count()).toBe(0);
    });
  }

  test('no script runs in the Quick Log chips or the edit modal', async ({ page }) => {
    await openApp(page, { seed });
    await page.evaluate(() => window.ExpenseTrackApp.openAddExpenseModal());
    await page.evaluate(() => window.ExpenseTrackApp.openEditExpenseModal('exp-1'));
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  });

  test('the category name is shown as text', async ({ page }) => {
    await openApp(page, { seed });
    await expect(page.locator('#dash-transactions-list')).toContainText(payload);
  });
});
