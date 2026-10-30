const { test, expect } = require('@playwright/test');
const { openApp, todayLocal } = require('./fixtures');

const nav = (page, view) => page.evaluate((v) => window.ExpenseTrackApp.navigateTo(v), view);
const exp = (n, extra = {}) => ({ id: `old-${n}`, amount: 10 + n, category: 'food', date: todayLocal(), note: `note ${n}`, createdAt: n, ...extra });

test.describe('B12: copy and placeholders are true', () => {
  test('the page source has no stale claims or invented numbers', async ({ page }) => {
    const html = await (await page.request.get('/')).text();
    for (const stale of ['localStorage', 'Saved on this device', 'Midterm Cycle', 'Week 1 of 16', 'Semester 2026', 'Auto-Saved',
      'Coming Soon', '4,000', '1,800', '₹12,000', 'Rollover unspent']) {
      expect(html, `index.html still contains "${stale}"`).not.toContain(stale);
    }
    const login = await (await page.request.get('/login.html')).text();
    expect(login).not.toContain('Saved on this device');
  });

  test('the signed-in profile says the data is synced to the Google account', async ({ page }) => {
    await openApp(page);
    await nav(page, 'profile-&-settings');
    await expect(page.locator('#profile-user-email')).toContainText('Synced to your Google account');
    await expect(page.locator('#view-profile-\\&-settings')).not.toContainText('localStorage');
  });

  test('each built-in category card carries the name the data layer uses', async ({ page }) => {
    await openApp(page);
    await nav(page, 'budget-setup');
    const cats = await page.evaluate(() => window.ExpenseTrackApp.getActiveCategories());
    for (const [id, cat] of Object.entries(cats)) {
      await expect(page.locator(`#cat-card-${id}`)).toContainText(cat.name);
    }
  });

  test('slider ranges and cap figures come from the category definitions', async ({ page }) => {
    await openApp(page);
    await nav(page, 'budget-setup');
    await expect(page.locator('#slider-food')).toHaveAttribute('min', '500');
    await expect(page.locator('#cap-food')).toHaveText('3,500');
    await expect(page.locator('#cap-entertainment')).toHaveText('1,500');
    await expect(page.locator('#active-categories-count-badge')).toHaveText('7 Active Budgets');
  });
});

test.describe('B13: no controls that do nothing', () => {
  test('the "Coming Soon" toggles are gone', async ({ page }) => {
    await openApp(page);
    await nav(page, 'budget-setup');
    await expect(page.locator('#toggle-digest')).toHaveCount(0);
    await expect(page.locator('#toggle-roommate')).toHaveCount(0);
    await expect(page.locator('#toggle-80')).toHaveCount(1);
  });
});

test.describe('B14: sign-out and old browser data', () => {
  test('signing out clears the Firestore offline cache before leaving', async ({ page }) => {
    await openApp(page, { useFirestore: true });
    await page.locator('#btn-logout-sidebar').click();
    await page.waitForURL(/\/login(\.html)?$/);
    const calls = await page.evaluate(() => sessionStorage.getItem('__fsCalls'));
    expect(calls).toBe('terminate,clearPersistence,');
  });

  const legacySeed = { expensetrack_expenses: [exp(1), exp(2)] };

  test('old data is offered, and importing it copies it to the account', async ({ page }) => {
    await openApp(page, { useFirestore: true, seed: legacySeed });
    await expect(page.locator('#confirm-modal')).toBeVisible();
    await expect(page.locator('#confirm-modal-title')).toHaveText('Import data saved in this browser?');
    expect(await page.evaluate(() => [...window.__db._store.keys()].filter((k) => k.includes('/expenses/')).length)).toBe(0);
    await page.locator('#confirm-modal-ok').click();
    await expect(page.locator('#toast-container')).toContainText('Imported 2 expenses');
    expect(await page.evaluate(() => [...window.__db._store.keys()].filter((k) => k.includes('/expenses/')).length)).toBe(2);
    expect(await page.evaluate(() => localStorage.getItem('expensetrack_expenses'))).toBeNull();
  });

  test('deleting the old data imports nothing', async ({ page }) => {
    await openApp(page, { useFirestore: true, seed: legacySeed });
    await page.locator('#confirm-modal-extra').click();
    await expect(page.locator('#toast-container')).toContainText('deleted');
    expect(await page.evaluate(() => [...window.__db._store.keys()].filter((k) => k.includes('/expenses/')).length)).toBe(0);
    expect(await page.evaluate(() => localStorage.getItem('expensetrack_expenses'))).toBeNull();
  });

  test('"Ask me later" leaves the old data where it is', async ({ page }) => {
    await openApp(page, { useFirestore: true, seed: legacySeed });
    await page.locator('#confirm-modal-cancel').click();
    await expect(page.locator('#confirm-modal')).toBeHidden();
    expect(await page.evaluate(() => localStorage.getItem('expensetrack_expenses'))).not.toBeNull();
    expect(await page.evaluate(() => [...window.__db._store.keys()].filter((k) => k.includes('/expenses/')).length)).toBe(0);
  });
});

test.describe('B15: listeners and rendering', () => {
  test('repeated sign-in events register one data listener', async ({ page }) => {
    await openApp(page, { useFirestore: true });
    await page.evaluate(() => { window.__fireAuth(); window.__fireAuth(); });
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.ExpenseTrackApp.getDataListenerCount())).toBe(1);
  });

  test('a repeated sign-in event does not pull you back to the dashboard', async ({ page }) => {
    await openApp(page);
    await nav(page, 'analytics');
    await page.evaluate(() => window.__fireAuth());
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.ExpenseTrackApp.getState().currentView)).toBe('analytics');
  });

  test('only the view on screen is re-rendered when data changes', async ({ page }) => {
    await openApp(page, { useFirestore: true });
    const before = await page.evaluate(() => ({ ...window.ExpenseTrackApp.getState().renderCounts }));
    await page.evaluate(() => window.ExpenseTrackApp.addExpense({ amount: 25, category: 'food' }));
    await page.waitForTimeout(200);
    const after = await page.evaluate(() => ({ ...window.ExpenseTrackApp.getState().renderCounts }));
    expect(after.dashboard).toBeGreaterThan(before.dashboard);
    expect(after.analytics).toBe(before.analytics);
    expect(after['budget-setup']).toBe(before['budget-setup']);
    expect(after['profile-&-settings']).toBe(before['profile-&-settings']);
  });
});

test.describe('B16: offline banner', () => {
  test('is shown while offline and hidden again when back online', async ({ page, context }) => {
    await openApp(page);
    await expect(page.locator('#offline-banner')).toBeHidden();
    await context.setOffline(true);
    await expect(page.locator('#offline-banner')).toBeVisible();
    await context.setOffline(false);
    await expect(page.locator('#offline-banner')).toBeHidden();
  });
});

test.describe('B17: in-app dialogs instead of alert/confirm', () => {
  test.beforeEach(({ page }) => {
    page.on('dialog', (d) => { throw new Error(`Native ${d.type()} dialog: ${d.message()}`); });
  });

  test('deleting an expense is immediate and can be undone', async ({ page }) => {
    await openApp(page, { seed: { expensetrack_expenses: [exp(1)] } });
    await page.locator('#dash-transactions-list [aria-label="Delete Expense"]').click();
    await expect(page.locator('#toast-container')).toContainText('Expense deleted');
    expect(await page.evaluate(() => window.ExpenseTrackApp.getExpenses().length)).toBe(0);
    await page.locator('#toast-container button', { hasText: 'Undo' }).click();
    await expect(page.locator('#toast-container')).toContainText('restored');
    expect(await page.evaluate(() => window.ExpenseTrackApp.getExpenses().length)).toBe(1);
    await expect(page.locator('#dash-transactions-list')).toContainText('note 1');
  });

  test('clearing all expenses needs the word DELETE', async ({ page }) => {
    await openApp(page, { seed: { expensetrack_expenses: [exp(1), exp(2)] } });
    await nav(page, 'profile-&-settings');
    await page.locator('#btn-clear-expenses').click();
    const dialog = page.locator('#confirm-modal');
    await expect(dialog).toBeVisible();
    await expect(page.locator('#confirm-modal-ok')).toBeDisabled();
    await page.locator('#confirm-modal-input').fill('delete');
    await expect(page.locator('#confirm-modal-ok')).toBeDisabled();
    await page.locator('#confirm-modal-input').fill('DELETE');
    await expect(page.locator('#confirm-modal-ok')).toBeEnabled();
    await page.locator('#confirm-modal-ok').click();
    await expect(dialog).toBeHidden();
    expect(await page.evaluate(() => window.ExpenseTrackApp.getExpenses().length)).toBe(0);
  });

  test('cancelling the clear-all dialog keeps everything', async ({ page }) => {
    await openApp(page, { seed: { expensetrack_expenses: [exp(1)] } });
    await nav(page, 'profile-&-settings');
    await page.locator('#btn-clear-expenses').click();
    await page.locator('#confirm-modal-cancel').click();
    expect(await page.evaluate(() => window.ExpenseTrackApp.getExpenses().length)).toBe(1);
  });

  test('resetting the budget and deleting a category both use the in-app dialog', async ({ page }) => {
    await openApp(page, {
      seed: {
        expensetrack_custom_categories: {
          custom_1: { id: 'custom_1', name: 'Gym', icon: 'fitness_center', color: '#006948', defaultCap: 500, isDefault: false, isArchived: false },
        },
      },
    });
    await nav(page, 'budget-setup');
    await page.locator('#reset-defaults').click();
    await expect(page.locator('#confirm-modal-title')).toHaveText('Reset budget to defaults?');
    await page.locator('#confirm-modal-ok').click();
    await expect(page.locator('#toast-container')).toContainText('reset to defaults');

    await page.locator('#custom-category-cards-container [aria-label="Delete Category"]').click();
    await expect(page.locator('#confirm-modal-title')).toContainText('Gym');
    await page.locator('#confirm-modal-ok').click();
    await expect(page.locator('#custom-category-cards-container')).not.toContainText('Gym');
  });
});

test.describe('B18: accessibility', () => {
  test('the Quick Log dialog is a labelled modal that Escape closes and focus returns to its opener', async ({ page }) => {
    await openApp(page);
    const opener = page.locator('aside a[data-path="add-expense"]');
    await opener.focus();
    await opener.press('Enter');
    const modal = page.locator('#expense-modal');
    await expect(modal).toBeVisible();
    await expect(modal).toHaveAttribute('role', 'dialog');
    await expect(modal).toHaveAttribute('aria-modal', 'true');
    const labelId = await modal.getAttribute('aria-labelledby');
    await expect(page.locator(`#${labelId}`)).toHaveText('Quick Log Expense');
    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test('clicking the backdrop closes a dialog', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => window.ExpenseTrackApp.openBudgetModal());
    await expect(page.locator('#budget-modal')).toBeVisible();
    await page.mouse.click(8, 400);
    await expect(page.locator('#budget-modal')).toBeHidden();
  });

  test('Tab stays inside an open dialog', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => window.ExpenseTrackApp.openAddExpenseModal());
    await expect(page.locator('#expense-modal')).toBeVisible();
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      const inside = await page.evaluate(() => document.getElementById('expense-modal').contains(document.activeElement));
      expect(inside, `focus escaped the dialog after ${i + 1} Tab presses`).toBe(true);
    }
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Shift+Tab');
      expect(await page.evaluate(() => document.getElementById('expense-modal').contains(document.activeElement))).toBe(true);
    }
  });

  test('every label points at a real control and every icon-only button has a name', async ({ page }) => {
    await openApp(page, {
      seed: {
        expensetrack_custom_categories: {
          custom_1: { id: 'custom_1', name: 'Gym', icon: 'fitness_center', color: '#006948', defaultCap: 500, isDefault: false, isArchived: false },
        },
      },
    });
    await nav(page, 'budget-setup');
    const problems = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('label').forEach((l) => {
        if (l.control) return;
        const f = l.getAttribute('for');
        if (!f || !document.getElementById(f)) out.push(`label without control: ${l.textContent.trim().slice(0, 40)}`);
      });
      document.querySelectorAll('button, a[href]').forEach((b) => {
        if (b.classList.contains('hidden')) return; // unused slot of the shared confirm dialog
        const name = (b.getAttribute('aria-label') || b.getAttribute('title') || '').trim() ||
          Array.from(b.childNodes).filter((n) => n.nodeType === 3 || (n.nodeType === 1 && !n.classList.contains('material-symbols-outlined')))
            .map((n) => n.textContent).join('').trim();
        if (!name) out.push(`button without name: ${b.id || b.className.slice(0, 50)}`);
      });
      return out;
    });
    expect(problems).toEqual([]);
  });

  test('colour swatches keep their colour after one is picked', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => window.ExpenseTrackApp.openAddCustomCategoryModal());
    await page.locator('#custom-color-selector [data-color="#e11d48"]').click();
    await expect(page.locator('#custom-color-selector [data-color="#e11d48"]')).toHaveAttribute('aria-pressed', 'true');
    const colours = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#custom-color-selector .color-option')).map((b) => getComputedStyle(b).backgroundColor));
    expect(colours.length).toBe(9);
    colours.forEach((c) => expect(c).not.toBe('rgba(0, 0, 0, 0)'));
    expect(new Set(colours).size).toBe(9);
  });

  test('category chips report whether they are selected', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => window.ExpenseTrackApp.openAddExpenseModal());
    await expect(page.locator('#quick-log-category-container [data-category="food"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#quick-log-category-container [data-category="groceries"]')).toHaveAttribute('aria-pressed', 'false');
    await page.locator('#quick-log-category-container [data-category="groceries"]').click();
    await expect(page.locator('#quick-log-category-container [data-category="groceries"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#quick-log-category-container [data-category="food"]')).toHaveAttribute('aria-pressed', 'false');
  });

  test('keyboard focus is visible', async ({ page }) => {
    await openApp(page);
    await page.keyboard.press('Tab');
    const outline = await page.evaluate(() => {
      const s = getComputedStyle(document.activeElement);
      return { style: s.outlineStyle, width: s.outlineWidth };
    });
    expect(outline.style).not.toBe('none');
    expect(parseFloat(outline.width)).toBeGreaterThanOrEqual(2);
  });

  test('reduced-motion users get no transitions', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openApp(page);
    const duration = await page.evaluate(() => parseFloat(getComputedStyle(document.getElementById('open-budget-modal')).transitionDuration));
    expect(duration).toBeLessThan(0.001);
  });
});

test.describe('B19: unknown categories are shown honestly', () => {
  test('an expense with an unknown category is "Uncategorized", not Food', async ({ page }) => {
    await openApp(page, { seed: { expensetrack_expenses: [exp(1, { category: 'mystery' })] } });
    const row = page.locator('#dash-transactions-list > div').first();
    await expect(row).toContainText('Uncategorized');
    await expect(row).not.toContainText('Food');
    expect(await page.evaluate(() => window.ExpenseTrackApp.getCategorySpending('food'))).toBe(0);
  });
});
