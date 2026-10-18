// The figure measure's render artifacts and facing, on crops of RBF's frames
// as the owner saw them on 2026-10-18 (the lab's look at 1:1):
// Christ at court 16.51 s, the farmer at rain's mark (14.19 s) and at 16.49 s,
// against the figures he locked (cold's lead at 24 s, its judge and
// prosecutor at 3.87 s, court's lead at 4 s). The owner, on the cast: "theres some
// artifacts in the render, and the farmer looks nothing like the concept,
// face proportions and angles are off". The crops are PNGs, so they are
// decoded here, past core.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Result } from 'effect';
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

/** The facing rows of the concept `concept` against the scene `scene`, by name, flagged or not. */
const facingFlags = (concept: string, scene: string) =>
  Effect.map(Effect.all([measured(concept), measured(scene)]), ([c, s]) =>
    Object.fromEntries(
      compareFigures(c, s)
        .filter((row) => row.name.startsWith('head: turn') || row.name.startsWith('head: roll'))
        .map((row) => [row.name.slice(0, 10), row.flagged]),
    ),
  );

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
    'the farmer, drawn level and front from a concept turned and tilted up: the turn and the roll flag',
    () =>
      Effect.gen(function* () {
        expect(
          yield* facingFlags('rain-rain-farmer-concept.png', 'rbf-rain-farmer-1419.png'),
        ).toEqual({ 'head: turn': true, 'head: roll': true });
      }),
  );

  it.effect("Christ and cold's prosecutor, drawn in their concepts' facing: neither flags", () =>
    Effect.gen(function* () {
      const [christ, prosecutor] = yield* Effect.all([
        facingFlags('court-12-christ-concept.png', 'rbf-court-christ-head-1651.png'),
        facingFlags('cold-34-prosecutor.png', 'rbf-cold-prosecutor-head.png'),
      ]);
      expect({ christ, prosecutor }).toEqual({
        christ: { 'head: turn': false, 'head: roll': false },
        prosecutor: { 'head: turn': false, 'head: roll': false },
      });
    }),
  );
});
