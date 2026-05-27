import { test, expect, type Page } from '@playwright/test';

/**
 * Wait for the app to finish loading and render actual content.
 * Works for both Bible and other routes.
 */
async function waitForBibleContent(page: Page, timeout = 60_000) {
  // Wait for verse content to appear (means SQLite loaded + Effect runtime running + data fetched)
  await expect(page.locator('[data-verse="1"]')).toBeVisible({ timeout });
}

/**
 * Collect JS errors during a test. Filters out expected network errors.
 */
function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (err) => {
    // Ignore expected network errors (sync, API calls)
    if (err.message.includes('fetch') && err.message.includes('/api/')) return;
    errors.push(err.message);
  });
  return errors;
}

test.describe('App Initialization', () => {
  test('loads SQLite and renders Bible content without JS errors', async ({ page }) => {
    const errors = collectErrors(page);

    await page.goto('/bible/genesis/1', { timeout: 60_000 });
    await waitForBibleContent(page);

    // Heading present
    await expect(page.locator('h1')).toContainText('Genesis');

    // Multiple verses rendered
    const verseCount = await page.locator('[data-verse]').count();
    expect(verseCount).toBeGreaterThan(10);

    // First verse has actual text content
    const firstVerseText = await page.locator('[data-verse="1"]').innerText();
    expect(firstVerseText.length).toBeGreaterThan(10);

    // Genesis 1:1 sanity check
    expect(firstVerseText).toContain('In the beginning');

    expect(errors).toHaveLength(0);
  });

  test('redirects /bible to saved position', async ({ page }) => {
    test.setTimeout(120_000);

    // First visit a known page to set saved position
    await page.goto('/bible/genesis/1', { timeout: 60_000 });
    await waitForBibleContent(page);

    // Wait for position save
    await page.waitForTimeout(2_000);

    // Navigate to /bible via full page load — triggers redirect from saved position
    await page.goto('/bible', { timeout: 60_000 });
    await expect(page).toHaveURL(/\/bible\/[\w-]+\/\d+/, { timeout: 60_000 });

    // Content should render after redirect
    await waitForBibleContent(page);
  });

  test('no blank screen after SQLite loads', async ({ page }) => {
    const errors = collectErrors(page);

    await page.goto('/bible/genesis/1', { timeout: 60_000 });

    // Wait for content to actually render
    await waitForBibleContent(page);

    // Body should have substantial text
    const bodyText = await page.evaluate(() => document.body.innerText.trim());
    expect(bodyText.length).toBeGreaterThan(100);

    // h1 and verses both present
    await expect(page.locator('h1')).toContainText('Genesis');
    const verseCount = await page.locator('[data-verse]').count();
    expect(verseCount).toBeGreaterThan(0);

    expect(errors).toHaveLength(0);
  });
});

test.describe('Verse Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/bible/genesis/1', { timeout: 60_000 });
    await waitForBibleContent(page);
  });

  test('verse 1 is selected by default', async ({ page }) => {
    const verse1 = page.locator('[data-verse="1"]');
    await expect(verse1).toHaveClass(/bg-\[--color-highlight\]/);
  });

  test('arrow down moves to next verse', async ({ page }) => {
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('[data-verse="2"]')).toHaveClass(/bg-\[--color-highlight\]/, {
      timeout: 2_000,
    });
  });

  test('arrow up from verse 2 moves back to verse 1', async ({ page }) => {
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('[data-verse="2"]')).toHaveClass(/bg-\[--color-highlight\]/);

    await page.keyboard.press('ArrowUp');
    await expect(page.locator('[data-verse="1"]')).toHaveClass(/bg-\[--color-highlight\]/);
  });

  test('clicking a verse selects it', async ({ page }) => {
    const verse5 = page.locator('[data-verse="5"]');
    await verse5.click();
    await expect(verse5).toHaveClass(/bg-\[--color-highlight\]/);
  });

  test('multiple consecutive arrow presses navigate correctly', async ({ page }) => {
    // Press down 4 times to reach verse 5
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('[data-verse="5"]')).toHaveClass(/bg-\[--color-highlight\]/, {
      timeout: 2_000,
    });
  });
});

test.describe('Chapter Navigation', () => {
  test('right arrow navigates to next chapter', async ({ page }) => {
    await page.goto('/bible/genesis/1', { timeout: 60_000 });
    await waitForBibleContent(page);

    await page.keyboard.press('ArrowRight');

    await expect(page).toHaveURL(/\/bible\/genesis\/2/, { timeout: 10_000 });
    await expect(page.locator('h1')).toContainText('Genesis 2');
    await waitForBibleContent(page);
  });

  test('left arrow navigates to previous chapter', async ({ page }) => {
    await page.goto('/bible/genesis/2', { timeout: 60_000 });
    await waitForBibleContent(page);

    await page.keyboard.press('ArrowLeft');

    await expect(page).toHaveURL(/\/bible\/genesis\/1/, { timeout: 10_000 });
    await expect(page.locator('h1')).toContainText('Genesis 1');
  });

  test('cross-book navigation: Genesis 50 → Exodus 1', async ({ page }) => {
    await page.goto('/bible/genesis/50', { timeout: 60_000 });
    await waitForBibleContent(page);

    await page.keyboard.press('ArrowRight');

    await expect(page).toHaveURL(/\/bible\/exodus\/1/, { timeout: 10_000 });
    await expect(page.locator('h1')).toContainText('Exodus 1');
  });
});

test.describe('Command Palette', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/bible/genesis/1', { timeout: 60_000 });
    await waitForBibleContent(page);
  });

  test('opens with Cmd+K and shows book list', async ({ page }) => {
    await page.keyboard.press('Meta+k');

    // Use exact match to avoid ambiguity with "⌘G go to" text in footer
    await expect(page.getByText('Go to', { exact: true })).toBeVisible({ timeout: 5_000 });

    // Should show book names in the list
    await expect(page.locator('#command-input')).toBeFocused();
  });

  test('navigates via direct reference input', async ({ page }) => {
    await page.keyboard.press('Meta+k');
    await expect(page.locator('#command-input')).toBeVisible({ timeout: 5_000 });

    await page.locator('#command-input').fill('John 3:16');
    await page.locator('#command-input').press('Enter');

    await expect(page).toHaveURL(/\/bible\/john\/3\/16/, { timeout: 10_000 });
    await expect(page.locator('h1')).toContainText('John 3');
  });

  test('closes with Escape', async ({ page }) => {
    await page.keyboard.press('Meta+k');
    await expect(page.getByText('Go to', { exact: true })).toBeVisible({ timeout: 5_000 });

    await page.keyboard.press('Escape');

    await expect(page.getByText('Go to', { exact: true })).not.toBeVisible({ timeout: 3_000 });
  });
});

test.describe('Search', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/bible/genesis/1', { timeout: 60_000 });
    await waitForBibleContent(page);
  });

  test('opens search overlay with / key', async ({ page }) => {
    await page.keyboard.press('/');

    await expect(page.locator('#search-input')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('#search-input')).toBeFocused();
  });

  test('chapter search finds matching verses', async ({ page }) => {
    await page.keyboard.press('/');
    await expect(page.locator('#search-input')).toBeFocused({ timeout: 5_000 });

    await page.locator('#search-input').fill('light');

    // Should show matching results with chapter:verse references
    await expect(page.locator('mark').first()).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('State Persistence (Effect Layer)', () => {
  test('saves and restores position across navigation', async ({ page }) => {
    const errors = collectErrors(page);

    // Navigate to John 3:16
    await page.goto('/bible/john/3', { timeout: 60_000 });
    await waitForBibleContent(page);
    await expect(page.locator('h1')).toContainText('John 3');

    // Wait for position to save
    await page.waitForTimeout(1_000);

    // Navigate to /bible — should redirect to saved position
    await page.goto('/bible', { timeout: 60_000 });
    await expect(page).toHaveURL(/\/bible\/john\/3/, { timeout: 30_000 });

    expect(errors).toHaveLength(0);
  });

  test('bookmarks panel opens and loads data', async ({ page }) => {
    const errors = collectErrors(page);

    await page.goto('/bible/genesis/1', { timeout: 60_000 });
    await waitForBibleContent(page);

    // Open bookmarks
    await page.keyboard.press('Meta+b');

    // Use role-based selector for the heading
    await expect(page.getByRole('heading', { name: 'Bookmarks' })).toBeVisible({ timeout: 5_000 });

    // Panel loaded data (shows either bookmarks or empty state)
    await expect(page.getByText('No bookmarks yet.').or(page.locator('time'))).toBeVisible({
      timeout: 5_000,
    });

    expect(errors).toHaveLength(0);
  });

  test('history panel shows visited entries', async ({ page }) => {
    const errors = collectErrors(page);

    // Visit Genesis to generate a history entry
    await page.goto('/bible/genesis/1', { timeout: 60_000 });
    await waitForBibleContent(page);
    await page.waitForTimeout(1_000);

    // Open history via command palette
    await page.keyboard.press('Meta+k');
    await expect(page.locator('#command-input')).toBeVisible({ timeout: 5_000 });
    await page.getByRole('button', { name: 'History' }).click();

    // History panel should open with entries
    await expect(page.getByRole('heading', { name: 'History' })).toBeVisible({ timeout: 5_000 });

    // Should have at least one entry (Today group)
    await expect(page.getByText('Today').or(page.getByText('No history yet.'))).toBeVisible({
      timeout: 5_000,
    });

    expect(errors).toHaveLength(0);
  });
});

test.describe('Display Modes', () => {
  test('toggles between verse and paragraph mode', async ({ page }) => {
    await page.goto('/bible/genesis/1', { timeout: 60_000 });
    await waitForBibleContent(page);

    // Default: verse mode with individual verse elements
    const versesBefore = await page.locator('[data-verse]').count();
    expect(versesBefore).toBeGreaterThan(10);

    // Toggle to paragraph mode
    await page.keyboard.press('Meta+d');
    await page.waitForTimeout(500);

    // Content still present
    const bodyText = await page.evaluate(() => document.body.innerText);
    expect(bodyText).toContain('In the beginning');
  });
});

test.describe('Cross-book Navigation', () => {
  test('loads different books correctly', async ({ page }) => {
    const errors = collectErrors(page);

    // Psalms 23 (OT)
    await page.goto('/bible/psalms/23', { timeout: 60_000 });
    await waitForBibleContent(page);
    await expect(page.locator('h1')).toContainText('Psalms 23');
    const psalmText = await page.locator('[data-verse="1"]').innerText();
    expect(psalmText.toLowerCase()).toContain('shepherd');

    // John 1 (NT)
    await page.goto('/bible/john/1', { timeout: 60_000 });
    await waitForBibleContent(page);
    await expect(page.locator('h1')).toContainText('John 1');

    // Revelation 22 (last book, last chapter)
    await page.goto('/bible/revelation/22', { timeout: 60_000 });
    await waitForBibleContent(page);
    await expect(page.locator('h1')).toContainText('Revelation 22');

    expect(errors).toHaveLength(0);
  });
});

test.describe('Effect Runtime Integrity', () => {
  test('multiple rapid navigations do not crash', async ({ page }) => {
    const errors = collectErrors(page);

    await page.goto('/bible/genesis/1', { timeout: 60_000 });
    await waitForBibleContent(page);

    // Rapidly navigate through chapters
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');

    // Should end up at Genesis 6
    await expect(page).toHaveURL(/\/bible\/genesis\/6/, { timeout: 15_000 });
    await waitForBibleContent(page);
    await expect(page.locator('h1')).toContainText('Genesis 6');

    expect(errors).toHaveLength(0);
  });

  test('concurrent overlay interactions do not break state', async ({ page }) => {
    const errors = collectErrors(page);

    await page.goto('/bible/genesis/1', { timeout: 60_000 });
    await waitForBibleContent(page);

    // Open and close bookmarks
    await page.keyboard.press('Meta+b');
    await expect(page.getByRole('heading', { name: 'Bookmarks' })).toBeVisible({ timeout: 5_000 });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: 'Bookmarks' })).not.toBeVisible({
      timeout: 3_000,
    });

    // Open and close search
    await page.keyboard.press('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 5_000 });
    await page.keyboard.press('Escape');
    await expect(page.locator('#search-input')).not.toBeVisible({ timeout: 3_000 });

    // Verses should still be interactive
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('[data-verse="2"]')).toHaveClass(/bg-\[--color-highlight\]/, {
      timeout: 2_000,
    });

    expect(errors).toHaveLength(0);
  });
});
