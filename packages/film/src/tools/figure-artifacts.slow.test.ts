// The figure measure's render artifacts, facing, and hair against beard, on crops of RBF's frames
// as the owner saw them on 2026-10-18 (the lab's look at 1:1):
// Christ at court 16.51 s, the farmer at rain's mark (14.19 s) and at 16.49 s,
// against the figures he locked (cold's lead at 24 s, its judge and
// prosecutor at 3.87 s, court's lead at 4 s). The owner, on the cast: "theres some
// artifacts in the render, and the farmer looks nothing like the concept,
// face proportions and angles are off". The crops are PNGs, so they are
// decoded here, past core.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Option, Result } from 'effect';
import { measureFigure } from '../core/figure.ts';
import { compareFigures } from '../core/match.ts';
import { decodePng } from './png.ts';

const measured = (name: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const bytes = yield* fs.readFile(
      new URL(`../core/fixtures/figure/${name}`, import.meta.url).pathname,
    );
    return Result.getOrThrow(measureFigure(Result.getOrThrow(decodePng(bytes))));
  }).pipe(Effect.provide(BunServices.layer));

const kindsOf = (name: string) => Effect.map(measured(name), (m) => m.artifacts.map((a) => a.kind));

/** How finely each facing row is read back: a turn to three places, a roll to a tenth of a degree. */
const PLACES = new Map([
  ['turn', 1000],
  ['roll', 10],
]);

/** The facing rows of the concept `concept` against the scene `scene`, by name: each side's value, rounded, and whether it flags. */
const facingRows = (concept: string, scene: string) =>
  Effect.map(Effect.all([measured(concept), measured(scene)]), ([c, s]) =>
    Object.fromEntries(
      compareFigures(c, s)
        .filter((row) => row.name.startsWith('head: turn') || row.name.startsWith('head: roll'))
        .map((row) => {
          const name = row.name.slice(6, 10);
          const by = PLACES.get(name) ?? 1;
          const round = (v: Option.Option<number>) =>
            Math.round(Option.getOrElse(v, () => Number.NaN) * by) / by;
          return [
            name,
            {
              concept: round(Option.fromUndefinedOr(row.concept)),
              scene: round(Option.fromUndefinedOr(row.scene)),
              flagged: row.flagged,
            },
          ];
        }),
    ),
  );

/** Whether the rows flag, by name. */
const flagsOf = (rows: Readonly<Record<string, { readonly flagged: boolean }>>) =>
  Object.fromEntries(Object.entries(rows).map(([name, row]) => [name, row.flagged]));

describe('render artifacts on RBF frames', () => {
  it.effect(
    'Christ at court: the light lines between His hair and its outline read as slivers',
    () =>
      Effect.gen(function* () {
        const kinds = yield* kindsOf('rbf-court-christ-head-1651.png');
        expect(kinds.filter((k) => k === 'sliver').length).toBeGreaterThanOrEqual(2);
      }),
  );

  it.effect(
    "the farmer at rain's mark: the headcloth showing between his face and its outline reads as a sliver",
    () =>
      Effect.gen(function* () {
        const m = yield* measured('rbf-rain-farmer-1419.png');
        // By hand on the crop: the cream line runs down the face's right edge, x 362 to 384.
        expect(m.artifacts.some((a) => a.kind === 'sliver' && a.box[0] >= 350)).toBe(true);
      }),
  );

  it.effect('the farmer at 16.49 s: rain across his face reads as weather', () =>
    Effect.gen(function* () {
      const kinds = yield* kindsOf('rbf-rain-farmer-1649.png');
      expect(kinds.filter((k) => k === 'weather').length).toBeGreaterThanOrEqual(2);
    }),
  );

  it.effect(
    'the figures the owner locked read none: the house rim, the grain and the light are no artifact',
    () =>
      Effect.gen(function* () {
        const locked = [
          'rbf-cold-lead-head-2400.png',
          'rbf-cold-judge-head-0387.png',
          'rbf-cold-prosecutor-face-0387.png',
          'rbf-court-lead-0401.png',
        ];
        const read = yield* Effect.forEach(locked, kindsOf, { concurrency: 4 });
        expect(Object.fromEntries(locked.map((name, i) => [name, read[i]]))).toEqual(
          Object.fromEntries(locked.map((name) => [name, []])),
        );
      }),
  );
});

describe("a head's facing against its concept", () => {
  it.effect(
    'the farmer at rain 14.19 s, turned as his concept is (a little more) and level where it tilts up 12°: the roll flags, the turn does not',
    () =>
      Effect.gen(function* () {
        const rows = yield* facingRows('rain-rain-farmer-concept.png', 'rbf-rain-farmer-1419.png');
        // His skin alone: the headcloth beside his cheek, with no ink between, is no face.
        expect(rows).toEqual({
          turn: { concept: 0.094, scene: 0.141, flagged: false },
          roll: { concept: -11.7, scene: 0.4, flagged: true },
        });
      }),
  );

  it.effect("Christ and cold's prosecutor, drawn in their concepts' facing: neither flags", () =>
    Effect.gen(function* () {
      const [christ, prosecutor] = yield* Effect.all([
        facingRows('court-12-christ-concept.png', 'rbf-court-christ-head-1651.png'),
        facingRows('cold-34-prosecutor.png', 'rbf-cold-prosecutor-head.png'),
      ]);
      expect({ christ: flagsOf(christ), prosecutor: flagsOf(prosecutor) }).toEqual({
        christ: { turn: false, roll: false },
        prosecutor: { turn: false, roll: false },
      });
    }),
  );
});

describe('the hair and the beard against the concept', () => {
  it.effect(
    'Christ at court 16.51 s, his beard run into his hair where his concept parts them by a dark band: flagged (owner, 2026-10-18)',
    () =>
      Effect.gen(function* () {
        const [c, s] = yield* Effect.all([
          measured('court-12-christ-concept.png'),
          measured('rbf-court-christ-head-1651.png'),
        ]);
        const parted = compareFigures(c, s).find((row) => row.name === 'hair/beard: parted');
        expect(parted).toMatchObject({
          flagged: true,
          note: 'concept parted (edge 0.146, step 0.020), scene merged (edge 0.063, step 0.004)',
        });
      }),
  );
});
