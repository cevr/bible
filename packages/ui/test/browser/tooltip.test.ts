// Upstream: packages/react/src/tooltip/root/TooltipRoot.test.tsx,
// packages/react/src/tooltip/trigger/TooltipTrigger.test.tsx,
// packages/react/src/tooltip/provider/TooltipProvider.test.tsx,
// packages/react/src/tooltip/popup/TooltipPopup.test.tsx,
// packages/react/src/tooltip/portal/TooltipPortal.test.tsx,
// packages/react/src/tooltip/arrow/TooltipArrow.test.tsx
//
// The tooltip's behaviour cases, in a real browser with a real pointer.
// Timing cases install Playwright's clock and advance it. Upstream's cases
// for parts not ported (viewport, detached triggers, handles and payloads,
// `trackCursorAxis`), for positioning math (covered by the floating layer's
// own tests) and for React-only machinery are left out.
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { type Page, expect as see } from '@playwright/test';

import { type Harness, focused, harness, logOf } from './harness.ts';

let h: Harness;
beforeAll(async () => {
  h = await harness('tooltip.tsx');
});
afterAll(async () => {
  await h.close();
});

async function center(page: Page, selector: string): Promise<{ x: number; y: number }> {
  const box = await page.locator(selector).boundingBox();
  if (!box) {
    throw new Error(`${selector} has no box`);
  }
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Installs the fake clock and stops it, so time moves only by `runFor`. */
async function freezeClock(page: Page): Promise<void> {
  await page.clock.install();
  await page.clock.pauseAt(Date.now() + 10_000);
}

async function moveTo(page: Page, selector: string): Promise<void> {
  const { x, y } = await center(page, selector);
  await page.mouse.move(x, y);
}

describe('hover', () => {
  it('opens when the trigger is hovered and closes when the pointer leaves', async () => {
    const page = await h.open('tooltip');
    const trigger = page.locator('#trigger');
    await see(trigger).not.toHaveAttribute('data-popup-open');
    await moveTo(page, '#trigger');
    await see(page.locator('#popup')).toBeVisible();
    await see(trigger).toHaveAttribute('data-popup-open', '');
    await see(page.locator('#popup')).toHaveAttribute('data-open', '');
    await see(page.locator('#popup')).not.toHaveAttribute('data-instant');
    await see.poll(() => focused(page)).not.toBe('trigger');
    await moveTo(page, '#outside');
    await see(page.locator('#popup')).toHaveCount(0);
    await see(trigger).not.toHaveAttribute('data-popup-open');
    const log = await logOf(page);
    expect(log).toContain('open true trigger-hover');
    expect(log).toContain('open false trigger-hover');
  });

  it('waits for the trigger delay (600 ms by default) before opening', async () => {
    const page = await h.open('tooltip', { query: { delay: 'default' } });
    await freezeClock(page);
    await moveTo(page, '#trigger');
    await page.clock.runFor(599);
    await see(page.locator('#popup')).toHaveCount(0);
    await page.clock.runFor(1);
    await see(page.locator('#popup')).toBeVisible();
  });

  it('waits for closeDelay before closing', async () => {
    const page = await h.open('tooltip', { query: { closeDelay: '300' } });
    await freezeClock(page);
    await moveTo(page, '#trigger');
    await see(page.locator('#popup')).toBeVisible();
    await moveTo(page, '#outside');
    await page.clock.runFor(299);
    await see(page.locator('#popup')).toHaveAttribute('data-open', '');
    await page.clock.runFor(1);
    await see(page.locator('#popup')).toHaveAttribute('data-closed', '');
    // The unmount waits for the exit animations, checked on animation frames.
    await page.clock.runFor(50);
    await see(page.locator('#popup')).toHaveCount(0);
  });

  it('stays open while the pointer travels from the trigger into the popup, then closes after leaving it', async () => {
    const page = await h.open('tooltip');
    await moveTo(page, '#trigger');
    await see(page.locator('#popup')).toBeVisible();
    await see(page.locator('#positioner')).not.toHaveCSS('pointer-events', 'none');
    const from = await center(page, '#trigger');
    const to = await center(page, '#popup');
    await page.mouse.move(from.x, from.y);
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await see(page.locator('#popup')).toBeVisible();
    await moveTo(page, '#outside');
    await see(page.locator('#popup')).toHaveCount(0);
  });

  it('closes on the trip to the popup with disableHoverablePopup, whose positioner lets the pointer through', async () => {
    const page = await h.open('tooltip', { query: { hoverable: 'false' } });
    await moveTo(page, '#trigger');
    await see(page.locator('#popup')).toBeVisible();
    await see(page.locator('#positioner')).toHaveCSS('pointer-events', 'none');
    const to = await center(page, '#popup');
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await see(page.locator('#popup')).toHaveCount(0);
  });
});

describe('focus', () => {
  it('opens on keyboard focus with data-instant="focus" and closes on blur', async () => {
    const page = await h.open('tooltip');
    await page.focus('#before');
    await page.keyboard.press('Tab');
    await see.poll(() => focused(page)).toBe('trigger');
    await see(page.locator('#popup')).toBeVisible();
    await see(page.locator('#popup')).toHaveAttribute('data-instant', 'focus');
    await page.keyboard.press('Tab');
    await see.poll(() => focused(page)).toBe('after');
    await see(page.locator('#popup')).toHaveCount(0);
    const log = await logOf(page);
    expect(log).toContain('open true trigger-focus');
    expect(log).toContain('open false trigger-focus');
  });
});

describe('dismissal', () => {
  it('closes on Escape, with data-instant="dismiss"', async () => {
    const page = await h.open('tooltip');
    await page.focus('#before');
    await page.keyboard.press('Tab');
    await see(page.locator('#popup')).toBeVisible();
    await page.keyboard.press('Escape');
    await see(page.locator('#popup')).toHaveCount(0);
    expect(await logOf(page)).toContain('open false escape-key');
  });

  it('closes when the trigger is pressed after the delay', async () => {
    const page = await h.open('tooltip');
    await moveTo(page, '#trigger');
    await see(page.locator('#popup')).toBeVisible();
    await page.mouse.down();
    await page.mouse.up();
    await see(page.locator('#popup')).toHaveCount(0);
    expect(await logOf(page)).toContain('open false trigger-press');
  });

  it('stays open when the trigger is pressed and closeOnClick is false', async () => {
    const page = await h.open('tooltip', { query: { closeOnClick: 'false' } });
    await moveTo(page, '#trigger');
    await see(page.locator('#popup')).toBeVisible();
    await page.mouse.down();
    await page.mouse.up();
    await see(page.locator('#popup')).toBeVisible();
    expect(await logOf(page)).not.toContain('open false trigger-press');
  });

  it('does not open when the trigger is pressed before the delay', async () => {
    const page = await h.open('tooltip', { query: { delay: 'default' } });
    await freezeClock(page);
    await moveTo(page, '#trigger');
    await page.clock.runFor(300);
    await page.mouse.down();
    await page.mouse.up();
    await page.clock.runFor(600);
    await see(page.locator('#popup')).toHaveCount(0);
  });

  it('opens after a press before the delay when closeOnClick is false', async () => {
    const page = await h.open('tooltip', { query: { delay: 'default', closeOnClick: 'false' } });
    await freezeClock(page);
    await moveTo(page, '#trigger');
    await page.clock.runFor(300);
    await page.mouse.down();
    await page.mouse.up();
    await page.clock.runFor(300);
    await see(page.locator('#popup')).toBeVisible();
  });

  it('closes when the imperative close action runs', async () => {
    const page = await h.open('tooltip', { query: { defaultOpen: 'true' } });
    await see(page.locator('#popup')).toBeVisible();
    await page.evaluate(() => document.getElementById('imperative-close')?.click());
    await see(page.locator('#popup')).toHaveCount(0);
    expect(await logOf(page)).toContain('open false imperative-action');
  });
});

describe('prop: disabled', () => {
  it('a disabled trigger opens on neither hover nor focus and is marked', async () => {
    const page = await h.open('tooltip', { query: { disabled: 'true' } });
    await see(page.locator('#trigger')).toHaveAttribute('data-trigger-disabled', '');
    await moveTo(page, '#trigger');
    await page.focus('#before');
    await page.keyboard.press('Tab');
    await see.poll(() => focused(page)).toBe('trigger');
    await see(page.locator('#popup')).toHaveCount(0);
    expect(await logOf(page)).toEqual([]);
  });

  it('a disabled root keeps the tooltip closed and marks the trigger', async () => {
    const page = await h.open('tooltip', { query: { rootDisabled: 'true', defaultOpen: 'true' } });
    await see(page.locator('#trigger')).toHaveAttribute('data-trigger-disabled', '');
    await see(page.locator('#popup')).toHaveCount(0);
    await moveTo(page, '#trigger');
    await see(page.locator('#popup')).toHaveCount(0);
  });

  it('closes an open tooltip when the root becomes disabled', async () => {
    const page = await h.open('tooltip');
    await page.focus('#before');
    await page.keyboard.press('Tab');
    await see(page.locator('#popup')).toBeVisible();
    await page.evaluate(() => document.getElementById('toggle-disabled')?.click());
    await see(page.locator('#popup')).toHaveCount(0);
    expect(await logOf(page)).toContain('open false disabled');
  });
});

describe('Tooltip.Root', () => {
  it('defaultOpen renders it open', async () => {
    const page = await h.open('tooltip', { query: { defaultOpen: 'true' } });
    await see(page.locator('#popup')).toBeVisible();
    await see(page.locator('#trigger')).toHaveAttribute('data-popup-open', '');
  });

  it('onOpenChange can cancel an open', async () => {
    const page = await h.open('tooltip', { query: { cancel: 'true' } });
    await moveTo(page, '#trigger');
    await see.poll(() => logOf(page)).toContain('open true trigger-hover');
    await see(page.locator('#popup')).toHaveCount(0);
  });

  it('a controlled tooltip follows its open prop and reports changes', async () => {
    const page = await h.open('controlled');
    // Pressed without the pointer, so no hover or outside press joins in.
    const toggle = () => page.evaluate(() => document.getElementById('toggle')?.click());
    await toggle();
    await see(page.locator('#popup')).toBeVisible();
    await toggle();
    await see(page.locator('#popup')).toHaveCount(0);
    expect(await logOf(page)).toEqual([]);
    await moveTo(page, '#trigger');
    await see(page.locator('#popup')).toBeVisible();
    expect(await logOf(page)).toContain('open true trigger-hover');
  });

  it('places the popup above the trigger with an aria-hidden arrow', async () => {
    const page = await h.open('tooltip', { query: { defaultOpen: 'true' } });
    await see(page.locator('#popup')).toHaveAttribute('data-side', 'top');
    await see(page.locator('#arrow')).toHaveAttribute('aria-hidden', 'true');
    await see(page.locator('#arrow')).toHaveAttribute('data-side', 'top');
    const trigger = await page.locator('#trigger').boundingBox();
    const popup = await page.locator('#popup').boundingBox();
    expect(popup && trigger && popup.y + popup.height <= trigger.y).toBe(true);
  });
});

describe('Tooltip.Provider', () => {
  it('waits for the provider delay', async () => {
    const page = await h.open('group', { query: { delay: '1000' } });
    await freezeClock(page);
    await moveTo(page, '#trigger-one');
    await page.clock.runFor(999);
    await see(page.locator('#popup-one')).toHaveCount(0);
    await page.clock.runFor(1);
    await see(page.locator('#popup-one')).toBeVisible();
  });

  it('opens an adjacent tooltip instantly while the group is active', async () => {
    const page = await h.open('group', { query: { timeout: '400' } });
    await freezeClock(page);
    await moveTo(page, '#trigger-one');
    await page.clock.runFor(100);
    await see(page.locator('#popup-one')).toBeVisible();
    await moveTo(page, '#trigger-two');
    await see(page.locator('#popup-two')).toBeVisible();
    await see(page.locator('#popup-two')).toHaveAttribute('data-instant', 'delay');
    await see(page.locator('#popup-one')).toHaveAttribute('data-closed', '');
    await page.clock.runFor(50);
    await see(page.locator('#popup-one')).toHaveCount(0);
    const log = await logOf(page);
    expect(log).toContain('one false none');
  });

  it('requires the full delay again once the timeout elapses', async () => {
    const page = await h.open('group', { query: { timeout: '400' } });
    await freezeClock(page);
    await moveTo(page, '#trigger-one');
    await page.clock.runFor(100);
    await see(page.locator('#popup-one')).toBeVisible();
    await moveTo(page, '#outside');
    await see(page.locator('#popup-one')).toHaveAttribute('data-closed', '');
    await page.clock.runFor(400);
    await see(page.locator('#popup-one')).toHaveCount(0);
    await moveTo(page, '#trigger-two');
    await page.clock.runFor(50);
    await see(page.locator('#popup-two')).toHaveCount(0);
    await page.clock.runFor(50);
    await see(page.locator('#popup-two')).toBeVisible();
    await see(page.locator('#popup-two')).not.toHaveAttribute('data-instant');
  });

  it('waits for the provider closeDelay before closing', async () => {
    const page = await h.open('group', { query: { closeDelay: '400' } });
    await freezeClock(page);
    await moveTo(page, '#trigger-one');
    await page.clock.runFor(100);
    await see(page.locator('#popup-one')).toBeVisible();
    await moveTo(page, '#outside');
    await page.clock.runFor(399);
    await see(page.locator('#popup-one')).toHaveAttribute('data-open', '');
    await page.clock.runFor(1);
    await see(page.locator('#popup-one')).toHaveAttribute('data-closed', '');
    await page.clock.runFor(50);
    await see(page.locator('#popup-one')).toHaveCount(0);
  });
});

describe('nested tooltips', () => {
  it('hovering a nested trigger opens only its tooltip; the parent area opens the outer one', async () => {
    const page = await h.open('nested');
    await moveTo(page, '#inner-trigger');
    await see(page.locator('#inner-popup')).toBeVisible();
    await see(page.locator('#outer-popup')).toHaveCount(0);
    const box = await page.locator('#outer-trigger').boundingBox();
    if (!box) {
      throw new Error('no outer trigger box');
    }
    await page.mouse.move(box.x + 4, box.y + 4);
    await see(page.locator('#outer-popup')).toBeVisible();
    await see(page.locator('#inner-popup')).toHaveCount(0);
  });

  it('moving from the outer area onto a nested trigger closes the hover-opened outer tooltip', async () => {
    const page = await h.open('nested');
    const box = await page.locator('#outer-trigger').boundingBox();
    if (!box) {
      throw new Error('no outer trigger box');
    }
    await page.mouse.move(box.x + 4, box.y + 4);
    await see(page.locator('#outer-popup')).toBeVisible();
    await moveTo(page, '#inner-trigger');
    await see(page.locator('#outer-popup')).toHaveCount(0);
    await see(page.locator('#inner-popup')).toBeVisible();
  });
});
