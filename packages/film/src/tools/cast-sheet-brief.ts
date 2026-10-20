// A cast sheet's brief (`film concept brief`): the prompt one try of a cast
// member's sheet is painted from on the image route. It is the house block
// made a sheet's, a note on what each reference image is for, the member's
// look, the sheet's layout, and the rules of its kind. The house block is the
// one every concept and Board prompt opens with
// (`apps/animations/docs/ref/house-look.txt`); four of its phrases are swapped
// so it asks for a model sheet with no place behind, no beams and no walls. A
// swap whose phrase the block no longer says is `HouseBlockMoved`, so a
// changed house text stops the brief before a try is spent rather than
// painting a scene. A layout or a look whose clause says a hand floats is
// `HandFloats`: the brief's own rule puts every hand at the end of an arm in
// its sleeve, and a prompt that asks both ways spends a try on a hand
// `sleeveReach` then flags. How tall a figure stands, in its own heads, is
// the member's (`statureOf`: the cast's canon unless its record names its
// own), and a smaller figure a pose sheet draws (a child) is said with its
// share of the grown height; the hair's paragraph is said only of a member
// whose hair shows.

import { Array as Arr, Option, Result, Schema } from 'effect';
import type { SheetKind, ViewFigure } from '../core/cast-sheet.ts';

/** The house block no longer says a phrase the sheet's swaps replace. */
class HouseBlockMoved extends Schema.TaggedError<HouseBlockMoved>()('HouseBlockMoved', {
  phrase: Schema.String,
}) {
  override get message() {
    return `the house block no longer says "${this.phrase}": update the sheet's swaps in tools/cast-sheet-brief.ts`;
  }
}

/** A clause of the member's layout or look says a hand floats, against the rule that every hand is at the end of a sleeved arm. */
class HandFloats extends Schema.TaggedError<HandFloats>()('HandFloats', {
  part: Schema.Literals(['layout', 'look']),
  clause: Schema.String,
}) {
  override get message() {
    return `the sheet's ${this.part} says a hand floats ("${this.clause}"): every house hand is at the end of an arm in its sleeve (CRAFT rule 12), so rewrite the clause`;
  }
}

/** The first clause (a sentence or a part between semicolons) of `text` that names a hand and says it floats. */
const floatingHand = (text: string): Option.Option<string> =>
  Arr.findFirst(
    text.split(/[.;]/).map((clause) => clause.trim()),
    (clause) => /\bhands?\b/i.test(clause) && /\bfloat/i.test(clause),
  );

/** The layout and the look, each refused when a clause of it floats a hand. */
const sleevedHands = (brief: SheetBrief): Result.Result<SheetBrief, HandFloats> =>
  Option.match(
    Option.orElse(
      Option.map(floatingHand(brief.layout), (clause) =>
        HandFloats.make({ part: 'layout', clause }),
      ),
      () =>
        Option.map(floatingHand(brief.look), (clause) => HandFloats.make({ part: 'look', clause })),
    ),
    { onNone: () => Result.succeed(brief), onSome: (refused) => Result.fail(refused) },
  );

/** The house block's phrases a sheet swaps: the key frame becomes a model sheet, and the place behind the figures, its beams and its walls go. */
const SWAPS: ReadonlyArray<readonly [string, string]> = [
  [
    'A 2D key frame from a narrated animated film',
    'A character model sheet for a narrated animated film',
  ],
  [
    'The light and the place: a warm, soft key light from the upper left that falls in soft, hazy beams; ',
    'The light: a warm, soft key light from the upper left; ',
  ],
  [
    'a real place behind the figures, built of simple flat paper planes with no ink outline, each plane further back paler and softer in a warm haze, so depth comes from haze and never from blur; ',
    '',
  ],
  [
    'soft violet cast shadows on the walls and the floor, never a darker brown',
    'a small soft violet contact shadow under each figure, never a darker brown',
  ],
];

/** The house block made a sheet's, each swap guarded. */
const sheetHouseBlock = (house: string): Result.Result<string, HouseBlockMoved> =>
  SWAPS.reduce<Result.Result<string, HouseBlockMoved>>(
    (block, [from, to]) =>
      Result.flatMap(block, (text) =>
        Result.liftPredicate(
          text,
          (t) => t.includes(from),
          () => HouseBlockMoved.make({ phrase: from }),
        ).pipe(Result.map((t) => t.replace(from, to))),
      ),
    Result.succeed(house.trim()),
  );

/** The whole numbers a figure's height is said in. */
const WHOLE = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];

/** The fractions a share or a height is said in, nearest first. */
const FRACTIONS: ReadonlyArray<readonly [number, string]> = [
  [0, ''],
  [1 / 4, 'a quarter'],
  [1 / 3, 'a third'],
  [1 / 2, 'a half'],
  [2 / 3, 'two thirds'],
  [3 / 4, 'three quarters'],
  [1, ''],
];

/** The fraction nearest `x` (0 to 1), as its value and its words. */
const nearestFraction = (x: number): readonly [number, string] =>
  FRACTIONS.reduce((best, f) => (Math.abs(f[0] - x) < Math.abs(best[0] - x) && f) || best);

/** A figure's height in heads in words, to the nearest quarter or third: 3.36 is "three and a third", 2.6 "two and two thirds". */
export const headsWords = (heads: number): string => {
  const [part, words] = nearestFraction(heads - Math.floor(heads));
  const n = Math.floor(heads) + Number(part === 1);
  const whole = WHOLE[n] ?? `${n}`;
  return (words === '' && whole) || `${whole} and ${words}`;
};

/** A share of the grown figure's height in words: 0.67 is "two thirds of", 0.5 "half of". */
const shareWords = (share: number): string => {
  const [part, words] = nearestFraction(share);
  return (part === 1 && 'nearly') || (words === 'a half' && 'half of') || `${words} of`;
};

/** The views of `figures` that share one size, in words: "Figures 1 and 2", "Figure 5". */
const figuresNamed = (views: ReadonlyArray<number>): string =>
  `${(views.length > 1 && 'Figures') || 'Figure'} ${[views.slice(0, -1).join(', '), ...views.slice(-1)].filter((x) => x !== '').join(' and ')}`;

/** The sizes a pose sheet's smaller figures stand at, one sentence a size. */
const smallerFigures = (figures: ReadonlyArray<ViewFigure>): ReadonlyArray<string> => {
  const sizeOf = (f: ViewFigure) => `${f.height}:${f.heads}`;
  const firsts = figures.filter((f, k) => figures.findIndex((g) => sizeOf(g) === sizeOf(f)) === k);
  return firsts.map(({ height, heads }) => {
    const same = figures.filter((f) => sizeOf(f) === `${height}:${heads}`);
    return `${figuresNamed(same.map((f) => f.view))} ${(same.length > 1 && 'are') || 'is'} the same figure smaller: ${shareWords(height)} a grown figure's height and about ${headsWords(heads)} of its own heads tall, its head a larger share of it.`;
  });
};

// What a sheet says, by its kind. The arm in its sleeve is the owner's
// (2026-10-18, the look's v5: "I actually like the style when they have
// sleeves and like arms, kind of like we have with Jesus and a lot of the
// characters so far in the cast. Let's make that kind of a standing role for
// the concept"; on the farmer: "He lifts his hand up, but it just looks weird
// without the sleeves. So let's add the sleeves.");
// the hair and the beard answer his note on Christ's render ("Jesus's render
// confuses parts of his hair with his beard"), as the kept concepts part them
// (court.you and court-12: one brown, a dark band of its deep shade, about
// 0.13 to 0.18 in value, between the beard and each lock); the skin below the
// neck answers a try that read "no sleeve" as bare shoulders. A turnaround
// holds every view to one height on one ground line; a pose sheet holds the
// head and the hands, never the height (a pose sits, kneels or lies); a heads
// sheet draws no hands and no soles.

const PAPER_GROUND =
  'This is a model sheet for the animators, not a scene: a plain warm cream paper ground with a soft paper grain and no place behind';

const OUTLINE =
  "One thick warm dark-brown outline runs round the whole silhouette of each figure, and the head's outline is the one line inside it: none on the nose, the ear or the hairline, and the hair, the ear and the garments meet as flat colour, never as their own outlined pieces.";

const HAIR_BEARD =
  'The hair and the beard are one brown, yet never one shape: the hair is its own shape behind the head, the face and its beard one shape in front of it, and a narrow dark band, the deep shade of that brown, nearly as dark as the outline, runs between the beard and each lock of hair beside it, as the kept concepts paint it, so the beard never runs into the hair.';

const LIGHT =
  'The key light comes from the upper left on every figure, whichever way it faces, so its lit side is always on the left and its far side turns a deeper hue of its own colour toward violet, never grey and never black. Each turn is its own drawing, never a mirror of another.';

const HANDS =
  "Each arm is in its sleeve to the wrist, and each hand is a plain round paper circle of the skin's colour at its sleeve's end: no thumb, no fingers. The sleeve runs from the shoulder to the hand wherever the hand is, hanging at rest along the side or raised with it; a hand never floats free beside the body. No skin shows below the neck except the hands: never a bare arm, a forearm or a bare shoulder.";

const NO_LETTERING =
  'No lettering anywhere: no labels, no names, no numbers, no arrows, no text, no grid, no boxes or frames round the figures.';

/** How the member is drawn across its sheet: its grown height in its own heads, the smaller figures a pose sheet draws, and whether its hair shows. */
interface SheetFigures {
  readonly heads: number;
  readonly figures: ReadonlyArray<ViewFigure>;
  readonly hair: boolean;
}

/** Each kind's rules, in the order the brief says them. */
const sheetRules = (
  kind: SheetKind,
  { heads, figures, hair }: SheetFigures,
): ReadonlyArray<string> => {
  const hairBeard = (hair && [HAIR_BEARD]) || [];
  const tall = headsWords(heads);
  const smaller = figures.length > 0;
  return {
    turnaround: [
      `${PAPER_GROUND}, one thin flat ground line in a slightly deeper cream under every figure, and a small soft violet contact shadow under each one.`,
      `Every figure on the sheet is the same person at the same size: the same height, the same head size, the same garment length and the same hand size, their soles on the one ground line. The person stands about ${tall} heads tall.`,
      OUTLINE,
      ...hairBeard,
      LIGHT,
      HANDS,
      NO_LETTERING,
    ],
    poses: [
      `${PAPER_GROUND}, one thin flat ground line in a slightly deeper cream under the figures that stand, and a small soft violet contact shadow under each one.`,
      `Every ${(smaller && 'grown ') || ''}figure on the sheet is the same person: the same head size, the same garment and the same hand size; each pose takes the height its pose gives it, and a standing ${(smaller && 'grown ') || ''}figure stands about ${tall} heads tall.`,
      ...smallerFigures(figures),
      OUTLINE,
      ...hairBeard,
      LIGHT,
      HANDS,
      'A walking figure glides: both soles flat on the ground line, the feet close together, the body leaning a little into the travel, the hem swung back, never a stride.',
      NO_LETTERING,
    ],
    heads: [
      `${PAPER_GROUND}, and nothing under the heads.`,
      `Every head on the sheet is the same person at the same size: the same head size${(hair && ' and the same hair') || ''}, each head with the top of its shoulders only. No hands, no arms and no skin show below the neck.`,
      OUTLINE,
      ...hairBeard,
      LIGHT,
      NO_LETTERING,
    ],
  }[kind];
};

/** A turnaround's layout: six views in one row, as `TURNAROUND_SLOTS` reads them, `who` the member's pronoun ("Him", "her"). */
export const turnaroundLayout = (who: string): string =>
  `Draw ${who} six times in one row, evenly spaced across the sheet, standing at rest with both arms hanging in their sleeves at the sides, each hand at its sleeve's end, left to right: one, facing the viewer straight on; two, turned three-quarters toward the viewer's left; three, in full profile facing the viewer's left; four, seen from directly behind; five, in full profile facing the viewer's right; six, turned three-quarters toward the viewer's right. In profile one eye shows; from behind no face shows, only the back of the hair or headcloth and the garment's back.`;

/** What a sheet's brief is made of: its kind, the house block as the app keeps it, the member's own paragraphs, and how its figures are drawn. */
interface SheetBrief extends SheetFigures {
  readonly kind: SheetKind;
  readonly house: string;
  /** What each reference image is for, in their order. */
  readonly references: string;
  /** The member's look: face, hair, beard, skin, garments, as the kept concepts draw them. */
  readonly look: string;
  /** The views or poses, left to right (`turnaroundLayout` for a turnaround). */
  readonly layout: string;
}

/** The brief: the sheet's house block, the references' note, the look, the layout, then its kind's rules. */
export const castSheetBrief = (
  brief: SheetBrief,
): Result.Result<string, HouseBlockMoved | HandFloats> =>
  Result.flatMap(sleevedHands(brief), () => sheetHouseBlock(brief.house)).pipe(
    Result.map((block) =>
      [
        block,
        brief.references.trim(),
        brief.look.trim(),
        brief.layout.trim(),
        sheetRules(brief.kind, brief).join(' '),
      ].join('\n\n'),
    ),
  );
