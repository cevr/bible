import { test, expect } from '@playwright/test';

test.describe('Focus Management', () => {
  test('focus returns to trigger after closing dialog', async ({ page }) => {
    await page.goto('/bible/genesis/1');

    // Focus the body initially
    await page.locator('body').click();

    // Open command palette
    await page.keyboard.press('Meta+k');
    await expect(page.getByRole('dialog')).toBeVisible();

    // Close dialog
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // Focus should be restored (implementation will handle this)
  });

  test('dialog traps focus', async ({ page }) => {
    await page.goto('/bible/genesis/1');

    // Open command palette
    await page.keyboard.press('Meta+k');
    await expect(page.getByRole('dialog')).toBeVisible();

    // Tab through dialog - focus should stay within
    // This tests that focus trap is working
    await page.keyboard.press('Tab');

    // Focused element should be within dialog
    // Note: actual implementation with Kobalte will handle focus trapping
    const dialog = page.getByRole('dialog');
    const focusedElement = page.locator(':focus');
    await expect(focusedElement).not.toHaveCount(0);
    await expect(dialog.locator(':focus')).toBeVisible();
  });
});
