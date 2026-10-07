// Upstream: packages/react/src/drawer/root/DrawerRoot.test.tsx,
// packages/react/src/drawer/popup/DrawerPopup.test.tsx,
// packages/react/src/drawer/viewport/DrawerViewport.test.tsx
//
// The drawer's behaviour cases: opening and closing as a dialog, and swipe to
// dismiss (past the threshold, by a flick, or springing back). Every drawer
// opens from its owner's `open`, as every page's does. Gestures are
// synthetic pointer events whose `timeStamp` is set, so a drag's velocity is
// exact. A finger on a scrolling body is the browser's own touches, so it
// scrolls natively; the touch scroll arbitration's iOS cases are left out.
import { describe, expect, it } from 'bun:test';

import { expect as see, type Page } from '@playwright/test';

import { focused, harness, logOf } from './harness.ts';

const h = harness('drawer.tsx');

interface DragOptions {
  /** Moves between the press and the release. @default 8 */
  steps?: number;
  /** Milliseconds between moves (sets the drag's velocity). @default 50 */
  stepMs?: number;
  /** Milliseconds between the last move and the release. @default 0 */
  holdMs?: number;
}

/**
 * Drags from one point to another with synthetic mouse pointer events sent
 * to the element under the press (as pointer capture would), each with a
 * `timeStamp` `stepMs` after the last.
 */
async function drag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  options: DragOptions = {},
) {
  const { steps = 8, stepMs = 50, holdMs = 0 } = options;
  await page.evaluate(
    ({ from, to, steps, stepMs, holdMs }) => {
      const target = document.elementFromPoint(from.x, from.y);
      if (!target) {
        throw new Error(`nothing at ${from.x},${from.y}`);
      }
      let time = performance.now();
      const fire = (type: string, x: number, y: number, buttons: number) => {
        const event = new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          clientX: x,
          clientY: y,
          pointerId: 1,
          pointerType: 'mouse',
          isPrimary: true,
          button: type === 'pointermove' ? -1 : 0,
          buttons,
        });
        Object.defineProperty(event, 'timeStamp', { value: time });
        target.dispatchEvent(event);
      };
      fire('pointerdown', from.x, from.y, 1);
      for (let step = 1; step <= steps; step += 1) {
        time += stepMs;
        fire(
          'pointermove',
          from.x + ((to.x - from.x) * step) / steps,
          from.y + ((to.y - from.y) * step) / steps,
          1,
        );
      }
      time += holdMs;
      fire('pointerup', to.x, to.y, 0);
    },
    { from, to, steps, stepMs, holdMs },
  );
}

/** Starts a drag and leaves the pointer down, for the mid-gesture state. */
async function pressAndMove(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  await page.evaluate(
    ({ from, to }) => {
      const target = document.elementFromPoint(from.x, from.y);
      if (!target) {
        throw new Error(`nothing at ${from.x},${from.y}`);
      }
      let time = performance.now();
      const fire = (type: string, x: number, y: number) => {
        const event = new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
          pointerId: 1,
          pointerType: 'mouse',
          isPrimary: true,
          button: type === 'pointermove' ? -1 : 0,
          buttons: 1,
        });
        Object.defineProperty(event, 'timeStamp', { value: time });
        target.dispatchEvent(event);
      };
      fire('pointerdown', from.x, from.y);
      for (let step = 1; step <= 4; step += 1) {
        time += 50;
        fire(
          'pointermove',
          from.x + ((to.x - from.x) * step) / 4,
          from.y + ((to.y - from.y) * step) / 4,
        );
      }
    },
    { from, to },
  );
}

const styleVar = (page: Page, selector: string, name: string) =>
  page
    .locator(selector)
    .evaluate((el, name) => (el as HTMLElement).style.getPropertyValue(name), name);

async function openDrawer(page: Page) {
  await page.click('#open');
  await see(page.locator('#popup')).toBeVisible();
  await see.poll(() => focused(page)).toBe('popup');
}

describe('Drawer.Root', () => {
  it('opens as a dialog that focuses its popup and names its swipe direction', async () => {
    const page = await h.open('drawer');
    await openDrawer(page);
    const popup = page.locator('#popup');
    await see(popup).toHaveAttribute('role', 'dialog');
    await see(popup).toHaveAttribute('aria-labelledby', 'title');
    await see(popup).toHaveAttribute('data-swipe-direction', 'down');
  });

  it('closes on Escape, on an outside press and from Drawer.Close', async () => {
    const page = await h.open('drawer');
    await openDrawer(page);
    await page.keyboard.press('Escape');
    await see(page.locator('#popup')).toHaveCount(0);
    await see.poll(() => focused(page)).toBe('open');
    await openDrawer(page);
    await page.mouse.click(400, 100);
    await see(page.locator('#popup')).toHaveCount(0);
    await openDrawer(page);
    await page.click('#close');
    await see(page.locator('#popup')).toHaveCount(0);
    expect(await logOf(page)).toEqual([
      'open false escape-key',
      'open false outside-press',
      'open false close-press',
    ]);
  });

  it('focuses the element initialFocus returns on open', async () => {
    const page = await h.open('drawer', { query: { initial: 'first' } });
    await page.click('#open');
    await see(page.locator('#popup')).toBeVisible();
    await see.poll(() => focused(page)).toBe('first');
  });

  it('leaves focus where it was when initialFocus returns false', async () => {
    const page = await h.open('drawer', { query: { initial: 'false' } });
    await page.click('#open');
    await see(page.locator('#popup')).toBeVisible();
    await see.poll(() => focused(page)).toBe('open');
  });

  it('takes its swipe direction per instance', async () => {
    const page = await h.open('drawer', { query: { direction: 'right' } });
    await openDrawer(page);
    await see(page.locator('#popup')).toHaveAttribute('data-swipe-direction', 'right');
    const box = await page.locator('#popup').boundingBox();
    expect(box?.x).toBe(500);
    expect(box?.width).toBe(300);
  });
});

describe('swipe to dismiss', () => {
  it('dismisses when released past half the popup', async () => {
    const page = await h.open('drawer');
    await openDrawer(page);
    // 220px down, slowly (the swipe counts from the first move: 192.5px of the 150px needed).
    await drag(page, { x: 400, y: 350 }, { x: 400, y: 570 });
    await see(page.locator('#popup')).toHaveCount(0);
    expect(await logOf(page)).toEqual(['open false swipe']);
  });

  it('springs back when released short of the threshold, slowly', async () => {
    const page = await h.open('drawer');
    await openDrawer(page);
    // 100px over 400ms: under half the popup, and slower than a flick.
    await drag(page, { x: 400, y: 350 }, { x: 400, y: 450 });
    const popup = page.locator('#popup');
    await see(popup).toBeVisible();
    await see(popup).not.toHaveAttribute('data-swiping', '');
    expect(await styleVar(page, '#popup', '--drawer-swipe-movement-y')).toBe('0px');
    expect(await logOf(page)).toEqual([]);
  });

  it('dismisses on a fast flick even when short', async () => {
    const page = await h.open('drawer');
    await openDrawer(page);
    // 60px in 40ms: 1.2px/ms, past the 0.5px/ms flick velocity.
    await drag(page, { x: 400, y: 350 }, { x: 400, y: 410 }, { steps: 4, stepMs: 10 });
    await see(page.locator('#popup')).toHaveCount(0);
    expect(await logOf(page)).toContain('open false swipe');
  });

  it('marks the popup while swiping and moves it with the drag', async () => {
    const page = await h.open('drawer');
    await openDrawer(page);
    await pressAndMove(page, { x: 400, y: 350 }, { x: 400, y: 410 });
    await see(page.locator('#popup')).toHaveAttribute('data-swiping', '');
    // The swipe starts at the first move (15px in), so 45px of the 60px count.
    expect(await styleVar(page, '#popup', '--drawer-swipe-movement-y')).toBe('45px');
  });

  it('damps a drag against the dismiss direction to its square root', async () => {
    const page = await h.open('drawer');
    await openDrawer(page);
    // 48px up in four moves; the swipe starts at the first (12px in), so 36px count, damped to 6.
    await pressAndMove(page, { x: 400, y: 450 }, { x: 400, y: 402 });
    await see(page.locator('#popup')).toHaveAttribute('data-swiping', '');
    expect(await styleVar(page, '#popup', '--drawer-swipe-movement-y')).toBe('-6px');
  });

  it('a mouse drag that stays on a button never starts a swipe', async () => {
    const page = await h.open('drawer');
    await openDrawer(page);
    const box = await page.locator('#first').boundingBox();
    const x = (box?.x ?? 0) + 10;
    const y = (box?.y ?? 0) + 10;
    // A flick that would dismiss from the sheet itself (60px in 40ms).
    await drag(page, { x, y }, { x, y: y + 60 }, { steps: 4, stepMs: 10 });
    await see(page.locator('#popup')).toBeVisible();
    await see(page.locator('#popup')).not.toHaveAttribute('data-swiping', '');
    expect(await logOf(page)).toEqual([]);
  });

  it('a drag against the dismiss direction does not dismiss', async () => {
    const page = await h.open('drawer');
    await openDrawer(page);
    await drag(page, { x: 400, y: 450 }, { x: 400, y: 320 }, { stepMs: 10 });
    await see(page.locator('#popup')).toBeVisible();
    expect(await logOf(page)).toEqual([]);
  });

  it('a side sheet dismisses on a swipe right, not down', async () => {
    const page = await h.open('drawer', { query: { direction: 'right' } });
    await openDrawer(page);
    await drag(page, { x: 650, y: 400 }, { x: 650, y: 590 });
    await see(page.locator('#popup')).toBeVisible();
    await drag(page, { x: 600, y: 400 }, { x: 780, y: 400 });
    await see(page.locator('#popup')).toHaveCount(0);
    expect(await logOf(page)).toEqual(['open false swipe']);
  });

  it('holds the swiped sheet away from rest until an async owner drops it', async () => {
    const page = await h.open('async-owner');
    await openDrawer(page);
    // Every frame from the press to the unmount: the popup's translateY, or null once gone.
    await page.evaluate(() => {
      const samples: Array<number | null> = [];
      (window as unknown as { __samples: typeof samples }).__samples = samples;
      const sample = () => {
        const popup = document.getElementById('popup');
        samples.push(popup ? new DOMMatrix(getComputedStyle(popup).transform).m42 : null);
        if (popup) {
          requestAnimationFrame(sample);
        }
      };
      requestAnimationFrame(sample);
    });
    await drag(page, { x: 400, y: 350 }, { x: 400, y: 570 });
    await see(page.locator('#popup')).toHaveCount(0);
    expect(await logOf(page)).toEqual(['open false swipe']);
    const samples = await page.evaluate(
      () => (window as unknown as { __samples: Array<number | null> }).__samples,
    );
    // Once the swipe has moved the sheet, no frame shows it back at rest before it goes.
    const moved = samples.findIndex((y) => y != null && y > 0);
    expect(moved).toBeGreaterThanOrEqual(0);
    const mounted = samples.slice(moved).filter((y): y is number => y != null);
    expect(mounted.filter((y) => y === 0)).toEqual([]);
  });

  it('springs back when the owner cancels the swipe close', async () => {
    const page = await h.open('drawer', { query: { owner: 'cancel' } });
    await openDrawer(page);
    await drag(page, { x: 400, y: 350 }, { x: 400, y: 570 });
    const popup = page.locator('#popup');
    await see(popup).toBeVisible();
    await see(popup).not.toHaveAttribute('data-swipe-dismiss', '');
    await see(popup).not.toHaveAttribute('data-ending-style', '');
    expect(await styleVar(page, '#popup', '--drawer-swipe-movement-y')).toBe('0px');
    expect(await logOf(page)).toEqual(['open false swipe']);
  });

  it('never starts a pointer swipe inside Drawer.Content', async () => {
    const page = await h.open('drawer');
    await openDrawer(page);
    const box = await page.locator('#content').boundingBox();
    const x = (box?.x ?? 0) + 20;
    const y = (box?.y ?? 0) + (box?.height ?? 0) / 2;
    await drag(page, { x, y }, { x, y: y + 250 });
    await see(page.locator('#popup')).toBeVisible();
  });
});

/**
 * A finger pressed at the middle of `#content` and moved `distance` px down
 * in `steps` moves, then lifted: the browser's own touches (CDP), so it
 * scrolls natively where nothing prevents it.
 */
async function fingerDownContent(page: Page, distance: number, steps: number) {
  const cdp = await page.context().newCDPSession(page);
  const at = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number, y: number) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x, y }],
    });
  const box = await page.locator('#content').boundingBox();
  const x = (box?.x ?? 0) + 20;
  const y = (box?.y ?? 0) + (box?.height ?? 0) / 2;
  await at('touchStart', x, y);
  // One move after another, in order.
  await Array.from({ length: steps }, (_, i) => y + (distance * (i + 1)) / steps).reduce<
    Promise<unknown>
  >((previous, moveY) => previous.then(() => at('touchMove', x, moveY)), Promise.resolve());
  await at('touchEnd', x, y + distance);
}

const contentScrollTop = (page: Page) => page.locator('#content').evaluate((el) => el.scrollTop);

describe('a finger on a scrolling body', () => {
  it('scrolls a body scrolled down, and leaves the sheet open', async () => {
    const page = await h.open('drawer', { touch: true, query: { body: 'tall' } });
    await openDrawer(page);
    await page.locator('#content').evaluate((el) => (el.scrollTop = 300));
    await fingerDownContent(page, 80, 8);
    await see.poll(() => contentScrollTop(page)).toBeLessThan(300);
    expect(await contentScrollTop(page)).toBeGreaterThan(0);
    await see(page.locator('#popup')).toBeVisible();
    await see(page.locator('#popup')).not.toHaveAttribute('data-swiping', '');
    expect(await logOf(page)).toEqual([]);
  });

  it('dismisses the sheet from a body at its top', async () => {
    const page = await h.open('drawer', { touch: true, query: { body: 'tall' } });
    await openDrawer(page);
    expect(await contentScrollTop(page)).toBe(0);
    await fingerDownContent(page, 200, 10);
    await see(page.locator('#popup')).toHaveCount(0);
    expect(await logOf(page)).toEqual(['open false swipe']);
  });
});
