// The figure measure on real crops: the cold.34 concept's prosecutor
// against the table measured by hand on the concept, RBF cold's prosecutor
// at 3.87 s (his hair dark and grained) against his head measured by hand
// on the frame, RBF court's Christ at 20.01 s (a front light's lit band on
// his dark hair) against his head's outline, and a round-3 scene still of
// the judge whose hair carried its own line. The crops are PNGs, so they are decoded here, past core.

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

  it.effect(
    "RBF cold's prosecutor at 3.87 s, his hair dark and grained, reads the head measured by hand on the frame",
    () =>
      Effect.gen(function* () {
        const m = yield* measuredFixture('rbf-cold-prosecutor-head.png');
        // By hand on the frame: the outline's outer edge from x 30 to 216, y 21 (the hair's top) to 241 (the chin's).
        expect(Math.abs(valueOf(m, 'headHeight') / (221 / 187) - 1)).toBeLessThan(0.05);
      }),
  );

  it.effect(
    "RBF court's Christ at 20.01 s, a lit band on his dark hair, reads his head to the outline and no line on his hair",
    () =>
      Effect.gen(function* () {
        const m = yield* measuredFixture('rbf-court-christ-front-lit-2001.png');
        // By hand on the frame: the outline's outer edge from x 42 to 442 over the head's rows.
        expect(Math.abs(m.head[0] - 42)).toBeLessThanOrEqual(2);
        expect(Math.abs(m.head[2] - 442)).toBeLessThanOrEqual(4);
        // Dark hair round the face, the band on it: the hair's paper, no line of its own.
        expect(valueOf(m, 'interiorInk')).toBeLessThan(0.02);
      }),
  );

  it.effect("the round-3 judge's hair carries its own line: interior ink over a head long", () =>
    Effect.gen(function* () {
      const m = yield* measuredFixture('round-3-judge-head.png');
      expect(valueOf(m, 'interiorInk')).toBeGreaterThan(1);
    }),
  );
});
