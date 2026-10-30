const fs = require('fs');
const { test, expect } = require('@playwright/test');
const { openApp, todayLocal } = require('./fixtures');

const nav = (page, view) => page.evaluate((v) => window.ExpenseTrackApp.navigateTo(v), view);
const iso = (daysAgo) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const exp = (n, extra = {}) => ({ id: `s-${n}`, amount: 10 + n, category: 'food', date: iso(0), note: `Item ${String(n).padStart(3, '0')}`, createdAt: n, ...extra });
const many = (count) => Array.from({ length: count }, (_, i) => exp(i + 1, { date: iso(i * 2), category: ['food', 'groceries', 'transport'][i % 3], paymentMethod: ['UPI', 'Cash', 'Card'][i % 3] }));
const rowCount = (page) => page.locator('#tx-list [data-action="edit-expense"]').count();

test.describe('P1.2 payment method and remembered choices', () => {
  test('UPI is the default, the choice is saved and shown, and is remembered next time', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => window.ExpenseTrackApp.openAddExpenseModal());
    await expect(page.locator('[data-payment="UPI"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#expense-amount').fill('80');
    await page.locator('[data-payment="Cash"]').click();
    await expect(page.locator('[data-payment="UPI"]')).toHaveAttribute('aria-pressed', 'false');
    await page.locator('#quick-log-category-container [data-category="groceries"]').click();
    await page.locator('#expense-modal-submit').click();
    await expect(page.locator('#dash-transactions-list')).toContainText('Cash');
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('expensetrack_expenses')));
    expect(stored[0].paymentMethod).toBe('Cash');

    await page.evaluate(() => window.ExpenseTrackApp.openAddExpenseModal());
    await expect(page.locator('[data-payment="Cash"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#quick-log-category-container [data-category="groceries"]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('pressing the chosen method again saves the expense without one', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => window.ExpenseTrackApp.openAddExpenseModal());
    await page.locator('#expense-amount').fill('15');
    await page.locator('[data-payment="UPI"]').click();
    await expect(page.locator('[data-payment="UPI"]')).toHaveAttribute('aria-pressed', 'false');
    await page.locator('#expense-modal-submit').click();
    await expect(page.locator('#dash-transactions-list')).toContainText('₹15');
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('expensetrack_expenses')));
    expect('paymentMethod' in stored[0]).toBe(false);
  });

  test('an older expense with no method opens with none selected and stays that way', async ({ page }) => {
    await openApp(page, { seed: { expensetrack_expenses: [exp(1)] } });
    await page.locator('#dash-transactions-list [aria-label="Edit Expense"]').click();
    for (const m of ['UPI', 'Cash', 'Card', 'Wallet', 'Other']) {
      await expect(page.locator(`[data-payment="${m}"]`)).toHaveAttribute('aria-pressed', 'false');
    }
    await page.locator('#expense-amount').fill('99');
    await page.locator('#expense-modal-submit').click();
    await expect(page.locator('#dash-transactions-list')).toContainText('₹99');
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('expensetrack_expenses')));
    expect('paymentMethod' in stored[0]).toBe(false);
  });

  test('dates read as Today, Yesterday or 30 Oct 2026', async ({ page }) => {
    await openApp(page, { seed: { expensetrack_expenses: [exp(1, { date: iso(0) }), exp(2, { date: iso(1) })] } });
    await expect(page.locator('#dash-transactions-list')).toContainText('Today');
    await expect(page.locator('#dash-transactions-list')).toContainText('Yesterday');
    await nav(page, 'transactions');
    await page.locator('#tx-sort').selectOption('high');
    await expect(page.locator('#tx-list')).toContainText(/\d{1,2} [A-Z][a-z]{2} \d{4}/);
  });
});

test.describe('P1.1 All Transactions', () => {
  test('is in the sidebar and in the mobile bar, and opens the page', async ({ page }) => {
    await openApp(page, { seed: { expensetrack_expenses: [exp(1)] } });
    await page.locator('aside nav a[data-path="transactions"]').click();
    await expect(page.locator('#view-transactions')).toBeVisible();
    await expect(page.locator('h1', { hasText: 'All Transactions' })).toBeVisible();
    await expect(page.locator('nav.lg\\:hidden a[data-path="transactions"]')).toHaveCount(1);
  });

  test('shows full history in pages of 50, grouped by month and day with subtotals', async ({ page }) => {
    await openApp(page, { seed: { expensetrack_expenses: many(120) } });
    await nav(page, 'transactions');
    expect(await rowCount(page)).toBe(50);
    await expect(page.locator('#tx-summary')).toContainText('120 transactions');
    await expect(page.locator('#tx-list h2').first()).toContainText(/\d{4}/);
    await expect(page.locator('#tx-list h3').first()).toHaveText('Today');
    await expect(page.locator('#tx-more')).toContainText('70 left');
    await page.locator('#tx-more').click();
    expect(await rowCount(page)).toBe(100);
    await page.locator('#tx-more').click();
    expect(await rowCount(page)).toBe(120);
    await expect(page.locator('#tx-more')).toBeHidden();
  });

  test('search, category, payment, date and amount filters work alone and together', async ({ page }) => {
    await openApp(page, {
      seed: {
        expensetrack_expenses: [
          exp(1, { note: 'Canteen lunch', amount: 120, paymentMethod: 'UPI' }),
          exp(2, { note: 'Metro card', amount: 500, category: 'transport', paymentMethod: 'Card', date: iso(10) }),
          exp(3, { note: 'Notebook', amount: 60, category: 'textbooks', paymentMethod: 'Cash', date: iso(40) }),
          exp(4, { note: 'Old chai', amount: 15, date: iso(90) }),
        ],
      },
    });
    await nav(page, 'transactions');
    const notes = async () => (await page.locator('#tx-list .font-title-md.font-bold.truncate').allTextContents()).sort();

    await page.locator('#tx-search').fill('metro');
    await expect.poll(notes).toEqual(['Metro card']);
    await page.locator('#tx-search').fill('card'); // matches the note AND the payment method of different rows
    await expect.poll(notes).toEqual(['Metro card']);
    await page.locator('#tx-search').fill('');
    await page.locator('#tx-category').selectOption('transport');
    await expect.poll(notes).toEqual(['Metro card']);
    await page.locator('#tx-category').selectOption('');
    await page.locator('#tx-payment').selectOption('none');
    await expect.poll(notes).toEqual(['Old chai']);
    await page.locator('#tx-payment').selectOption('Cash');
    await expect.poll(notes).toEqual(['Notebook']);
    await page.locator('#tx-payment').selectOption('');
    await page.locator('#tx-from').fill(iso(45));
    await page.locator('#tx-to').fill(iso(5));
    await expect.poll(notes).toEqual(['Metro card', 'Notebook']);
    await page.locator('#tx-min').fill('100');
    await expect.poll(notes).toEqual(['Metro card']);
    await expect(page.locator('#tx-summary')).toContainText('filtered from 4');
  });

  test('sorting by amount gives a flat list with full dates', async ({ page }) => {
    await openApp(page, { seed: { expensetrack_expenses: [exp(1, { amount: 50 }), exp(2, { amount: 900, date: iso(30) }), exp(3, { amount: 5, date: iso(60) })] } });
    await nav(page, 'transactions');
    await page.locator('#tx-sort').selectOption('high');
    await expect(page.locator('#tx-list h2')).toHaveCount(0);
    const amounts = await page.locator('#tx-list .tabular-nums').allTextContents();
    expect(amounts.map((a) => a.trim())).toEqual(['₹900', '₹50', '₹5']);
    await page.locator('#tx-sort').selectOption('low');
    expect((await page.locator('#tx-list .tabular-nums').allTextContents()).map((a) => a.trim())).toEqual(['₹5', '₹50', '₹900']);
  });

  test('empty states: no data at all, and no matches with a way back', async ({ page }) => {
    await openApp(page);
    await nav(page, 'transactions');
    await expect(page.locator('#tx-empty-all')).toBeVisible();

    await page.evaluate(() => window.ExpenseTrackApp.addExpense({ amount: 10, category: 'food', note: 'Tea' }));
    await expect(page.locator('#tx-empty-all')).toBeHidden();
    await page.locator('#tx-search').fill('zzzz');
    await expect(page.locator('#tx-empty-none')).toBeVisible();
    await page.locator('#tx-clear-empty').click();
    await expect(page.locator('#tx-empty-none')).toBeHidden();
    expect(await rowCount(page)).toBe(1);
    await expect(page.locator('#tx-search')).toHaveValue('');
  });

  test('rows can be deleted with undo from the page', async ({ page }) => {
    await openApp(page, { seed: { expensetrack_expenses: [exp(1, { note: 'Keep me' })] } });
    await nav(page, 'transactions');
    await page.locator('#tx-list [aria-label="Delete Expense"]').click();
    await expect(page.locator('#tx-empty-all')).toBeVisible();
    await page.locator('#toast-container button', { hasText: 'Undo' }).click();
    await expect(page.locator('#tx-list')).toContainText('Keep me');
  });

  test('stored text is shown as text on this page too', async ({ page }) => {
    await openApp(page, { seed: { expensetrack_expenses: [exp(1, { note: '<img src=x onerror=window.__xss=1>', category: '<b>odd</b>' })] } });
    await nav(page, 'transactions');
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
    await expect(page.locator('#tx-list')).toContainText('<img src=x');
    await expect(page.locator('#tx-category option', { hasText: 'Uncategorized' })).toHaveCount(1);
  });

  test('shortcuts: N opens Quick Log, / jumps to search, and neither fires while typing', async ({ page }) => {
    await openApp(page);
    await page.keyboard.press('n');
    await expect(page.locator('#expense-modal')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.keyboard.press('/');
    await expect(page.locator('#view-transactions')).toBeVisible();
    await expect(page.locator('#tx-search')).toBeFocused();
    await page.keyboard.type('n/n');
    await expect(page.locator('#tx-search')).toHaveValue('n/n');
    await expect(page.locator('#expense-modal')).toBeHidden();
  });
});

test.describe('P1.3 CSV export and import', () => {
  const rows = [
    exp(1, { note: 'Canteen, lunch', amount: 120.5, paymentMethod: 'UPI', date: iso(1) }),
    exp(2, { note: '=SUM(1+1)', amount: 40, category: 'transport', date: iso(2) }),
    exp(3, { note: 'Notebook', amount: 60, category: 'textbooks', paymentMethod: 'Cash', date: iso(3) }),
  ];

  async function download(page, click) {
    const [dl] = await Promise.all([page.waitForEvent('download'), click()]);
    const file = await dl.path();
    return { name: dl.suggestedFilename(), text: fs.readFileSync(file, 'utf8') };
  }

  test('exports everything as an Excel-friendly CSV', async ({ page }) => {
    await openApp(page, { seed: { expensetrack_expenses: rows } });
    await nav(page, 'transactions');
    const { name, text } = await download(page, () => page.locator('#tx-export').click());
    expect(name).toBe(`expensetrack-${todayLocal()}.csv`);
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(text).toContain('Date,Amount,Category,Payment method,Note,ID\r\n');
    expect(text).toContain(`${iso(1)},120.5,Food & Dining,UPI,"Canteen, lunch",s-1`);
    expect(text).toContain("'=SUM(1+1)"); // formula neutralised
    expect(text.trim().split('\r\n')).toHaveLength(4);
  });

  test('with filters on, you choose between the filtered rows and everything', async ({ page }) => {
    await openApp(page, { seed: { expensetrack_expenses: rows } });
    await nav(page, 'transactions');
    await page.locator('#tx-category').selectOption('transport');
    let result = await download(page, async () => {
      await page.locator('#tx-export').click();
      await expect(page.locator('#confirm-modal-title')).toHaveText('Export which transactions?');
      await page.locator('#confirm-modal-ok').click();
    });
    expect(result.text.trim().split('\r\n')).toHaveLength(2);
    result = await download(page, async () => {
      await page.locator('#tx-export').click();
      await page.locator('#confirm-modal-extra').click();
    });
    expect(result.text.trim().split('\r\n')).toHaveLength(4);
  });

  const csvFile = (text) => ({ name: 'bank.csv', mimeType: 'text/csv', buffer: Buffer.from(text) });

  test('import shows a preview with what is new, what exists and what is wrong, then imports the good rows', async ({ page }) => {
    await openApp(page, { seed: { expensetrack_expenses: [exp(9, { note: 'Tea', amount: 10, date: '2026-10-05', category: 'food' })] } });
    await nav(page, 'transactions');
    const text = [
      'Date,Amount,Category,Payment method,Note',
      '2026-10-05,10,Food & Dining,,Tea',
      '2026-10-06,"1,250.50",Transport,upi,Cab',
      '07/10/2026,80,Groceries,Cash,Veg',
      '2026-13-40,5,Food & Dining,,Bad date',
      '2026-10-08,abc,Food & Dining,,Bad amount',
      '2026-10-09,5,Rent,,Bad category',
    ].join('\n');
    await page.locator('#csv-file').setInputFiles(csvFile(text));
    await expect(page.locator('#import-modal')).toBeVisible();
    await expect(page.locator('#import-summary')).toContainText('6 rows read: 2 ready to import, 1 already in your list, 3 with problems.');
    await expect(page.locator('#import-bad-list')).toContainText('Row 5');
    await expect(page.locator('#import-bad-list')).toContainText('Category "Rent" does not exist');
    await expect(page.locator('#import-ok-list')).toContainText('₹1,250.50');
    await expect(page.locator('#import-confirm')).toHaveText('Import 2 expenses');

    await page.locator('#import-include-dups').check();
    await expect(page.locator('#import-confirm')).toHaveText('Import 3 expenses');
    await page.locator('#import-include-dups').uncheck();
    await page.locator('#import-confirm').click();
    await expect(page.locator('#import-modal')).toBeHidden();
    await expect(page.locator('#toast-container')).toContainText('Imported 2 expenses');
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('expensetrack_expenses')));
    expect(stored).toHaveLength(3);
    const cab = stored.find((e) => e.note === 'Cab');
    expect(cab).toMatchObject({ amount: 1250.5, category: 'transport', date: '2026-10-06', paymentMethod: 'UPI' });
  });

  test('importing your own export again finds only duplicates', async ({ page }) => {
    await openApp(page, { seed: { expensetrack_expenses: rows } });
    await nav(page, 'transactions');
    const { text } = await download(page, () => page.locator('#tx-export').click());
    await page.locator('#csv-file').setInputFiles(csvFile(text));
    await expect(page.locator('#import-summary')).toContainText('3 rows read: 0 ready to import, 3 already in your list, 0 with problems.');
    await expect(page.locator('#import-confirm')).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(page.locator('#import-modal')).toBeHidden();
  });

  test('a file with the wrong columns is explained, not imported', async ({ page }) => {
    await openApp(page);
    await nav(page, 'transactions');
    await page.locator('#csv-file').setInputFiles(csvFile('Foo,Bar\n1,2'));
    await expect(page.locator('#import-fatal')).toContainText('Date, Amount, Category');
    await expect(page.locator('#import-confirm')).toBeDisabled();
  });
});

test.describe('P1.5 alerts for each category', () => {
  const settingsOn = { notify80: true, weeklyDigest: false, roommateAlert: false };
  const budget = { overallCap: 12000, categories: { food: 1000, groceries: 2000, transport: 1000, textbooks: 1200, entertainment: 1500, personal: 600, emergency: 1200 } };
  const seedWith = (expenses, settings = settingsOn) => ({ expensetrack_expenses: expenses, expensetrack_budget: budget, expensetrack_settings: settings });

  test('a category at 85% of its cap is listed even when the overall budget is fine', async ({ page }) => {
    await openApp(page, { seed: seedWith([exp(1, { amount: 850 })]) });
    await expect(page.locator('#budget-warning-banner')).toBeVisible();
    await expect(page.locator('#budget-warning-list')).toContainText('Food & Dining');
    await expect(page.locator('#budget-warning-list')).toContainText('85%');
    await expect(page.locator('#budget-warning-list')).not.toContainText('Monthly budget');
  });

  test('the overall budget and each category are separate lines, and 100% reads as exceeded', async ({ page }) => {
    await openApp(page, { seed: seedWith([exp(1, { amount: 1100 }), exp(2, { amount: 9000, category: 'groceries' })]) });
    await expect(page.locator('#budget-warning-title')).toContainText('exceeded');
    await expect(page.locator('#budget-warning-list li')).toHaveCount(3); // overall (10100 of 12000 = 84%), food over, groceries over
    await expect(page.locator('#budget-warning-list')).toContainText('Monthly budget');
    await expect(page.locator('#budget-warning-list')).toContainText('over the limit');
  });

  test('dismissing keeps it hidden through re-renders and reloads, but a new threshold brings it back', async ({ page }) => {
    await openApp(page, { seed: seedWith([exp(1, { amount: 850 })]) });
    await page.locator('#budget-warning-banner [aria-label="Dismiss"]').click();
    await expect(page.locator('#budget-warning-banner')).toBeHidden();
    await nav(page, 'analytics');
    await nav(page, 'dashboard');
    await page.evaluate(() => window.ExpenseTrackApp.syncAllViewsWithData());
    await expect(page.locator('#budget-warning-banner')).toBeHidden();
    await page.reload();
    await page.waitForFunction(() => document.getElementById('auth-loading-overlay').style.display === 'none');
    await expect(page.locator('#budget-warning-banner')).toBeHidden();

    await page.evaluate(() => window.ExpenseTrackApp.addExpense({ amount: 200, category: 'food' })); // 105%: a new threshold
    await expect(page.locator('#budget-warning-banner')).toBeVisible();
    await expect(page.locator('#budget-warning-list')).toContainText('over the limit');
  });

  test('a dismissal from an earlier month does not hide this month', async ({ page }) => {
    await openApp(page, { seed: seedWith([exp(1, { amount: 850 })]) });
    await page.locator('#budget-warning-banner [aria-label="Dismiss"]').click();
    const key = 'expensetrack_alert_dismissed_test-uid';
    const stored = await page.evaluate((k) => localStorage.getItem(k), key);
    expect(stored).toMatch(/^\d{4}-\d{2}\|/);
    await page.evaluate(([k, v]) => localStorage.setItem(k, '2020-01|' + v.split('|')[1]), [key, stored]);
    await page.evaluate(() => window.ExpenseTrackApp.syncAllViewsWithData());
    await expect(page.locator('#budget-warning-banner')).toBeVisible();
  });

  test('crossing a threshold while logging shows a toast', async ({ page }) => {
    await openApp(page, { seed: seedWith([exp(1, { amount: 500 })]) });
    await expect(page.locator('#budget-warning-banner')).toBeHidden();
    await page.evaluate(() => window.ExpenseTrackApp.openAddExpenseModal());
    await page.locator('#expense-amount').fill('350');
    await page.locator('#expense-modal-submit').click();
    await expect(page.locator('#toast-container')).toContainText('Food & Dining has reached 85%');
  });

  test('with the setting off there is no banner and no toast', async ({ page }) => {
    await openApp(page, { seed: seedWith([exp(1, { amount: 1500 })], { ...settingsOn, notify80: false }) });
    await expect(page.locator('#budget-warning-banner')).toBeHidden();
    await page.evaluate(() => window.ExpenseTrackApp.openAddExpenseModal());
    await page.locator('#expense-amount').fill('10');
    await page.locator('#expense-modal-submit').click();
    await page.waitForTimeout(300);
    await expect(page.locator('#toast-container')).not.toContainText('limit');
  });
});

test.describe('P1.7 exact caps that scale with the budget', () => {
  test('typing an exact cap saves it and moves the slider', async ({ page }) => {
    await openApp(page);
    await nav(page, 'budget-setup');
    await page.locator('#cap-input-food').fill('4200');
    await page.locator('#cap-input-food').press('Tab');
    await expect(page.locator('#cap-food')).toHaveText('4,200');
    expect(await page.locator('#slider-food').inputValue()).toBe('4200');
    const budget = await page.evaluate(() => JSON.parse(localStorage.getItem('expensetrack_budget')));
    expect(budget.categories.food).toBe(4200);
  });

  test('a cap above the old slider limit is allowed (Food used to stop at ₹6,000)', async ({ page }) => {
    await openApp(page);
    await nav(page, 'budget-setup');
    await page.locator('#cap-input-food').fill('9000');
    await page.locator('#cap-input-food').press('Tab');
    await expect(page.locator('#cap-food')).toHaveText('9,000');
    expect(Number(await page.locator('#slider-food').getAttribute('max'))).toBeGreaterThanOrEqual(9000);
  });

  for (const bad of ['-5', '12.5', '2000000']) {
    test(`"${bad}" is refused with a message and the old cap stays`, async ({ page }) => {
      await openApp(page);
      await nav(page, 'budget-setup');
      await page.locator('#cap-input-food').fill(bad);
      await page.locator('#cap-input-food').press('Tab');
      await expect(page.locator('#toast-container')).toContainText(/whole rupees|between/);
      await expect(page.locator('#cap-input-food')).toHaveValue('3500');
      expect(await page.evaluate(() => localStorage.getItem('expensetrack_budget'))).toBeNull();
    });
  }

  test('slider range grows with the monthly budget', async ({ page }) => {
    await openApp(page, { seed: { expensetrack_budget: { overallCap: 60000, categories: {} } } });
    await nav(page, 'budget-setup');
    expect(Number(await page.locator('#slider-food').getAttribute('max'))).toBeGreaterThanOrEqual(30000);
  });

  test('raising the budget can scale every category cap, and says what it will do', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => window.ExpenseTrackApp.openBudgetModal());
    await page.locator('#overall-cap-input').fill('24000');
    await expect(page.locator('#scale-caps-note')).toContainText('multiplied by 2');
    await expect(page.locator('#scale-caps-note')).toContainText('₹3,500 becomes ₹7,000');
    await page.locator('#scale-caps').check();
    await page.locator('#save-budget-modal').click();
    await expect(page.locator('#budget-modal')).toBeHidden();
    await nav(page, 'budget-setup');
    await expect(page.locator('#cap-food')).toHaveText('7,000');
    await expect(page.locator('#total-allocated-val')).toHaveText('22,000');
  });

  test('without the box ticked, the category caps are left alone', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => window.ExpenseTrackApp.openBudgetModal());
    await page.locator('#overall-cap-input').fill('24000');
    await page.locator('#save-budget-modal').click();
    await nav(page, 'budget-setup');
    await expect(page.locator('#cap-food')).toHaveText('3,500');
    await expect(page.locator('#total-allocated-val')).toHaveText('11,000');
  });

  test('custom categories get the same exact cap box', async ({ page }) => {
    await openApp(page, {
      seed: { expensetrack_custom_categories: { custom_1: { id: 'custom_1', name: 'Gym', icon: 'fitness_center', color: '#006948', defaultCap: 500, isDefault: false, isArchived: false } } },
    });
    await nav(page, 'budget-setup');
    await page.locator('#cap-input-custom_1').fill('2500');
    await page.locator('#cap-input-custom_1').press('Tab');
    await expect(page.locator('#cap-custom_1')).toHaveText('2,500');
  });
});

test.describe('P1.6 loading, error and sync states', () => {
  test('the placeholder blocks are shown until data arrives, then removed', async ({ page }) => {
    await openApp(page);
    expect(await page.evaluate(() => document.body.hasAttribute('data-loading'))).toBe(false);
    await page.evaluate(() => document.body.setAttribute('data-loading', 'true'));
    const colour = await page.evaluate(() => getComputedStyle(document.getElementById('dash-total-spent')).color);
    expect(colour).toBe('rgba(0, 0, 0, 0)');
    expect(await page.evaluate(() => document.querySelectorAll('.skel').length)).toBeGreaterThanOrEqual(4);
  });

  test('a failed first load shows an error with Try again, which loads the data', async ({ page }) => {
    await openApp(page, {
      useFirestore: true,
      failReads: true,
      fsSeed: { 'users/test-uid/expenses/e1': { amount: 77, category: 'food', date: iso(0), note: 'Saved earlier', createdAt: 1 } },
    });
    await expect(page.locator('#load-error-banner')).toBeVisible();
    await page.evaluate(() => { window.__db.failReads = null; });
    await page.locator('#btn-retry-load').click();
    await expect(page.locator('#load-error-banner')).toBeHidden();
    await expect(page.locator('#dash-transactions-list')).toContainText('Saved earlier');
  });

  test('the header says Synced, then Offline, then Synced again', async ({ page, context }) => {
    await openApp(page, { useFirestore: true });
    await expect(page.locator('#sync-indicator')).toHaveAttribute('data-state', 'synced');
    await expect(page.locator('#sync-icon')).toHaveText('cloud_done');
    await context.setOffline(true);
    await expect(page.locator('#sync-indicator')).toHaveAttribute('data-state', 'offline');
    await context.setOffline(false);
    await expect(page.locator('#sync-indicator')).toHaveAttribute('data-state', 'synced');
  });

  test('while a save is in flight it says Saving', async ({ page }) => {
    await openApp(page, { useFirestore: true });
    await page.evaluate(() => { window.__db.hang = true; window.ExpenseTrackDataLayer.addExpense({ amount: 5, category: 'food' }); });
    await expect(page.locator('#sync-indicator')).toHaveAttribute('data-state', 'syncing');
    await expect(page.locator('#sync-icon')).toHaveText('sync');
  });

  test('without Firebase the header says the data lives in this browser', async ({ page }) => {
    await openApp(page);
    await expect(page.locator('#sync-indicator')).toHaveAttribute('data-state', 'local');
  });
});

test.describe('P1 touch targets and layout on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  const small = (page, scope) => page.evaluate((sel) => {
    const root = document.querySelector(sel);
    const out = [];
    root.querySelectorAll('button, a[href], select, input:not([type="hidden"]):not([type="checkbox"]):not([type="file"]), [role="button"]').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      if (r.height < 43.5 || r.width < 43.5) out.push(`${el.id || el.getAttribute('aria-label') || el.textContent.trim().slice(0, 25)} ${Math.round(r.width)}x${Math.round(r.height)}`);
    });
    return out;
  }, scope);

  test('the Transactions page controls are at least 44px', async ({ page }) => {
    await openApp(page, { seed: { expensetrack_expenses: many(5) } });
    await nav(page, 'transactions');
    expect(await small(page, '#view-transactions')).toEqual([]);
  });

  test('on a phone the extra filters sit behind a Filters button that shows how many are active', async ({ page }) => {
    await openApp(page, { seed: { expensetrack_expenses: many(5) } });
    await nav(page, 'transactions');
    await expect(page.locator('#tx-search')).toBeVisible();
    await expect(page.locator('#tx-category')).toBeHidden();
    await page.locator('#tx-filter-toggle').click();
    await expect(page.locator('#tx-filter-toggle')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#tx-category')).toBeVisible();
    await page.locator('#tx-category').selectOption('food');
    await expect(page.locator('#tx-filter-toggle-text')).toHaveText('Filters (1)');
    await page.locator('#tx-filter-toggle').click();
    await expect(page.locator('#tx-category')).toBeHidden();
  });

  test('the Quick Log dialog controls are at least 44px', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => window.ExpenseTrackApp.openAddExpenseModal());
    expect(await small(page, '#expense-modal')).toEqual([]);
  });

  test('the mobile bar fits six items without sideways scrolling, even at 320px', async ({ page }) => {
    for (const width of [390, 360, 320]) {
      await page.setViewportSize({ width, height: 700 });
      await openApp(page, { seed: { expensetrack_expenses: many(3) } });
      for (const v of ['dashboard', 'transactions', 'budget-setup', 'analytics']) {
        await nav(page, v);
        if (v === 'analytics') await page.waitForFunction(() => !!window.ExpenseTrackApp.getState().charts.monthlyBar); // measure with the charts drawn
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, `${v} at ${width}px overflows by ${overflow}px`).toBeLessThanOrEqual(0);
      }
      const widths = await page.locator('nav.lg\\:hidden a').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)));
      expect(Math.min(...widths), `a tab is too narrow at ${width}px`).toBeGreaterThanOrEqual(44);
    }
  });
});
