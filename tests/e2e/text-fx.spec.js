const { test, expect } = require('@playwright/test');
const { openApp } = require('./fixtures');

test.describe('animated letters', () => {
  test('page titles keep their exact text and accessible name while animating', async ({ page }) => {
    await openApp(page);
    const h1 = page.locator('#view-dashboard h1');
    await expect(h1).toHaveText('Spending Dashboard');
    await expect(h1).toHaveAttribute('aria-label', 'Spending Dashboard');
    expect(await h1.locator('.fx-ch').count()).toBe('SpendingDashboard'.length);
    await expect(page.getByRole('heading', { name: 'Spending Dashboard' })).toBeVisible();
  });

  test('no letter animation when the person asks for reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openApp(page);
    expect(await page.locator('.fx-ch').count()).toBe(0);
  });
});
