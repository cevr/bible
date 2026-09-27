/* oxlint-disable effect/noAsyncFunction -- Playwright's public runner and
 * browser protocol are Promise based. */

import { expect, test, type Page } from '@playwright/test';

interface Receipts {
  readonly batchHttpRequests: number;
  readonly singleHttpRequests: number;
  readonly holdReleases: number;
  readonly holdInterruptions: number;
  readonly holdWorkCompletions: number;
  readonly holdWorkObserved: number;
  readonly lastBatch: readonly string[];
}

const BATCH_PATH = '/api/search/batch';

const resetFixture = async (page: Page): Promise<void> => {
  const response = await page.request.post('/__fixture/reset');
  expect(response.ok()).toBe(true);
};

const receipts = async (page: Page): Promise<Receipts> => {
  const response = await page.request.get('/__fixture/receipts');
  expect(response.ok()).toBe(true);
  return (await response.json()) as Receipts;
};

const observeHistory = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    const writes: string[] = [];
    Object.defineProperty(window, '__egwHistoryWrites', {
      configurable: true,
      value: writes,
    });
    const pushState = history.pushState.bind(history);
    const replaceState = history.replaceState.bind(history);
    history.pushState = ((...args: Parameters<History['pushState']>) => {
      writes.push('push');
      return pushState(...args);
    }) as History['pushState'];
    history.replaceState = ((...args: Parameters<History['replaceState']>) => {
      writes.push('replace');
      return replaceState(...args);
    }) as History['replaceState'];
  });
};

const historyWrites = async (page: Page): Promise<readonly string[]> =>
  (await page.evaluate(() => {
    const value = Reflect.get(window, '__egwHistoryWrites');
    if (!Array.isArray(value)) return [];
    return value;
  })) as readonly string[];

const pageErrors = (page: Page): Error[] => {
  const errors: Error[] = [];
  page.on('pageerror', (error) => errors.push(error));
  return errors;
};

const waitForTwoResults = async (page: Page): Promise<void> => {
  await expect(page.locator('.pane')).toHaveCount(2);
  await expect(page.locator('.pane .hit:not(.skeleton)')).toHaveCount(2);
};

test('runs the real batched workflow with identity and URL receipts', async ({ page }) => {
  const errors = pageErrors(page);
  const batchRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === BATCH_PATH) batchRequests.push(request.url());
  });
  await observeHistory(page);
  await resetFixture(page);

  await page.goto('/?q=alpha&q2=beta');
  await waitForTwoResults(page);
  // Both panes' searches started together, so they went out as one batch.
  expect(batchRequests).toHaveLength(1);
  const initialReceipts = await receipts(page);
  expect(initialReceipts.batchHttpRequests).toBe(1);
  expect(initialReceipts.singleHttpRequests).toBe(0);
  expect(initialReceipts.lastBatch.toSorted()).toEqual(['alpha', 'beta']);

  const firstPane = page.locator('.pane').nth(0);
  const secondPane = page.locator('.pane').nth(1);
  const firstHit = await firstPane.locator('.hit').elementHandle();
  const secondHit = await secondPane.locator('.hit').elementHandle();
  const firstInput = firstPane.locator('input');
  const firstInputHandle = await firstInput.elementHandle();
  expect(firstHit).not.toBeNull();
  expect(secondHit).not.toBeNull();
  expect(firstInputHandle).not.toBeNull();

  await firstPane.locator('.expand').first().click();
  await expect(firstPane.locator('.context')).toHaveCount(4);

  await secondPane.locator('.ftoggle').click();
  await secondPane.getByRole('button', { name: 'Ellen White' }).click();
  await expect(secondPane.locator('.filtered')).toBeVisible();
  await expect(secondPane.locator('.text')).toHaveText('beta [egw]');
  await expect(firstPane.locator('.context')).toHaveCount(4);
  expect(new URL(page.url()).searchParams.get('scope2')).toBe('egw');
  expect(
    await page.evaluate(
      (node) =>
        node?.isConnected && document.querySelectorAll('.pane')[0]?.querySelector('.hit') === node,
      firstHit,
    ),
  ).toBe(true);

  await firstInput.fill('fresh');
  await expect(firstInput).toBeFocused();
  expect(
    await page.evaluate((node) => node === document.querySelector('.pane input'), firstInputHandle),
  ).toBe(true);
  expect(new URL(page.url()).searchParams.get('q')).toBe('alpha');
  await firstInput.press('Enter');
  await expect(firstPane.locator('.text')).toHaveText('fresh');
  await expect(firstPane.locator('.context')).toHaveCount(2);
  expect(new URL(page.url()).searchParams.get('q')).toBe('fresh');
  expect(
    await page.evaluate((node) => node === document.querySelector('.pane input'), firstInputHandle),
  ).toBe(true);
  expect(
    await page.evaluate(
      (node) =>
        node?.isConnected && document.querySelectorAll('.pane')[1]?.querySelector('.hit') === node,
      secondHit,
    ),
  ).toBe(true);

  await page.getByRole('button', { name: '+ pane' }).click();
  await expect(page.locator('.pane')).toHaveCount(3);
  await page.locator('.pane').nth(2).getByRole('button', { name: 'Close pane 3' }).click();
  await expect(page.locator('.pane')).toHaveCount(2);
  // The first replace keys the entry the page loaded on (for its scroll
  // position); the URL does not change. The second is the filter.
  expect(await historyWrites(page)).toEqual(['replace', 'replace', 'push', 'push', 'push']);

  await page.goBack();
  await expect(page.locator('.pane')).toHaveCount(3);
  await page.goBack();
  await expect(firstPane.locator('input')).toHaveValue('fresh');
  await page.goBack();
  await expect(firstPane.locator('input')).toHaveValue('alpha');
  await expect(secondPane.locator('.text')).toHaveText('beta [egw]');
  expect(new URL(page.url()).searchParams.get('q')).toBe('alpha');
  expect(new URL(page.url()).searchParams.get('scope2')).toBe('egw');
  expect(await historyWrites(page)).toEqual(['replace', 'replace', 'push', 'push', 'push']);
  expect(errors).toEqual([]);
});

test('renders a typed query failure and recovers through the real transport', async ({ page }) => {
  const errors = pageErrors(page);
  const failedRequests: string[] = [];
  page.on('requestfailed', (request) => failedRequests.push(request.url()));
  await resetFixture(page);
  await page.goto('/?q=fail');
  const pane = page.locator('.pane').first();
  await expect(pane.locator('.err')).toContainText('controlled fixture failure');
  await expect(pane.locator('.status').first()).toContainText('“fail” — failed');
  expect(failedRequests).toEqual([]);

  const input = pane.locator('input');
  await input.fill('recovered');
  await input.press('Enter');
  await expect(pane.locator('.text')).toHaveText('recovered');
  const result = await receipts(page);
  expect(result.batchHttpRequests).toBe(2);
  expect(errors).toEqual([]);
});

test('aborts a held real query and releases its fixture resource', async ({ page }) => {
  const errors = pageErrors(page);
  const failedBatch = page.waitForEvent('requestfailed', {
    predicate: (request) => new URL(request.url()).pathname === BATCH_PATH,
  });
  await resetFixture(page);
  await page.goto('/?q=ready');
  const firstPane = page.locator('.pane').first();
  await expect(firstPane.locator('.text')).toHaveText('ready');
  await page.getByRole('button', { name: '+ pane' }).click();
  await expect(page.locator('.pane')).toHaveCount(2);

  const holdReady = page.request.get('/__fixture/hold-ready');
  const secondPane = page.locator('.pane').nth(1);
  const input = secondPane.locator('input');
  await input.fill('hold');
  await input.press('Enter');
  const holdReceipt = await holdReady;
  expect(holdReceipt.ok()).toBe(true);
  expect((await holdReceipt.json()) as { readonly ready: boolean }).toEqual({ ready: true });

  await secondPane.getByRole('button', { name: 'Close pane 2' }).click();
  await expect(page.locator('.pane')).toHaveCount(1);
  const released = await page.request.get('/__fixture/hold-released');
  expect(released.ok()).toBe(true);
  expect((await released.json()) as { readonly released: boolean }).toEqual({ released: true });
  const aborted = await failedBatch;
  expect(aborted.failure()?.errorText).toBeTruthy();

  const completed = await page.request.get('/__fixture/hold-complete');
  expect(completed.ok()).toBe(true);
  expect((await completed.json()) as { readonly completed: boolean }).toEqual({ completed: true });
  await expect(firstPane.locator('.text')).toHaveText('ready');
  await expect(page.locator('.text')).toHaveCount(1);
  const result = await receipts(page);
  expect(result.lastBatch).toEqual(['hold']);
  expect(result.holdReleases).toBe(1);
  expect(result.holdInterruptions).toBe(1);
  expect(result.holdWorkCompletions).toBe(1);
  expect(result.holdWorkObserved).toBe(0);
  expect(result.singleHttpRequests).toBe(0);
  expect(errors).toEqual([]);

  await resetFixture(page);
  const reset = await receipts(page);
  expect(reset.holdReleases).toBe(0);
  expect(reset.holdInterruptions).toBe(0);
  expect(reset.holdWorkCompletions).toBe(0);
  expect(reset.holdWorkObserved).toBe(0);
});

test('a filter change and a new pane leave the viewport where the reader is', async ({ page }) => {
  const errors = pageErrors(page);
  await page.setViewportSize({ width: 390, height: 640 });
  await resetFixture(page);
  await page.goto('/?q=alpha&q2=beta');
  await waitForTwoResults(page);

  // The panes stack on a phone: the second pane's filters are below the fold.
  const secondPane = page.locator('.pane').nth(1);
  await secondPane.locator('.ftoggle').scrollIntoViewIfNeeded();
  await secondPane.locator('.ftoggle').click();
  const chip = secondPane.getByRole('button', { name: 'Ellen White' });
  await chip.scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => window.scrollY);
  expect(before).toBeGreaterThan(0);
  // A filter replaces the URL. The page must not jump to the top.
  await chip.click();
  await expect(secondPane.locator('.text')).toHaveText('beta [egw]');
  expect(await page.evaluate(() => window.scrollY)).toBe(before);

  // A new pane pushes the URL. Its search box takes focus and comes into
  // view; the page must not jump back to the top over it.
  await page.getByRole('button', { name: '+ pane' }).click();
  const thirdInput = page.locator('.pane').nth(2).locator('input');
  await expect(thirdInput).toBeFocused();
  await expect(thirdInput).toBeInViewport();
  expect(errors).toEqual([]);
});

test('Back returns to the position the reader left', async ({ page }) => {
  const errors = pageErrors(page);
  await page.setViewportSize({ width: 390, height: 640 });
  await resetFixture(page);
  await page.goto('/?q=alpha&q2=beta');
  await waitForTwoResults(page);
  const secondPane = page.locator('.pane').nth(1);
  const input = secondPane.locator('input');
  await input.scrollIntoViewIfNeeded();
  const left = await page.evaluate(() => window.scrollY);
  expect(left).toBeGreaterThan(0);

  await input.fill('gamma');
  await input.press('Enter');
  await expect(secondPane.locator('.text')).toHaveText('gamma');
  await page.evaluate(() => window.scrollTo(0, 0));

  await page.goBack();
  await expect(secondPane.locator('.text')).toHaveText('beta');
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(left);
  expect(errors).toEqual([]);
});

test('a reload keeps the position, and Back after it still finds the older one', async ({
  page,
}) => {
  const errors = pageErrors(page);
  await page.setViewportSize({ width: 390, height: 640 });
  await resetFixture(page);
  await page.goto('/?q=alpha&q2=beta');
  await waitForTwoResults(page);
  const secondPane = page.locator('.pane').nth(1);
  const input = secondPane.locator('input');
  await input.scrollIntoViewIfNeeded();
  const left = await page.evaluate(() => window.scrollY);
  expect(left).toBeGreaterThan(0);

  await input.fill('gamma');
  await input.press('Enter');
  await expect(secondPane.locator('.text')).toHaveText('gamma');
  await page.evaluate(() => window.scrollTo(0, 0));
  await secondPane.locator('.text').scrollIntoViewIfNeeded();
  const reading = await page.evaluate(() => window.scrollY);
  expect(reading).toBeGreaterThan(0);

  await page.reload();
  await expect(secondPane.locator('.text')).toHaveText('gamma');
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(reading);

  await page.goBack();
  await expect(secondPane.locator('.text')).toHaveText('beta');
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(left);
  expect(errors).toEqual([]);
});

test('a pane keeps its unsent draft when another pane navigates', async ({ page }) => {
  const errors = pageErrors(page);
  await resetFixture(page);
  await page.goto('/?q=alpha&q2=beta');
  await waitForTwoResults(page);
  const firstInput = page.locator('.pane').nth(0).locator('input');
  const secondPane = page.locator('.pane').nth(1);

  await firstInput.fill('half typed');
  await secondPane.locator('input').fill('gamma');
  await secondPane.locator('input').press('Enter');
  await expect(secondPane.locator('.text')).toHaveText('gamma');
  await expect(firstInput).toHaveValue('half typed');

  await secondPane.locator('.ftoggle').click();
  await secondPane.getByRole('button', { name: 'Ellen White' }).click();
  await expect(secondPane.locator('.text')).toHaveText('gamma [egw]');
  await expect(firstInput).toHaveValue('half typed');
  expect(new URL(page.url()).searchParams.get('q')).toBe('alpha');
  expect(errors).toEqual([]);
});

test('filter changes in quick succession share one request', async ({ page }) => {
  const errors = pageErrors(page);
  await resetFixture(page);
  await page.goto('/?q=alpha');
  const pane = page.locator('.pane').first();
  await expect(pane.locator('.text')).toHaveText('alpha');
  await pane.locator('.ftoggle').click();
  const before = (await receipts(page)).batchHttpRequests;

  // Two changes inside the quiet period: the URL takes both at once, the
  // server sees one request for where they end.
  await pane.evaluate((node) => {
    const button = (name: string) =>
      [...node.querySelectorAll('button')].find((candidate) => candidate.textContent === name);
    button('Ellen White')?.click();
    button('Books')?.click();
  });
  const url = new URL(page.url()).searchParams;
  expect([url.get('scope'), url.get('type')]).toEqual(['egw', 'book']);
  await expect(pane.locator('.text')).toHaveText('alpha [egw]');
  await expect(pane.locator('.results')).toHaveAttribute('aria-busy', 'false');
  await page.waitForTimeout(300);
  expect((await receipts(page)).batchHttpRequests).toBe(before + 1);
  expect(errors).toEqual([]);
});

test('a row says when it is a chapter or back matter, and discloses more context', async ({
  page,
}) => {
  const errors = pageErrors(page);
  await resetFixture(page);
  await page.goto('/?q=labels');
  const hit = page.locator('.pane .hit:not(.skeleton)');
  await expect(hit).toHaveCount(1);
  await expect(hit.locator('.kind')).toHaveText(['Chapter', 'Back matter']);
  await expect(hit.locator('.match')).toHaveClass(/heading/);
  await expect(hit.locator('.context')).toHaveCount(2);
  await hit.locator('.expand').first().click();
  await expect(hit.locator('.context')).toHaveCount(4);
  await expect(hit.locator('.expand')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('an unknown path says so and links home', async ({ page }) => {
  const errors = pageErrors(page);
  await page.goto('/no/such/page');
  await expect(page.locator('.status')).toContainText('nothing at /no/such/page');
  await page.getByRole('link', { name: 'search' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('.pane')).toHaveCount(1);
  expect(errors).toEqual([]);
});
