// The paper's grain is fixed to the plane and reads as paper (DIRECTION,
// "Grain"): a 50–150 px mottle that moves the tone by 3–6 %, a fine fibre
// within it, and a pan that slides the grain with the plane rather than
// leaving it on the screen. Drawn in headless Chromium with the renderer's
// software 2D canvas, as the export draws it.

import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { chromium } from 'playwright-core';
import type { FibreStats } from './fixtures/fibre-pixels.ts';

/** The fixture page's script, bundled for the browser. */
const fixture = Effect.promise(() =>
  Bun.build({
    entrypoints: [`${import.meta.dir}/fixtures/fibre-pixels.ts`],
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
  return yield* Effect.promise((): Promise<FibreStats> =>
    page.evaluate(() => Reflect.apply(Reflect.get(globalThis, 'fibreStats'), undefined, [])),
  );
});

describe('the paper fibre on a plane', () => {
  it.scopedLive(
    'mottles the tone by 3–6 %, carries a fine fibre, and slides with the plane',
    () =>
      Effect.gen(function* () {
        const s = yield* stats;
        yield* Effect.log(
          `fibre mottle=${s.mottle.toFixed(4)} fibre=${s.fibre.toFixed(4)} panned=${s.panned.toFixed(5)} screen=${s.screen.toFixed(4)} zoomed=${s.zoomed.toFixed(5)}`,
        );
        expect(s.mottle).toBeGreaterThanOrEqual(0.03);
        expect(s.mottle).toBeLessThanOrEqual(0.06);
        expect(s.fibre).toBeGreaterThan(0.01);
        // Panned 37 px, the grain is where the plane put it, not where the screen was.
        expect(s.panned).toBeLessThan(0.002);
        expect(s.screen).toBeGreaterThan(s.panned * 5);
        // Pushed in, the grain is the plane's, scaled and carried with it.
        expect(s.zoomed).toBeLessThan(0.002);
      }),
    60_000,
  );
});
