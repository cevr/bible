// Every drawn scene breathes, exactly once (DIRECTION, "Always breathing,
// never busy"): a scene with no camera breathes as a whole, a scene with a
// camera or a multiplane shot breathes through it, and none breathes twice.
// Where one frame lands never depends on what the film drew before it. Drawn
// through `createFilm` in headless Chromium with the renderer's software 2D
// canvas, as the export draws it.

import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { chromium } from 'playwright-core';
import { DRIFT } from './camera.ts';
import type { BreathStats, Landed } from './fixtures/breath-pixels.ts';

/** The fixture page's script, bundled for the browser. */
const fixture = Effect.promise(() =>
  Bun.build({
    entrypoints: [`${import.meta.dir}/fixtures/breath-pixels.ts`],
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
  return yield* Effect.promise((): Promise<BreathStats> =>
    page.evaluate(() => Reflect.apply(Reflect.get(globalThis, 'breathStats'), undefined, [])),
  );
});

/** The square's centre and width on the frame. */
const placeOf = (l: Landed) => ({
  x: (l.left + l.right + 1) / 2,
  y: (l.top + l.bottom + 1) / 2,
  w: l.right - l.left + 1,
});

/** One breath at 60 % of a scene: the 40 px square pushed in and slid left, from the frame's centre (160, 90). */
const BREATH = Math.sin(Math.PI * 0.6);
const ONCE = { x: 160 - DRIFT.x * BREATH, y: 90, w: 40 * (1 + DRIFT.zoom * BREATH) };

const near = (l: Landed, to: { x: number; y: number; w: number }) => {
  const at = placeOf(l);
  expect(Math.abs(at.x - to.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(at.y - to.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(at.w - to.w)).toBeLessThanOrEqual(1.5);
};

describe('every scene breathes, once', () => {
  it.scopedLive(
    'a scene with no camera, a camera or a multiplane shot all breathe one breath, and a frame never depends on the one before',
    () =>
      Effect.gen(function* () {
        const s = yield* stats;
        const line = (l: Landed) => {
          const at = placeOf(l);
          return `${at.x},${at.y} w=${at.w}`;
        };
        yield* Effect.log(
          `breath still0=${line(s.still0)} still60=${line(s.still60)} shot60=${line(s.shot60)} plane60=${line(s.plane60)}`,
        );
        // At its start a scene is as framed; at 60 % a scene with no camera has moved.
        near(s.still0, { x: 160, y: 90, w: 40 });
        near(s.still60, ONCE);
        // A camera or a multiplane shot breathes once, as far as the scene with none: never twice.
        near(s.shot60, ONCE);
        near(s.plane60, ONCE);
        // The knob the scene read is placed where it breathes, read once, not once per attempt.
        expect(s.still60.knobs).toHaveLength(1);
        expect(s.still60.knobs[0]?.[0]).toBeCloseTo(1 + DRIFT.zoom * BREATH);
        expect(s.shot60.knobs).toHaveLength(1);
        // A scene that frames with a camera in one half and without in the other draws each
        // frame the same whether the film drew the other half first or nothing at all.
        expect(s.mixedLate.pixels).toEqual(s.mixedLateFresh.pixels);
        expect(s.mixedEarly.pixels).toEqual(s.mixedEarlyFresh.pixels);
        expect(s.mixedLate.knobs).toHaveLength(1);
        expect(s.mixedEarly.knobs).toHaveLength(1);
      }),
    60_000,
  );

  it.scopedLive(
    'a scene that sets its own drift: 0 holds still in a breathing film, with a camera or without',
    () =>
      Effect.gen(function* () {
        const s = yield* stats;
        near(s.held60, { x: 160, y: 90, w: 40 });
        near(s.heldShot60, { x: 160, y: 90, w: 40 });
      }),
    60_000,
  );
});
