import { test, expect } from '@playwright/test';

test.describe('Keyboard Navigation', () => {
  test('Tab navigates through interactive elements', async ({ page }) => {
    await page.goto('/bible/genesis/1');
    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toBeVisible();
  });

  test('Escape closes any open overlay', async ({ page }) => {
    await page.goto('/bible/genesis/1');

    // Open command palette
    await page.keyboard.press('Meta+k');
    await expect(page.getByRole('dialog')).toBeVisible();

    // Close with Escape
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('keyboard shortcuts do not fire when input is focused', async ({ page }) => {
    await page.goto('/bible/genesis/1');

    // Open search (creates input)
    await page.keyboard.press('Meta+f');
    await expect(page.getByRole('dialog')).toBeVisible();

    // Type in search input - should not trigger navigation
    // This tests that / doesn't open search again when typing
    const searchInput = page.getByRole('searchbox');
    await searchInput.fill('test/search');

    // Dialog should still be open
    await expect(page.getByRole('dialog')).toBeVisible();
  });
});
