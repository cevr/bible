import { test, expect } from '@playwright/test';

test.describe('Search', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/bible/genesis/1');
  });

  test('⌘F opens search', async ({ page }) => {
    await page.keyboard.press('Meta+f');
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('/ opens search', async ({ page }) => {
    await page.keyboard.press('/');
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('Escape closes search', async ({ page }) => {
    await page.keyboard.press('/');
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });
});
