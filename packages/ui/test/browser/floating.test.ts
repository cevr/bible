// Upstream: packages/react/src/floating-ui-react/hooks/useDismiss.test.tsx,
// packages/react/src/floating-ui-react/hooks/useListNavigation.test.tsx,
// packages/react/src/floating-ui-react/hooks/useTypeahead.test.tsx,
// packages/react/src/floating-ui-react/hooks/useClick.test.tsx,
// packages/react/src/floating-ui-react/components/FloatingFocusManager.test.tsx,
// packages/react/src/floating-ui-react/components/FloatingPortal.test.tsx,
// packages/react/src/floating-ui-react/safePolygon.test.ts,
// packages/react/src/internals/useAnchorPositioning.test.tsx
//
// The behaviour cases, against one popup assembled from the interactions.
// Upstream's cases for React-only machinery (strict mode, React-tree
// portals, act timing) and for grid navigation (not ported) are left out.
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { expect as see } from '@playwright/test';

import { type Harness, focused, harness, logOf } from './harness.ts';

let h: Harness;
beforeAll(async () => {
  h = await harness();
});
afterAll(async () => {
  await h.close();
});

describe('useClick + useDismiss', () => {
  it('opens on click, closes on a second click, on Escape and on an outside press', async () => {
    const page = await h.open('list-popup');
    await page.click('#trigger');
    await see(page.locator('#popup')).toBeVisible();
    await page.click('#trigger');
    await see(page.locator('#popup')).toHaveCount(0);
    await page.click('#trigger');
    await see(page.locator('#popup')).toBeVisible();
    await page.keyboard.press('Escape');
    await see(page.locator('#popup')).toHaveCount(0);
    await page.click('#trigger');
    await see(page.locator('#popup')).toBeVisible();
    await page.mouse.click(700, 500);
    await see(page.locator('#popup')).toHaveCount(0);
    const reasons = (await logOf(page)).filter((line) => line.startsWith('open false'));
    expect(reasons).toEqual([
      'open false trigger-press',
      'open false escape-key',
      'open false outside-press',
    ]);
  });
});

describe('FloatingPortal + useAnchorPositioning', () => {
  it('renders the popup in a portal node in the body, placed under the trigger', async () => {
    const page = await h.open('list-popup');
    await page.click('#trigger');
    const portal = page.locator('body > [data-base-ui-portal]');
    await see(portal).toHaveCount(1);
    await see(portal.locator('#popup')).toHaveCount(1);
    await see(page.locator('#positioner')).not.toHaveCSS('opacity', '0');
    const trigger = await page.locator('#trigger').boundingBox();
    const positioner = await page.locator('#positioner').boundingBox();
    expect(Math.round(positioner!.y)).toBe(Math.round(trigger!.y + trigger!.height + 4));
    expect(Math.round(positioner!.x)).toBe(Math.round(trigger!.x));
    const vars = await page
      .locator('#positioner')
      .evaluate((el) => [
        el.style.getPropertyValue('--anchor-width'),
        el.style.getPropertyValue('--available-height'),
        el.style.getPropertyValue('--transform-origin'),
      ]);
    expect(vars[0]).toBe(`${trigger!.width}px`);
    expect(vars[1]).toMatch(/px$/);
    expect(vars[2]).toBe('0% -4px');
  });
});

describe('FloatingFocusManager', () => {
  it('focuses the popup on a pointer open and returns focus to the trigger on close', async () => {
    const page = await h.open('list-popup');
    await page.click('#trigger');
    await see.poll(() => focused(page)).toBe('popup');
    await page.keyboard.press('Escape');
    await see.poll(() => focused(page)).toBe('trigger');
  });

  it('traps Tab inside a modal popup and hides the outside from assistive tech', async () => {
    const page = await h.open('list-popup');
    await page.click('#trigger');
    await page.keyboard.press('ArrowDown');
    await see.poll(() => focused(page)).toBe('item-apple');
    expect(await page.locator('#root').getAttribute('aria-hidden')).toBe('true');
    await page.keyboard.press('Tab');
    await see.poll(() => focused(page)).toBe('item-apple');
    await page.keyboard.press('Escape');
    await see(page.locator('#root')).not.toHaveAttribute('aria-hidden');
  });

  it('closes a non-modal popup when Tab leaves it, moving on from the trigger', async () => {
    const page = await h.open('list-popup', { query: { modal: 'false' } });
    await page.focus('#trigger');
    await page.keyboard.press('Enter');
    await see(page.locator('#popup')).toBeVisible();
    // A keyboard open highlights the first item.
    await see.poll(() => focused(page)).toBe('item-apple');
    await page.keyboard.press('Tab');
    await see(page.locator('#popup')).toHaveCount(0);
    await see.poll(() => focused(page)).toBe('after');
    expect(await logOf(page)).toContain('open false focus-out');
  });
});

describe('useListNavigation', () => {
  it('moves with the arrows, skips disabled items, stops at the ends, and Home/End jump', async () => {
    const page = await h.open('list-popup');
    await page.click('#trigger');
    await page.keyboard.press('ArrowDown');
    await see.poll(() => focused(page)).toBe('item-apple');
    await page.keyboard.press('ArrowDown');
    await see.poll(() => focused(page)).toBe('item-blueberry');
    await page.keyboard.press('ArrowDown');
    await see.poll(() => focused(page)).toBe('item-cherry');
    await page.keyboard.press('ArrowDown');
    await see.poll(() => focused(page)).toBe('item-cherry');
    await page.keyboard.press('Home');
    await see.poll(() => focused(page)).toBe('item-apple');
    await page.keyboard.press('End');
    await see.poll(() => focused(page)).toBe('item-cherry');
    await page.keyboard.press('ArrowUp');
    await see.poll(() => focused(page)).toBe('item-blueberry');
  });

  it('wraps around with loopFocus', async () => {
    const page = await h.open('list-popup', { query: { loop: 'true' } });
    await page.click('#trigger');
    await page.keyboard.press('ArrowUp');
    await see.poll(() => focused(page)).toBe('item-cherry');
    await page.keyboard.press('ArrowDown');
    await see.poll(() => focused(page)).toBe('item-apple');
  });

  it('opens from the trigger with ArrowDown, highlighting the first item', async () => {
    const page = await h.open('list-popup');
    await page.focus('#trigger');
    await page.keyboard.press('ArrowDown');
    await see.poll(() => focused(page)).toBe('item-apple');
    expect(await logOf(page)).toContain('open true list-navigation');
  });

  it('highlights the item under the pointer', async () => {
    const page = await h.open('list-popup');
    await page.click('#trigger');
    await page.hover('#item-cherry');
    await see(page.locator('#item-cherry')).toHaveAttribute('data-highlighted', '');
    await see.poll(() => focused(page)).toBe('item-cherry');
  });
});

describe('useTypeahead', () => {
  it('highlights the item a typed letter matches', async () => {
    const page = await h.open('list-popup');
    await page.click('#trigger');
    await page.keyboard.press('c');
    await see.poll(() => focused(page)).toBe('item-cherry');
  });

  it('matches a typed prefix of several letters', async () => {
    const page = await h.open('list-popup');
    await page.click('#trigger');
    await page.keyboard.type('bl');
    await see.poll(() => focused(page)).toBe('item-blueberry');
  });

  it('wraps the search past the highlighted item', async () => {
    const page = await h.open('list-popup');
    await page.click('#trigger');
    await page.keyboard.press('End');
    await see.poll(() => focused(page)).toBe('item-cherry');
    await page.keyboard.press('a');
    await see.poll(() => focused(page)).toBe('item-apple');
  });

  it('skips a disabled item', async () => {
    const page = await h.open('list-popup');
    await page.click('#trigger');
    await page.keyboard.press('b');
    // Banana is disabled, so the first match is Blueberry.
    await see.poll(() => focused(page)).toBe('item-blueberry');
  });
});

describe('useHover + safePolygon', () => {
  it('opens on hover and stays open while the pointer travels to the card', async () => {
    const page = await h.open('hover-card');
    const trigger = (await page.locator('#card-trigger').boundingBox())!;
    await page.mouse.move(trigger.x + 10, trigger.y + 10);
    await see(page.locator('#card')).toBeVisible();
    const card = (await page.locator('#card').boundingBox())!;
    // Leave the trigger towards the card, crossing the 40px gap.
    await page.mouse.move(card.x + 20, card.y + 20, { steps: 12 });
    // Landed on the card: no close is pending any more.
    await see(page.locator('#card')).toBeVisible();
    expect(await logOf(page)).not.toContain('open false trigger-hover');
    // Leaving the card closes it.
    await page.mouse.move(card.x + card.width + 100, card.y + card.height + 100, { steps: 4 });
    await see(page.locator('#card')).toHaveCount(0);
  });

  it('closes when the pointer leaves the trigger away from the card', async () => {
    const page = await h.open('hover-card');
    const trigger = (await page.locator('#card-trigger').boundingBox())!;
    await page.mouse.move(trigger.x + 10, trigger.y + 10);
    await see(page.locator('#card')).toBeVisible();
    await page.mouse.move(trigger.x - 30, trigger.y + 10, { steps: 4 });
    await see(page.locator('#card')).toHaveCount(0);
    expect(await logOf(page)).toContain('open false trigger-hover');
  });
});
