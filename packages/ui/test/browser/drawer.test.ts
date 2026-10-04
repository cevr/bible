// Upstream: packages/react/src/drawer/root/DrawerRoot.test.tsx,
// packages/react/src/drawer/root/DrawerSnapPoints.test.tsx,
// packages/react/src/drawer/popup/DrawerPopup.test.tsx,
// packages/react/src/drawer/viewport/DrawerViewport.test.tsx,
// packages/react/src/drawer/swipe-area/DrawerSwipeArea.test.tsx,
// packages/react/src/drawer/provider/DrawerProvider.test.tsx,
// packages/react/src/drawer/indent/DrawerIndent.test.tsx
//
// The drawer's behaviour cases: opening and closing as a dialog, swipe to
// dismiss (past the threshold, by a flick, or springing back), the swipe
// area's open gesture, snap points, nested drawers and the provider's
// indent. Gestures are synthetic pointer events whose `timeStamp` is set, so
// a drag's velocity is exact. The virtual keyboard provider, detached
// triggers and the touch scroll arbitration's iOS cases are left out.
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { expect as see, type Page } from '@playwright/test';

import { type Harness, focused, harness, logOf } from './harness.ts';

let h: Harness;
beforeAll(async () => {
  h = await harness('drawer.tsx');
});
afterAll(async () => {
  await h.close();
});

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
  await page.click('#trigger');
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
    await see(popup).toHaveAttribute('aria-describedby', 'description');
    await see(popup).toHaveAttribute('data-swipe-direction', 'down');
    await see(page.locator('#trigger')).toHaveAttribute('aria-expanded', 'true');
  });

  it('closes on Escape, on an outside press and from Drawer.Close', async () => {
    const page = await h.open('drawer');
    await openDrawer(page);
    await page.keyboard.press('Escape');
    await see(page.locator('#popup')).toHaveCount(0);
    await see.poll(() => focused(page)).toBe('trigger');
    await openDrawer(page);
    await page.mouse.click(400, 100);
    await see(page.locator('#popup')).toHaveCount(0);
    await openDrawer(page);
    await page.click('#close');
    await see(page.locator('#popup')).toHaveCount(0);
    expect(await logOf(page)).toEqual([
      'open true trigger-press',
      'open false escape-key',
      'open true trigger-press',
      'open false outside-press',
      'open true trigger-press',
      'open false close-press',
    ]);
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
    expect(await logOf(page)).toEqual(['open true trigger-press', 'open false swipe']);
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
    expect(await logOf(page)).toEqual(['open true trigger-press']);
  });

  it('dismisses on a fast flick even when short', async () => {
    const page = await h.open('drawer');
    await openDrawer(page);
    // 60px in 40ms: 1.2px/ms, past the 0.5px/ms flick velocity.
    await drag(page, { x: 400, y: 350 }, { x: 400, y: 410 }, { steps: 4, stepMs: 10 });
    await see(page.locator('#popup')).toHaveCount(0);
    expect(await logOf(page)).toContain('open false swipe');
  });

  it('marks the popup and the backdrop while swiping and moves the popup with the drag', async () => {
    const page = await h.open('drawer');
    await openDrawer(page);
    await pressAndMove(page, { x: 400, y: 350 }, { x: 400, y: 410 });
    await see(page.locator('#popup')).toHaveAttribute('data-swiping', '');
    await see(page.locator('#backdrop')).toHaveAttribute('data-swiping', '');
    // The swipe starts at the first move (15px in), so 45px of the 60px count.
    expect(await styleVar(page, '#popup', '--drawer-swipe-movement-y')).toBe('45px');
    const progress = Number(await styleVar(page, '#backdrop', '--drawer-swipe-progress'));
    expect(progress).toBeCloseTo(0.15, 2);
  });

  it('a drag against the dismiss direction does not dismiss', async () => {
    const page = await h.open('drawer');
    await openDrawer(page);
    await drag(page, { x: 400, y: 450 }, { x: 400, y: 320 }, { stepMs: 10 });
    await see(page.locator('#popup')).toBeVisible();
    expect(await logOf(page)).toEqual(['open true trigger-press']);
  });

  it('a side sheet dismisses on a swipe right, not down', async () => {
    const page = await h.open('drawer', { query: { direction: 'right' } });
    await openDrawer(page);
    await drag(page, { x: 650, y: 400 }, { x: 650, y: 590 });
    await see(page.locator('#popup')).toBeVisible();
    await drag(page, { x: 600, y: 400 }, { x: 780, y: 400 });
    await see(page.locator('#popup')).toHaveCount(0);
    expect(await logOf(page)).toEqual(['open true trigger-press', 'open false swipe']);
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

describe('Drawer.SwipeArea', () => {
  it('removed mid-drag, leaves the drawer open with no drag styles behind', async () => {
    const page = await h.open('drawer', { query: { area: 'true' } });
    await pressAndMove(page, { x: 400, y: 590 }, { x: 400, y: 530 });
    const popup = page.locator('#popup');
    await see(popup).toHaveAttribute('data-swiping', '');
    await page.evaluate(() => (window as unknown as { __removeArea: () => void }).__removeArea());
    await see(page.locator('#area')).toHaveCount(0);
    await see(popup).toBeVisible();
    await see(popup).not.toHaveAttribute('data-swiping', '');
    expect(await styleVar(page, '#popup', '--drawer-swipe-movement-y')).toBe('');
    expect(await popup.evaluate((el) => (el as HTMLElement).style.transition)).not.toBe('none');
    await page.click('#first');
    await see(popup).toBeVisible();
  });

  it('is hidden from assistive tech and pans across its axis', async () => {
    const page = await h.open('drawer', { query: { area: 'true' } });
    const area = page.locator('#area');
    await see(area).toHaveAttribute('role', 'presentation');
    await see(area).toHaveAttribute('aria-hidden', 'true');
    await see(area).toHaveAttribute('data-swipe-direction', 'up');
    await see(area).toHaveAttribute('data-closed', '');
    await see(area).toHaveCSS('touch-action', 'pan-x');
  });

  it('opens the drawer with a swipe past half the popup', async () => {
    const page = await h.open('drawer', { query: { area: 'true' } });
    await drag(page, { x: 400, y: 590 }, { x: 400, y: 400 }, { holdMs: 200 });
    const popup = page.locator('#popup');
    await see(popup).toBeVisible();
    await see(page.locator('#area')).toHaveAttribute('data-open', '');
    await see(popup).not.toHaveAttribute('data-swiping', '');
    expect(await logOf(page)).toEqual(['open true swipe']);
  });

  it('closes again when released short, slowly', async () => {
    const page = await h.open('drawer', { query: { area: 'true' } });
    // 60px up, then a hold: neither far enough nor a flick.
    await drag(page, { x: 400, y: 590 }, { x: 400, y: 530 }, { holdMs: 200 });
    await see(page.locator('#popup')).toHaveCount(0);
    expect(await logOf(page)).toEqual(['open true swipe', 'open false swipe']);
  });

  it('opens on a short flick', async () => {
    const page = await h.open('drawer', { query: { area: 'true' } });
    await drag(page, { x: 400, y: 590 }, { x: 400, y: 550 }, { steps: 4, stepMs: 10 });
    await see(page.locator('#popup')).toBeVisible();
    expect(await logOf(page)).toEqual(['open true swipe']);
  });

  it('follows the drag in, with the backdrop fading to match', async () => {
    const page = await h.open('drawer', { query: { area: 'true' } });
    await pressAndMove(page, { x: 400, y: 590 }, { x: 400, y: 530 });
    await see(page.locator('#popup')).toHaveAttribute('data-swiping', '');
    await see(page.locator('#area')).toHaveAttribute('data-swiping', '');
    // 60px of a 300px popup: 240px still to come in.
    await see.poll(() => styleVar(page, '#popup', '--drawer-swipe-movement-y')).toBe('240px');
    expect(Number(await styleVar(page, '#backdrop', '--drawer-swipe-progress'))).toBeCloseTo(
      0.8,
      2,
    );
  });

  it("the release's trailing click does not dismiss the drawer it opened", async () => {
    const page = await h.open('drawer', { query: { area: 'true' } });
    await drag(page, { x: 400, y: 590 }, { x: 400, y: 100 }, { holdMs: 200 });
    await see(page.locator('#popup')).toBeVisible();
    // The click a real release synthesizes, outside the popup.
    await page.evaluate(() => {
      document
        .elementFromPoint(400, 100)
        ?.dispatchEvent(
          new MouseEvent('click', { bubbles: true, detail: 1, clientX: 400, clientY: 100 }),
        );
    });
    await see(page.locator('#popup')).toBeVisible();
    // The next press of the user's own dismisses as usual.
    await page.mouse.click(400, 100);
    await see(page.locator('#popup')).toHaveCount(0);
  });

  it('opens a side sheet with a swipe left from the right edge', async () => {
    const page = await h.open('drawer', { query: { area: 'true', direction: 'right' } });
    await see(page.locator('#area')).toHaveAttribute('data-swipe-direction', 'left');
    await see(page.locator('#area')).toHaveCSS('touch-action', 'pan-y');
    await drag(page, { x: 790, y: 300 }, { x: 550, y: 300 }, { holdMs: 200 });
    await see(page.locator('#popup')).toBeVisible();
    expect(await logOf(page)).toEqual(['open true swipe']);
  });
});

describe('snap points', () => {
  it('opens on the first snap point and offsets the popup to show it', async () => {
    const page = await h.open('drawer', { query: { snap: 'true' } });
    await openDrawer(page);
    const popup = page.locator('#popup');
    await see(popup).toHaveCSS('--drawer-snap-point-offset', '200px');
    await see(popup).not.toHaveAttribute('data-expanded', '');
    const box = await popup.boundingBox();
    expect(box?.y).toBe(500);
  });

  it('a drag up settles on the taller point and marks it expanded', async () => {
    const page = await h.open('drawer', { query: { snap: 'true' } });
    await openDrawer(page);
    await drag(page, { x: 400, y: 550 }, { x: 400, y: 350 });
    const popup = page.locator('#popup');
    await see(popup).toHaveAttribute('data-expanded', '');
    await see(popup).toHaveCSS('--drawer-snap-point-offset', '0px');
    expect(await logOf(page)).toEqual(['open true trigger-press', 'snap 1 swipe']);
  });

  it('a short drag down from the top settles back on the nearest point', async () => {
    const page = await h.open('drawer', { query: { snap: 'true' } });
    await openDrawer(page);
    await drag(page, { x: 400, y: 550 }, { x: 400, y: 350 });
    await see(page.locator('#popup')).toHaveAttribute('data-expanded', '');
    // 150px down from the top lands nearer the 100px point (offset 200) than closed.
    await drag(page, { x: 400, y: 350 }, { x: 400, y: 500 }, { holdMs: 200 });
    await see(page.locator('#popup')).toHaveCSS('--drawer-snap-point-offset', '200px');
    expect(await logOf(page)).toEqual([
      'open true trigger-press',
      'snap 1 swipe',
      'snap 100px swipe',
    ]);
  });

  it('a drag down nearer closed than the lowest point dismisses, and reopens on the first point', async () => {
    const page = await h.open('drawer', { query: { snap: 'true' } });
    await openDrawer(page);
    await drag(page, { x: 400, y: 550 }, { x: 400, y: 350 });
    await see(page.locator('#popup')).toHaveAttribute('data-expanded', '');
    // From the top: 240px down (210px counted) lands nearer the 100px point than closed.
    await drag(page, { x: 400, y: 350 }, { x: 400, y: 590 }, { holdMs: 200 });
    await see(page.locator('#popup')).toHaveCSS('--drawer-snap-point-offset', '200px');
    // From the 100px point: 79px down (69px counted) lands nearer closed.
    await drag(page, { x: 400, y: 520 }, { x: 400, y: 599 }, { holdMs: 200 });
    await see(page.locator('#popup')).toHaveCount(0);
    expect(await logOf(page)).toEqual([
      'open true trigger-press',
      'snap 1 swipe',
      'snap 100px swipe',
      'snap null swipe',
      'open false swipe',
      'snap 100px swipe',
    ]);
    await openDrawer(page);
    await see(page.locator('#popup')).toHaveCSS('--drawer-snap-point-offset', '200px');
  });
});

describe('nested drawers', () => {
  it('counts the drawers open on top and carries the frontmost height', async () => {
    const page = await h.open('nested');
    await page.click('#trigger');
    const parent = page.locator('#parent-popup');
    await see(parent).toBeVisible();
    await see(parent).toHaveCSS('--nested-drawers', '0');
    await see(parent).toHaveCSS('--drawer-frontmost-height', '300px');
    await page.click('#child-trigger');
    const child = page.locator('#child-popup');
    await see(child).toBeVisible();
    await see(child).toHaveAttribute('data-nested', '');
    await see(parent).toHaveAttribute('data-nested-drawer-open', '');
    await see(parent).toHaveCSS('--nested-drawers', '1');
    await see(parent).toHaveCSS('--drawer-frontmost-height', '200px');
    await see(parent).toHaveCSS('--drawer-height', '300px');
    await page.click('#child-close');
    await see(child).toHaveCount(0);
    await see(parent).not.toHaveAttribute('data-nested-drawer-open', '');
    await see(parent).toHaveCSS('--drawer-frontmost-height', '300px');
  });

  it('Escape closes only the frontmost drawer', async () => {
    const page = await h.open('nested');
    await page.click('#trigger');
    await page.click('#child-trigger');
    await see.poll(() => focused(page)).toBe('child-popup');
    await page.keyboard.press('Escape');
    await see(page.locator('#child-popup')).toHaveCount(0);
    await see(page.locator('#parent-popup')).toBeVisible();
    expect(await logOf(page)).toEqual([
      'parent true trigger-press',
      'child true trigger-press',
      'child false escape-key',
    ]);
  });
});

describe('Drawer.Provider', () => {
  it('marks the indent and its background active while a drawer is open', async () => {
    const page = await h.open('provider');
    const indent = page.locator('#indent');
    const background = page.locator('#indent-background');
    await see(indent).toHaveAttribute('data-inactive', '');
    await see(background).toHaveAttribute('data-inactive', '');
    await see(indent).toHaveCSS('--drawer-swipe-progress', '0');
    await page.click('#trigger');
    await see(indent).toHaveAttribute('data-active', '');
    await see(background).toHaveAttribute('data-active', '');
    await page.click('#close');
    await see(indent).toHaveAttribute('data-inactive', '');
  });

  it('the indent follows the swipe progress', async () => {
    const page = await h.open('provider');
    await page.click('#trigger');
    await see.poll(() => focused(page)).toBe('popup');
    await pressAndMove(page, { x: 400, y: 350 }, { x: 400, y: 410 });
    await see
      .poll(async () => Number(await styleVar(page, '#indent', '--drawer-swipe-progress')))
      .toBeCloseTo(0.15, 2);
    await see(page.locator('#indent')).toHaveCSS('--drawer-height', '300px');
  });
});
