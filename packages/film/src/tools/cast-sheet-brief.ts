// A cast sheet's brief (`film concept brief`): the prompt one try of a cast
// member's sheet is painted from on the image route. It is the house block
// made a sheet's, a note on what each reference image is for, the member's
// look, the sheet's layout, and the rules of its kind. The house block is the
// one every concept and Board prompt opens with
// (`apps/animations/docs/ref/house-look.txt`); four of its phrases are swapped
// so it asks for a model sheet with no place behind, no beams and no walls. A
// swap whose phrase the block no longer says is `HouseBlockMoved`, so a
// changed house text stops the brief before a try is spent rather than
// painting a scene.

import { Result, Schema } from 'effect';
import type { SheetKind } from '../core/cast-sheet.ts';

/** The house block no longer says a phrase the sheet's swaps replace. */
class HouseBlockMoved extends Schema.TaggedError<HouseBlockMoved>()('HouseBlockMoved', {
  phrase: Schema.String,
}) {
  override get message() {
    return `the house block no longer says "${this.phrase}": update the sheet's swaps in tools/cast-sheet-brief.ts`;
  }
}

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

/** Each kind's rules, in the order the brief says them. */
const SHEET_RULES: Record<SheetKind, ReadonlyArray<string>> = {
  turnaround: [
    `${PAPER_GROUND}, one thin flat ground line in a slightly deeper cream under every figure, and a small soft violet contact shadow under each one.`,
    'Every figure on the sheet is the same person at the same size: the same height, the same head size, the same garment length and the same hand size, their soles on the one ground line. The person stands about three and a third heads tall.',
    OUTLINE,
    HAIR_BEARD,
    LIGHT,
    HANDS,
    NO_LETTERING,
  ],
  poses: [
    `${PAPER_GROUND}, one thin flat ground line in a slightly deeper cream under the figures that stand, and a small soft violet contact shadow under each one.`,
    'Every figure on the sheet is the same person: the same head size, the same garment and the same hand size; each pose takes the height its pose gives it, and a standing figure stands about three and a third heads tall.',
    OUTLINE,
    HAIR_BEARD,
    LIGHT,
    HANDS,
    'A walking figure glides: both soles flat on the ground line, the feet close together, the body leaning a little into the travel, the hem swung back, never a stride.',
    NO_LETTERING,
  ],
  heads: [
    `${PAPER_GROUND}, and nothing under the heads.`,
    'Every head on the sheet is the same person at the same size: the same head size and the same hair, each head with the top of its shoulders only. No hands, no arms and no skin show below the neck.',
    OUTLINE,
    HAIR_BEARD,
    LIGHT,
    NO_LETTERING,
  ],
};

/** A turnaround's layout: six views in one row, as `TURNAROUND_SLOTS` reads them, `who` the member's pronoun ("Him", "her"). */
export const turnaroundLayout = (who: string): string =>
  `Draw ${who} six times in one row, evenly spaced across the sheet, standing at rest with both arms hanging in their sleeves at the sides, each hand at its sleeve's end, left to right: one, facing the viewer straight on; two, turned three-quarters toward the viewer's left; three, in full profile facing the viewer's left; four, seen from directly behind; five, in full profile facing the viewer's right; six, turned three-quarters toward the viewer's right. In profile one eye shows; from behind no face shows, only the back of the hair or headcloth and the garment's back.`;

/** What a sheet's brief is made of: its kind, the house block as the app keeps it, and the member's own paragraphs. */
interface SheetBrief {
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
export const castSheetBrief = (brief: SheetBrief): Result.Result<string, HouseBlockMoved> =>
  Result.map(sheetHouseBlock(brief.house), (block) =>
    [
      block,
      brief.references.trim(),
      brief.look.trim(),
      brief.layout.trim(),
      SHEET_RULES[brief.kind].join(' '),
    ].join('\n\n'),
  );
