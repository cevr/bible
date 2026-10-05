// Upstream: packages/react/src/context-menu/trigger/ContextMenuTrigger.test.tsx,
// packages/react/src/context-menu/root/ContextMenuRoot.test.tsx
//
// The context menu's behaviour cases: right click at the pointer, the
// mouseup grace after a right click, the native menu suppression, and the
// touch long press with its move threshold. Timers run on `page.clock`;
// touches are dispatched as real TouchEvents in a touch context.
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { expect as see, type Page } from '@playwright/test';

import { type Harness, focused, harness, logOf } from './harness.ts';

let h: Harness;
beforeAll(async () => {
  h = await harness('context-menu.tsx');
});
afterAll(async () => {
  await h.close();
});

/** The centre of the trigger area. */
const areaCentre = async (page: Page): Promise<{ x: number; y: number }> => {
  const box = await page.locator('#area').boundingBox();
  if (!box) {
    throw new Error('no #area');
  }
  return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
};

/** Dispatches a TouchEvent of `type` at (x, y) with `count` fingers on the element there. */
const touch = (
  page: Page,
  type: 'touchstart' | 'touchmove' | 'touchend',
  x: number,
  y: number,
  count = 1,
): Promise<void> =>
  page.evaluate(
    ([type, x, y, count]) => {
      const target = document.elementFromPoint(x, y);
      if (!target) {
        throw new Error(`nothing at ${x},${y}`);
      }
      const touches = Array.from(
        { length: count },
        (_, i) => new Touch({ identifier: i, target, clientX: x + i * 30, clientY: y }),
      );
      target.dispatchEvent(
        new TouchEvent(type, {
          bubbles: true,
          cancelable: true,
          touches: type === 'touchend' ? [] : touches,
          changedTouches: touches,
        }),
      );
    },
    [type, x, y, count] as const,
  );

/**
 * A finger as the browser's own touch input (CDP `Input.dispatchTouchEvent`):
 * its touches, and the gestures and clicks the browser makes of them, are
 * the browser's, at real time.
 */
const finger = async (page: Page) => {
  const cdp = await page.context().newCDPSession(page);
  return {
    down: (x: number, y: number) =>
      cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }),
    up: () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }),
  };
};

/** The `id` of what is at (x, y), or of its nearest ancestor with one. */
const idAt = (page: Page, x: number, y: number): Promise<string> =>
  page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('[id]')?.id ?? '', [
    x,
    y,
  ] as const);

/** The centre of `selector`'s box. */
const centreOf = async (page: Page, selector: string): Promise<{ x: number; y: number }> => {
  const box = await page.locator(selector).boundingBox();
  if (!box) {
    throw new Error(`no ${selector}`);
  }
  return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
};

/** Whether a `contextmenu` event dispatched on `selector` had its default prevented. */
const nativeMenuBlocked = (page: Page, selector: string): Promise<boolean> =>
  page.evaluate((selector) => {
    const el = document.querySelector(selector);
    if (!el) {
      throw new Error(`no ${selector}`);
    }
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    el.dispatchEvent(event);
    return event.defaultPrevented;
  }, selector);

describe('ContextMenu.Trigger: right click', () => {
  it('opens the menu at the pointer and marks the trigger open', async () => {
    const page = await h.open('area');
    const { x, y } = await areaCentre(page);
    await page.mouse.click(x, y, { button: 'right' });
    await see(page.locator('#popup')).toBeVisible();
    await see(page.locator('#area')).toHaveAttribute('data-popup-open', '');
    await see(page.locator('#area')).toHaveAttribute('data-pressed', '');
    await see(page.locator('#positioner')).not.toHaveCSS('opacity', '0');
    const box = await page.locator('#positioner').boundingBox();
    // bottom/start at the point, nudged by the root context menu's -5 side and 2 align offsets.
    expect(Math.round(box?.y ?? 0)).toBe(y - 5);
    expect(Math.round(box?.x ?? 0)).toBe(x + 2);
    await see(page.locator('#positioner')).toHaveCSS('position', 'fixed');
    expect(await logOf(page)).toContain('open true trigger-press');
  });

  it('a second right click elsewhere in the area moves the menu there', async () => {
    const page = await h.open('area');
    const { x, y } = await areaCentre(page);
    await page.mouse.click(x, y, { button: 'right' });
    await see(page.locator('#popup')).toBeVisible();
    await page.mouse.click(x - 100, y - 50, { button: 'right' });
    await see
      .poll(async () => Math.round((await page.locator('#positioner').boundingBox())?.x ?? 0))
      .toBe(x - 100 + 2);
    await see(page.locator('#popup')).toBeVisible();
  });

  it('keyboard navigation and Escape work in the opened menu', async () => {
    const page = await h.open('area');
    const { x, y } = await areaCentre(page);
    await page.mouse.click(x, y, { button: 'right' });
    await see(page.locator('#popup')).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await see.poll(() => focused(page)).toBe('copy');
    await page.keyboard.press('Escape');
    await see(page.locator('#popup')).toHaveCount(0);
  });

  it('an item click runs it and closes the menu', async () => {
    const page = await h.open('area');
    const { x, y } = await areaCentre(page);
    await page.mouse.click(x, y, { button: 'right' });
    await page.click('#paste');
    await see(page.locator('#popup')).toHaveCount(0);
    expect(await logOf(page)).toContain('click paste');
  });

  it('suppresses the native context menu on the area and on the backdrop', async () => {
    const page = await h.open('area');
    expect(await nativeMenuBlocked(page, '#area')).toBe(true);
    const { x, y } = await areaCentre(page);
    await page.mouse.click(x, y, { button: 'right' });
    await see(page.locator('#backdrop')).toHaveAttribute('data-open', '');
    expect(await nativeMenuBlocked(page, '#backdrop')).toBe(true);
    expect(await nativeMenuBlocked(page, 'body')).toBe(false);
  });

  it('an open the root declines leaves the native context menu alone', async () => {
    const page = await h.open('area');
    expect(await nativeMenuBlocked(page, '#field')).toBe(false);
    await see(page.locator('#popup')).toHaveCount(0);
    expect(await logOf(page)).toContain('open declined');
    expect(await logOf(page)).not.toContain('open true');
  });
});

describe('ContextMenu.Trigger: the mouseup after a right click', () => {
  it('a release within 500ms of opening keeps the menu open', async () => {
    const page = await h.open('area');
    await page.clock.install();
    const { x, y } = await areaCentre(page);
    await page.mouse.move(x, y);
    await page.mouse.down({ button: 'right' });
    await see(page.locator('#popup')).toBeVisible();
    await page.clock.runFor(100);
    await page.mouse.move(5, 5);
    await page.mouse.up({ button: 'right' });
    await page.clock.runFor(1000);
    await see(page.locator('#popup')).toBeVisible();
  });

  it('a release outside the menu after 500ms closes it (cancel-open)', async () => {
    const page = await h.open('area');
    await page.clock.install();
    const { x, y } = await areaCentre(page);
    await page.mouse.move(x, y);
    await page.mouse.down({ button: 'right' });
    await see(page.locator('#popup')).toBeVisible();
    await page.clock.runFor(600);
    await page.mouse.move(5, 5);
    await page.mouse.up({ button: 'right' });
    await see(page.locator('#popup')).toHaveCount(0);
    expect(await logOf(page)).toContain('open false cancel-open');
  });

  it('a release inside the positioner after 500ms keeps the menu open', async () => {
    const page = await h.open('area');
    await page.clock.install();
    const { x, y } = await areaCentre(page);
    await page.mouse.move(x, y);
    await page.mouse.down({ button: 'right' });
    await see(page.locator('#popup')).toBeVisible();
    await page.clock.runFor(600);
    const sep = await page.locator('#positioner').boundingBox();
    await page.mouse.move((sep?.x ?? 0) + 1, (sep?.y ?? 0) + 1);
    await page.mouse.up({ button: 'right' });
    await page.clock.runFor(100);
    await see(page.locator('#popup')).toBeVisible();
    expect(await logOf(page)).not.toContain('open false cancel-open');
  });
});

describe('ContextMenu.Trigger: touch long press', () => {
  it('opens after a 500ms press held still', async () => {
    const page = await h.open('area', { touch: true });
    await page.clock.install();
    // Paused, so only runFor moves time and the 499ms check is exact.
    await page.clock.pauseAt(Date.now() + 10_000);
    const { x, y } = await areaCentre(page);
    await touch(page, 'touchstart', x, y);
    await page.clock.runFor(499);
    await see(page.locator('#popup')).toHaveCount(0);
    await page.clock.runFor(1);
    await see(page.locator('#popup')).toBeVisible();
    expect(await logOf(page)).toContain('open true trigger-press');
  });

  it('a move beyond 10px cancels the pending long press', async () => {
    const page = await h.open('area', { touch: true });
    await page.clock.install();
    const { x, y } = await areaCentre(page);
    await touch(page, 'touchstart', x, y);
    await page.clock.runFor(200);
    await touch(page, 'touchmove', x + 15, y);
    await page.clock.runFor(600);
    await see(page.locator('#popup')).toHaveCount(0);
  });

  it('a move within 10px keeps the pending long press', async () => {
    const page = await h.open('area', { touch: true });
    await page.clock.install();
    const { x, y } = await areaCentre(page);
    await touch(page, 'touchstart', x, y);
    await page.clock.runFor(200);
    await touch(page, 'touchmove', x + 5, y + 5);
    await page.clock.runFor(400);
    await see(page.locator('#popup')).toBeVisible();
  });

  it('lifting the finger cancels the pending long press', async () => {
    const page = await h.open('area', { touch: true });
    await page.clock.install();
    const { x, y } = await areaCentre(page);
    await touch(page, 'touchstart', x, y);
    await page.clock.runFor(200);
    await touch(page, 'touchend', x, y);
    await page.clock.runFor(600);
    await see(page.locator('#popup')).toHaveCount(0);
  });

  it('the finger that opened the menu over itself lifts choosing nothing; a later tap chooses the item it lands on', async () => {
    // The browser's own touches at real time (no page clock): the browser
    // makes of the lift what it would of a finger's, a click under it included.
    const page = await h.open('area', { touch: true, query: { under: 'true' } });
    const f = await finger(page);
    const { x, y } = await areaCentre(page);
    await f.down(x, y);
    await see(page.locator('#popup')).toBeVisible();
    // The menu opened over the finger: its first item is under it.
    expect(await idAt(page, x, y)).toBe('copy');
    const paste = await centreOf(page, '#paste');
    await f.up();
    // A later tap, on the next item: the browser handles it after the lift,
    // so once it has chosen, whatever the lift did is done. The lift chose
    // nothing (no Copy), and the menu was still open for the tap to choose Paste.
    await f.down(paste.x, paste.y);
    await f.up();
    await see
      .poll(() => logOf(page))
      .toEqual(['open true trigger-press', 'click paste', 'open false item-press']);
  });

  it('a second finger cancels the pending long press', async () => {
    const page = await h.open('area', { touch: true });
    await page.clock.install();
    const { x, y } = await areaCentre(page);
    await touch(page, 'touchstart', x, y);
    await page.clock.runFor(200);
    await touch(page, 'touchmove', x, y, 2);
    await page.clock.runFor(600);
    await see(page.locator('#popup')).toHaveCount(0);
  });
});

describe('ContextMenu.Root: outside press after a long press', () => {
  it('is ignored for 500ms after the menu opens, then closes it', async () => {
    const page = await h.open('area', { touch: true });
    await page.clock.install();
    await page.clock.pauseAt(Date.now() + 10_000);
    const { x, y } = await areaCentre(page);
    await touch(page, 'touchstart', x, y);
    await page.clock.runFor(500);
    await see(page.locator('#popup')).toBeVisible();
    await touch(page, 'touchend', x, y);
    await page.mouse.click(5, 5);
    await see(page.locator('#popup')).toBeVisible();
    await page.clock.runFor(500);
    await page.mouse.click(5, 5);
    // The unmount after close waits on a frame, which the paused clock holds.
    await page.clock.runFor(100);
    await see(page.locator('#popup')).toHaveCount(0);
    expect(await logOf(page)).toContain('open false outside-press');
  });
});

describe('ContextMenu.Root: reactivity', () => {
  it('mounts and opens without reading reactive props outside a tracking scope', async () => {
    const page = await h.open('area');
    const warnings: Array<string> = [];
    page.on('console', (message) => {
      if (message.text().includes('STRICT_READ_UNTRACKED')) {
        warnings.push(message.text());
      }
    });
    await page.reload();
    await page.locator('#root[data-mounted]').waitFor({ state: 'attached' });
    const { x, y } = await areaCentre(page);
    await page.mouse.click(x, y, { button: 'right' });
    await see(page.locator('#popup')).toBeVisible();
    expect(warnings).toEqual([]);
  });
});

describe('ContextMenu.Root: disabled', () => {
  it('a press pending when the root becomes disabled does not open', async () => {
    const page = await h.open('area', { touch: true });
    await page.clock.install();
    await page.clock.pauseAt(Date.now() + 10_000);
    const { x, y } = await areaCentre(page);
    await touch(page, 'touchstart', x, y);
    await page.clock.runFor(200);
    await page.evaluate(() =>
      (window as unknown as { __setDisabled: (next: boolean) => void }).__setDisabled(true),
    );
    await page.clock.runFor(600);
    await see(page.locator('#popup')).toHaveCount(0);
    expect(await logOf(page)).not.toContain('open true trigger-press');
  });

  it('does not open on right click or long press, and leaves the native menu alone', async () => {
    const page = await h.open('area', { query: { disabled: 'true' }, touch: true });
    await page.clock.install();
    const { x, y } = await areaCentre(page);
    expect(await nativeMenuBlocked(page, '#area')).toBe(false);
    await touch(page, 'touchstart', x, y);
    await page.clock.runFor(600);
    await see(page.locator('#popup')).toHaveCount(0);
  });
});
