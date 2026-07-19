import { expect, test, type Page } from '@playwright/test';

const openChapter = async (page: Page, route = '/bible/1/1'): Promise<void> => {
  await page.goto(route, { timeout: 60_000 });
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Genesis', {
    timeout: 60_000,
  });
  await expect(page.getByRole('listitem').first()).toContainText('In the beginning');
};

const collectPageErrors = (page: Page): string[] => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
};

test.describe('shared Solid reading application', () => {
  test('negotiates the worker runtime and renders a canonical chapter', async ({ page }) => {
    const errors = collectPageErrors(page);

    await openChapter(page);

    await expect(page.getByRole('banner')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
    await expect(page.getByRole('main')).toBeVisible();
    expect(await page.getByRole('listitem').count()).toBeGreaterThan(10);
    await expect(page.getByRole('link', { name: 'Verse 1', exact: true })).toHaveAttribute(
      'href',
      '/bible/1/1/1',
    );
    expect(errors).toEqual([]);
  });

  test('uses the shared canonical route for chapter navigation', async ({ page }) => {
    await openChapter(page);

    await page.getByRole('link', { name: 'Next chapter' }).click();

    await expect(page).toHaveURL(/\/bible\/1\/2$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Genesis 2');
  });

  test('searches Scripture through the shared procedure cache', async ({ page }) => {
    await openChapter(page);
    await page.getByRole('link', { name: 'Search' }).click();

    const search = page.getByRole('textbox', { name: 'Search the Bible' });
    await search.fill('beginning');
    await page.getByRole('button', { name: 'Search' }).click();

    await expect(page).toHaveURL(/\/search\?q=beginning/);
    await expect(page.getByText(/results? for “beginning”/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('link', { name: /Genesis 1:1/ })).toContainText('In the beginning');
  });

  test('keeps the reading surface usable at a mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openChapter(page);

    const readingCanvas = page.getByRole('main');
    await expect(readingCanvas).toBeVisible();
    expect(
      await readingCanvas.evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
  });
});
