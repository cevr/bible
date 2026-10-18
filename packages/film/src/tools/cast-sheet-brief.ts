// A cast sheet's brief (`film concept brief`): the prompt one try of a cast
// member's sheet is painted from on the image route. It is the house block
// made a sheet's, a note on what each reference image is for, the member's
// look, the sheet's layout, and the rules every sheet carries. The house
// block is the one every concept and Board prompt opens with
// (`apps/animations/docs/ref/house-look.txt`); two of its phrases are swapped
// so it asks for a model sheet with no place behind. A swap whose phrase the
// block no longer says is `HouseBlockMoved`, so a changed house text stops the
// brief before a try is spent rather than painting a scene.

import { Result, Schema } from 'effect';

/** The house block no longer says a phrase the sheet's swaps replace. */
class HouseBlockMoved extends Schema.TaggedError<HouseBlockMoved>()('HouseBlockMoved', {
  phrase: Schema.String,
}) {
  override get message() {
    return `the house block no longer says "${this.phrase}": update the sheet's swaps in tools/cast-sheet-brief.ts`;
  }
}

/** The house block's two phrases a sheet swaps: the key frame becomes a model sheet, and the place behind the figures goes. */
const SWAPS: ReadonlyArray<readonly [string, string]> = [
  [
    'A 2D key frame from a narrated animated film',
    'A character model sheet for a narrated animated film',
  ],
  [
    'a real place behind the figures, built of simple flat paper planes with no ink outline, each plane further back paler and softer in a warm haze, so depth comes from haze and never from blur; ',
    '',
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

/**
 * What every sheet says, whatever it draws. The sleeve and the arm are the
 * owner's (2026-10-18: "A sleeve may hang at rest, but never reach toward a
 * hand"); the hair and the beard answer his note on Christ's render ("Jesus's
 * render confuses parts of his hair with his beard"); the skin below the neck
 * answers a try that read "no sleeve" as bare shoulders.
 */
const SHEET_RULES: ReadonlyArray<string> = [
  'This is a model sheet for the animators, not a scene: a plain warm cream paper ground with a soft paper grain and no place behind, one thin flat ground line in a slightly deeper cream under every figure, and a small soft violet contact shadow under each one.',
  'Every figure on the sheet is the same person at the same size: the same height, the same head size, the same garment length and the same hand size, their soles on the one ground line. The person stands about three and a third heads tall.',
  'One thick warm dark-brown outline runs round the whole silhouette of each figure; there is no ink line inside it, none on the nose, the ear or the hairline: the hair, the beard, the ear and the garments meet as flat colour, never as their own outlined pieces.',
  "The hair is its own shape behind the head. The face and the beard are one shape in front of it, and the head's outline runs between the beard and the hair, so the two never run into one another.",
  'The key light comes from the upper left on every figure, whichever way it faces, so its lit side is always on the left and its far side turns a deeper hue of its own colour toward violet, never grey and never black. Each turn is its own drawing, never a mirror of another.',
  "The hands are two plain round paper circles of the skin's colour floating free a hand's width beside the body: no arm, no thumb, no fingers. A sleeve may hang at rest along the body's side, but never reaches toward a hand. No skin shows below the neck except the hands: never a bare arm, a forearm or a bare shoulder.",
  "A walking figure glides: the body upright and level, the garment's hem swinging a little, never a stride.",
  'No lettering anywhere: no labels, no names, no numbers, no arrows, no text, no grid, no boxes or frames round the figures.',
];

/** A turnaround's layout: six views in one row, as `TURNAROUND_SLOTS` reads them, `who` the member's pronoun ("Him", "her"). */
export const turnaroundLayout = (who: string): string =>
  `Draw ${who} six times in one row, evenly spaced across the sheet, standing at rest with both hands floating low beside the body, left to right: one, facing the viewer straight on; two, turned three-quarters toward the viewer's left; three, in full profile facing the viewer's left; four, seen from directly behind; five, in full profile facing the viewer's right; six, turned three-quarters toward the viewer's right. In profile one eye shows; from behind no face shows, only the back of the hair or headcloth and the garment's back.`;

/** What a sheet's brief is made of: the house block as the app keeps it, and the member's own paragraphs. */
interface SheetBrief {
  readonly house: string;
  /** What each reference image is for, in their order. */
  readonly references: string;
  /** The member's look: face, hair, beard, skin, garments, as the kept concepts draw them. */
  readonly look: string;
  /** The views or poses, left to right (`turnaroundLayout` for a turnaround). */
  readonly layout: string;
}

/** The brief: the sheet's house block, the references' note, the look, the layout, then the sheet rules. */
export const castSheetBrief = (brief: SheetBrief): Result.Result<string, HouseBlockMoved> =>
  Result.map(sheetHouseBlock(brief.house), (block) =>
    [
      block,
      brief.references.trim(),
      brief.look.trim(),
      brief.layout.trim(),
      SHEET_RULES.join(' '),
    ].join('\n\n'),
  );
