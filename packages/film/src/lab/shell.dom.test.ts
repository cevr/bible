// The lab's shell in a browser: the real lab page over the probe film. The
// panel, its header and the look-book link are in place; every pinned layer
// sits exactly over the film canvas and follows it as the window resizes; the
// strip's slot sits right under the player's timeline; and the page starts
// without an error.

import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import type { Page } from 'playwright-core';
import { openLab } from './fixtures/harness.ts';

/** Each match's box as the page placed it: its rect, or for a pinned layer its inline box (a hidden layer has no rect). */
const rects = (sel: string) =>
  `[...document.querySelectorAll('${sel}')].map((e) => { const r = e.getBoundingClientRect(); const s = e.style; return (s.left === '' ? [r.left, r.top, r.width, r.height] : [s.left, s.top, s.width, s.height].map(parseFloat)).map(Math.round); })`;

/**
 * Resize the window, and wait until the page has handled it: its `resize`
 * event has fired. The lab places its layers in its own listener, added
 * before this one, and on the canvas's ResizeObserver in the same rendering
 * step, so the next read sees them placed.
 */
const resize = (page: Page, size: { readonly width: number; readonly height: number }) =>
  Effect.gen(function* () {
    yield* Effect.promise(() =>
      page.evaluate(
        `window.labResized = new Promise((done) => addEventListener('resize', () => done(true), { once: true })); true`,
      ),
    );
    yield* Effect.promise(() => page.setViewportSize(size));
    yield* Effect.promise(() => page.evaluate('window.labResized'));
  });

describe('the lab shell', () => {
  it.live('mounts the panel with its header and the look-book link', () =>
    Effect.gen(function* () {
      const { page, errors } = yield* openLab();
      const header = yield* Effect.promise(() => page.textContent('.lab-panel header'));
      expect(header).toContain('Lab');
      const href = yield* Effect.promise(() => page.getAttribute('.lab-lookbook', 'href'));
      expect(href).toBe('/?film=probe&lookbook');
      const lab = yield* Effect.promise(() =>
        page.evaluate(() => document.body.classList.contains('lab')),
      );
      expect(lab).toBe(true);
      expect(errors).toEqual([]);
    }).pipe(Effect.scoped),
  );

  it.live('pins its layers over the film canvas, and keeps them there as the window resizes', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab();
      const over = () =>
        Effect.promise(() =>
          page.evaluate(
            `({ canvas: ${rects('.stage canvas')}[0], layers: ${rects('.lab-overlay, .lab-onion, .lab-compare')} })`,
          ),
        );
      const before = (yield* over()) as { canvas: number[]; layers: number[][] };
      expect(before.layers.length).toBeGreaterThan(0);
      for (const layer of before.layers) expect(layer).toEqual(before.canvas);
      yield* resize(page, { width: 1000, height: 800 });
      const after = (yield* over()) as { canvas: number[]; layers: number[][] };
      expect(after.canvas).not.toEqual(before.canvas);
      for (const layer of after.layers) expect(layer).toEqual(after.canvas);
    }).pipe(Effect.scoped),
  );

  it.live('keeps the film canvas, and so its layers, inside its row, off the bar', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab();
      for (const size of [
        { width: 1400, height: 480 },
        { width: 1100, height: 420 },
      ]) {
        yield* resize(page, size);
        const box = (yield* Effect.promise(() =>
          page.evaluate(
            `({ stage: ${rects('.stage')}[0], canvas: ${rects('.stage canvas')}[0], overlay: ${rects('.lab-overlay')}[0], bar: ${rects('.bar')}[0] })`,
          ),
        )) as Record<'stage' | 'canvas' | 'overlay' | 'bar', [number, number, number, number]>;
        const bottom = ([, top, , height]: readonly number[]) => (top ?? 0) + (height ?? 0);
        expect(bottom(box.canvas)).toBeLessThanOrEqual(bottom(box.stage));
        expect(bottom(box.overlay)).toBeLessThanOrEqual(box.bar[1]);
        expect(box.overlay).toEqual(box.canvas);
      }
    }).pipe(Effect.scoped),
  );

  it.live("keeps the strip's slot right under the player's timeline", () =>
    Effect.gen(function* () {
      const { page } = yield* openLab();
      const next = yield* Effect.promise(() =>
        page.evaluate(() => document.querySelector('.bar .track')?.nextElementSibling?.className),
      );
      expect(next).toBe('lab-strip-slot');
    }).pipe(Effect.scoped),
  );

  it.live('a scene of many cues scrolls its strip, and the film keeps its size', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab();
      yield* Effect.promise(() => page.setViewportSize({ width: 1440, height: 900 }));
      yield* Effect.promise(() => page.waitForSelector('.lab-strip-row'));
      // 35 cue rows, as roof's busiest scene has: the probe's own rows, copied.
      yield* Effect.promise(() =>
        page.$eval('.lab-strip-rows', (rows) => {
          const row = rows.querySelector('.lab-strip-row');
          for (let i = rows.querySelectorAll('.lab-strip-row').length; i < 35; i++)
            if (row) rows.append(row.cloneNode(true));
        }),
      );
      const width = (sel: string) =>
        Effect.promise(() => page.$eval(sel, (el) => el.getBoundingClientRect().width));
      const canvas = yield* width('.stage canvas');
      const column = yield* width('.stage');
      // Scrolled to its end, the strip still shows the words row at its top.
      const strip = (yield* Effect.promise(() =>
        page.$eval('.lab-strip-scroll', (scroller) => {
          scroller.scrollTop = scroller.scrollHeight;
          const words = scroller.querySelector('.lab-strip-words')?.getBoundingClientRect().top;
          return {
            scrolls: scroller.scrollHeight > scroller.clientHeight,
            wordsAtTop:
              Math.round(words ?? -1) === Math.round(scroller.getBoundingClientRect().top),
          };
        }),
      )) as { scrolls: boolean; wordsAtTop: boolean };
      const box = { canvas, column, ...strip };
      expect(box.canvas).toBeGreaterThanOrEqual(box.column / 2);
      expect(box.scrolls).toBe(true);
      expect(box.wordsAtTop).toBe(true);
    }).pipe(Effect.scoped),
  );

  it.live('Play at the end of the film starts it over', () =>
    Effect.gen(function* () {
      // Past the end: the player shows the last frame.
      const { page } = yield* openLab([], { hash: '#999' });
      const t = () =>
        Effect.promise(() => page.evaluate(() => Number(location.hash.slice(1)))).pipe(
          Effect.map((n) => Math.round(n * 10) / 10),
        );
      const end = yield* t();
      expect(end).toBeGreaterThan(1);
      yield* Effect.promise(() => page.keyboard.press(' '));
      yield* Effect.promise(() => page.clock.runFor(500));
      yield* Effect.promise(() => page.keyboard.press(' '));
      const played = yield* t();
      expect(played).toBeGreaterThan(0);
      expect(played).toBeLessThan(end);
    }).pipe(Effect.scoped),
  );
});
