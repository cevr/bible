// The lab's shell in a browser: the real lab page over the probe film. The
// panel, its header and the look-book link are in place; every pinned layer
// sits exactly over the film canvas and follows it as the window resizes; the
// strip's slot sits right under the player's timeline; and the page starts
// without an error.

import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { openLab } from './fixtures/harness.ts';

/** Each match's box as the page placed it: its rect, or for a pinned layer its inline box (a hidden layer has no rect). */
const rects = (sel: string) =>
  `[...document.querySelectorAll('${sel}')].map((e) => { const r = e.getBoundingClientRect(); const s = e.style; return (s.left === '' ? [r.left, r.top, r.width, r.height] : [s.left, s.top, s.width, s.height].map(parseFloat)).map(Math.round); })`;

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
      yield* Effect.promise(() => page.setViewportSize({ width: 1000, height: 800 }));
      yield* Effect.promise(() => page.waitForTimeout(100));
      const after = (yield* over()) as { canvas: number[]; layers: number[][] };
      expect(after.canvas).not.toEqual(before.canvas);
      for (const layer of after.layers) expect(layer).toEqual(after.canvas);
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
});
