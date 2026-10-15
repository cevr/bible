// Hydration: a fixture rendered by Solid's server build is the page, and the
// browser's build hydrates it (`harness(…, { hydrate: true })`). A case fails
// on any warning the page reports, so a hydration key miss (Solid's
// development build warns of each) or an unclaimed server node fails it.
// Solid writes no attribute while hydrating, so the toggles' `tabindex` the
// browser computed then is read from their log, not the DOM. The group
// settles on a microtask after the hydration, so before `open` returns.
import { describe, expect, it } from 'bun:test';

import { expect as see, type Page } from '@playwright/test';

import { focused, harness, logOf, servedOf } from './harness.ts';

const h = harness('hydration.tsx', { hydrate: true });

const TOGGLES = ['one', 'two', 'three'];

/** Each toggle's `tabindex` in `html`, or in the page's DOM when `html` is null. */
const tabindexes = (page: Page, html: string | null): Promise<Record<string, string | null>> =>
  page.evaluate(
    ([markup, ids]) => {
      let root: ParentNode = document;
      if (markup !== null) {
        const template = document.createElement('template');
        template.innerHTML = markup;
        root = template.content;
      }
      return Object.fromEntries(
        ids.map((id) => [id, root.querySelector(`#${id}`)?.getAttribute('tabindex') ?? null]),
      );
    },
    [html, TOGGLES] as const,
  );

/** The `tabindex` lines the toggles logged. */
const tabindexLog = async (page: Page): Promise<Array<string>> =>
  (await logOf(page)).filter((line) => line.startsWith('tabindex '));

describe('hydration', () => {
  it('puts the one tab stop on the pressed toggle on the server, at hydration and once settled', async () => {
    const page = await h.open('pressed');
    const served = await tabindexes(page, await servedOf(page));
    expect(served).toEqual({ one: '-1', two: '0', three: '-1' });
    // What the browser computed at hydration, unchanged once the group settled.
    expect(await tabindexLog(page)).toEqual([
      'tabindex one -1',
      'tabindex two 0',
      'tabindex three -1',
    ]);
    expect(await tabindexes(page, null)).toEqual(served);
  });

  it('puts it on the first toggle when none is pressed', async () => {
    const page = await h.open('unpressed');
    const served = await tabindexes(page, await servedOf(page));
    expect(served).toEqual({ one: '0', two: '-1', three: '-1' });
    expect(await tabindexLog(page)).toEqual([
      'tabindex one 0',
      'tabindex two -1',
      'tabindex three -1',
    ]);
    expect(await tabindexes(page, null)).toEqual(served);
  });

  it('hydrates an element with a spread and a ref factory made in the body, and what follows it', async () => {
    const page = await h.open('pressed');
    expect(await logOf(page)).toContain('setup spread');
    await see(page.locator('#spread')).toHaveAttribute('data-pressed-count', '1');
    // The server's toggles are the ones hydrated: none was made again beside them.
    expect(await page.locator('#group > button').count()).toBe(3);
  });

  it('moves the tab stop with the keyboard and presses on a click after hydration', async () => {
    const page = await h.open('pressed');
    await page.keyboard.press('Tab');
    expect(await focused(page)).toBe('two');
    await page.keyboard.press('ArrowRight');
    expect(await focused(page)).toBe('three');
    expect(await tabindexes(page, null)).toEqual({ one: '-1', two: '-1', three: '0' });
    await page.locator('#one').click();
    await see(page.locator('#one')).toHaveAttribute('aria-pressed', 'true');
    await see(page.locator('#two')).toHaveAttribute('aria-pressed', 'false');
    await see(page.locator('#spread')).toHaveAttribute('data-pressed-count', '1');
    expect(await logOf(page)).toContain('value [one]');
  });
});
