import { test, expect } from '@playwright/test';

test.describe('Command Palette', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/bible/genesis/1');
  });

  test('⌘K opens command palette', async ({ page }) => {
    await page.keyboard.press('Meta+k');
    // Command palette dialog should be visible
    // Note: Actual implementation will add the dialog
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('Ctrl+K opens command palette on non-Mac', async ({ page }) => {
    await page.keyboard.press('Control+k');
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('Escape closes command palette', async ({ page }) => {
    await page.keyboard.press('Meta+k');
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });
});
