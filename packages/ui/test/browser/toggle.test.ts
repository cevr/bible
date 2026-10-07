// Upstream: packages/react/src/toggle/Toggle.test.tsx,
// packages/react/src/toggle-group/ToggleGroup.test.tsx
//
// Toggle's pressed state (owned or the owner's, cancelable) and ToggleGroup's
// shared value (single or multiple, controlled or not), its disabled state,
// and its roving focus per orientation. Upstream's console
// spy for a missing `value` is left out (a test-runner spy); the behaviour of
// toggles without values is kept.
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

describe('Toggle', () => {
  it('toggles its own pressed state, reporting each change', async () => {
    const page = await h.open('toggle');
    const toggle = page.locator('#uncontrolled');
    await see(toggle).toHaveAttribute('aria-pressed', 'false');
    await see(toggle).toHaveAttribute('type', 'button');
    await see(toggle).not.toHaveAttribute('data-pressed');
    await toggle.click();
    await see(toggle).toHaveAttribute('aria-pressed', 'true');
    await see(toggle).toHaveAttribute('data-pressed', '');
    await toggle.click();
    await see(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(await logOf(page)).toEqual(['pressed true none', 'pressed false none']);
  });

  it('follows the owner when controlled', async () => {
    const page = await h.open('toggle');
    const toggle = page.locator('#controlled');
    await toggle.click();
    await see(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(await logOf(page)).toEqual(['controlled true']);
    await page.click('#external');
    await see(toggle).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps its state when the change is canceled', async () => {
    const page = await h.open('toggle', { query: { cancel: 'true' } });
    const toggle = page.locator('#uncontrolled');
    await toggle.click();
    await see(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(await logOf(page)).toEqual(['pressed true none']);
  });

  it('is natively disabled and ignores clicks when disabled', async () => {
    const page = await h.open('toggle', { query: { disabled: 'true' } });
    const toggle = page.locator('#uncontrolled');
    await see(toggle).toBeDisabled();
    await see(toggle).toHaveAttribute('data-disabled', '');
    await toggle.click({ force: true });
    await see(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(await logOf(page)).toEqual([]);
  });
});

describe('ToggleGroup', () => {
  it('renders a group with its state attributes, and no aria-orientation', async () => {
    const page = await h.open('group', { query: { orientation: 'vertical' } });
    const group = page.locator('#group');
    await see(group).toHaveAttribute('role', 'group');
    await see(group).toHaveAttribute('data-orientation', 'vertical');
    await see(group).not.toHaveAttribute('aria-orientation');
    await see(group).not.toHaveAttribute('data-multiple');
  });

  it('presses one toggle at a time, uncontrolled', async () => {
    const page = await h.open('group', { query: { defaultValue: 'two' } });
    await see(page.locator('#two')).toHaveAttribute('aria-pressed', 'true');
    await page.click('#one');
    await see(page.locator('#one')).toHaveAttribute('aria-pressed', 'true');
    await see(page.locator('#two')).toHaveAttribute('aria-pressed', 'false');
    await page.click('#one');
    await see(page.locator('#one')).toHaveAttribute('aria-pressed', 'false');
    expect(await logOf(page)).toEqual(['value [one] none', 'value [] none']);
  });

  it('presses several toggles with multiple, which can change while mounted', async () => {
    const page = await h.open('group', { query: { multiple: 'true', defaultValue: 'one' } });
    await see(page.locator('#group')).toHaveAttribute('data-multiple', '');
    await page.click('#two');
    await see(page.locator('#one')).toHaveAttribute('aria-pressed', 'true');
    await see(page.locator('#two')).toHaveAttribute('aria-pressed', 'true');
    await page.click('#one');
    await see(page.locator('#one')).toHaveAttribute('aria-pressed', 'false');
    await page.click('#multiple');
    await see(page.locator('#group')).not.toHaveAttribute('data-multiple');
    await page.click('#one');
    await see(page.locator('#one')).toHaveAttribute('aria-pressed', 'true');
    await see(page.locator('#two')).toHaveAttribute('aria-pressed', 'false');
  });

  it('follows the owner when controlled', async () => {
    const page = await h.open('group', { query: { controlled: 'true' } });
    await page.click('#one');
    await see(page.locator('#one')).toHaveAttribute('aria-pressed', 'false');
    expect(await logOf(page)).toEqual(['value [one] none']);
    await page.click('#set-value');
    await see(page.locator('#three')).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps the pressed toggle pressed when the owner ignores the empty value', async () => {
    // The mode tray's shape: one value always pressed, pressing it again offers [].
    const page = await h.open('group', { query: { controlled: 'true' } });
    await page.click('#set-value');
    await see(page.locator('#three')).toHaveAttribute('aria-pressed', 'true');
    await page.click('#three');
    expect(await logOf(page)).toEqual(['value [] none']);
    await see(page.locator('#three')).toHaveAttribute('aria-pressed', 'true');
    await see(page.locator('#three')).toHaveAttribute('data-pressed', '');
  });

  it('keeps its value when the group or the toggle cancels the change', async () => {
    const page = await h.open('group', { query: { cancel: 'group' } });
    await page.click('#one');
    await see(page.locator('#one')).toHaveAttribute('aria-pressed', 'false');
    const vetoed = await h.open('group', { query: { cancel: 'toggle' } });
    await vetoed.click('#two');
    await see(vetoed.locator('#two')).toHaveAttribute('aria-pressed', 'false');
    expect(await logOf(vetoed)).toEqual([]);
  });

  it('disables every toggle, or one', async () => {
    const page = await h.open('group', { query: { disabled: 'true' } });
    await see(page.locator('#group')).toHaveAttribute('data-disabled', '');
    await inSequence(['#one', '#two', '#three'], async (id) => {
      await see(page.locator(id)).toHaveAttribute('data-disabled', '');
    });
    const one = await h.open('group', { query: { disabledItem: 'one' } });
    await see(one.locator('#one')).toHaveAttribute('data-disabled', '');
    await see(one.locator('#two')).not.toHaveAttribute('data-disabled');
  });

  it('presses toggles without values by their own identity', async () => {
    const page = await h.open('missing-values');
    await page.click('#first');
    await see(page.locator('#first')).toHaveAttribute('aria-pressed', 'true');
    await page.click('#second');
    await see(page.locator('#first')).toHaveAttribute('aria-pressed', 'false');
    await see(page.locator('#second')).toHaveAttribute('aria-pressed', 'true');
    const multiple = await h.open('missing-values', { query: { multiple: 'true' } });
    await multiple.click('#first');
    await multiple.click('#second');
    await see(multiple.locator('#first')).toHaveAttribute('aria-pressed', 'true');
    await see(multiple.locator('#second')).toHaveAttribute('aria-pressed', 'true');
  });

  it('gives a rendered toggle the roving tabindex', async () => {
    const page = await h.open('group', { query: { defaultValue: 'three' } });
    await see(page.locator('#three')).toHaveAttribute('data-rendered', '');
    await see(page.locator('#one')).toHaveAttribute('tabindex', '0');
    await see(page.locator('#three')).toHaveAttribute('tabindex', '-1');
  });

  const cases = [
    ['horizontal', 'ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'],
    ['vertical', 'ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft'],
  ] as const;
  for (const [orientation, next, prev, ignoredNext, ignoredPrev] of cases) {
    it(`moves the tab stop with the arrows: ${orientation}`, async () => {
      const page = await h.open('group', { query: { orientation } });
      await page.focus('#before');
      await page.keyboard.press('Tab');
      await see.poll(() => focused(page)).toBe('one');
      await see(page.locator('#one')).toHaveAttribute('tabindex', '0');
      await inSequence(
        [
          [next, 'two'],
          [next, 'three'],
          [next, 'one'],
          [prev, 'three'],
          [prev, 'two'],
          [ignoredNext, 'two'],
          [ignoredPrev, 'two'],
        ] as const,
        async ([key, id]) => {
          await page.keyboard.press(key);
          await see.poll(() => focused(page)).toBe(id);
          await see(page.locator(`#${id}`)).toHaveAttribute('tabindex', '0');
        },
      );
    });
  }

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

  it('stops at the ends without loopFocus', async () => {
    const page = await h.open('group', { query: { loop: 'false' } });
    await page.focus('#before');
    await page.keyboard.press('Tab');
    await page.keyboard.press('ArrowLeft');
    await see.poll(() => focused(page)).toBe('one');
  });

  for (const key of ['Enter', 'Space']) {
    it(`toggles the focused toggle with ${key}`, async () => {
      const page = await h.open('group');
      await page.focus('#one');
      await page.keyboard.press(key);
      await see(page.locator('#one')).toHaveAttribute('aria-pressed', 'true');
      await page.keyboard.press(key);
      await see(page.locator('#one')).toHaveAttribute('aria-pressed', 'false');
      expect(await logOf(page)).toEqual(['value [one] none', 'value [] none']);
    });
  }

  it('skips a disabled toggle with the arrows', async () => {
    const page = await h.open('group', { query: { disabledItem: 'two' } });
    await page.focus('#one');
    await page.keyboard.press('ArrowRight');
    await see.poll(() => focused(page)).toBe('three');
  });
});
