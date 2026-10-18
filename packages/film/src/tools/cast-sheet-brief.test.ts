// A cast sheet's brief from the app's own house block: the block made a
// sheet's, a block whose phrase moved stops the brief, every brief carries
// the sheet rules the owner set, and a layout or a look that floats a hand
// stops it: the library's and every film's records are read here.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Option, Result, Schema } from 'effect';
import { SheetKind } from '../core/cast-sheet.ts';
import { CastSheetJson } from '../core/cast-record.ts';
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

  it.effect(
    'keeps the house hand: a circle at the end of an arm in its sleeve, never floating free',
    () =>
      Effect.gen(function* () {
        // The owner's rule (2026-10-18, look v5): every hand ends an arm in its sleeve.
        expect(yield* houseBlock).toContain(
          'Hands are plain round paper circles at the end of each arm in its sleeve, the sleeve running from the shoulder to the hand: never a hand floating free of the body, never a bare arm',
        );
        expect(yield* briefOf).toContain('at the end of each arm in its sleeve');
      }),
  );

  it.effect('stops at a block that no longer says a phrase it swaps', () =>
    Effect.gen(function* () {
      const moved = (yield* houseBlock).replace('A 2D key frame', 'A key frame');
      const failed = Result.match(briefOver(moved), {
        onFailure: (e) => ('phrase' in e && e.phrase) || e._tag,
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
    "carries the owner's rules: each hand at its sleeve's end, the beard parted from the hair, no lettering",
    () =>
      Effect.gen(function* () {
        const brief = yield* briefOf;
        expect(brief).toContain('Each arm is in its sleeve to the wrist');
        expect(brief).toContain('a hand never floats free beside the body');
        expect(brief).not.toContain('floating free a hand');
        expect(brief).not.toContain('floating low');
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
      expect(brief).not.toContain('Each arm is in its sleeve');
    }),
  );
});

describe('a hand that floats', () => {
  it.effect('stops a brief whose layout or look says a hand floats, naming the clause', () =>
    Effect.gen(function* () {
      const house = yield* houseBlock;
      const refused = (layout: string, look: string) =>
        Result.match(castSheetBrief({ kind: 'poses', house, references: '', look, layout }), {
          onSuccess: () => 'drawn',
          onFailure: (e) => `${e._tag}: ${e.message}`,
        });
      expect(
        refused(
          'one, at rest; two, His near hand raised before His chest, floating free; three, bowed.',
          'A cream robe.',
        ),
      ).toBe(
        'HandFloats: the sheet\'s layout says a hand floats ("two, His near hand raised before His chest, floating free"): every house hand is at the end of an arm in its sleeve (CRAFT rule 12), so rewrite the clause',
      );
      expect(refused(turnaroundLayout('Him'), 'Circle hands float beside him.')).toStartWith(
        "HandFloats: the sheet's look",
      );
      expect(
        refused('one, a boat floating on the lake; two, both hands low.', 'A cream robe.'),
      ).toBe('drawn');
    }),
  );

  it.effect("passes every cast record's layouts and look, the library's and each film's", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const house = yield* houseBlock;
      const app = new URL('../../../../apps/animations/src', import.meta.url).pathname;
      /** The members' sheet folders under `cast`, where a `cast-sheet.json` is. */
      const sheetsIn = (cast: string) =>
        Effect.gen(function* () {
          // A film with no cast folder (or a file beside the films) lists none.
          const members = yield* fs
            .readDirectory(cast)
            .pipe(Effect.orElseSucceed((): Array<string> => []));
          return yield* Effect.filter(
            members.map((m) => `${cast}/${m}/cast-sheet`),
            (folder) => fs.exists(`${folder}/cast-sheet.json`),
          );
        });
      const films = yield* fs.readDirectory(`${app}/films`);
      const folders = [
        ...(yield* sheetsIn(`${app}/library/cast`)),
        ...(yield* Effect.forEach(films, (film) => sheetsIn(`${app}/films/${film}/cast`))).flat(),
      ];
      const refused = yield* Effect.forEach(folders, (folder) =>
        Effect.gen(function* () {
          const record = yield* Schema.decodeEffect(CastSheetJson)(
            yield* fs.readFileString(`${folder}/cast-sheet.json`),
          );
          const look = yield* fs.readFileString(`${folder}/look.md`);
          const kinds = SheetKind.literals.flatMap((kind) =>
            Option.toArray(
              Option.map(Option.fromUndefinedOr(record.sheets[kind]), (sheet) => ({ kind, sheet })),
            ),
          );
          return kinds.flatMap(({ kind, sheet }) =>
            Result.match(
              castSheetBrief({
                kind,
                house,
                references: '',
                look,
                layout: Option.getOrElse(Option.fromUndefinedOr(sheet.layout), () =>
                  turnaroundLayout(record.who),
                ),
              }),
              { onSuccess: () => [], onFailure: (e) => [`${folder} ${kind}: ${e.message}`] },
            ),
          );
        }),
      );
      expect(folders.length).toBeGreaterThan(0);
      expect(refused.flat()).toEqual([]);
    }).pipe(Effect.provide(BunServices.layer)),
  );
});
