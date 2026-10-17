// The figure measure on two real crops: the cold.34 concept's prosecutor
// against the table measured by hand on the concept, and a round-3 scene
// still of the judge whose hair carried its own line. The crops are PNGs,
// so they are decoded here, past core.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Option, Result } from 'effect';
import { type FigureMeasure, measureFigure, type Ratio } from '../core/figure.ts';
import { decodePng } from './png.ts';

const measuredFixture = (name: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const bytes = yield* fs.readFile(
      new URL(`../core/fixtures/figure/${name}`, import.meta.url).pathname,
    );
    return Result.getOrThrow(measureFigure(Result.getOrThrow(decodePng(bytes))));
  }).pipe(Effect.provide(BunServices.layer));

/** The ratio's value; NaN when it is missing, so the test's numbers fail on it. */
const valueOf = (m: FigureMeasure, ratio: Ratio): number =>
  Option.match(Option.fromUndefinedOr(m.ratios.find((r) => r.ratio === ratio)), {
    onNone: () => Number.NaN,
    onSome: (r) => r.value,
  });

describe('a real crop', () => {
  it.effect(
    "the cold.34 concept's prosecutor reads within a tenth of the hand-measured table",
    () =>
      Effect.gen(function* () {
        const m = yield* measuredFixture('cold-34-prosecutor.png');
        const hand: ReadonlyArray<readonly [Ratio, number]> = [
          ['headHeight', 1.24],
          ['outline', 0.065],
          ['jaw', 0.755],
          ['bodyUnderChin', 0.8],
          ['body35', 0.91],
          ['body70', 1.065],
          ['hem', 1.5],
          ['heightInHeads', 3.35],
          ['hand', 0.44],
          ['eyeSpacing', 0.22],
        ];
        for (const [ratio, value] of hand)
          expect({ ratio, off: Math.abs(valueOf(m, ratio) / value - 1) < 0.1 }).toEqual({
            ratio,
            off: true,
          });
        expect(valueOf(m, 'interiorInk')).toBe(0);
      }),
  );

  it.effect("the round-3 judge's hair carries its own line: interior ink over a head long", () =>
    Effect.gen(function* () {
      const m = yield* measuredFixture('round-3-judge-head.png');
      expect(valueOf(m, 'interiorInk')).toBeGreaterThan(1);
    }),
  );
});
