import { test, expect } from '@playwright/test';

test.describe('EGW Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/egw/PP/1');
  });

  test('loads page with book name', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Patriarchs and Prophets');
  });

  test('shows page number', async ({ page }) => {
    await expect(page.locator('text=Page 1')).toBeVisible();
  });

  test('arrow down navigates to next paragraph', async ({ page }) => {
    await page.keyboard.press('ArrowDown');
    // Should select next paragraph
    await expect(page.locator('[data-para][data-selected="true"]')).toBeVisible();
  });

  test('redirects /egw/:book to /egw/:book/1', async ({ page }) => {
    await page.goto('/egw/GC');
    await expect(page).toHaveURL(/\/egw\/GC\/1/);
  });
});
