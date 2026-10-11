// Upstream: react-aria-components 1.22.1, packages/react-aria-components/test/Sheet.test.js.
// Copyright 2026 Adobe, Apache-2.0 (`../../src/sheet/LICENSE`); ported to Playwright on
// Solid 2, with the drawer suite's cases this sheet replaces.
//
// The sheet's behaviour cases. Every sheet opens from its owner's `open`, as
// every page's does. A swipe is native scrolling, so it is driven as the
// browser's own: a scroll of the container (as a wheel or trackpad would), or
// a finger (CDP touches) on a touch page.
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

/** Scrolls the sheet's container to `to` (`0` is the start), as a wheel would. */
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
    expect(await page.locator('#root').getAttribute('aria-hidden')).toBeNull();
    await see(page.locator('#panel')).not.toHaveAttribute('data-entering', '');
    await see.poll(() => focused(page)).toBe('popup');
    // Modal once in: the page outside is hidden from assistive technology.
    await see(page.locator('#root')).toHaveAttribute('aria-hidden', 'true');
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

  it('leaves focus where it was when initialFocus returns false', async () => {
    const page = await h.open('sheet', { query: { initial: 'false' } });
    await page.click('#open');
    await see(page.locator('#panel')).toHaveAttribute('data-expanded', '');
    await see(page.locator('#panel')).not.toHaveAttribute('data-entering', '');
    expect(await focused(page)).toBe('open');
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
});

describe('swipe to dismiss', () => {
  it('a scroll to the exit dismisses and unmounts it', async () => {
    const page = await h.open('sheet');
    await openSheet(page);
    expect((await scrollState(page)).top).toBe(600);
    await scrollSheet(page, { top: 0 });
    await see(page.locator('#popup')).toHaveCount(0);
    await see(page.locator('#overlay')).toHaveCount(0);
    expect((await logOf(page)).filter((line) => line.startsWith('open'))).toEqual([
      'open false swipe',
    ]);
    await see.poll(() => focused(page)).toBe('open');
  });

  it('a scroll short of the exit snaps back open', async () => {
    const page = await h.open('sheet');
    await openSheet(page);
    // 100px of the 300px sheet down: the nearer snap is the open one.
    await scrollSheet(page, { top: 500 });
    await see.poll(async () => (await scrollState(page)).top).toBe(600);
    await see(page.locator('#popup')).toBeVisible();
    expect((await logOf(page)).filter((line) => line.startsWith('open'))).toEqual([]);
  });

  it('a side sheet dismisses on a scroll along its own axis', async () => {
    const page = await h.open('sheet', { query: { position: 'right' } });
    await openSheet(page);
    expect((await scrollState(page)).left).toBe(800);
    await scrollSheet(page, { left: 0 });
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
    await page.mouse.move(650, 500);
    // 600px of the sheet's 800px travel toward the exit: the nearer snap is the exit.
    await page.mouse.wheel(-600, 0);
    await see(page.locator('#popup')).toHaveCount(0);
    expect((await logOf(page)).filter((line) => line.startsWith('open'))).toEqual([
      'open false swipe',
    ]);
  });

  it('a top sheet rests at scroll 0 and leaves toward the end', async () => {
    const page = await h.open('sheet', { query: { position: 'top' } });
    await openSheet(page);
    expect((await scrollState(page)).top).toBe(0);
    await scrollSheet(page, { top: 600 });
    await see(page.locator('#popup')).toHaveCount(0);
    expect((await logOf(page)).filter((line) => line.startsWith('open'))).toEqual([
      'open false swipe',
    ]);
  });

  it('a centred sheet leaves by either edge', async () => {
    const logs = await Promise.all(
      [0, 1200].map(async (top) => {
        const page = await h.open('sheet', { query: { position: 'center' } });
        await openSheet(page);
        expect((await scrollState(page)).top).toBe(600);
        await scrollSheet(page, { top });
        await see(page.locator('#popup')).toHaveCount(0);
        return (await logOf(page)).filter((line) => line.startsWith('open'));
      }),
    );
    expect(logs).toEqual([['open false swipe'], ['open false swipe']]);
  });

  it('springs back when the owner cancels the swipe close', async () => {
    const page = await h.open('sheet', { query: { owner: 'cancel' } });
    await openSheet(page);
    await scrollSheet(page, { top: 0 });
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
    await scrollSheet(page, { top: 0 });
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
    await scrollSheet(page, { top: 0 });
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
    await scrollSheet(page, { top: 0 });
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
 * then lifted: the browser's own touches (CDP), so it scrolls natively.
 */
async function fingerDown(
  page: Page,
  from: { x: number; y: number },
  distance: number,
  steps: number,
) {
  const cdp = await page.context().newCDPSession(page);
  const at = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number, y: number) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x, y }],
    });
  await at('touchStart', from.x, from.y);
  // One move after another, in order.
  await Array.from({ length: steps }, (_, i) => from.y + (distance * (i + 1)) / steps).reduce<
    Promise<unknown>
  >((previous, moveY) => previous.then(() => at('touchMove', from.x, moveY)), Promise.resolve());
  await at('touchEnd', from.x, from.y + distance);
}

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
