const { test, expect } = require('@playwright/test');
const { openApp, todayLocal } = require('./fixtures');

const DEFAULT_CAPS = { food: 3500, groceries: 2000, transport: 1000, textbooks: 1200, entertainment: 1500, personal: 600, emergency: 1200 };

function monthsAgo(n) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-15`;
}

async function logExpense(page, { amount, date, note }) {
  await page.evaluate(() => window.ExpenseTrackApp.openAddExpenseModal());
  await page.locator('#expense-amount').fill(String(amount));
  if (date) await page.locator('#expense-date').fill(date);
  if (note) await page.locator('#expense-note').fill(note);
  await page.locator('#expense-modal-submit').click();
}

test.describe('B5: decimal amounts', () => {
  test('49.50 is stored and shown as 49.50, and can be edited to another decimal', async ({ page }) => {
    await openApp(page);
    await logExpense(page, { amount: '49.50' });
    await expect(page.locator('#dash-total-spent')).toHaveText('₹49.50');
    let stored = await page.evaluate(() => JSON.parse(localStorage.getItem('expensetrack_expenses')));
    expect(stored[0].amount).toBe(49.5);

    await page.locator('#dash-transactions-list [aria-label="Edit Expense"]').click();
    await page.locator('#expense-amount').fill('80.25');
    await page.locator('#expense-modal-submit').click();
    await expect(page.locator('#dash-total-spent')).toHaveText('₹80.25');
    stored = await page.evaluate(() => JSON.parse(localStorage.getItem('expensetrack_expenses')));
    expect(stored[0].amount).toBe(80.25);
  });

  test('whole amounts show no decimals and totals do not drift', async ({ page }) => {
    await openApp(page);
    await logExpense(page, { amount: '0.10' });
    await logExpense(page, { amount: '0.20' });
    await expect(page.locator('#dash-total-spent')).toHaveText('₹0.30');
  });
});

test.describe('B6: monthly cap modal', () => {
  const openModal = (page) => page.evaluate(() => window.ExpenseTrackApp.openBudgetModal());

  for (const [label, value, message] of [['zero', '0', /between/], ['a decimal', '12.5', /whole rupees/], ['too small', '100', /between/], ['too large', '2000000', /between/]]) {
    test(`${label} shows an inline error and saves nothing`, async ({ page }) => {
      await openApp(page);
      await openModal(page);
      await page.locator('#overall-cap-input').fill(value);
      await page.locator('#save-budget-modal').click();
      await expect(page.locator('#overall-cap-error')).toBeVisible();
      await expect(page.locator('#overall-cap-error')).toHaveText(message);
      await expect(page.locator('#budget-modal')).toBeVisible();
      expect(await page.evaluate(() => localStorage.getItem('expensetrack_budget'))).toBeNull();
      await expect(page.locator('#dash-budget-cap')).toHaveText('₹12,000');
    });
  }

  test('a valid cap is saved and survives a reload', async ({ page }) => {
    await openApp(page);
    await openModal(page);
    await page.locator('#overall-cap-input').fill('20000');
    await page.locator('#save-budget-modal').click();
    await expect(page.locator('#budget-modal')).toBeHidden();
    await expect(page.locator('#dash-budget-cap')).toHaveText('₹20,000');
    await page.reload();
    await page.waitForFunction(() => document.getElementById('auth-loading-overlay').style.display === 'none');
    await expect(page.locator('#dash-budget-cap')).toHaveText('₹20,000');
  });
});

test.describe('B7: archived categories and allocation', () => {
  test('an archived category with a cap does not add to the allocated total', async ({ page }) => {
    await openApp(page, {
      seed: {
        expensetrack_budget: { overallCap: 12000, categories: { ...DEFAULT_CAPS, custom_9: 2000 } },
        expensetrack_custom_categories: {
          custom_9: { id: 'custom_9', name: 'Old Hobby', icon: 'home', color: '#006948', defaultCap: 2000, isDefault: false, isArchived: true },
        },
      },
    });
    await page.evaluate(() => window.ExpenseTrackApp.navigateTo('budget-setup'));
    await expect(page.locator('#total-allocated-val')).toHaveText('11,000');
  });
});

test.describe('B9: numbers that agree with each other', () => {
  test('with only older expenses, the dashboard does not claim a leader at ₹0', async ({ page }) => {
    await openApp(page, {
      seed: { expensetrack_expenses: [{ id: 'e1', amount: 500, category: 'food', date: monthsAgo(2), note: 'old', createdAt: 1 }] },
    });
    const insight = page.locator('#dash-spending-insight');
    await expect(insight).toContainText('Nothing logged this month');
    await expect(insight).not.toContainText('leads your spending');
  });

  test('the profile labels say what each number covers', async ({ page }) => {
    await openApp(page, {
      seed: {
        expensetrack_expenses: [
          { id: 'e1', amount: 500, category: 'food', date: monthsAgo(2), note: 'old', createdAt: 1 },
          { id: 'e2', amount: 60, category: 'food', date: todayLocal(), note: 'now', createdAt: 2 },
        ],
      },
    });
    await page.evaluate(() => window.ExpenseTrackApp.navigateTo('profile-&-settings'));
    const view = page.locator('#view-profile-\\&-settings');
    await expect(view).toContainText('Spent This Month');
    await expect(view).toContainText('Records (all time)');
    await expect(page.locator('#profile-total-spent')).toHaveText('₹60');
    await expect(page.locator('#profile-tx-count')).toHaveText('2 Records');
  });

  test('analytics cannot move past the current month', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => window.ExpenseTrackApp.navigateTo('analytics'));
    await expect(page.locator('#analytics-next-month')).toBeDisabled();
    const label = await page.locator('#analytics-month-label').textContent();
    await page.locator('#analytics-next-month').click({ force: true });
    await expect(page.locator('#analytics-month-label')).toHaveText(label);
    await page.locator('#analytics-prev-month').click();
    await expect(page.locator('#analytics-next-month')).toBeEnabled();
  });

  test('daily average for the current month is per day so far, and says so', async ({ page }) => {
    await openApp(page, {
      seed: { expensetrack_expenses: [{ id: 'e2', amount: 60, category: 'food', date: todayLocal(), note: 'now', createdAt: 2 }] },
    });
    await page.evaluate(() => window.ExpenseTrackApp.navigateTo('analytics'));
    const day = new Date().getDate();
    const expected = await page.evaluate((d) => `₹${window.BudgetCalculator.formatINR(60 / d)} / day`, day);
    await expect(page.locator('#analytics-daily-avg')).toHaveText(expected);
    await expect(page.locator('#analytics-daily-avg-note')).toContainText('so far');
  });

  test('weekly chart buckets are dated and at most seven days', async ({ page }) => {
    await openApp(page, {
      seed: { expensetrack_expenses: [{ id: 'e2', amount: 60, category: 'food', date: todayLocal(), note: 'now', createdAt: 2 }] },
    });
    await page.evaluate(() => window.ExpenseTrackApp.navigateTo('analytics'));
    await page.waitForFunction(() => !!window.ExpenseTrackApp.getState().charts.monthlyBar);
    const labels = await page.evaluate(() => window.ExpenseTrackApp.getState().charts.monthlyBar.data.labels);
    expect(labels.length).toBeGreaterThanOrEqual(4);
    // calendar weeks from the chosen first day (Monday by default): the first block starts on the 1st and may be short
    expect(labels[0]).toMatch(/^1(–\d+)? [A-Z][a-z]{2}$/);
  });
});

test.describe('B10: emergency fund copy', () => {
  test('does not claim money is auto-saved or saved on the device', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => window.ExpenseTrackApp.navigateTo('budget-setup'));
    const card = page.locator('#cat-card-emergency');
    await expect(card).not.toContainText('Auto-Saved');
    await expect(card).not.toContainText('saved on this device');
    await expect(card).toContainText('spent from this fund this month');
  });
});

test.describe('B11: dates and limits in the expense form', () => {
  test('the date picker stops at today and the note is limited to 100 characters', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => window.ExpenseTrackApp.openAddExpenseModal());
    await expect(page.locator('#expense-date')).toHaveAttribute('max', todayLocal());
    await expect(page.locator('#expense-note')).toHaveAttribute('maxlength', '100');
  });

  test('a future date is rejected with a message and nothing is stored', async ({ page }) => {
    await openApp(page);
    await logExpense(page, { amount: 50, date: '2030-01-01' });
    await expect(page.locator('#expense-form-error')).toBeVisible();
    await expect(page.locator('#expense-form-error-text')).toContainText('future');
    await expect(page.locator('#expense-modal')).toBeVisible();
    expect(await page.evaluate(() => window.ExpenseTrackApp.getExpenses().length)).toBe(0);
  });

  test('an amount above ₹10,00,000 is rejected', async ({ page }) => {
    await openApp(page);
    await logExpense(page, { amount: 2000000 });
    await expect(page.locator('#expense-form-error-text')).toContainText('10,00,000');
    expect(await page.evaluate(() => window.ExpenseTrackApp.getExpenses().length)).toBe(0);
  });
});
