// Upstream: react-aria-components 1.22.1, packages/react-aria-components/test/Sheet.test.js.
// Copyright 2026 Adobe, Apache-2.0 (`../../src/sheet/LICENSE`); ported to Playwright on
// Solid 2, with the drawer suite's cases this sheet replaces.
//
// The sheet's behaviour cases. Every sheet opens from its owner's `open`, as
// every page's does. A swipe is native scrolling, so it is driven as the
// browser's own: a wheel over the panel (a mouse's or a trackpad's), a key, or
// a finger (CDP touches) on a touch page. A script's scroll of the container
// is no user's, and never a swipe away.
import { describe, expect, it } from 'bun:test';

import { expect as see, type Page } from '@playwright/test';

import { focused, harness, logOf } from './harness.ts';

const h = harness('sheet.tsx');

const box = async (page: Page, selector: string) => {
  const rect = await page.locator(selector).boundingBox();
  if (!rect) {
    throw new Error(`${selector} has no box`);
  }
  return rect;
};

/** Opens the sheet and waits for it to have scrolled in (focus moves in then). */
async function openSheet(page: Page, focus = 'popup') {
  await page.click('#open');
  await see(page.locator('#popup')).toBeVisible();
  await see.poll(() => focused(page)).toBe(focus);
}

/**
 * Scrolls the sheet's container to `to` (`0` is the start), as a script would: no gesture of the
 * user's, so never a swipe away (`wheelSheet` is the user's).
 */
const scrollSheet = (page: Page, to: { top?: number; left?: number }) =>
  page
    .locator('#overlay [data-sheet-scroll]')
    .first()
    .evaluate((el, to) => el.scrollTo(to), to);

const scrollState = (page: Page) =>
  page
    .locator('#overlay [data-sheet-scroll]')
    .first()
    .evaluate((el) => ({ top: el.scrollTop, left: el.scrollLeft }));

/**
 * A wheel over the middle of the sheet's panel, `dx` and `dy` px (negative toward the start):
 * a mouse's or a trackpad's swipe, the user's own.
 */
async function wheelSheet(page: Page, dx: number, dy: number) {
  // The middle of what shows of it: a sheet at a snap point shows only some.
  const at = await page.locator('#panel').evaluate((panel) => {
    const r = panel.getBoundingClientRect();
    const top = Math.max(r.top, 0);
    const left = Math.max(r.left, 0);
    return {
      x: (left + Math.min(r.right, innerWidth)) / 2,
      y: (top + Math.min(r.bottom, innerHeight)) / 2,
    };
  });
  await page.mouse.move(at.x, at.y);
  await page.mouse.wheel(dx, dy);
}

/**
 * The window laid out at `between`, then back at `size`, before any frame is drawn between: the
 * two changes sent together just after a frame, as a phone's window changes and changes back
 * while its page is too busy to draw (a toolbar, a keyboard, a quick turn).
 */
async function windowFlicker(
  page: Page,
  between: { width: number; height: number },
  size: { width: number; height: number },
  phone = false,
) {
  const cdp = await page.context().newCDPSession(page);
  const metrics = (to: { width: number; height: number }) =>
    cdp.send('Emulation.setDeviceMetricsOverride', { ...to, deviceScaleFactor: 1, mobile: phone });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  await Promise.all([metrics(between), metrics(size)]);
}

/** Hides (`display: none`) or shows what holds the sheet, as the lab hides a mode's section. */
const hideSection = (page: Page, hidden: boolean) =>
  page.locator('#section').evaluate((el, hide) => (el.style.display = hide ? 'none' : ''), hidden);

const opens = async (page: Page) => (await logOf(page)).filter((line) => line.startsWith('open'));

/**
 * Resolves once an IntersectionObserver of the page's own reports the content
 * hidden: observers are told in one task, in the order they were made, so the
 * sheet's (made first) has been told by then.
 */
const reportedHidden = (page: Page) => reported(page, false);

/** As `reportedHidden`, once the content is reported showing. */
const reportedShown = (page: Page) => reported(page, true);

const reported = (page: Page, showing: boolean) =>
  page.locator('#popup').evaluate(
    (content, showing) =>
      new Promise<void>((resolve) => {
        const observer = new IntersectionObserver((entries) => {
          if (entries.some((entry) => entry.isIntersecting === showing)) {
            observer.disconnect();
            resolve();
          }
        });
        observer.observe(content);
      }),
    showing,
  );

/**
 * Where a non-modal sheet's panel stands, and what a press reaches round it: `box`, its box;
 * `drawn`, whether it is drawn whole there (its container's clip cuts none of it); `inside`,
 * whether a press 3 px inside each of its edges and corners lands on it; `outside`, whether one
 * 3 px past each edge (inside the window) misses the sheet and reaches the page.
 */
const reachOf = (page: Page) =>
  page.evaluate(() => {
    const panel = document.getElementById('panel');
    const container = document.querySelector<HTMLElement>('#overlay [data-sheet-scroll]');
    if (!panel || !container) {
      return null;
    }
    const r = panel.getBoundingClientRect();
    const hits = (x: number, y: number, selector: string) =>
      document.elementFromPoint(x, y)?.closest(selector) != null;
    const midX = r.left + r.width / 2;
    const midY = r.top + r.height / 2;
    const inside: Array<[number, number]> = [
      [r.left + 3, midY],
      [r.right - 3, midY],
      [midX, r.top + 3],
      [midX, r.bottom - 3],
      [r.left + 3, r.top + 3],
      [r.right - 3, r.bottom - 3],
    ];
    const outside: Array<[number, number]> = [
      [r.left - 3, midY],
      [r.right + 3, midY],
      [midX, r.top - 3],
      [midX, r.bottom + 3],
    ];
    // Drawn whole: the container's clip (an `inset()` from its own box) cuts nothing of the panel.
    const inset = /^inset\(([^)]*)\)$/.exec(getComputedStyle(container).clipPath)?.[1];
    const [top = 0, right = top, bottom = top, left = right] = (inset ?? '0px')
      .split(/\s+/)
      .map((value) => Number.parseFloat(value));
    const c = container.getBoundingClientRect();
    const drawn =
      r.left >= c.left + left - 0.5 &&
      r.top >= c.top + top - 0.5 &&
      r.right <= c.right - right + 0.5 &&
      r.bottom <= c.bottom - bottom + 0.5;
    return {
      box: {
        x: Math.round(r.x),
        y: Math.round(r.y),
        width: Math.round(r.width),
        height: Math.round(r.height),
      },
      drawn,
      inside: inside.every(([x, y]) => hits(x, y, '#panel')),
      outside: outside
        .filter(([x, y]) => x >= 0 && y >= 0 && x < innerWidth && y < innerHeight)
        .every(([x, y]) => !hits(x, y, '#overlay')),
    };
  });

/** What `reachOf` answers of a sheet resting whole at `box`, the page round it live. */
const standsAt = (box: { x: number; y: number; width: number; height: number }) => ({
  box,
  drawn: true,
  inside: true,
  outside: true,
});

/** Resolves after the page's next two frames. */
const frames = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );

/**
 * Resolves after the page's next `count` frames (none for 0): the pace of a run of inputs,
 * on the page's own clock (about 16 ms a frame).
 */
const framesOf = (page: Page, count: number) =>
  page.evaluate(
    (count) =>
      new Promise<void>((resolve) => {
        const step = (left: number) =>
          left <= 0 ? resolve() : requestAnimationFrame(() => step(left - 1));
        step(count);
      }),
    count,
  );

/**
 * Resolves once an IntersectionObserver made now has seen the panel as drawn, then two frames
 * on: the sheet's own observer, made before it, was told of the same drawing first, and what it
 * asked of the sheet has been drawn.
 */
const observed = async (page: Page) => {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const panel = document.getElementById('panel');
        if (!panel) return resolve();
        const seen = new IntersectionObserver(() => {
          seen.disconnect();
          resolve();
        });
        seen.observe(panel);
      }),
  );
  await frames(page);
};

/** What `recordCrossing` leaves on the page's window. */
interface CrossingWindow {
  /** How far the sheet has scrolled in along its axis, 0 to 1. */
  entranceShare: () => number;
  /** Where the sheet was when the window first resized. */
  __crossed?: { entering: boolean; share: number };
}

/**
 * Gives the page `entranceShare()`, and records whether the sheet was still scrolling in when the
 * window first resized (read on the resize, before the sheet hears of it).
 */
const recordCrossing = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as CrossingWindow;
    w.entranceShare = () => {
      const scroller = document.querySelector<HTMLElement>('#overlay [data-sheet-scroll]');
      const position = document.getElementById('panel')?.getAttribute('data-position');
      if (!scroller) {
        return 0;
      }
      const across = position === 'right' || position === 'left';
      const share = across
        ? scroller.scrollLeft / Math.max(1, scroller.scrollWidth - scroller.clientWidth)
        : scroller.scrollTop / Math.max(1, scroller.scrollHeight - scroller.clientHeight);
      // A top or left sheet comes in from the end of its travel to its start.
      return position === 'top' || position === 'left' ? 1 - share : share;
    };
    addEventListener('resize', () => {
      w.__crossed ??= {
        entering: document.getElementById('panel')?.hasAttribute('data-entering') ?? false,
        share: w.entranceShare(),
      };
    });
  });

/** How far the sheet had come in, as an expression the page runs. */
const entranceShare = () => (window as unknown as CrossingWindow).entranceShare();

/**
 * Where the sheet was as the window first resized (`recordCrossing`), once the page has been
 * told of the resize: it is told on its next frame, after the viewport has changed.
 */
const crossing = async (page: Page) => {
  const crossed = await page.waitForFunction(
    () => (window as unknown as CrossingWindow).__crossed,
    undefined,
    { polling: 'raf' },
  );
  return (await crossed.jsonValue()) as { entering: boolean; share: number };
};

/**
 * The page's offset of the `breakpoint` fixture's panel, as the lab's page sets one: `--floor`
 * under a bottom sheet (a phone's dock), `--side` beside a right one (a scrollbar's gutter).
 */
const OFFSETS = `#panel[data-position="bottom"] { bottom: var(--floor, 0px); }
  #panel[data-position="right"] { right: var(--side, 0px); }`;

/**
 * Where the `breakpoint` fixture's panel rests in a window of `size`, its page's offset `by`
 * (`--floor` under a bottom sheet, `--side` beside a right one) applied: a 300 px bottom sheet
 * under 900 px wide, a 300 px right one from there.
 */
const restIn = (size: { width: number; height: number }, by = 0) =>
  size.width < 900
    ? { x: 0, y: size.height - 300 - by, width: size.width, height: 300 }
    : { x: size.width - 300 - by, y: 0, width: 300, height: size.height };

describe('its layout changing under it (hidden with what holds it, a window resized)', () => {
  const LAB = { modal: 'false', dismissal: 'disabled', portal: 'inline' };
  const REST = { x: 0, y: 300, width: 800, height: 300 };

  it('stays open while hidden, rests where it did when shown, and is swiped away after', async () => {
    const page = await h.open('sheet', { query: LAB });
    await openSheet(page);
    await hideSection(page, true);
    await reportedHidden(page);
    await see(page.locator('#popup')).toHaveCount(1);
    await hideSection(page, false);
    await see.poll(() => box(page, '#panel')).toEqual(REST);
    expect(await opens(page)).toEqual([]);
    // Shown again as the sheet's observer has it, before the swipe: one seen only after it is
    // no swipe of a sheet shown.
    await reportedShown(page);
    await wheelSheet(page, 0, -600);
    await see(page.locator('#popup')).toHaveCount(0);
    expect(await opens(page)).toEqual(['open false swipe']);
  });

  it('rests again when the window is resized under it, and stays open', async () => {
    const page = await h.open('sheet', { query: LAB });
    await openSheet(page);
    await page.setViewportSize({ width: 800, height: 1400 });
    await see.poll(() => box(page, '#panel')).toEqual({ ...REST, y: 1100 });
    await page.setViewportSize({ width: 800, height: 480 });
    await see.poll(() => box(page, '#panel')).toEqual({ ...REST, y: 180 });
    expect(await opens(page)).toEqual([]);
  });

  it('turns from a bottom sheet to a right one and back as the window crosses a breakpoint in one step, open, at rest and pressed over its panel alone', async () => {
    const page = await h.open('sheet', { query: { ...LAB, position: 'breakpoint' } });
    await openSheet(page);
    await see.poll(() => reachOf(page)).toEqual(standsAt(REST));
    const steps = [
      {
        viewport: { width: 1180, height: 820 },
        position: 'right',
        rest: { x: 880, y: 0, width: 300, height: 820 },
      },
      {
        viewport: { width: 820, height: 1180 },
        position: 'bottom',
        rest: { x: 0, y: 880, width: 820, height: 300 },
      },
      {
        viewport: { width: 1440, height: 900 },
        position: 'right',
        rest: { x: 1140, y: 0, width: 300, height: 900 },
      },
      {
        viewport: { width: 700, height: 900 },
        position: 'bottom',
        rest: { x: 0, y: 600, width: 700, height: 300 },
      },
    ];
    // One turn after another, each from where the last left it.
    const stood = await steps.reduce<Promise<Array<unknown>>>(async (before, step) => {
      const done = await before;
      await page.setViewportSize(step.viewport);
      await see(page.locator('#panel')).toHaveAttribute('data-position', step.position);
      await see.poll(() => reachOf(page)).toEqual(standsAt(step.rest));
      // Still so once the sheet's observer has seen the turn drawn: nothing read it as a swipe.
      await observed(page);
      return [...done, [step.position, await reachOf(page)]];
    }, Promise.resolve([]));
    expect(stood).toEqual(steps.map((step) => [step.position, standsAt(step.rest)]));
    expect(await opens(page)).toEqual([]);
  });

  it('follows its panel as its owner moves it with no resize, both ways: drawn whole, pressed over it alone, and open', async () => {
    // The lab's panel stands on an offset its page sets (a phone's dock, a laptop's scrollbar
    // gutter); the page changes it, by 61 px here, with nothing resized and the position kept.
    const cases = [
      {
        viewport: { width: 800, height: 600 },
        position: 'bottom',
        rest: (by: number) => ({ x: 0, y: 300 - by, width: 800, height: 300 }),
      },
      {
        viewport: { width: 1180, height: 820 },
        position: 'right',
        rest: (by: number) => ({ x: 880 - by, y: 0, width: 300, height: 820 }),
      },
    ];
    const followed = await Promise.all(
      cases.map(async ({ viewport, position, rest }) => {
        const page = await h.open('sheet', {
          viewport,
          query: { ...LAB, position: 'breakpoint' },
        });
        await page.addStyleTag({ content: OFFSETS });
        await openSheet(page);
        await see(page.locator('#panel')).toHaveAttribute('data-position', position);
        const moves = [61, 0, 61, 0];
        // One move after another, each from where the last left it.
        const stood = await moves.reduce<Promise<Array<unknown>>>(async (before, by) => {
          const done = await before;
          await page.evaluate(
            (by) =>
              ['--floor', '--side'].forEach((name) =>
                document.documentElement.style.setProperty(name, `${by}px`),
              ),
            by,
          );
          await see.poll(() => box(page, '#panel')).toEqual(rest(by));
          await frames(page);
          await observed(page);
          return [...done, await reachOf(page)];
        }, Promise.resolve([]));
        return { position, stood, opens: await opens(page) };
      }),
    );
    expect(followed).toEqual(
      cases.map(({ position, rest }) => ({
        position,
        stood: [61, 0, 61, 0].map((by) => standsAt(rest(by))),
        opens: [],
      })),
    );
  });

  it('with a snap point, its panel moved by its owner as it scrolls in, either way, it ends where it rests when opened so moved', async () => {
    // A snap point's marker moves with the panel, so the scroll the sheet rests at moves with it:
    // the entrance goes on to the rest of the layout it ends in, not the one it set off in.
    const VIEW = { width: 800, height: 600 };
    const query = { ...LAB, snap: '150' };
    // Where its panel stands, and whether a press 3 px inside its showing top lands on it and one
    // 3 px above it reaches the page.
    const standing = (page: Page) =>
      page.evaluate(() => {
        const panel = document.getElementById('panel')!;
        const r = panel.getBoundingClientRect();
        const x = r.left + r.width / 2;
        return {
          box: { x: Math.round(r.x), y: Math.round(r.y), width: r.width, height: r.height },
          pressed: [
            document.elementFromPoint(x, r.top + 3)?.closest('#panel') != null,
            document.elementFromPoint(x, r.top - 3)?.closest('#overlay') == null,
          ],
        };
      });
    const restsMoved = async (by: number) => {
      const page = await h.open('sheet', { viewport: VIEW, query });
      await page.addStyleTag({ content: OFFSETS });
      await page.evaluate(
        (by) => document.documentElement.style.setProperty('--floor', `${by}px`),
        by,
      );
      await openSheet(page);
      await frames(page);
      return standing(page);
    };
    const moves = [
      [0, 61],
      [61, 0],
    ] as const;
    const ended = await moves.reduce<Promise<Array<unknown>>>(async (before, [from, to]) => {
      const done = await before;
      const rest = await restsMoved(to);
      const page = await h.open('sheet', { viewport: VIEW, query });
      await page.addStyleTag({ content: OFFSETS });
      await page.evaluate(
        (by) => document.documentElement.style.setProperty('--floor', `${by}px`),
        from,
      );
      await recordCrossing(page);
      await page.click('#open');
      await see(page.locator('#panel')).toHaveAttribute('data-entering', '');
      await page.waitForFunction(() => entranceShare() > 0.03, undefined, { polling: 'raf' });
      await page.evaluate(
        (by) => document.documentElement.style.setProperty('--floor', `${by}px`),
        to,
      );
      const entering = await page.locator('#panel').getAttribute('data-entering');
      await see(page.locator('#panel')).not.toHaveAttribute('data-entering', '');
      await see.poll(() => standing(page)).toEqual(rest);
      await observed(page);
      const stood = await standing(page);
      return [
        ...done,
        { from, to, entering: entering !== null, moved: stood, rest, opens: await opens(page) },
      ];
    }, Promise.resolve([]));
    const rests = (ended as Array<{ rest: unknown }>).map((e) => e.rest);
    expect(ended).toEqual(
      moves.map(([from, to], i) => ({
        from,
        to,
        entering: true,
        moved: rests[i],
        rest: { box: expect.anything(), pressed: [true, true] },
        opens: [],
      })),
    );
  });

  it('a window resized under a finger dragging it down leaves it where the finger has it, and the swipe goes on', async () => {
    const page = await h.open('sheet', {
      touch: true,
      viewport: { width: 800, height: 600 },
      query: LAB,
    });
    await openSheet(page);
    const rest = await box(page, '#panel');
    const cdp = await page.context().newCDPSession(page);
    const start = Date.now() / 1000;
    const x = rest.x + 100;
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', step: number, y: number) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: type === 'touchEnd' ? [] : [{ x, y }],
        timestamp: start + step * 0.008,
      });
    const from = rest.y + 20;
    // Moves one after another, in order, 20 px each.
    const moves = (steps: ReadonlyArray<number>) =>
      steps.reduce<Promise<unknown>>(
        (previous, step) => previous.then(() => touch('touchMove', step, from + step * 20)),
        Promise.resolve(),
      );
    await touch('touchStart', 0, from);
    await moves([1, 2, 3, 4, 5, 6]);
    await frames(page);
    const dragged = (await box(page, '#panel')).y;
    // The window grows taller (a phone's toolbar going), the finger still down.
    await page.setViewportSize({ width: 800, height: 640 });
    await frames(page);
    await frames(page);
    const held = (await box(page, '#panel')).y;
    await moves([7, 8, 9, 10, 11, 12]);
    await touch('touchEnd', 13, from + 240);
    await see(page.locator('#popup'), 'swiped away').toHaveCount(0);
    // Still dragged down as far (the window's 40 px more below it): not put back at rest.
    expect([dragged - rest.y > 60, held - rest.y > 60, await opens(page)]).toEqual([
      true,
      true,
      ['open false swipe'],
    ]);
  });

  it('crossing the breakpoint as it scrolls in, at the start or on its way, either way, it ends open at rest at its new end, pressed over its panel alone', async () => {
    const NARROW = { width: 800, height: 600 };
    const WIDE = { width: 1180, height: 820 };
    // When it crosses: as the entrance starts (0), or once it has come that share of the way in.
    const cases = [NARROW, WIDE].flatMap((from) =>
      [0, 0.3, 0.7].map((when) => ({ from, to: from === NARROW ? WIDE : NARROW, when })),
    );
    // One case after another: a loaded page under three others would start its scroll late.
    const ended = await cases.reduce<Promise<Array<unknown>>>(async (before, c) => {
      const done = await before;
      const page = await h.open('sheet', {
        viewport: c.from,
        query: { ...LAB, position: 'breakpoint' },
      });
      await recordCrossing(page);
      await page.click('#open');
      await see(page.locator('#panel')).toHaveAttribute('data-entering', '');
      await page.waitForFunction((when) => entranceShare() >= when, c.when, { polling: 'raf' });
      await page.setViewportSize(c.to);
      const crossed = await crossing(page);
      await see(page.locator('#panel')).not.toHaveAttribute('data-entering', '');
      await see.poll(() => reachOf(page)).toEqual(standsAt(restIn(c.to)));
      await observed(page);
      return [
        ...done,
        { ...c, entering: crossed.entering, stood: await reachOf(page), opens: await opens(page) },
      ];
    }, Promise.resolve([]));
    expect(ended).toEqual(
      cases.map((c) => ({ ...c, entering: true, stood: standsAt(restIn(c.to)), opens: [] })),
    );
  });

  it('crossing the breakpoint twice four frames (about 60 ms) apart as it scrolls in ends open at rest where it started', async () => {
    const NARROW = { width: 800, height: 600 };
    const WIDE = { width: 1180, height: 820 };
    const ended = await [
      [NARROW, WIDE],
      [WIDE, NARROW],
    ].reduce<Promise<Array<unknown>>>(async (before, [from, to]) => {
      const done = await before;
      const page = await h.open('sheet', {
        viewport: from,
        query: { ...LAB, position: 'breakpoint' },
      });
      await recordCrossing(page);
      await page.click('#open');
      await page.waitForFunction(() => entranceShare() >= 0.3, undefined, { polling: 'raf' });
      await page.setViewportSize(to!);
      await framesOf(page, 4);
      await page.setViewportSize(from!);
      const crossed = await crossing(page);
      await see(page.locator('#panel')).not.toHaveAttribute('data-entering', '');
      await see.poll(() => reachOf(page)).toEqual(standsAt(restIn(from!)));
      await observed(page);
      return [...done, [crossed.entering, await reachOf(page), await opens(page)]];
    }, Promise.resolve([]));
    expect(ended).toEqual([
      [true, standsAt(restIn(NARROW)), []],
      [true, standsAt(restIn(WIDE)), []],
    ]);
  });

  it('turned to the other edge of its axis as it scrolls in, bottom and top, right and left, either way, it ends open at rest at its new edge', async () => {
    const NARROW = { width: 800, height: 600 };
    const WIDE = { width: 1180, height: 820 };
    // Where each rests whole in the window it ends in.
    const REST = {
      bottom: { x: 0, y: 300, width: 800, height: 300 },
      top: { x: 0, y: 0, width: 1180, height: 300 },
      right: { x: 500, y: 0, width: 300, height: 600 },
      left: { x: 0, y: 0, width: 300, height: 820 },
    };
    const turns = [
      { narrow: 'bottom', wide: 'top' },
      { narrow: 'right', wide: 'left' },
    ] as const;
    const cases = turns.flatMap((turn) => [
      { ...turn, from: NARROW, to: WIDE, ends: turn.wide },
      { ...turn, from: WIDE, to: NARROW, ends: turn.narrow },
    ]);
    // One case after another: a loaded page under three others would start its scroll late.
    const ended = await cases.reduce<Promise<Array<unknown>>>(async (before, c) => {
      const done = await before;
      const page = await h.open('sheet', {
        viewport: c.from,
        query: { ...LAB, position: 'breakpoint', narrow: c.narrow, wide: c.wide },
      });
      await recordCrossing(page);
      await page.click('#open');
      await page.waitForFunction(() => entranceShare() >= 0.3, undefined, { polling: 'raf' });
      await page.setViewportSize(c.to);
      const crossed = await crossing(page);
      await see(page.locator('#panel')).toHaveAttribute('data-position', c.ends);
      await see(page.locator('#panel')).not.toHaveAttribute('data-entering', '');
      await see.poll(() => reachOf(page)).toEqual(standsAt(REST[c.ends]));
      await observed(page);
      return [
        ...done,
        { turn: `${c.narrow}/${c.wide} to ${c.ends}`, entering: crossed.entering },
        await reachOf(page),
        await opens(page),
      ];
    }, Promise.resolve([]));
    expect(ended).toEqual(
      cases.flatMap((c) => [
        { turn: `${c.narrow}/${c.wide} to ${c.ends}`, entering: true },
        standsAt(REST[c.ends]),
        [],
      ]),
    );
  });

  it('carried out of view by a layout gone before it was drawn (a window shorter than its rest and back, a tablet turned and back), no gesture of the user’s, it rests again and asks nothing', async () => {
    // The window changes and changes back with no frame drawn between: the layout between
    // clamps the container's scroll, which carries the sheet out of view, and leaves its size as
    // it was. Three times each.
    const cases = [
      {
        query: LAB,
        size: { width: 800, height: 600 },
        between: { width: 800, height: 200 },
        rest: REST,
      },
      {
        query: { ...LAB, position: 'breakpoint' },
        size: { width: 820, height: 1180 },
        between: { width: 1180, height: 820 },
        rest: { x: 0, y: 880, width: 820, height: 300 },
      },
    ];
    const runs = cases.flatMap((c) => [c, c, c]);
    const ended = await runs.reduce<Promise<Array<unknown>>>(async (before, c) => {
      const done = await before;
      const page = await h.open('sheet', { viewport: c.size, query: c.query });
      await openSheet(page);
      await see.poll(() => reachOf(page)).toEqual(standsAt(c.rest));
      await windowFlicker(page, c.between, c.size);
      await see.poll(() => reachOf(page)).toEqual(standsAt(c.rest));
      // Still so once the sheet's observer has seen it drawn: nothing read it as a swipe.
      await observed(page);
      return [...done, await reachOf(page), await opens(page)];
    }, Promise.resolve([]));
    expect(ended).toEqual(runs.flatMap((c) => [standsAt(c.rest), []]));
  });

  it('a finger of the page’s that outlives the sheet’s leaves the sheet free to rest again', async () => {
    const page = await h.open('sheet', {
      touch: true,
      viewport: { width: 800, height: 600 },
      query: LAB,
    });
    await openSheet(page);
    // Where it rests in the window a phone's browser lays out.
    const rested = await reachOf(page);
    const cdp = await page.context().newCDPSession(page);
    const sheet = { x: 400, y: 600, id: 1 };
    const pageFinger = { x: 400, y: 100, id: 2 };
    const touch = (type: 'touchStart' | 'touchEnd', points: Array<typeof sheet>) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
    // A finger goes down on the sheet, another on the page; the sheet's lifts (the points a
    // touchEnd names are the ones lifted).
    await touch('touchStart', [sheet]);
    await touch('touchStart', [sheet, pageFinger]);
    await touch('touchEnd', [sheet]);
    await frames(page);
    // The page's finger still down, a layout carries the sheet out of view.
    await windowFlicker(page, { width: 800, height: 200 }, { width: 800, height: 600 }, true);
    await see.poll(() => reachOf(page)).toEqual(rested);
    await observed(page);
    const stood = await reachOf(page);
    await touch('touchEnd', [pageFinger]);
    expect([stood?.inside, stood, await opens(page)]).toEqual([true, rested, []]);
  });

  it('a finger holding it as its owner turns it (to the centre, to the other edge) leaves it where the finger has it, and once let go it rests, open', async () => {
    // A touch screen as wide as a laptop's window (a phone's browser would lay out 980 px, past
    // the breakpoint), so the turn comes as the window widens under the finger.
    const WIDE = { width: 1200, height: 820 };
    const cases = [
      { wide: 'center', rest: { x: 450, y: 260, width: 300, height: 300 } },
      { wide: 'top', rest: { x: 0, y: 0, width: 1200, height: 300 } },
    ] as const;
    const ended = await cases.reduce<Promise<Array<unknown>>>(async (before, c) => {
      const done = await before;
      const page = await h.open('sheet', {
        touch: true,
        query: { ...LAB, position: 'breakpoint', narrow: 'bottom', wide: c.wide },
      });
      const cdp = await page.context().newCDPSession(page);
      const metrics = (size: { width: number; height: number }) =>
        cdp.send('Emulation.setDeviceMetricsOverride', {
          ...size,
          deviceScaleFactor: 1,
          mobile: false,
        });
      await metrics({ width: 800, height: 600 });
      await page.waitForFunction(() => innerWidth === 800);
      await openSheet(page);
      const scrolled = () =>
        page.locator('#overlay [data-sheet-scroll]').evaluate((el) => Math.round(el.scrollTop));
      const atRest = await scrolled();
      const start = Date.now() / 1000;
      const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', step: number, y: number) =>
        cdp.send('Input.dispatchTouchEvent', {
          type,
          touchPoints: type === 'touchEnd' ? [] : [{ x: 400, y }],
          timestamp: start + step * 0.008,
        });
      // Dragged 100 px down, and held there.
      await touch('touchStart', 0, 420);
      await [1, 2, 3, 4, 5].reduce<Promise<unknown>>(
        (previous, step) => previous.then(() => touch('touchMove', step, 420 + step * 20)),
        Promise.resolve(),
      );
      await framesOf(page, 10);
      const dragged = await scrolled();
      // The window widens past the breakpoint: its owner turns it.
      await metrics({ width: 1180, height: 820 });
      await see(page.locator('#panel')).toHaveAttribute('data-position', c.wide);
      // And widens again, the finger still down: the turn did not let go of it.
      await metrics(WIDE);
      await framesOf(page, 4);
      const held = await scrolled();
      await touch('touchEnd', 60, 520);
      await see.poll(() => reachOf(page), { message: c.wide }).toEqual(standsAt(c.rest));
      await observed(page);
      // Dragged well down from where it rested (the browser's touch slop takes a little of it).
      return [
        ...done,
        { wide: c.wide, dragged: atRest - dragged > 50, held: held === dragged },
        await reachOf(page),
        await opens(page),
      ];
    }, Promise.resolve([]));
    expect(ended).toEqual(
      cases.flatMap((c) => [{ wide: c.wide, dragged: true, held: true }, standsAt(c.rest), []]),
    );
  });

  it("a script's scroll of its container to the exit is no swipe: it rests again, open", async () => {
    const page = await h.open('sheet');
    await openSheet(page);
    const went = await page.locator('#overlay [data-sheet-scroll]').evaluate((el) => {
      el.scrollTo({ top: 0 });
      return el.scrollTop;
    });
    await see.poll(async () => (await scrollState(page)).top).toBe(600);
    await observed(page);
    expect([went, await opens(page)]).toEqual([0, []]);
    await see(page.locator('#popup')).toBeVisible();
  });

  it('rests whole at its end after any run of moves, turns and resizes, the opening among them, at any pace', async () => {
    // A small seeded random walk: each run opens the sheet at some step, and between steps the
    // page moves the panel (`--floor`, `--side`), or resizes the window (across the breakpoint
    // or not), 0 to 15 frames (about 250 ms) apart. However the steps fall, it ends at rest for where it is.
    const SIZES = [
      { width: 800, height: 600 },
      { width: 700, height: 900 },
      { width: 820, height: 1180 },
      { width: 1180, height: 820 },
      { width: 1440, height: 900 },
    ];
    const random = (seed: number) => () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const ended = await [1, 2, 3, 4, 5, 6].reduce<Promise<Array<unknown>>>(async (before, seed) => {
      const done = await before;
      const next = random(seed);
      const pick = <T>(of: ReadonlyArray<T>) => of[Math.floor(next() * of.length)]!;
      let size = pick(SIZES);
      const page = await h.open('sheet', {
        viewport: size,
        query: { ...LAB, position: 'breakpoint' },
      });
      await page.addStyleTag({ content: OFFSETS });
      const opensAt = Math.floor(next() * 3);
      const steps: Array<string> = [];
      await Array.from({ length: 7 }, (_, i) => i).reduce<Promise<void>>(async (prior, i) => {
        await prior;
        if (i === opensAt) {
          steps.push('open');
          await page.click('#open');
        } else if (next() < 0.4) {
          const by = Math.round(next() * 80);
          steps.push(`offset ${by}`);
          await page.evaluate(
            (by) =>
              ['--floor', '--side'].forEach((name) =>
                document.documentElement.style.setProperty(name, `${by}px`),
              ),
            by,
          );
        } else {
          size = pick(SIZES);
          steps.push(`size ${size.width}x${size.height}`);
          await page.setViewportSize(size);
        }
        await framesOf(page, Math.round(next() * 15));
      }, Promise.resolve());
      const run = `seed ${seed}: ${steps.join(', ')}`;
      await see(page.locator('#panel'), run).not.toHaveAttribute('data-entering', '');
      // Where it rests is worked out from the walk itself: the last size, the last offset.
      const lastOffset = steps.findLast((step) => step.startsWith('offset '));
      const by = lastOffset ? Number(lastOffset.slice('offset '.length)) : 0;
      const rest = restIn(size, by);
      await see.poll(() => reachOf(page), { message: run }).toEqual(standsAt(rest));
      await observed(page);
      return [
        ...done,
        { run, stood: await reachOf(page), opens: await opens(page), rest: standsAt(rest) },
      ];
    }, Promise.resolve([]));
    // Each run stood where its own walk says it rests, and asked nothing.
    const walked = ended as Array<{ run: string; stood: unknown; opens: unknown; rest: unknown }>;
    expect(walked.map(({ run, stood, opens: asked }) => ({ run, stood, opens: asked }))).toEqual(
      walked.map(({ run, rest }) => ({ run, stood: rest, opens: [] })),
    );
  });

  it('rests when the window is resized as it scrolls in, and stays open', async () => {
    const page = await h.open('sheet', { query: LAB });
    await page.click('#open');
    await see(page.locator('#panel')).toHaveAttribute('data-entering', '');
    await page.setViewportSize({ width: 800, height: 1400 });
    await see(page.locator('#panel')).not.toHaveAttribute('data-entering', '');
    await see.poll(() => box(page, '#panel')).toEqual({ ...REST, y: 1100 });
    expect(await opens(page)).toEqual([]);
  });

  it('scrolls in on a page too busy to start the scroll at once, entering until it rests', async () => {
    const page = await h.open('sheet', { query: LAB });
    // Where the panel stands as it stops entering; the frame after the open runs 400 ms long.
    await page.locator('#open').evaluate((button: HTMLElement) => {
      const seen = window as unknown as { __enteredAt?: number };
      new MutationObserver(() => {
        const panel = document.getElementById('panel');
        if (seen.__enteredAt === undefined && panel && !panel.hasAttribute('data-entering')) {
          seen.__enteredAt = Math.round(panel.getBoundingClientRect().y);
        }
      }).observe(document.body, { subtree: true, attributes: true, childList: true });
      button.click();
      setTimeout(() =>
        requestAnimationFrame(() => {
          const from = performance.now();
          while (performance.now() - from < 400) {
            // The page is busy.
          }
        }),
      );
    });
    // At rest, within the pixel a scroll's last frame may leave.
    await see
      .poll(() => page.evaluate(() => (window as { __enteredAt?: number }).__enteredAt))
      .toBeGreaterThanOrEqual(REST.y - 1);
    expect(
      await page.evaluate(() => (window as { __enteredAt?: number }).__enteredAt),
    ).toBeLessThanOrEqual(REST.y + 1);
    await see.poll(() => box(page, '#panel')).toEqual(REST);
    expect(await opens(page)).toEqual([]);
  });

  it('opened while hidden, rests once shown', async () => {
    const page = await h.open('sheet', { query: LAB });
    await hideSection(page, true);
    await page.click('#open');
    await see(page.locator('#popup')).toHaveCount(1);
    await reportedHidden(page);
    // Its scroll in has settled where it had no layout: it has entered.
    await see(page.locator('#panel')).not.toHaveAttribute('data-entering', '');
    await hideSection(page, false);
    await see.poll(() => box(page, '#panel')).toEqual(REST);
    expect(await opens(page)).toEqual([]);
  });
});

describe('Sheet.Root', () => {
  it('opens as a dialog named by its title that focuses itself once in', async () => {
    const page = await h.open('sheet');
    await openSheet(page);
    const popup = page.locator('#popup');
    await see(popup).toHaveAttribute('role', 'dialog');
    await see(popup).toHaveAttribute('aria-labelledby', 'title');
    await see(popup).toHaveAttribute('data-sheet-content', '');
    const panel = page.locator('#panel');
    await see(panel).toHaveAttribute('data-position', 'bottom');
    await see(panel).toHaveAttribute('data-swipe-direction', 'bottom');
    await see(panel).toHaveAttribute('data-expanded', '');
    await see(panel).toHaveAttribute('data-stack-index', '0');
    await see(panel).not.toHaveAttribute('data-entering', '');
    expect(await logOf(page)).toEqual(['complete true']);
  });

  it('rests at its edge from each position', async () => {
    const expected = {
      bottom: { x: 0, y: 300, width: 800, height: 300 },
      top: { x: 0, y: 0, width: 800, height: 300 },
      left: { x: 0, y: 0, width: 300, height: 600 },
      right: { x: 500, y: 0, width: 300, height: 600 },
      center: { x: 250, y: 150, width: 300, height: 300 },
    };
    const landed = await Promise.all(
      Object.keys(expected).map(async (position) => {
        const page = await h.open('sheet', { query: { position } });
        await openSheet(page);
        await see(page.locator('#panel')).toHaveAttribute('data-position', position);
        return [position, await box(page, '#panel')] as const;
      }),
    );
    expect(Object.fromEntries(landed)).toEqual(expected);
  });

  it('closes on Escape, on a backdrop press and from Sheet.Close, scrolling out first', async () => {
    const page = await h.open('sheet');
    await openSheet(page);
    await page.keyboard.press('Escape');
    // Scrolling out: the dialog stays mounted, marked, until the scroll settles.
    await see(page.locator('#panel')).toHaveAttribute('data-exiting', '');
    await see(page.locator('#popup')).toHaveCount(0);
    await see.poll(() => focused(page)).toBe('open');
    await openSheet(page);
    await page.mouse.click(400, 100);
    await see(page.locator('#popup')).toHaveCount(0);
    await openSheet(page);
    await page.click('#close');
    await see(page.locator('#popup')).toHaveCount(0);
    expect((await logOf(page)).filter((line) => line.startsWith('open'))).toEqual([
      'open false escape-key',
      'open false outside-press',
      'open false close-press',
    ]);
    expect((await logOf(page)).filter((line) => line.startsWith('complete'))).toEqual([
      'complete true',
      'complete false',
      'complete true',
      'complete false',
      'complete true',
      'complete false',
    ]);
  });

  it('keeps focus outside and the page live until it has scrolled in', async () => {
    const page = await h.open('sheet');
    await page.click('#open');
    await see(page.locator('#panel')).toHaveAttribute('data-entering', '');
    expect(await focused(page)).toBe('open');
    expect(await page.locator('#root').getAttribute('inert')).toBeNull();
    await see(page.locator('#panel')).not.toHaveAttribute('data-entering', '');
    await see.poll(() => focused(page)).toBe('popup');
    // Modal once in: the page outside is inert, as upstream's (hidden from assistive technology,
    // and out of reach of a script's focus and of find in page), and not aria-hidden besides.
    await see(page.locator('#root')).toHaveAttribute('inert', '');
    expect(await page.locator('#root').getAttribute('aria-hidden')).toBeNull();
    await page.locator('#open').evaluate((el: HTMLElement) => el.focus());
    expect(await focused(page)).toBe('popup');
    // Its own backdrop is no outside: a press on it still closes the sheet, and the page is live.
    await page.mouse.click(400, 50);
    await see(page.locator('#popup')).toHaveCount(0);
    expect(await page.locator('#root').getAttribute('inert')).toBeNull();
    expect((await logOf(page)).filter((line) => line.startsWith('open'))).toEqual([
      'open false outside-press',
    ]);
  });

  it('keeps the focus given to a field while it scrolled in, and returns it to the opener on close', async () => {
    const kept = await Promise.all(
      ([{}, { modal: 'false', dismissal: 'disabled', portal: 'inline' }] as const).map(
        async (query: Readonly<Record<string, string>>) => {
          const page = await h.open('sheet', { query });
          await page.click('#open');
          await see(page.locator('#panel')).toHaveAttribute('data-entering', '');
          await page.locator('#first').focus();
          await see(page.locator('#panel')).not.toHaveAttribute('data-entering', '');
          // Once in, its focus manager takes over: its guards come in round the content, and
          // its initial focus is queued for a frame.
          await see(page.locator('#panel [data-type="inside"]:not([hidden])')).toHaveCount(2);
          await frames(page);
          const inside = await focused(page);
          // Where focus returns was recorded as the sheet opened, not when it had entered.
          await page.keyboard.press('Escape');
          await see(page.locator('#popup')).toHaveCount(0);
          await frames(page);
          return { inside, after: await focused(page) };
        },
      ),
    );
    expect(kept).toEqual([
      { inside: 'first', after: 'open' },
      { inside: 'first', after: 'open' },
    ]);
  });

  it('scrolls on to rest when a scroll into view stops it as it scrolls in', async () => {
    const cases = [
      { position: 'bottom', how: 'focus', times: 1 },
      { position: 'right', how: 'focus', times: 1 },
      { position: 'bottom', how: 'scrollIntoView', times: 2 },
    ] as const;
    const rested = await Promise.all(
      cases.map(async ({ position, how, times }) => {
        const page = await h.open('sheet', {
          query: { position, modal: 'false', dismissal: 'disabled', portal: 'inline' },
        });
        // On the sheet's first scroll (and on its first again once it scrolls on), the field
        // is focused or scrolled into view: the browser scrolls the field into view, which
        // stops the sheet's own scroll a few pixels in, and its snapping takes it back out.
        await page.evaluate(
          ({ how, times }) => {
            let left = times;
            let last = -Infinity;
            const stop = (event: Event) => {
              const now = performance.now();
              if (
                !(event.target as Element).hasAttribute?.('data-sheet-scroll') ||
                now - last < 200
              ) {
                return;
              }
              last = now;
              left -= 1;
              if (left === 0) {
                document.removeEventListener('scroll', stop, true);
              }
              document.getElementById('first')?.[how]();
            };
            document.addEventListener('scroll', stop, true);
          },
          { how, times },
        );
        await page.click('#open');
        await see(page.locator('#panel')).not.toHaveAttribute('data-entering', '');
        await see(page.locator('#first')).toBeInViewport({ ratio: 1 });
        await see(page.locator('#panel')).toBeInViewport({ ratio: 1 });
        return opens(page);
      }),
    );
    expect(rested).toEqual([[], [], []]);
  });

  it('stays open when a scroll into view stops it once it has shown, short of its snap midpoint', async () => {
    // On an 800×400 page a 300 px panel shows past a scroll of 100, and its snap midpoint is 200:
    // stopped between, its snapping carries it back out of view, which is no swipe of the user's.
    const cases = [
      { at: 110, how: 'focus' },
      { at: 150, how: 'focus' },
      { at: 110, how: 'scrollIntoView' },
      { at: 150, how: 'scrollIntoView' },
    ] as const;
    const rested = await Promise.all(
      cases.map(async ({ at, how }) => {
        const page = await h.open('sheet', {
          viewport: { width: 800, height: 400 },
          query: { modal: 'false', dismissal: 'disabled', portal: 'inline' },
        });
        await page.evaluate(
          ({ at, how }) => {
            const stop = (event: Event) => {
              const scroller = event.target as Element;
              if (scroller.hasAttribute?.('data-sheet-scroll') && scroller.scrollTop >= at) {
                document.removeEventListener('scroll', stop, true);
                const first = document.getElementById('first');
                if (how === 'focus') {
                  first?.focus();
                } else {
                  first?.scrollIntoView({ block: 'nearest' });
                }
              }
            };
            document.addEventListener('scroll', stop, true);
          },
          { at, how },
        );
        await page.click('#open');
        await see(page.locator('#panel')).not.toHaveAttribute('data-entering', '');
        await see(page.locator('#panel')).toBeInViewport({ ratio: 1 });
        return { at, how, opens: await opens(page) };
      }),
    );
    expect(rested).toEqual(cases.map((c) => ({ ...c, opens: [] })));
  });

  it('traps Tab inside a modal sheet', async () => {
    const page = await h.open('sheet');
    await openSheet(page);
    await page.keyboard.press('Tab');
    await see.poll(() => focused(page)).toBe('first');
    await page.keyboard.press('Tab');
    await see.poll(() => focused(page)).toBe('close');
    await page.keyboard.press('Tab');
    await see.poll(() => focused(page)).toBe('first');
    await page.keyboard.press('Shift+Tab');
    await see.poll(() => focused(page)).toBe('close');
  });

  it('focuses the element initialFocus returns once in', async () => {
    const page = await h.open('sheet', { query: { initial: 'first' } });
    await openSheet(page, 'first');
  });

  it('moves no focus in when initialFocus returns false, unless the sheet is modal: a modal one focuses itself, as upstream', async () => {
    const left = await Promise.all(
      ([{}, { modal: 'false', dismissal: 'disabled', portal: 'inline' }] as const).map(
        async (query: Readonly<Record<string, string>>) => {
          const page = await h.open('sheet', { query: { ...query, initial: 'false' } });
          await page.click('#open');
          await see(page.locator('#panel')).toHaveAttribute('data-expanded', '');
          await see(page.locator('#panel')).not.toHaveAttribute('data-entering', '');
          await frames(page);
          return focused(page);
        },
      ),
    );
    // Modal: the page outside is inert, focus cannot stay there, and the dialog takes it (not
    // the body, where a screen reader would lose the dialog). Not modal: the page is live, and
    // focus stays on the opener.
    expect(left).toEqual(['popup', 'open']);
  });

  it("the lab's inspector: non-modal, an outside press is ignored, rendered in place", async () => {
    const page = await h.open('sheet', {
      query: { modal: 'false', dismissal: 'disabled', portal: 'inline' },
    });
    await openSheet(page);
    // In place: the dialog stays inside the page's own container, not moved to the body.
    await see(page.locator('#root #popup')).toHaveCount(1);
    // Non-modal: the page around the panel takes presses and focus, and neither closes it.
    await page.mouse.click(400, 100);
    await see(page.locator('#popup')).toBeVisible();
    await page.click('#outside');
    await see.poll(() => focused(page)).toBe('outside');
    await see(page.locator('#popup')).toBeVisible();
    expect(await page.locator('#outside').getAttribute('aria-hidden')).toBeNull();
    expect((await logOf(page)).filter((line) => line.startsWith('open'))).toEqual([]);
    await page.click('#close');
    await see(page.locator('#popup')).toHaveCount(0);
    expect((await logOf(page)).filter((line) => line.startsWith('open'))).toEqual([
      'open false close-press',
    ]);
  });

  it('a non-modal right sheet on a page with a classic scrollbar takes presses over all its panel', async () => {
    const page = await h.open('sheet', {
      scrollbars: true,
      viewport: { width: 1440, height: 900 },
      query: { position: 'right', modal: 'false', dismissal: 'disabled', portal: 'inline' },
    });
    // A page long enough to scroll, with a scrollbar that takes room (Windows, Linux), which
    // `100vw` counts in (the root's overflow is `auto`); the panel stands off it, as the lab's
    // does.
    await page.addStyleTag({
      content: `html { overflow-y: auto; } body { min-height: 3000px; }
        #panel { right: var(--sheet-scroll-padding-x, 0px); }`,
    });
    expect(await page.evaluate(() => innerWidth - document.documentElement.clientWidth)).toBe(15);
    await openSheet(page);
    const reach = await page.evaluate(() => {
      const panel = document.getElementById('panel')!.getBoundingClientRect();
      const y = panel.y + panel.height / 2;
      const hit = (x: number) => document.elementFromPoint(x, y)?.closest('#panel') !== null;
      return {
        right: Math.round(panel.right),
        nearRight: hit(panel.right - 3),
        nearLeft: hit(panel.left + 3),
        pastLeft: hit(panel.left - 3),
      };
    });
    expect(reach).toEqual({ right: 1425, nearRight: true, nearLeft: true, pastLeft: false });
  });
});

describe('swipe to dismiss', () => {
  it("the user's scroll to the exit dismisses and unmounts it", async () => {
    const page = await h.open('sheet');
    await openSheet(page);
    expect((await scrollState(page)).top).toBe(600);
    await wheelSheet(page, 0, -600);
    await see(page.locator('#popup')).toHaveCount(0);
    await see(page.locator('#overlay')).toHaveCount(0);
    expect((await logOf(page)).filter((line) => line.startsWith('open'))).toEqual([
      'open false swipe',
    ]);
    await see.poll(() => focused(page)).toBe('open');
  });

  it("the user's scroll short of the exit snaps back open", async () => {
    const page = await h.open('sheet');
    await openSheet(page);
    // 100px of the 300px sheet down: the nearer snap is the open one.
    await wheelSheet(page, 0, -100);
    await see.poll(async () => (await scrollState(page)).top).toBe(600);
    await see(page.locator('#popup')).toBeVisible();
    expect((await logOf(page)).filter((line) => line.startsWith('open'))).toEqual([]);
  });

  it("a snap the browser starts just after the user's scroll ended is still theirs: carried to the exit by it, the sheet is swiped away", async () => {
    // Desktop WebKit snaps a wheel's scroll in two: back to the open snap at once (a `scrollend`
    // there), then, about 90 ms later, on to the snap in the wheel's direction, the exit (probe
    // r6/probe-webkit.ts). Chromium's own snap is played here as WebKit's second one.
    const page = await h.open('sheet');
    await openSheet(page);
    await page.locator('#overlay [data-sheet-scroll]').evaluate((el) => {
      el.addEventListener(
        'scrollend',
        () => setTimeout(() => el.scrollTo({ top: 0, behavior: 'smooth' }), 90),
        { once: true },
      );
    });
    await wheelSheet(page, 0, -100);
    await see(page.locator('#popup')).toHaveCount(0);
    expect(await opens(page)).toEqual(['open false swipe']);
  });

  it('a side sheet dismisses on a scroll along its own axis', async () => {
    const page = await h.open('sheet', { query: { position: 'right' } });
    await openSheet(page);
    expect((await scrollState(page)).left).toBe(800);
    await wheelSheet(page, -800, 0);
    await see(page.locator('#popup')).toHaveCount(0);
    expect((await logOf(page)).filter((line) => line.startsWith('open'))).toEqual([
      'open false swipe',
    ]);
  });

  it('a wheel over a non-modal side sheet swipes it, and the page beside it stays pressable', async () => {
    const page = await h.open('sheet', {
      query: { position: 'right', modal: 'false', dismissal: 'disabled', portal: 'inline' },
    });
    await openSheet(page);
    await page.mouse.click(20, 10);
    await see.poll(() => focused(page)).toBe('outside');
    // The sheet takes presses over its panel exactly (its left edge at x=500).
    expect(
      await page.evaluate(() => [
        document.elementFromPoint(495, 300)?.closest('#overlay') ?? null,
        document.elementFromPoint(505, 300)?.closest('#panel')?.id,
      ]),
    ).toEqual([null, 'panel']);
    await page.mouse.move(650, 500);
    // 600px of the sheet's 800px travel toward the exit: the nearer snap is the exit.
    await page.mouse.wheel(-600, 0);
    await see(page.locator('#popup')).toHaveCount(0);
    expect((await logOf(page)).filter((line) => line.startsWith('open'))).toEqual([
      'open false swipe',
    ]);
  });

  it('a non-modal sheet takes presses over its panel alone, its container taking them itself at rest, through its entrance, a swipe that snaps back and one that carries it out', async () => {
    const page = await h.open('sheet', {
      query: { modal: 'false', dismissal: 'disabled', portal: 'inline' },
    });
    // Between frames, every 4 ms: a press 3 px inside each edge of the panel lands on it, and
    // one 3 px past each (inside the window) misses the sheet; but past its top edge while a
    // swipe holds it below its rest (y 300), on its way back there, is the sheet's. Frames where
    // either fails are kept, with where the panel stood.
    await page.evaluate(() => {
      const record = window as unknown as { __samples: number; __bad: Array<string> };
      record.__samples = 0;
      record.__bad = [];
      const sample = () => {
        const panel = document.getElementById('panel');
        if (panel && panel.getClientRects().length > 0) {
          const r = panel.getBoundingClientRect();
          const midX = r.left + r.width / 2;
          const midY = r.top + r.height / 2;
          const shows = (x: number, y: number) =>
            x >= 0 && y >= 0 && x < innerWidth && y < innerHeight;
          const lands = (x: number, y: number, selector: string) =>
            document.elementFromPoint(x, y)?.closest(selector) != null;
          const inside = [
            [midX, r.top + 3],
            [midX, r.bottom - 3],
            [r.left + 3, midY],
            [r.right - 3, midY],
          ].filter(([x, y]) => shows(x!, y!));
          const swiped =
            r.top > 300.5 &&
            !panel.hasAttribute('data-entering') &&
            !panel.hasAttribute('data-exiting');
          const outside = [
            ...(swiped ? [] : [[midX, r.top - 3]]),
            [midX, r.bottom + 3],
            [r.left - 3, midY],
            [r.right + 3, midY],
          ].filter(([x, y]) => shows(x!, y!));
          record.__samples += 1;
          if (
            !inside.every(([x, y]) => lands(x!, y!, '#panel')) ||
            outside.some(([x, y]) => lands(x!, y!, '#overlay'))
          ) {
            record.__bad.push(`${Math.round(r.top)},${Math.round(r.left)}`);
          }
        }
        setTimeout(sample, 4);
      };
      sample();
    });
    await openSheet(page);
    const resting = await page
      .locator('#overlay [data-sheet-scroll]')
      .evaluate((el) => getComputedStyle(el).pointerEvents);
    await wheelSheet(page, 0, -100);
    await see.poll(async () => (await scrollState(page)).top).toBe(600);
    await wheelSheet(page, 0, -600);
    await see(page.locator('#popup')).toHaveCount(0);
    const sampled = await page.evaluate(() => {
      const record = window as unknown as { __samples: number; __bad: Array<string> };
      return { many: record.__samples > 20, bad: record.__bad };
    });
    expect([resting, sampled, await opens(page)]).toEqual([
      'auto',
      { many: true, bad: [] },
      ['open false swipe'],
    ]);
  });

  it("a non-modal sheet's panel is drawn whole in every frame the browser draws as it scrolls in and snaps back after a swipe", async () => {
    const page = await h.open('sheet', {
      query: { modal: 'false', dismissal: 'disabled', portal: 'inline' },
    });
    // The panel's top edge red over a blue body, on a white page, nothing else drawn. The
    // browser scrolls ahead of the page's frames: a clip of its container that trailed the panel
    // would cut its leading edge, and the frames it draws would show blue first, not red.
    await page.addStyleTag({
      content: `html, body { background: rgb(255 255 255) !important; }
        .backdrop { display: none !important; }
        #panel { background: rgb(0 0 255) !important; border-top: 8px solid rgb(255 0 0) !important;
          box-sizing: border-box; animation: none !important; }
        #popup { background: none !important; }
        #popup * { visibility: hidden !important; }`,
    });
    const cdp = await page.context().newCDPSession(page);
    const drawn: Array<string> = [];
    cdp.on('Page.screencastFrame', (event: { data: string; sessionId: number }) => {
      drawn.push(event.data);
      void cdp.send('Page.screencastFrameAck', { sessionId: event.sessionId }).catch(() => {});
    });
    await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });
    await openSheet(page);
    // A swipe down that snaps back, twice.
    await wheelSheet(page, 0, -120);
    await see.poll(async () => (await scrollState(page)).top).toBe(600);
    await wheelSheet(page, 0, -120);
    await see.poll(async () => (await scrollState(page)).top).toBe(600);
    await framesOf(page, 10);
    await cdp.send('Page.stopScreencast');
    // Down the middle of each frame drawn, below the top fifth: the first pixel not the page's.
    const tops = await page.evaluate(async (frames: Array<string>) => {
      const images = await Promise.all(
        frames.map(async (data) => {
          const image = new Image();
          image.src = `data:image/png;base64,${data}`;
          await image.decode();
          return image;
        }),
      );
      const seen: Array<string> = [];
      for (const image of images) {
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d')!;
        context.drawImage(image, 0, 0);
        const column = context.getImageData(Math.floor(image.width / 2), 0, 1, image.height).data;
        let first = 'page';
        for (let y = Math.floor(image.height / 5); y < image.height; y++) {
          const [r, g, b] = [column[y * 4]!, column[y * 4 + 1]!, column[y * 4 + 2]!];
          if (r > 200 && g > 200 && b > 200) continue;
          first = r > 180 && g < 80 && b < 80 ? 'edge' : 'cut';
          break;
        }
        seen.push(first);
      }
      return seen;
    }, drawn);
    // Frames were drawn with the panel on the way (not only at rest), and none cut its edge.
    expect([
      tops.filter((top) => top === 'edge').length > 10,
      tops.filter((top) => top === 'cut'),
    ]).toEqual([true, []]);
  });

  it('a key that scrolls it toward its exit (PageUp, focus in it) swipes it away', async () => {
    const page = await h.open('sheet', {
      query: { modal: 'false', dismissal: 'disabled', portal: 'inline' },
    });
    await openSheet(page);
    await page.keyboard.press('PageUp');
    await see(page.locator('#popup')).toHaveCount(0);
    expect(await opens(page)).toEqual(['open false swipe']);
  });

  it('a top sheet rests at scroll 0 and leaves toward the end', async () => {
    const page = await h.open('sheet', { query: { position: 'top' } });
    await openSheet(page);
    expect((await scrollState(page)).top).toBe(0);
    await wheelSheet(page, 0, 600);
    await see(page.locator('#popup')).toHaveCount(0);
    expect((await logOf(page)).filter((line) => line.startsWith('open'))).toEqual([
      'open false swipe',
    ]);
  });

  it('a centred sheet leaves by either edge', async () => {
    const logs = await Promise.all(
      [-600, 600].map(async (dy) => {
        const page = await h.open('sheet', { query: { position: 'center' } });
        await openSheet(page);
        expect((await scrollState(page)).top).toBe(600);
        await wheelSheet(page, 0, dy);
        await see(page.locator('#popup')).toHaveCount(0);
        return (await logOf(page)).filter((line) => line.startsWith('open'));
      }),
    );
    expect(logs).toEqual([['open false swipe'], ['open false swipe']]);
  });

  it('springs back when the owner cancels the swipe close', async () => {
    const page = await h.open('sheet', { query: { owner: 'cancel' } });
    await openSheet(page);
    await wheelSheet(page, 0, -600);
    await see.poll(() => logOf(page)).toContain('open false swipe');
    await see.poll(async () => (await scrollState(page)).top).toBe(600);
    await see(page.locator('#popup')).toBeVisible();
    await see(page.locator('#popup')).not.toHaveAttribute('data-ending-style', '');
  });

  it('stays swiped away until an async owner drops it', async () => {
    const page = await h.open('async-owner');
    await openSheet(page);
    await page.evaluate(() => {
      const samples: Array<number | null> = [];
      (window as unknown as { __samples: typeof samples }).__samples = samples;
      const sample = () => {
        const panel = document.getElementById('panel');
        samples.push(panel ? panel.getBoundingClientRect().top : null);
        if (panel) {
          requestAnimationFrame(sample);
        }
      };
      requestAnimationFrame(sample);
    });
    await wheelSheet(page, 0, -600);
    await see(page.locator('#popup')).toHaveCount(0);
    expect(await logOf(page)).toEqual(['open false swipe']);
    const samples = await page.evaluate(
      () => (window as unknown as { __samples: Array<number | null> }).__samples,
    );
    // Once gone, no frame shows it back at rest before it unmounts.
    const gone = samples.findIndex((top) => top != null && top >= 600);
    expect(gone).toBeGreaterThanOrEqual(0);
    const after = samples.slice(gone).filter((top): top is number => top != null);
    expect(after.filter((top) => top < 600)).toEqual([]);
  });
});

describe('snap points', () => {
  it('opens at the first snap point and rests at each', async () => {
    const page = await h.open('sheet', { query: { snap: '100,50%' } });
    await openSheet(page);
    // 100px of the 300px panel shows.
    expect((await box(page, '#panel')).y).toBe(500);
    await see(page.locator('#panel')).not.toHaveAttribute('data-expanded', '');
    // A scroll between snaps settles on one: here the 50% one (150px showing).
    await scrollSheet(page, { top: (await scrollState(page)).top + 60 });
    await see.poll(async () => (await box(page, '#panel')).y).toBe(450);
    // And all of it.
    await scrollSheet(page, { top: 600 });
    await see.poll(async () => (await box(page, '#panel')).y).toBe(300);
    await see(page.locator('#panel')).toHaveAttribute('data-expanded', '');
  });

  it('a scroll past the first snap point dismisses', async () => {
    const page = await h.open('sheet', { query: { snap: '100' } });
    await openSheet(page);
    await wheelSheet(page, 0, -600);
    await see(page.locator('#popup')).toHaveCount(0);
    expect((await logOf(page)).filter((line) => line.startsWith('open'))).toEqual([
      'open false swipe',
    ]);
  });

  it('preventDismissal holds the first snap point, and Escape and outside presses', async () => {
    const page = await h.open('sheet', { query: { snap: '100', prevent: 'true' } });
    await openSheet(page);
    expect((await box(page, '#panel')).y).toBe(500);
    await scrollSheet(page, { top: 0 });
    await see.poll(async () => (await box(page, '#panel')).y).toBe(500);
    await page.keyboard.press('Escape');
    await page.mouse.click(400, 100);
    await see(page.locator('#popup')).toBeVisible();
    expect((await logOf(page)).filter((line) => line.startsWith('open'))).toEqual([]);
    // Its own Close still closes it, scrolling it out.
    await page.click('#close');
    await see(page.locator('#popup')).toHaveCount(0);
    expect((await logOf(page)).filter((line) => line.startsWith('open'))).toEqual([
      'open false close-press',
    ]);
  });

  it('preventDismissal without snap points holds the open position', async () => {
    const page = await h.open('sheet', { query: { prevent: 'true' } });
    await openSheet(page);
    await scrollSheet(page, { top: 0 });
    await see.poll(async () => (await box(page, '#panel')).y).toBeGreaterThanOrEqual(299);
    await see(page.locator('#popup')).toBeVisible();
  });
});

describe('stacked sheets', () => {
  it('a second sheet stacks in front, and the first runs its stack animation', async () => {
    const page = await h.open('sheet', { query: { stack: 'true' } });
    await openSheet(page);
    await page.click('#open-inner');
    await see(page.locator('#inner-popup')).toBeVisible();
    await see.poll(() => focused(page)).toBe('inner-popup');
    await see(page.locator('#inner-panel')).toHaveAttribute('data-stack-index', '1');
    await see(page.locator('#panel')).toHaveAttribute('data-has-descendants', '');
    expect(
      await page.evaluate(() => document.documentElement.style.getPropertyValue('timeline-scope')),
    ).toBe('--sheet-timeline-0, --sheet-timeline-1');
    const panelAnimation = await page.locator('#panel').evaluate((el) => ({
      name: el.style.getPropertyValue('animation-name'),
      timeline: el.style.getPropertyValue('animation-timeline'),
      composition: el.style.getPropertyValue('animation-composition'),
    }));
    expect(panelAnimation).toEqual({
      name: 'rise, recede',
      timeline: '--sheet-timeline-0, --sheet-timeline-1',
      composition: 'replace, accumulate',
    });
    // Escape closes the front sheet only.
    await page.keyboard.press('Escape');
    await see(page.locator('#inner-popup')).toHaveCount(0);
    await see(page.locator('#popup')).toBeVisible();
    await see.poll(() => focused(page)).toBe('open-inner');
    await see(page.locator('#panel')).not.toHaveAttribute('data-has-descendants', '');
    expect(
      await page.evaluate(() => document.documentElement.style.getPropertyValue('timeline-scope')),
    ).toBe('--sheet-timeline-0');
    // The last one closed, no timelines are hoisted.
    await page.keyboard.press('Escape');
    await see(page.locator('#popup')).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.style.getPropertyValue('timeline-scope')),
    ).toBe('');
  });

  it('marks every part of each sheet with its place in the stack', async () => {
    const page = await h.open('sheet', { query: { stack: 'true' } });
    await openSheet(page);
    await page.click('#open-inner');
    await see.poll(() => focused(page)).toBe('inner-popup');
    const marks = (id: string) =>
      page.locator(`#${id}`).evaluate((el) => ({
        index: el.getAttribute('data-stack-index'),
        descendants: el.hasAttribute('data-has-descendants'),
      }));
    const ids = ['overlay', 'backdrop', 'panel'];
    expect(await Promise.all(ids.map(marks))).toEqual(
      ids.map(() => ({ index: '0', descendants: true })),
    );
    expect(await Promise.all(ids.map((id) => marks(`inner-${id}`)))).toEqual(
      ids.map(() => ({ index: '1', descendants: false })),
    );
    // The front sheet has none in front of it: no stack animation.
    expect(
      await page
        .locator('#inner-panel')
        .evaluate((el) => el.style.getPropertyValue('animation-name')),
    ).toBe('rise');
  });

  it('does not hide a sheet opening in front while it scrolls in, then hides the one behind', async () => {
    const page = await h.open('sheet', { query: { stack: 'true' } });
    await openSheet(page);
    const hidden = (id: string) =>
      page.locator(`#${id}`).evaluate((el) => el.closest('[inert], [aria-hidden="true"]') !== null);
    await page.click('#open-inner');
    await see(page.locator('#inner-panel')).toHaveAttribute('data-entering', '');
    expect(await hidden('inner-popup')).toBe(false);
    expect(await hidden('popup')).toBe(false);
    await see.poll(() => focused(page)).toBe('inner-popup');
    expect(await hidden('inner-popup')).toBe(false);
    expect(await hidden('popup')).toBe(true);
  });
});

describe('the parts', () => {
  it('name the view timeline on the content by stack index, along the swipe axis', async () => {
    // As Chromium serializes them (`0` reads back as `0px`).
    const expected = {
      bottom: { axis: 'y', inset: '0px 100dvh' },
      top: { axis: 'y', inset: '100dvh 0px' },
      left: { axis: 'x', inset: '100dvw 0px' },
      right: { axis: 'x', inset: '0px 100dvw' },
      center: { axis: 'y', inset: '0px 100dvh' },
    };
    const found = await Promise.all(
      Object.keys(expected).map(async (position) => {
        const page = await h.open('sheet', { query: { position } });
        await openSheet(page);
        const timeline = await page.locator('#popup').evaluate((el) => ({
          name: el.style.getPropertyValue('view-timeline-name'),
          axis: el.style.getPropertyValue('view-timeline-axis'),
          inset: el.style.getPropertyValue('view-timeline-inset'),
        }));
        expect(timeline.name).toBe('--sheet-timeline-0');
        return [position, { axis: timeline.axis, inset: timeline.inset }] as const;
      }),
    );
    expect(Object.fromEntries(found)).toEqual(expected);
  });

  it('extend a sheet past the edge it is swiped toward with overscrollPadding', async () => {
    const found = await Promise.all(
      ['bottom', 'top', 'left', 'right'].map(async (position) => {
        const page = await h.open('sheet', { query: { position, overscroll: 'true' } });
        await openSheet(page);
        const values = await page
          .locator('#panel')
          .evaluate(
            (el, edge) => [
              el.style.getPropertyValue(`padding-${edge}`),
              el.style.getPropertyValue(`margin-${edge}`),
            ],
            position,
          );
        return [position, values] as const;
      }),
    );
    expect(Object.fromEntries(found)).toEqual({
      bottom: ['100vh', '-100vh'],
      top: ['100vh', '-100vh'],
      left: ['100vw', '-100vw'],
      right: ['100vw', '-100vw'],
    });
    // Not when it is swiped some other way.
    const page = await h.open('sheet', { query: { swipe: 'vertical', overscroll: 'true' } });
    await openSheet(page);
    expect(
      await page.locator('#panel').evaluate((el) => el.style.getPropertyValue('padding-bottom')),
    ).toBe('');
  });

  it('limit swipe animations to a snap point range', async () => {
    const page = await h.open('sheet', { query: { snap: '180', range: 'true' } });
    await openSheet(page);
    const range = (id: string) =>
      page
        .locator(`#${id}`)
        .evaluate((el) => [
          el.style.getPropertyValue('animation-range-start'),
          el.style.getPropertyValue('animation-range-end'),
        ]);
    // As Chromium serializes them (`entry 0%` and `entry 100%` read back as `entry`).
    expect(await range('panel')).toEqual(['entry', 'entry 180px']);
    expect(await range('backdrop')).toEqual(['entry 180px', 'entry']);
  });
});

describe('the software keyboard', () => {
  it('sets the visual viewport and the keyboard padding variables', async () => {
    const page = await h.open('sheet');
    await openSheet(page);
    const vars = () =>
      page.locator('#overlay').evaluate((el) => ({
        height: el.style.getPropertyValue('--visual-viewport-height'),
        padding: getComputedStyle(el).getPropertyValue('--sheet-scroll-padding-y').trim(),
      }));
    expect(await vars()).toEqual({ height: '600px', padding: 'calc(100dvh - 600px)' });
    // The visual viewport shrinks (as a keyboard shrinks it): the variable follows.
    await page.setViewportSize({ width: 800, height: 400 });
    await see.poll(async () => (await vars()).height).toBe('400px');
    // Resolved, the padding is what the keyboard covers of the layout viewport.
    const resolved = await page.locator('#overlay').evaluate((el) => {
      const probe = document.createElement('div');
      probe.style.height = 'var(--sheet-scroll-padding-y)';
      el.appendChild(probe);
      const height = getComputedStyle(probe).height;
      probe.remove();
      return height;
    });
    expect(resolved).toBe('0px');
  });
});

describe('without scroll-driven animations', () => {
  it('opens, snaps, dismisses by a scroll and closes, and plays the swipe keyframes on the way', async () => {
    const page = await h.open('sheet', { query: { timeline: 'none', snap: '100' } });
    await page.click('#open');
    await see(page.locator('#panel')).toHaveAttribute('data-entering', '');
    expect(
      await page.locator('#panel').evaluate((el) => ({
        timeline: el.style.getPropertyValue('animation-timeline'),
        duration: el.style.getPropertyValue('animation-duration'),
      })),
    ).toEqual({ timeline: '', duration: '300ms' });
    await see.poll(() => focused(page)).toBe('popup');
    expect((await box(page, '#panel')).y).toBe(500);
    await scrollSheet(page, { top: 600 });
    await see.poll(async () => (await box(page, '#panel')).y).toBe(300);
    await wheelSheet(page, 0, -600);
    await see(page.locator('#popup')).toHaveCount(0);
    await openSheet(page);
    await page.keyboard.press('Escape');
    await see(page.locator('#popup')).toHaveCount(0);
    expect((await logOf(page)).filter((line) => line.startsWith('open'))).toEqual([
      'open false swipe',
      'open false escape-key',
    ]);
  });
});

/**
 * A finger pressed at `from` and moved `distance` px down in `steps` moves,
 * then lifted: the browser's own touches (CDP), so it scrolls natively. Each
 * touch carries its time, a move every 8 ms: the fling a lift starts is the
 * same however slowly a busy machine delivers them.
 */
async function fingerDown(
  page: Page,
  from: { x: number; y: number },
  distance: number,
  steps: number,
) {
  const cdp = await page.context().newCDPSession(page);
  const start = Date.now() / 1000;
  const at = (type: 'touchStart' | 'touchMove' | 'touchEnd', step: number, y: number) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x: from.x, y }],
      timestamp: start + step * 0.008,
    });
  await at('touchStart', 0, from.y);
  // One move after another, in order.
  await Array.from({ length: steps }, (_, i) => i + 1).reduce<Promise<unknown>>(
    (previous, step) =>
      previous.then(() => at('touchMove', step, from.y + (distance * step) / steps)),
    Promise.resolve(),
  );
  await at('touchEnd', steps + 1, from.y + distance);
}

/**
 * Has a finger's moves scroll the sheet by as much as the finger moved, at once, in place of
 * the browser's own scroll. Headless Chromium does not stop a script's smooth scroll for
 * CDP's touches (the sheet's scroll in runs on to rest under them); a scroll of the page's
 * own does stop it, as a real finger does on a phone.
 */
const fingerScrollsSheet = (page: Page) =>
  page.evaluate(() => {
    let last: number | null = null;
    const options = { capture: true, passive: false };
    window.addEventListener(
      'touchstart',
      (event) => {
        last = event.touches[0]?.clientY ?? null;
      },
      options,
    );
    window.addEventListener(
      'touchmove',
      (event) => {
        const y = event.touches[0]?.clientY;
        const scroller = document.querySelector('#overlay [data-sheet-scroll]');
        if (y === undefined || last === null || !scroller) {
          return;
        }
        event.preventDefault();
        scroller.scrollBy({ top: last - y, behavior: 'instant' });
        last = y;
      },
      options,
    );
  });

/**
 * Resolves, once a bottom sheet's panel has shown (its head 60 px into the window) and then
 * scrolled wholly below the window, with whether the sheet was still entering then. Read on the
 * scroll that carried it there, before any observer is told it is gone (and its owner closes
 * it). From then on, a scroll that brings any of it back into the window is recorded
 * (`cameBack`). Call it before the sheet opens.
 */
const leftView = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        const watch = (scroller: Element) => {
          let shown = false;
          let left = false;
          const onScroll = () => {
            const panel = document.getElementById('panel');
            // Hidden as it unmounts, it has no box (its top reads 0): not back in view.
            if (!panel || panel.getClientRects().length === 0) {
              return;
            }
            const top = panel.getBoundingClientRect().top;
            shown ||= top < innerHeight - 60;
            if (shown && !left && top >= innerHeight) {
              left = true;
              resolve(panel.hasAttribute('data-entering'));
            } else if (left && top < innerHeight - 1) {
              (window as unknown as { __cameBack?: boolean }).__cameBack = true;
            }
          };
          scroller.addEventListener('scroll', onScroll);
        };
        const mounted = new MutationObserver(() => {
          const scroller = document.querySelector('#overlay [data-sheet-scroll]');
          if (scroller) {
            mounted.disconnect();
            watch(scroller);
          }
        });
        mounted.observe(document.body, { childList: true, subtree: true });
      }),
  );

const bodyScrollTop = (page: Page) => page.locator('#body').evaluate((el) => el.scrollTop);

describe('a finger', () => {
  it('swipes the sheet away', async () => {
    const page = await h.open('sheet', { touch: true });
    await openSheet(page);
    const panel = await box(page, '#panel');
    await fingerDown(page, { x: panel.x + 100, y: panel.y + 20 }, 260, 12);
    await see(page.locator('#popup')).toHaveCount(0);
    expect((await logOf(page)).filter((line) => line.startsWith('open'))).toEqual([
      'open false swipe',
    ]);
  });

  it('swipes the sheet away as it scrolls in, taking its entrance over, and asks once however long its owner keeps it', async () => {
    const swept = await Promise.all(
      (
        [
          ['sheet', {}],
          ['sheet', { modal: 'false', dismissal: 'disabled', portal: 'inline' }],
          // An owner slower than the entrance's settle: the swipe is asked of it once.
          ['async-owner', { drop: '1500' }],
        ] as const
      ).map(async ([fixture, query]: readonly [string, Readonly<Record<string, string>>]) => {
        const page = await h.open(fixture, { touch: true, query });
        await fingerScrollsSheet(page);
        const left = leftView(page);
        await page.click('#open');
        // The finger lands on the panel's head once it shows, and drags it down.
        await page.waitForFunction(() => {
          const panel = document.getElementById('panel');
          return panel !== null && panel.getBoundingClientRect().y < innerHeight - 60;
        });
        const panel = await box(page, '#panel');
        await fingerDown(page, { x: panel.x + 100, y: panel.y + 10 }, 400, 10);
        // It left the screen before its entrance ended: the swipe took the entrance over.
        const entering = await left;
        // The async owner lets it go 1.5 s after it was asked: past the entrance's settle. Taken,
        // the entrance never brings it back into view meanwhile.
        await see(page.locator('#popup')).toHaveCount(0);
        const cameBack = await page.evaluate(
          () => (window as unknown as { __cameBack?: boolean }).__cameBack ?? false,
        );
        return [entering, cameBack, (await logOf(page)).filter((line) => line.startsWith('open'))];
      }),
    );
    expect(swept).toEqual([
      [true, false, ['open false swipe']],
      [true, false, ['open false swipe']],
      [true, false, ['open false swipe']],
    ]);
  });

  it('swipes a non-modal sheet away by a wheel or a finger, its shadow drawn round its panel by a wrapper that takes no presses', async () => {
    const LOOSE = { modal: 'false', dismissal: 'disabled', portal: 'inline' };
    const swept = await Promise.all(
      (['wheel', 'finger'] as const).map(async (by) => {
        const page = await h.open('sheet', {
          touch: by === 'finger',
          query: by === 'wheel' ? { ...LOOSE, position: 'right' } : LOOSE,
        });
        // The lab's: the inline portal, fixed over the window, draws the shadow and takes no
        // presses; nor does the overlay inside, and the panel takes its own.
        await page.addStyleTag({
          content: `div:has(> #overlay) {
            position: fixed; inset: 0; pointer-events: none;
            filter: drop-shadow(0 8px 28px rgb(0 0 0 / 0.55));
          }`,
        });
        await openSheet(page);
        const panel = await box(page, '#panel');
        // Just past the panel's inner edge (its left, or its top) and just inside it.
        const [dx, dy] = by === 'wheel' ? [5, 0] : [0, 5];
        const edge =
          by === 'wheel'
            ? { x: panel.x, y: panel.y + panel.height / 2 }
            : { x: panel.x + panel.width / 2, y: panel.y };
        const reach = await page.evaluate(
          ({ x, y, dx, dy }) => [
            document.elementFromPoint(x - dx, y - dy)?.closest('#overlay') ?? null,
            document.elementFromPoint(x + dx, y + dy)?.closest('#panel')?.id,
          ],
          { ...edge, dx, dy },
        );
        if (by === 'wheel') {
          await page.mouse.move(panel.x + 150, panel.y + 200);
          await page.mouse.wheel(-600, 0);
        } else {
          await fingerDown(page, { x: panel.x + 100, y: panel.y + 20 }, 260, 12);
        }
        await see(page.locator('#popup'), `swiped by a ${by}`).toHaveCount(0);
        return [reach, (await logOf(page)).filter((line) => line.startsWith('open'))];
      }),
    );
    expect(swept).toEqual([
      [[null, 'panel'], ['open false swipe']],
      [[null, 'panel'], ['open false swipe']],
    ]);
  });

  it('swipes a non-modal sheet away from its panel, and leaves the page around it to the page', async () => {
    const page = await h.open('sheet', {
      touch: true,
      query: { modal: 'false', dismissal: 'disabled', portal: 'inline' },
    });
    await openSheet(page);
    // Above the panel the page takes the press: the button there is pressed.
    await page.locator('#outside').tap();
    await see.poll(() => focused(page)).toBe('outside');
    await see(page.locator('#popup')).toBeVisible();
    // On the panel the press is the sheet's: a finger swipes it away.
    const panel = await box(page, '#panel');
    await fingerDown(page, { x: panel.x + 100, y: panel.y + 20 }, 260, 12);
    await see(page.locator('#popup')).toHaveCount(0);
    expect((await logOf(page)).filter((line) => line.startsWith('open'))).toEqual([
      'open false swipe',
    ]);
  });

  it('on a scrolling body scrolled down scrolls it, and leaves the sheet open', async () => {
    const page = await h.open('sheet', { touch: true, query: { body: 'tall' } });
    await openSheet(page);
    await page.locator('#body').evaluate((el) => (el.scrollTop = 300));
    const rect = await box(page, '#body');
    await fingerDown(page, { x: rect.x + 20, y: rect.y + rect.height / 2 }, 80, 8);
    await see.poll(() => bodyScrollTop(page)).toBeLessThan(300);
    expect(await bodyScrollTop(page)).toBeGreaterThan(0);
    await see(page.locator('#popup')).toBeVisible();
    expect((await logOf(page)).filter((line) => line.startsWith('open'))).toEqual([]);
  });

  it('on a scrolling body at its top swipes the sheet away', async () => {
    const page = await h.open('sheet', { touch: true, query: { body: 'tall' } });
    await openSheet(page);
    expect(await bodyScrollTop(page)).toBe(0);
    const rect = await box(page, '#body');
    await fingerDown(page, { x: rect.x + 20, y: rect.y + 10 }, 260, 12);
    await see(page.locator('#popup')).toHaveCount(0);
    expect((await logOf(page)).filter((line) => line.startsWith('open'))).toEqual([
      'open false swipe',
    ]);
  });
});
