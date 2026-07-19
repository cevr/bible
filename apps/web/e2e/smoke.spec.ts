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
  page.on('console', (message) => {
    if (
      message.type() === 'error' ||
      message.type() === 'warning' ||
      /(?:persistence-ready|sqlite-vfs-ready|startup-failed)/u.test(message.text())
    ) {
      process.stdout.write(`[browser.${message.type()}] ${message.text()}\n`);
    }
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
};

test.describe('shared Solid reading application', () => {
  test('reads, navigates, searches, and remains responsive in one local session', async ({
    page,
  }) => {
    const errors = collectPageErrors(page);

    await openChapter(page);

    await expect(page.getByRole('banner')).toBeVisible();
    if ((page.viewportSize()?.width ?? 0) > 704) {
      await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
    } else {
      await expect(page.getByRole('button', { name: 'Library navigation' })).toBeVisible();
    }
    await expect(page.getByRole('main')).toBeVisible();
    expect(await page.getByRole('listitem').count()).toBeGreaterThan(10);
    await expect(page.getByRole('link', { name: 'Verse 1', exact: true })).toHaveAttribute(
      'href',
      '/bible/1/1/1',
    );

    const commandTrigger = page.getByRole('button', { name: 'Open command palette' });
    await commandTrigger.focus();
    await commandTrigger.click();
    await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(commandTrigger).toBeFocused();
    await page.keyboard.press('Control+k');
    const commandSearch = page.getByRole('textbox', { name: 'Search commands' });
    await expect(commandSearch).toBeFocused();
    await commandSearch.fill('Topics');
    await commandSearch.press('Enter');
    await expect(page).toHaveURL(/\/topics$/);

    await openChapter(page, '/bible/1/1/1');
    if ((page.viewportSize()?.width ?? 0) > 960) {
      const separator = page.getByRole('separator', { name: 'Resize Scripture and study tools' });
      await expect(separator).toBeVisible();
      await separator.press('ArrowLeft');
      await expect(separator).toHaveAttribute('aria-valuenow', '60');
      await page.getByRole('listitem').first().click({ button: 'right' });
      const verseMenu = page.getByRole('menu', { name: 'Verse 1 actions' });
      await expect(verseMenu).toBeVisible();
      await page.keyboard.press('Escape');
      const firstVerse = page.getByRole('link', { name: 'Verse 1', exact: true });
      await firstVerse.focus();
      await firstVerse.press('Shift+F10');
      await expect(verseMenu).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(firstVerse).toBeFocused();
    }
    const notesTab = page.getByRole('tab', { name: 'Notes' });
    if (!(await notesTab.isVisible())) await page.getByText('Study', { exact: true }).click();
    await notesTab.focus();
    await notesTab.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'References' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await page.getByRole('link', { name: 'Next chapter' }).click();

    await expect(page).toHaveURL(/\/bible\/1\/2$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Genesis 2');
    if ((page.viewportSize()?.width ?? 0) > 704) {
      await page.getByRole('link', { name: 'Search' }).click();
    } else {
      await page.getByRole('button', { name: 'Library navigation' }).click();
      await page.getByRole('menuitem', { name: 'Search Scripture' }).click();
    }

    const search = page.getByRole('textbox', { name: 'Search the Bible' });
    await search.fill('beginning');
    await page.getByRole('button', { name: 'Search' }).click();

    await expect(page).toHaveURL(/\/search\?q=beginning/);
    await expect(page.getByText(/results? for “beginning”/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('link', { name: /Genesis 1:1/ })).toContainText('In the beginning');

    await page.goto('/');
    await expect(page).toHaveURL(/\/bible\/1\/2$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Genesis 2');

    await page.setViewportSize({ width: 390, height: 844 });
    await openChapter(page);

    const mobileNavigation = page.getByRole('button', { name: 'Library navigation' });
    await mobileNavigation.click();
    await expect(page.getByRole('menu', { name: 'Library navigation' })).toBeVisible();
    await page.keyboard.press('Escape');

    const readingCanvas = page.getByRole('main');
    await expect(readingCanvas).toBeVisible();
    expect(
      await readingCanvas.evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
});
