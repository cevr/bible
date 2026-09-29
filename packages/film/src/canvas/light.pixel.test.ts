// A scene's `light` multiplies its page and all on it: none leaves the page
// as it is, an even light scales every pixel alike, a pool keeps the middle
// and darkens toward the corners, and a light read per frame comes up by its
// amount. Drawn through `createFilm` in headless Chromium with the
// renderer's software 2D canvas, as the export draws it.

import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { chromium } from 'playwright-core';
import type { LightStats } from './fixtures/light-pixels.ts';

/** The fixture page's script, bundled for the browser. */
const fixture = Effect.promise(() =>
  Bun.build({
    entrypoints: [`${import.meta.dir}/fixtures/light-pixels.ts`],
    target: 'browser',
    format: 'iife',
  }),
).pipe(
  Effect.flatMap((built) => {
    const out = built.outputs[0];
    return out === undefined ? Effect.succeed('') : Effect.promise(() => out.text());
  }),
);

/** Headless Chromium with the renderer's software 2D canvas (`tools/browser.ts`), closed with the scope. */
const browser = Effect.acquireRelease(
  Effect.promise(() => chromium.launch({ args: ['--disable-accelerated-2d-canvas'] })),
  (b) => Effect.promise(() => b.close()),
);

const stats = Effect.gen(function* () {
  const script = yield* fixture;
  const page = yield* Effect.flatMap(browser, (b) => Effect.promise(() => b.newPage()));
  yield* Effect.promise(() => page.setContent('<!doctype html><html><body></body></html>'));
  yield* Effect.promise(() => page.addScriptTag({ content: script }));
  return yield* Effect.promise((): Promise<LightStats> =>
    page.evaluate(() => Reflect.apply(Reflect.get(globalThis, 'lightStats'), undefined, [])),
  );
});

/** Within two levels of `want`. */
const near = (got: number, want: number) => expect(Math.abs(got - want)).toBeLessThanOrEqual(2);

describe('a scene is lit by its light', () => {
  it.scopedLive('none, even, a pool, and one coming up by its amount', () =>
    Effect.gen(function* () {
      const s = yield* stats;
      yield* Effect.log(
        `light unlit=${s.unlit.middle}/${s.unlit.corner} even=${s.even.middle}/${s.even.corner} pool=${s.pool.middle}/${s.pool.corner} rising=${s.rising25.middle},${s.rising75.middle}`,
      );
      // No light: the white page as it is.
      near(s.unlit.middle, 255);
      near(s.unlit.corner, 255);
      // An even grey light halves every pixel alike.
      near(s.even.middle, 128);
      near(s.even.corner, 128);
      // A pool keeps the middle and falls to its edge at the corners.
      near(s.pool.middle, 255);
      expect(s.pool.corner).toBeLessThanOrEqual(8);
      // Read per frame: a quarter and three quarters of the way up.
      near(s.rising25.middle, 255 - 0.25 * 127);
      near(s.rising75.middle, 255 - 0.75 * 127);
    }),
  );
});
