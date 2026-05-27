import { test, expect } from '@playwright/test';

test.describe('EGW Chapter Headings', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/egw/PP/1');
  });

  test('chapter heading is visible', async ({ page }) => {
    await expect(page.locator('[data-chapter-heading]')).toBeVisible();
  });

  test('chapter heading is sticky on scroll', async ({ page }) => {
    // Scroll down
    await page.evaluate(() => window.scrollTo(0, 500));

    const heading = page.locator('[data-chapter-heading]');
    const box = await heading.boundingBox();

    // Heading should be near top of viewport (sticky)
    expect(box?.y).toBeLessThan(150);
  });
});
