// A callback, or a shot carried over a cut, draws another scene's paper torn
// as that scene tore it: `f.handsOf(scene)` gives that scene's hands exactly
// as its own `f.hand` does there (the same seed rule, one function), boiling
// on this frame's tick, and a scene the film lacks fails naming it rather
// than tearing new paper. Drawn through `createFilm` in headless Chromium, as
// the export draws it.

import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { chromium } from 'playwright-core';
import type { HandsStats } from './fixtures/hands-frames.ts';

const fixture = Effect.promise(() =>
  Bun.build({
    entrypoints: [`${import.meta.dir}/fixtures/hands-frames.ts`],
    target: 'browser',
    format: 'iife',
  }),
).pipe(
  Effect.flatMap((built) => {
    const out = built.outputs[0];
    return out === undefined ? Effect.succeed('') : Effect.promise(() => out.text());
  }),
);

const browser = Effect.acquireRelease(
  Effect.promise(() => chromium.launch({ args: ['--disable-accelerated-2d-canvas'] })),
  (b) => Effect.promise(() => b.close()),
);

const stats = Effect.gen(function* () {
  const script = yield* fixture;
  const page = yield* Effect.flatMap(browser, (b) => Effect.promise(() => b.newPage()));
  yield* Effect.promise(() => page.setContent('<!doctype html><html><body></body></html>'));
  yield* Effect.promise(() => page.addScriptTag({ content: script }));
  return yield* Effect.promise((): Promise<HandsStats> =>
    page.evaluate(() => Reflect.apply(Reflect.get(globalThis, 'handsStats'), undefined, [])),
  );
});

describe('f.handsOf', () => {
  it.scopedLive(
    "gives another scene's hands as its own f.hand gives them, on this frame's boil, and refuses a scene the film lacks",
    () =>
      Effect.gen(function* () {
        const s = yield* stats;
        expect(s.own).toHaveLength(3);
        // Torn as the owning scene tore it: the same seeds, key for key.
        expect(s.borrowed.map((h) => h.seed)).toEqual(s.own.map((h) => h.seed));
        // Boiling on the frame it is drawn in.
        expect(s.borrowed.map((h) => h.boil)).toEqual(s.taker.map((h) => h.boil));
        // Not this scene's own paper.
        expect(s.borrowed.map((h) => h.seed)).not.toEqual(s.taker.map((h) => h.seed));
        // A mistyped scene fails, naming it.
        expect(s.unknown).toContain('"giver "');
      }),
    60_000,
  );
});
