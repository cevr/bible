/* oxlint-disable effect/noAsyncFunction -- Playwright's public runner and
 * browser protocol are Promise based. */

import { expect, test, type Page } from '@playwright/test';

interface Receipts {
  readonly batchHttpRequests: number;
  readonly singleHttpRequests: number;
  readonly queryBatches: number;
  readonly holdReleases: number;
  readonly holdResolverInterruptions: number;
  readonly holdWorkCompletions: number;
  readonly holdWorkObserved: number;
  readonly requestHandlerExits: number;
  readonly requestHandlerInterruptions: number;
  readonly lastBatch: readonly string[];
}

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
  const singleRequests: string[] = [];
  page.on('request', (request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname.endsWith('/query/batch')) batchRequests.push(request.url());
    if (pathname.endsWith('/query')) singleRequests.push(request.url());
  });
  await observeHistory(page);
  await resetFixture(page);

  await page.goto('/?q=alpha&q2=beta');
  await waitForTwoResults(page);
  expect(batchRequests).toHaveLength(1);
  expect(singleRequests).toHaveLength(0);
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
  expect(await historyWrites(page)).toEqual(['replace', 'push', 'push', 'push']);

  await page.goBack();
  await expect(page.locator('.pane')).toHaveCount(3);
  await page.goBack();
  await expect(firstPane.locator('input')).toHaveValue('fresh');
  await page.goBack();
  await expect(firstPane.locator('input')).toHaveValue('alpha');
  await expect(secondPane.locator('.text')).toHaveText('beta [egw]');
  expect(new URL(page.url()).searchParams.get('q')).toBe('alpha');
  expect(new URL(page.url()).searchParams.get('scope2')).toBe('egw');
  expect(await historyWrites(page)).toEqual(['replace', 'push', 'push', 'push']);
  expect(errors).toEqual([]);
});

test('renders a typed query failure and recovers through the real transport', async ({ page }) => {
  const errors = pageErrors(page);
  const failedRequests: string[] = [];
  page.on('requestfailed', (request) => failedRequests.push(request.url()));
  await resetFixture(page);
  await page.goto('/?q=fail');
  const pane = page.locator('.pane').first();
  await expect(pane.locator('.err')).toContainText('FixtureQueryFailure');
  expect(failedRequests).toEqual([]);

  const input = pane.locator('input');
  await input.fill('recovered');
  await input.press('Enter');
  await expect(pane.locator('.text')).toHaveText('recovered');
  const result = await receipts(page);
  expect(result.queryBatches).toBe(2);
  expect(errors).toEqual([]);
});

test('aborts a held real query and releases its fixture resource', async ({ page }) => {
  const errors = pageErrors(page);
  const failedBatch = page.waitForEvent('requestfailed', {
    predicate: (request) => new URL(request.url()).pathname.endsWith('/query/batch'),
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
  const handlerExited = await page.request.get('/__fixture/hold-handler-exited');
  expect(handlerExited.ok()).toBe(true);
  expect((await handlerExited.json()) as { readonly exited: boolean }).toEqual({ exited: true });

  const completed = await page.request.get('/__fixture/hold-complete');
  expect(completed.ok()).toBe(true);
  expect((await completed.json()) as { readonly completed: boolean }).toEqual({ completed: true });
  await expect(firstPane.locator('.text')).toHaveText('ready');
  await expect(page.locator('.text')).toHaveCount(1);
  const result = await receipts(page);
  expect(result.lastBatch).toEqual(['hold']);
  expect(result.holdReleases).toBe(1);
  expect(result.holdResolverInterruptions).toBe(1);
  expect(result.holdWorkCompletions).toBe(1);
  expect(result.holdWorkObserved).toBe(0);
  expect(result.requestHandlerExits).toBe(1);
  expect(result.requestHandlerInterruptions).toBe(1);
  expect(result.singleHttpRequests).toBe(0);
  expect(errors).toEqual([]);

  await resetFixture(page);
  const reset = await receipts(page);
  expect(reset.holdReleases).toBe(0);
  expect(reset.holdResolverInterruptions).toBe(0);
  expect(reset.holdWorkCompletions).toBe(0);
  expect(reset.holdWorkObserved).toBe(0);
  expect(reset.requestHandlerExits).toBe(0);
  expect(reset.requestHandlerInterruptions).toBe(0);
});
