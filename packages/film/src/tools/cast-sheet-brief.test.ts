// A cast sheet's brief from the app's own house block: the block made a
// sheet's, a block whose phrase moved stops the brief, and every brief
// carries the sheet rules the owner set.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Result } from 'effect';
import type { SheetKind } from '../core/cast-sheet.ts';
import { castSheetBrief, turnaroundLayout } from './cast-sheet-brief.ts';

/** The house block as the app keeps it. */
const houseBlock = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs.readFileString(
    new URL('../../../../apps/animations/docs/ref/house-look.txt', import.meta.url).pathname,
  );
}).pipe(Effect.provide(BunServices.layer));

/** A sheet's brief over `house`, a turnaround's unless `kind` says. */
const briefOver = (house: string, kind: SheetKind = 'turnaround') =>
  castSheetBrief({
    kind,
    house,
    references: 'Image 1 is his kept concept.',
    look: 'He wears a cream robe.',
    layout: turnaroundLayout('Him'),
  });

const briefOf = Effect.map(houseBlock, (house) => Result.getOrThrow(briefOver(house)));
const kindBrief = (kind: SheetKind) =>
  Effect.map(houseBlock, (house) => Result.getOrThrow(briefOver(house, kind)));

describe("the house block made a sheet's", () => {
  it.effect('asks for a model sheet, and drops the place behind the figures', () =>
    Effect.gen(function* () {
      const block = yield* briefOf;
      expect(block).toStartWith('A character model sheet for a narrated animated film');
      expect(block).not.toContain('a real place behind the figures');
      expect(block).not.toContain('key frame');
      expect(block).not.toContain('beams');
      expect(block).not.toContain('walls');
      expect(block).toContain('a small soft violet contact shadow under each figure');
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
        expect(brief).toContain('a narrow dark band, the deep shade of that brown');
        expect(brief).toContain('No lettering anywhere');
      }),
  );
});

describe("the owner's hair and beard in the brief", () => {
  it.effect('parts the beard from the hair by a dark band, never as flat colour meeting', () =>
    Effect.gen(function* () {
      const brief = yield* briefOf;
      expect(brief).not.toMatch(
        /the hair, the beard, the ear and the garments meet as flat colour/,
      );
      expect(brief).not.toContain('there is no ink line inside it');
      expect(brief).toContain('so the beard never runs into the hair');
    }),
  );
});

describe("each kind's rules", () => {
  it.effect('hold a turnaround to one height on one ground line', () =>
    Effect.gen(function* () {
      const brief = yield* kindBrief('turnaround');
      expect(brief).toContain('the same height');
      expect(brief).toContain('their soles on the one ground line');
    }),
  );

  it.effect(
    'hold a pose sheet to the head and the hands, never the height, and glide as the design says',
    () =>
      Effect.gen(function* () {
        const brief = yield* kindBrief('poses');
        expect(brief).not.toContain('the same height');
        expect(brief).toContain('each pose takes the height its pose gives it');
        expect(brief).toContain(
          'both soles flat on the ground line, the feet close together, the body leaning a little into the travel, the hem swung back',
        );
      }),
  );

  it.effect('draw a heads sheet with no hands and no soles', () =>
    Effect.gen(function* () {
      const brief = yield* kindBrief('heads');
      expect(brief).toContain('No hands, no arms and no skin show below the neck');
      expect(brief).not.toContain('soles');
      expect(brief).not.toContain('floating free a hand');
    }),
  );
});
