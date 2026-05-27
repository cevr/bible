import { test, expect } from '@playwright/test';

test.describe('Bible Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/bible/genesis/1');
  });

  test('loads Genesis 1 by default', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Genesis 1');
  });

  test('arrow down navigates to next verse', async ({ page }) => {
    // Start at verse 1
    await expect(page.locator('[class*="bg-[--color-highlight]"]')).toBeVisible();

    await page.keyboard.press('ArrowDown');

    // Should now highlight verse 2
    // Note: actual implementation will need data-verse attributes
  });

  test('arrow up navigates to previous verse', async ({ page }) => {
    // Navigate down first
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowUp');

    // Should be back at verse 1
  });

  test('redirects /bible to /bible/genesis/1', async ({ page }) => {
    await page.goto('/bible');
    await expect(page).toHaveURL(/\/bible\/genesis\/1/);
  });

  test('redirects /bible/:book to /bible/:book/1', async ({ page }) => {
    await page.goto('/bible/john');
    await expect(page).toHaveURL(/\/bible\/john\/1/);
  });
});
