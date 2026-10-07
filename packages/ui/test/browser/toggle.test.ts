// Upstream: packages/react/src/toggle/Toggle.test.tsx,
// packages/react/src/toggle-group/ToggleGroup.test.tsx
//
// ToggleGroup's one-at-a-time value, held by its owner, and its roving focus.
// Upstream's lone toggle, uncontrolled groups, `multiple`, `disabled`, the
// orientations, `loopFocus` and the console spy for a missing `value` are
// left out with the options they test.
import { describe, expect, it } from 'bun:test';

import { expect as see } from '@playwright/test';

import { focused, harness, logOf } from './harness.ts';

/** Runs `run` over `items` one after another (each step waits on the page). */
const inSequence = <T>(items: ReadonlyArray<T>, run: (item: T) => Promise<void>) =>
  items.reduce<Promise<void>>(
    (previous, item) => previous.then(() => run(item)),
    Promise.resolve(),
  );

const h = harness('toggle.tsx');

describe('ToggleGroup', () => {
  it('renders a group of buttons with aria-pressed, and no aria-orientation', async () => {
    const page = await h.open('group');
    const group = page.locator('#group');
    await see(group).toHaveAttribute('role', 'group');
    await see(group).not.toHaveAttribute('aria-orientation');
    const one = page.locator('#one');
    await see(one).toHaveAttribute('type', 'button');
    await see(one).toHaveAttribute('aria-pressed', 'false');
    await see(one).not.toHaveAttribute('data-pressed');
  });

  it('presses one toggle at a time', async () => {
    const page = await h.open('group', { query: { value: 'two' } });
    await see(page.locator('#two')).toHaveAttribute('aria-pressed', 'true');
    await page.click('#one');
    await see(page.locator('#one')).toHaveAttribute('aria-pressed', 'true');
    await see(page.locator('#one')).toHaveAttribute('data-pressed', '');
    await see(page.locator('#two')).toHaveAttribute('aria-pressed', 'false');
    await page.click('#one');
    await see(page.locator('#one')).toHaveAttribute('aria-pressed', 'false');
    expect(await logOf(page)).toEqual(['value [one]', 'value []']);
  });

  it('shows what the owner keeps', async () => {
    const page = await h.open('group', { query: { owner: 'decline' } });
    await page.click('#one');
    await see(page.locator('#one')).toHaveAttribute('aria-pressed', 'false');
    expect(await logOf(page)).toEqual(['value [one]']);
    await page.click('#set-value');
    await see(page.locator('#three')).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps the pressed toggle pressed when the owner ignores the empty value', async () => {
    // The mode tray's shape: one value always pressed, pressing it again offers [].
    const page = await h.open('group', { query: { owner: 'keep-one', value: 'three' } });
    await page.click('#three');
    expect(await logOf(page)).toEqual(['value []']);
    await see(page.locator('#three')).toHaveAttribute('aria-pressed', 'true');
    await see(page.locator('#three')).toHaveAttribute('data-pressed', '');
  });

  it('gives a rendered toggle the roving tabindex', async () => {
    const page = await h.open('group', { query: { value: 'three' } });
    await see(page.locator('#three')).toHaveAttribute('data-rendered', '');
    await see(page.locator('#one')).toHaveAttribute('tabindex', '0');
    await see(page.locator('#three')).toHaveAttribute('tabindex', '-1');
  });

  it('moves the tab stop with the left and right arrows, wrapping at the ends', async () => {
    const page = await h.open('group');
    await page.focus('#before');
    await page.keyboard.press('Tab');
    await see.poll(() => focused(page)).toBe('one');
    await see(page.locator('#one')).toHaveAttribute('tabindex', '0');
    await inSequence(
      [
        ['ArrowRight', 'two'],
        ['ArrowRight', 'three'],
        ['ArrowRight', 'one'],
        ['ArrowLeft', 'three'],
        ['ArrowLeft', 'two'],
        ['ArrowDown', 'two'],
        ['ArrowUp', 'two'],
      ] as const,
      async ([key, id]) => {
        await page.keyboard.press(key);
        await see.poll(() => focused(page)).toBe(id);
        await see(page.locator(`#${id}`)).toHaveAttribute('tabindex', '0');
      },
    );
  });

  it('moves to the first and last toggles with Home and End', async () => {
    const page = await h.open('group');
    await page.focus('#before');
    await page.keyboard.press('Tab');
    await page.keyboard.press('End');
    await see.poll(() => focused(page)).toBe('three');
    await page.keyboard.press('ArrowLeft');
    await see.poll(() => focused(page)).toBe('two');
    await page.keyboard.press('Home');
    await see.poll(() => focused(page)).toBe('one');
    await see(page.locator('#one')).toHaveAttribute('tabindex', '0');
  });

  for (const key of ['Enter', 'Space']) {
    it(`toggles the focused toggle with ${key}`, async () => {
      const page = await h.open('group');
      await page.focus('#one');
      await page.keyboard.press(key);
      await see(page.locator('#one')).toHaveAttribute('aria-pressed', 'true');
      await page.keyboard.press(key);
      await see(page.locator('#one')).toHaveAttribute('aria-pressed', 'false');
      expect(await logOf(page)).toEqual(['value [one]', 'value []']);
    });
  }
});
