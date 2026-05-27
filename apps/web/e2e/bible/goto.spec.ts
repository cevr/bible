import { test, expect } from '@playwright/test';

test.describe('Go To Dialog', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/bible/genesis/1');
  });

  test('⌘G opens goto dialog', async ({ page }) => {
    await page.keyboard.press('Meta+g');
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('Ctrl+G opens goto dialog on non-Mac', async ({ page }) => {
    await page.keyboard.press('Control+g');
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test.skip('can navigate to specific reference', async ({ page }) => {
    await page.keyboard.press('Meta+g');
    await page.getByRole('textbox').fill('john 3:16');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL('/bible/john/3/16');
  });
});
