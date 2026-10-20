// A cast sheet's brief from the app's own house block: the block made a
// sheet's, a block whose phrase moved stops the brief, every brief carries
// the sheet rules the owner set, a figure stands its own heads (the canon's
// unless the member names its own, a smaller figure its share of the grown
// height), the hair is spoken of only where it shows, and a layout or a look
// that floats a hand stops it: the library's and every film's records are
// read here.

import { BunServices } from '@effect/platform-bun';
import { test } from 'bun:test';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Option, Result, Schema } from 'effect';
import { CANON_HEADS, SheetKind, type ViewFigure } from '../core/cast-sheet.ts';
import { CastSheetJson, castKindPlan, hairShows } from '../core/cast-record.ts';
import { castSheetBrief, headsWords, turnaroundLayout } from './cast-sheet-brief.ts';

/** The house block as the app keeps it. */
const houseBlock = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs.readFileString(
    new URL('../../../../apps/animations/docs/ref/house-look.txt', import.meta.url).pathname,
  );
}).pipe(Effect.provide(BunServices.layer));

/** How a member is drawn across its sheet: its heads, its smaller figures, whether its hair shows. */
interface Drawn {
  readonly heads: number;
  readonly figures: ReadonlyArray<ViewFigure>;
  readonly hair: boolean;
}

/** How a canon member with hair is drawn: the default the tests vary. */
const CANON_MEMBER: Drawn = { heads: CANON_HEADS, figures: [], hair: true };

/** A sheet's brief over `house`, a turnaround's unless `kind` says, its figures the canon's unless `drawn` says. */
const briefOver = (house: string, kind: SheetKind = 'turnaround', drawn: Partial<Drawn> = {}) =>
  castSheetBrief({
    kind,
    house,
    references: 'Image 1 is his kept concept.',
    look: 'He wears a cream robe.',
    layout: turnaroundLayout('Him'),
    ...CANON_MEMBER,
    ...drawn,
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

describe("a figure's height in its own heads", () => {
  test('is said to the nearest quarter or third', () => {
    expect([3.36, 2.6, 2.2, 3, 2.9].map(headsWords)).toEqual([
      'three and a third',
      'two and two thirds',
      'two and a quarter',
      'three',
      'three',
    ]);
  });

  it.effect('stands a canon member at the canon, and a member of its own design at its own', () =>
    Effect.gen(function* () {
      const house = yield* houseBlock;
      const said = (kind: SheetKind, heads: number) =>
        Result.getOrThrow(briefOver(house, kind, { heads }));
      expect(said('turnaround', CANON_HEADS)).toContain(
        'The person stands about three and a third heads tall.',
      );
      // The plain lead stands about 2.6 heads (character-design 2.3).
      expect(said('turnaround', 2.6)).toContain(
        'The person stands about two and two thirds heads tall.',
      );
      expect(said('turnaround', 2.6)).not.toContain('three and a third');
      expect(said('poses', 2.6)).toContain(
        'a standing figure stands about two and two thirds heads tall',
      );
    }),
  );

  it.effect("sizes a pose sheet's smaller figures by their share of the grown height", () =>
    Effect.gen(function* () {
      const brief = Result.getOrThrow(
        briefOver(yield* houseBlock, 'poses', {
          heads: 2.6,
          figures: [
            { view: 1, height: 0.67, heads: 2.2 },
            { view: 2, height: 0.67, heads: 2.2 },
            { view: 5, height: 0.75, heads: 2.2 },
          ],
        }),
      );
      expect(brief).toContain(
        'Every grown figure on the sheet is the same person: the same head size, the same garment and the same hand size; each pose takes the height its pose gives it, and a standing grown figure stands about two and two thirds heads tall.',
      );
      expect(brief).toContain(
        "Figures 1 and 2 are the same figure smaller: two thirds of a grown figure's height and about two and a quarter of its own heads tall, its head a larger share of it.",
      );
      expect(brief).toContain(
        "Figure 5 is the same figure smaller: three quarters of a grown figure's height and about two and a quarter of its own heads tall",
      );
    }),
  );
});

describe('a smaller figure in a record', () => {
  const poses = {
    anchor: 1,
    layout: 'Standing; sitting.',
    slots: ['front', 'front'] as const,
    standing: [1],
    tries: [],
  };
  const held = (figures: ReadonlyArray<{ view: number; height: number; heads: number }>) =>
    Schema.decodeSync(CastSheetJson)(
      Schema.encodeSync(Schema.fromJsonString(Schema.Json))({
        member: 'them',
        scope: 'library',
        who: 'them',
        refs: [],
        sheets: { poses: { ...poses, figures }, heads: { ...poses, figures } },
      }),
    );
  const refusal = (kind: SheetKind, figures: Parameters<typeof held>[0]) =>
    Result.match(castKindPlan(held(figures), kind), {
      onSuccess: () => 'planned',
      onFailure: (unset) => unset.reason,
    });

  test('is drawn on a pose sheet at its own height and heads', () => {
    const plan = Result.getOrThrow(
      castKindPlan(held([{ view: 2, height: 0.5, heads: 2 }]), 'poses'),
    );
    expect(plan.options.figures).toEqual([{ view: 2, height: 0.5, heads: 2 }]);
  });

  test('is refused on a heads sheet, off the sheet, and named twice', () => {
    expect(refusal('heads', [{ view: 2, height: 0.5, heads: 2 }])).toContain(
      'only a pose sheet draws a smaller figure',
    );
    expect(refusal('poses', [{ view: 3, height: 0.5, heads: 2 }])).toContain(
      'a figure names view 3, not one of its 2',
    );
    expect(
      refusal('poses', [
        { view: 2, height: 0.5, heads: 2 },
        { view: 2, height: 0.6, heads: 2 },
      ]),
    ).toContain('a figure names view 2, not one of its 2 or named twice');
  });
});

describe('the hair in the brief', () => {
  it.effect('is spoken of only on a member whose hair shows', () =>
    Effect.gen(function* () {
      const house = yield* houseBlock;
      for (const kind of SheetKind.literals) {
        expect(Result.getOrThrow(briefOver(house, kind))).toContain(
          'so the beard never runs into the hair',
        );
        const bare = Result.getOrThrow(briefOver(house, kind, { hair: false }));
        expect(bare).not.toContain('The hair and the beard are one brown');
        expect(bare).not.toContain('the same hair');
      }
    }),
  );
});

describe('a hand that floats', () => {
  it.effect('stops a brief whose layout or look says a hand floats, naming the clause', () =>
    Effect.gen(function* () {
      const house = yield* houseBlock;
      const refused = (layout: string, look: string) =>
        Result.match(
          castSheetBrief({ kind: 'poses', house, references: '', look, layout, ...CANON_MEMBER }),
          {
            onSuccess: () => 'drawn',
            onFailure: (e) => `${e._tag}: ${e.message}`,
          },
        );
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
              Result.flatMap(castKindPlan(record, kind), (plan) =>
                castSheetBrief({
                  kind,
                  house,
                  references: '',
                  look,
                  layout: Option.getOrElse(Option.fromUndefinedOr(sheet.layout), () =>
                    turnaroundLayout(record.who),
                  ),
                  heads: plan.options.heads ?? CANON_HEADS,
                  figures: plan.options.figures ?? [],
                  hair: hairShows(record),
                }),
              ),
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
