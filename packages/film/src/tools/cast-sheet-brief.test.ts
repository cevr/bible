// A cast sheet's brief from the app's own house block: the block made a
// sheet's, a block whose phrase moved stops the brief, and every brief
// carries the sheet rules the owner set.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Result } from 'effect';
import { castSheetBrief, turnaroundLayout } from './cast-sheet-brief.ts';

/** The house block as the app keeps it. */
const houseBlock = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs.readFileString(
    new URL('../../../../apps/animations/docs/ref/house-look.txt', import.meta.url).pathname,
  );
}).pipe(Effect.provide(BunServices.layer));

/** A turnaround's brief over `house`. */
const briefOver = (house: string) =>
  castSheetBrief({
    house,
    references: 'Image 1 is his kept concept.',
    look: 'He wears a cream robe.',
    layout: turnaroundLayout('Him'),
  });

const briefOf = Effect.map(houseBlock, (house) => Result.getOrThrow(briefOver(house)));

describe("the house block made a sheet's", () => {
  it.effect('asks for a model sheet, and drops the place behind the figures', () =>
    Effect.gen(function* () {
      const block = yield* briefOf;
      expect(block).toStartWith('A character model sheet for a narrated animated film');
      expect(block).not.toContain('a real place behind the figures');
      expect(block).not.toContain('key frame');
    }),
  );

  it.effect('stops at a block that no longer says a phrase it swaps', () =>
    Effect.gen(function* () {
      const moved = (yield* houseBlock).replace('A 2D key frame', 'A key frame');
      const failed = Result.match(briefOver(moved), {
        onFailure: (e) => e.phrase,
        onSuccess: () => 'swapped',
      });
      expect(failed).toBe('A 2D key frame from a narrated animated film');
    }),
  );
});

describe("a sheet's brief", () => {
  it.effect(
    'runs the house block, the references, the look, the layout and the rules, in that order',
    () =>
      Effect.gen(function* () {
        const brief = yield* briefOf;
        const at = [
          'A character model sheet',
          'Image 1 is his',
          'He wears a cream',
          'Draw Him six times',
          'This is a model sheet for the animators',
        ].map((p) => brief.indexOf(p));
        expect(at.every((i) => i >= 0)).toBe(true);
        expect([...at].sort((a, b) => a - b)).toEqual(at);
      }),
  );

  it.effect(
    "carries the owner's rules: a sleeve at rest only, the beard parted from the hair, no lettering",
    () =>
      Effect.gen(function* () {
        const brief = yield* briefOf;
        expect(brief).toContain(
          "A sleeve may hang at rest along the body's side, but never reaches toward a hand.",
        );
        expect(brief).toContain('never a bare arm');
        expect(brief).toContain("the head's outline runs between the beard and the hair");
        expect(brief).toContain('No lettering anywhere');
      }),
  );
});
