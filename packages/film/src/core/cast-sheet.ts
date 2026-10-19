// A cast sheet measured (`film concept measure`): a member painted in the
// house look in several views on one image, its figures found by their ink
// and held, before any judge or pick, to the rules a rig traced from it must
// keep (the concept stage's cast sheets: the film skill's Concept step).
//
// - Facing first: each view's head turns as its slot says (a turnaround's
//   slots are front, three-quarter and profile to the viewer's left, back,
//   profile and three-quarter to the right). Two partner views that match
//   better unflipped than flipped were drawn facing one way; a profile, which
//   reads no face, is held to the three-quarter on its side the same way; a
//   turnaround head tipped past 5° is a redraw.
// - The canon: the anchor view's height in heads, and the squash a trace to
//   the cast's canon (3.36 heads) would apply with the head held. A sheet
//   never sets a height; the cast band does.
// - Held to the anchor (the view that passes the concept's match): height
//   on standing views, the head, the hand, the hair's fall under the chin on
//   level heads, the papers; the partners' body widths, the hands cut out;
//   one ground line. A heads sheet holds the head's height on its level
//   heads and its width within each turn, and reads no hands.
// - The look's rules: a lit side on the left (the key light is upper left;
//   a view lit on its right was flipped), no grey shade, a partner never a
//   mirror of the other, a beard parted from the hair as the kept concept
//   parts it (owner, 2026-10-18: "Jesus's render confuses parts of his hair
//   with his beard, look more closely to the concept"), and no skin below the
//   neck but the hands, nor a sleeve or an arm that joins a hand held out
//   or raised, from any angle (owner, 2026-10-18: "A sleeve may hang at
//   rest, but never reach toward a hand"). The face is found by its own
//   read (the skin round the eyes), never as the skin above the chin.
//
// A sheet is painted: what a view does not show is listed as not measured,
// never guessed, and the measure guides the retry and the ask; it does not
// keep a view.

import { Array as Arr, Option, Result, Schema } from 'effect';
import {
  arcOf,
  type Box,
  componentsOf,
  deltaE,
  figuresOf,
  firstLabelIn,
  firstLabelInside,
  inkByLuma,
  labOf,
  litSideOf,
  lumaOf,
  outsideOf,
  pairDiff,
  papersOf,
  type Region,
  regionsOf,
  type Rgb,
  rgbAt,
  ringShareOf,
  type SheetFigure,
  saturationValueOf,
} from './cast-sheet-pixels.ts';
import { type FigureMeasure, measureFigure, PixelBox } from './figure.ts';
import { compareFigures } from './match.ts';
import { cropRaster, type Raster, type RasterPath, strokeRaster } from './raster.ts';

// ---------------------------------------------------------------------------
// What a sheet is asked to hold

/** Where a view faces: front, three-quarter or profile toward the viewer's left or right, the back, or free (a pose sheet's view whose facing is not held). */
export const Slot = Schema.Literals(['front', 'left', 'right', 'back', 'free']);
export type Slot = typeof Slot.Type;

/** A turnaround's six views, left to right. */
const TURNAROUND_SLOTS: ReadonlyArray<Slot> = ['front', 'left', 'left', 'back', 'right', 'right'];

export const SheetKind = Schema.Literals(['turnaround', 'poses', 'heads']);
export type SheetKind = typeof SheetKind.Type;

/** The cast's canon: Christ's 3.36 heads, the owner's one height for the whole cast (character-design, the height band). */
const CANON_HEADS = 3.36;

/** How a sheet is read: its kind, how many figures it draws, the anchor view (1-based), each view's slot, the views that stand, and whether the member wears headgear. */
export interface SheetOptions {
  readonly kind: SheetKind;
  readonly count: number;
  readonly anchor: number;
  readonly slots?: ReadonlyArray<Slot>;
  /** The views whose height is held to the anchor's: a turnaround's are all of them. */
  readonly standing?: ReadonlyArray<number>;
  /** The views whose head is level, neither bowed nor lifted: the hair's fall is held on these alone (every view when left out). */
  readonly level?: ReadonlyArray<number>;
  /** A headcloth or a veil: the head is read as its face opening, and the canon is not measured. */
  readonly headgear?: boolean;
  /** Kept concepts, each held to the sheet's view that faces as it does. */
  readonly concepts?: ReadonlyArray<SheetConcept>;
}

/** A kept concept's figure, measured, and the sheet's view it is held to. */
export interface SheetConcept {
  readonly name: string;
  readonly measure: FigureMeasure;
  readonly view: number;
}

// ---------------------------------------------------------------------------
// Its tolerances

/** A view's height, head and hand against the anchor's, and partners' widths, in percent (the concepttool measure). */
const TOLERANCE = 5;
/** The squash to the canon past which a sheet is redrawn, in percent (a guess; calibrated on the first kept sheet). */
const SQUASH_MAX = 10;
/** A head's turn inside which it faces the viewer, and past which it faces a side (`figure.ts`'s facing). */
const FRONT_TURN = 0.06;
const SIDE_TURN = 0.04;
/** A turnaround head tipped past this, in degrees, is a redraw. */
const ROLL_MAX = 5;
/** A pair's mean difference flipped under this is a mirror. */
const MIRROR_FLOOR = 6;
/** A pair whose unflipped difference is under this share of its flipped one faces one way. */
const SAME_WAY = 0.8;
/** A paper's distance from the anchor's (ΔE76) past which it is another cloth. */
const PAPER_DE = 12;
/** A view's sole off the anchor's by more than this share of the anchor's height stands off the ground line. */
const GROUND = 0.02;
/** The hair's fall under the chin, in head heights, past which it differs from the anchor's. */
const HAIR_FALL = 0.1;
/** A garment that joins the body to a hand held out across more than this share of the hand's diameter is a sleeve or an arm that reaches. */
const REACH = 0.1;
/** A join crossing the circle just round a hand along less than this share of its radius is a touch, never a sleeve. */
const LINK = 0.5;
/** A fill's distance from the face's skin (ΔE76) inside which it may be skin. */
const SKIN_DE = 14;
/**
 * How many degrees of Lab hue a fill may lie yellower than the face's skin
 * and still be it: the house shade turns skin toward violet, never toward
 * yellow, so a gold sash as near the skin as its shade is told from it.
 */
const SKIN_YELLOWER = 8;
/**
 * A fill's distance from the face's lit skin (ΔE76) inside which it is the
 * skin's own paper: bare skin and the hands are cut from it, while a cloth
 * of a skin-like tan (a farmer's tunic, 8.5 from his face) is not.
 */
const SKIN_PAPER = 6;
/** The oval inside a head's box, as a share of its width and height, that only the head's own fills reach into. */
const HEAD_CORE = 0.95;
/** A dark fill (hair, a beard): darker than this luma, and farther than `PARTING_INK` from the ink. */
const DARK_LUMA = 115;
const PARTING_INK = 44;

// ---------------------------------------------------------------------------
// What the measure answers

const SheetCheck = Schema.Literals([
  'facing',
  'sameWay',
  'roll',
  'squash',
  'height',
  'head',
  'width',
  'hand',
  'hairFall',
  'papers',
  'grey',
  'lit',
  'mirror',
  'profileWay',
  'ground',
  'sleeveReach',
  'bareArm',
  'hairBeard',
]);
type SheetCheck = typeof SheetCheck.Type;

/** A check a sheet fails: the views it names, the value read, the limit, and what it means. */
const SheetFlag = Schema.Struct({
  check: SheetCheck,
  views: Schema.Array(Schema.Int),
  value: Schema.Finite,
  limit: Schema.Finite,
  note: Schema.String,
});
type SheetFlag = typeof SheetFlag.Type;

/** A check a view does not show, and why (view 0: the sheet). */
const SheetUnmeasured = Schema.Struct({
  check: SheetCheck,
  view: Schema.Int,
  why: Schema.String,
});
type SheetUnmeasured = typeof SheetUnmeasured.Type;

const LitSide = Schema.Literals(['left', 'right', 'even']);
type LitSide = typeof LitSide.Type;

/** A view read: its place, its size, its head and hands, its hair, its papers and its lit side. */
const SheetView = Schema.Struct({
  view: Schema.Int,
  slot: Slot,
  box: PixelBox,
  height: Schema.Finite,
  widthToHeight: Schema.Finite,
  /** The head's height in pixels; under headgear, the face opening's. */
  head: Schema.optionalKey(Schema.Finite),
  /** The head's width in pixels, which a nod changes little: what a heads sheet holds its heads by. */
  headWidth: Schema.optionalKey(Schema.Finite),
  headsTall: Schema.optionalKey(Schema.Finite),
  turn: Schema.optionalKey(Schema.Finite),
  roll: Schema.optionalKey(Schema.Finite),
  /** The hand's diameter in head heights (`figure.ts`'s `hand`, a share of the head's width, over the head's height). */
  hand: Schema.optionalKey(Schema.Finite),
  /** The hair's lowest point under the chin, in head heights. */
  hairFall: Schema.optionalKey(Schema.Finite),
  hairBeard: Schema.optionalKey(Schema.Literals(['parted', 'merged'])),
  lit: LitSide,
  papers: Schema.Array(
    Schema.Struct({
      rgb: Schema.Tuple([Schema.Int, Schema.Int, Schema.Int]),
      share: Schema.Finite,
    }),
  ),
  /** How far a garment reaches out to a hand held out or raised, joined to it, in hand diameters (0 where paper shows between them). */
  reach: Schema.optionalKey(Schema.Finite),
  /** Skin regions below the neck that are not round hands. */
  bare: Schema.Int,
});
type SheetView = typeof SheetView.Type;

/** Two partner views: their mean difference flipped and not, and their widths' difference in percent. */
const SheetPair = Schema.Struct({
  views: Schema.Tuple([Schema.Int, Schema.Int]),
  flipped: Schema.Finite,
  straight: Schema.Finite,
  widths: Schema.Finite,
});

/** A kept concept against its view: how many rows `compareFigures` reads, and the flagged ones. */
const SheetConceptRows = Schema.Struct({
  name: Schema.String,
  view: Schema.Int,
  rows: Schema.Int,
  flagged: Schema.Array(Schema.String),
});

/** A profile against the three-quarter on its own side: their mean difference flipped and not. */
const SheetSide = Schema.Struct({
  views: Schema.Tuple([Schema.Int, Schema.Int]),
  flipped: Schema.Finite,
  straight: Schema.Finite,
});

export const SheetMeasure = Schema.Struct({
  kind: SheetKind,
  anchor: Schema.Int,
  /** How many figures the sheet draws: more than the views when it draws more than it names. */
  found: Schema.Int,
  views: Schema.Array(SheetView),
  pairs: Schema.Array(SheetPair),
  sides: Schema.Array(SheetSide),
  /** The anchor's height in heads and the squash to the canon (percent; negative, a stretch). */
  canon: Schema.Struct({
    heads: Schema.optionalKey(Schema.Finite),
    squash: Schema.optionalKey(Schema.Finite),
  }),
  flags: Schema.Array(SheetFlag),
  unmeasured: Schema.Array(SheetUnmeasured),
  concepts: Schema.Array(SheetConceptRows),
});
export type SheetMeasure = typeof SheetMeasure.Type;

/** A sheet that cannot be read as asked: fewer figures than it names, or an anchor or slots that do not fit. */
class SheetUnread extends Schema.TaggedError<SheetUnread>()('SheetUnread', {
  reason: Schema.String,
}) {
  override get message() {
    return `the sheet does not read: ${this.reason}`;
  }
}

// ---------------------------------------------------------------------------
// One view read

/** A view as read, with what the checks need beside its record: its crop, its figure's measure, its hands and the unmeasured. */
interface ViewRead {
  readonly record: SheetView;
  readonly crop: Raster;
  readonly measure: Option.Option<FigureMeasure>;
  readonly unmeasured: ReadonlyArray<SheetUnmeasured>;
}

/** The room left round a view's crop. */
const PAD = 12;

const ratioOf = (m: FigureMeasure, ratio: FigureMeasure['ratios'][number]['ratio']) =>
  Option.map(
    Arr.findFirst(m.ratios, (r) => r.ratio === ratio),
    (r) => r.value,
  );

/** The parts of a view's head the reads below lean on, in its crop's pixels. */
interface HeadFrame {
  readonly W: number;
  /** The head's height, which turning does not change as it changes the width: what a hand and the hair's fall are shares of. */
  readonly H: number;
  readonly cx: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly chin: number;
  readonly eyeY: number;
  readonly faceX: number;
  /** The mouth's row, or a little under the eyes where no mouth reads. */
  readonly mouthY: number;
}

const headFrameOf = (m: FigureMeasure): HeadFrame => {
  const [x0, y0, x1, y1] = m.head;
  const W = x1 - x0;
  const cy = (y0 + y1) / 2;
  const eyeBelow = Option.getOrElse(ratioOf(m, 'eyeBelowCentre'), () => 0.1);
  const eyeY = cy + eyeBelow * W;
  return {
    W,
    H: y1 - y0,
    cx: (x0 + x1) / 2,
    left: x0,
    right: x1,
    top: y0,
    chin: y1,
    eyeY,
    faceX: (x0 + x1) / 2 + m.facing.turn * W,
    mouthY: Option.getOrElse(
      Option.map(ratioOf(m, 'mouthBelowCentre'), (v) => cy + v * W),
      () => eyeY + 0.22 * W,
    ),
  };
};

/** The face's skin: the median of the light fills on the band under the eyes. */
const skinOf = (crop: Raster, inside: Uint8Array, f: HeadFrame): Option.Option<Rgb> => {
  const at: Array<number> = [];
  for (let y = Math.round(f.eyeY); y < f.eyeY + 0.12 * f.W; y++)
    for (let x = Math.round(f.faceX - 0.3 * f.W); x < f.faceX + 0.3 * f.W; x++) {
      const i = y * crop.width + x;
      if (
        x >= 0 &&
        x < crop.width &&
        y >= 0 &&
        y < crop.height &&
        inside[i] === 1 &&
        lumaOf(rgbAt(crop, i)) >= DARK_LUMA
      )
        at.push(i);
    }
  if (at.length < 30) return Option.none();
  const ch = [0, 1, 2].map((k) => {
    const v = at.map((i) => crop.rgba[i * 4 + k] ?? 0).sort((a, b) => a - b);
    return v[Math.floor(v.length / 2)] ?? 0;
  });
  return Option.some([ch[0] ?? 0, ch[1] ?? 0, ch[2] ?? 0]);
};

const hueOf = (lab: Rgb) => (Math.atan2(lab[2], lab[1]) * 180) / Math.PI;

/** Whether a colour is the face's skin `skin` (in Lab), lit or shaded. */
const skinTest = (skin: Rgb) => {
  const hue = hueOf(skin);
  return (c: Rgb) => {
    const lab = labOf(c);
    return deltaE(lab, skin) < SKIN_DE && hueOf(lab) - hue <= SKIN_YELLOWER;
  };
};

/** How near a colour lies to the line from `a` to `b` in RGB: a soft edge between two fills lies on it. */
const offLine = (c: Rgb, a: Rgb, b: Rgb) => {
  const [dr, dg, db] = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const t = Math.max(
    0,
    Math.min(
      1,
      ((c[0] - a[0]) * dr + (c[1] - a[1]) * dg + (c[2] - a[2]) * db) /
        (dr ** 2 + dg ** 2 + db ** 2 || 1),
    ),
  );
  return Math.hypot(c[0] - a[0] - t * dr, c[1] - a[1] - t * dg, c[2] - a[2] - t * db);
};

/** A soft edge between the skin and the ink, or the skin and its light inner edge, lies within this of the line between them (RGB). */
const SOFT_EDGE = 24;
/** The light the house's thin inner edge turns a paper toward. */
const LIGHT_EDGE: Rgb = [255, 248, 230];

/** A skin region below the neck: a round hand (with the share of its ring that is a garment's fill), or bare skin (an arm, a shoulder). */
type SkinPart =
  | { readonly kind: 'hand'; readonly region: Region; readonly cloth: number }
  | { readonly kind: 'bare'; readonly region: Region };

/**
 * The skin's regions, by colour: the fills inside the figure within
 * `SKIN_PAPER` of the face's lit skin, joined where they touch. The house
 * look draws no ink inside the silhouette, so a bare arm meets the robe and
 * a face its headcloth with no line between them; read by what the ink
 * closes, each pair would be one region.
 */
const skinRegionsOf = (crop: Raster, inside: Uint8Array, skin: Rgb): ReadonlyArray<Region> => {
  const lab = labOf(skin);
  const mask = Uint8Array.from(inside, (v, i) =>
    Number(v === 1 && deltaE(labOf(rgbAt(crop, i)), lab) < SKIN_PAPER),
  );
  return regionsOf(crop, mask, 30);
};

/** The neck is no wider than this share of the head's width; bare skin from shoulder to shoulder is wider. */
const NECK_WIDTH = 0.6;
/** A hand's box, wide over tall, and how much of the box's ellipse it fills: a disc fills 1, a square 1.27. */
const HAND_ASPECT: readonly [number, number] = [0.75, 1.33];
const HAND_FILL: readonly [number, number] = [0.8, 1.1];
/** A hand's longest side against the hand the figure's measure reads (its ink in): a hand held, clipped or round, is no smaller and no bigger. */
const HAND_SIZE: readonly [number, number] = [0.4, 1.3];
/** A hand clipped behind the body meets the body's ink; bare skin on the robe meets its fill on more than this share of its ring. */
const CLIPPED_CLOTH = 0.35;

const within = (v: number, [lo, hi]: readonly [number, number]) => v >= lo && v <= hi;

/** Whether a region's box holds the eyes' middle. */
const holdsEyes = (region: Region, f: HeadFrame) => {
  const [x0, y0, x1, y1] = region.box;
  return x0 <= f.faceX && x1 >= f.faceX && y0 <= f.eyeY && y1 >= f.eyeY;
};

/**
 * The face or a part of it (an ear, a lit cheek): a region that holds the
 * eyes, or whose middle lies on the head: its box a tenth of its width
 * wider each side, down to a third of a head under the mouth, since the
 * measure's head can end where a beard starts.
 */
const facePart = (region: Region, f: HeadFrame) => {
  const [x0, y0, x1, y1] = region.box;
  const [mx, my] = [(x0 + x1) / 2, (y0 + y1) / 2];
  const onHead =
    mx >= f.left - 0.1 * f.W &&
    mx <= f.right + 0.1 * f.W &&
    my >= f.top &&
    my <= Math.max(f.chin, f.mouthY + 0.3 * f.W);
  return holdsEyes(region, f) || onHead;
};

/** What a view's skin parts are read against: its soles and height, the hand the measure reads, whether its sheet draws hands, and how much of a region's ring is a garment's fill. */
interface SkinFrame {
  readonly sole: number;
  readonly height: number;
  readonly hand: Option.Option<number>;
  readonly hands: boolean;
  readonly cloth: (region: Region) => number;
}

/**
 * The skin regions below the neck, at any height, each a hand or bare skin.
 * The face is the region that holds the eyes (and its parts in the head's
 * box), the neck the narrow region just under the chin, never skin above
 * the chin as such, so a raised hand is read where it is. A hand is round
 * (a disc's box and fill) and a hand's size, or clipped behind the body
 * (a hand's size, its cut edge on the body's ink, not its fill); any other
 * region big enough is bare skin, and on a heads sheet, which draws no
 * hands, every one is.
 */
const skinPartsOf = (
  regions: ReadonlyArray<Region>,
  f: HeadFrame,
  frame: SkinFrame,
): ReadonlyArray<SkinPart> =>
  regions.flatMap((region): ReadonlyArray<SkinPart> => {
    const [x0, y0, x1, y1] = region.box;
    const [bw, bh] = [x1 - x0, y1 - y0];
    // The neck and a V at the robe's throat start under the chin, or under a beard that hangs below it.
    const neck =
      y0 <= f.chin + 0.5 * f.W &&
      Math.abs((x0 + x1) / 2 - f.cx) < 0.35 * f.W &&
      bw <= NECK_WIDTH * f.W;
    const feet = y1 >= frame.sole - 0.06 * frame.height;
    if (facePart(region, f) || neck || feet) return [];
    const bare: ReadonlyArray<SkinPart> =
      (region.area >= 0.02 * f.W * f.W && [{ kind: 'bare', region }]) || [];
    if (!frame.hands) return bare;
    const sized = Option.match(frame.hand, {
      onNone: () => true,
      onSome: (d) => within(Math.max(bw, bh) / d, HAND_SIZE),
    });
    const round =
      within(bw / bh, HAND_ASPECT) &&
      within(region.area / ((Math.PI * bw * bh) / 4), HAND_FILL) &&
      sized;
    const cloth = frame.cloth(region);
    const clipped = Option.isSome(frame.hand) && sized && cloth < CLIPPED_CLOTH;
    return ((round || clipped) && [{ kind: 'hand', region, cloth }]) || bare;
  });

/**
 * A beard: the first dark fill under the mouth before the head's outline
 * (a dark robe under the chin lies past that line), and whether it runs up
 * past the eyes into the hair. The measure's head may end where a beard
 * starts, so the walk runs on to a third of a head under its chin.
 */
const beardOf = (
  labels: Int32Array,
  ink: Uint8Array,
  width: number,
  f: HeadFrame,
  fills: ReadonlyArray<{ readonly id: number; readonly box: Box }>,
): Option.Option<{ readonly id: number; readonly merged: boolean }> =>
  Option.flatMap(
    Option.liftPredicate(
      firstLabelInside(
        labels,
        ink,
        width,
        { from: f.mouthY + 0.04 * f.W, to: f.chin + 0.35 * f.W, cx: f.faceX, half: 0.15 * f.W },
        (id) => fills.some((c) => c.id === id),
      ),
      (b) => b >= 0,
    ),
    (id) =>
      Option.map(
        Arr.findFirst(fills, (c) => c.id === id),
        (c) => ({ id, merged: c.box[1] < f.eyeY - 0.05 * f.W }),
      ),
  );

/**
 * The dark fills of the head (hair, a beard) apart from the ink, each joined
 * where it touches: the crown, the beard under the mouth and whether it runs
 * into any lock of the hair, and the lowest the hair falls. A fill is the
 * head's when it reaches into the oval well inside the head's box (`HEAD_CORE`
 * of its half width and height), so a dark robe showing beside the jaw is
 * never a beard or a lock, even with a line drawn across the hair; a fill smaller than a
 * hundredth of the head's width squared is the soft edge between the ink and
 * the paper, never hair. The hair's fall is the lowest of the head's fills,
 * the beard left out, so a lock split from the crown by a lighter streak
 * still counts.
 */
const hairOf = (
  crop: Raster,
  m: FigureMeasure,
  f: HeadFrame,
): Option.Option<{
  readonly crown: number;
  readonly beard: Option.Option<{ readonly id: number; readonly merged: boolean }>;
  readonly lowest: number;
}> => {
  const dark = new Uint8Array(crop.width * crop.height);
  const inkLike = new Uint8Array(crop.width * crop.height);
  const ink: Rgb = [m.ink[0], m.ink[1], m.ink[2]];
  for (let i = 0; i < dark.length; i++) {
    const c = rgbAt(crop, i);
    const near = Math.hypot(c[0] - ink[0], c[1] - ink[1], c[2] - ink[2]) < PARTING_INK;
    if (lumaOf(c) < DARK_LUMA) {
      dark[i] = Number(!near);
      inkLike[i] = Number(near);
    }
  }
  const { components, labels } = componentsOf(dark, crop.width, crop.height, false);
  const inHead = new Set<number>();
  const [cy, rx, ry] = [(f.top + f.chin) / 2, (HEAD_CORE * f.W) / 2, (HEAD_CORE * f.H) / 2];
  for (let i = 0; i < labels.length; i++) {
    const [x, y] = [i % crop.width, Math.floor(i / crop.width)];
    const id = labels[i] ?? -1;
    if (id >= 0 && ((x - f.cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) inHead.add(id);
  }
  const big = components.filter((c) => c.area >= 0.01 * f.W * f.W);
  const fills = big.filter((c) => inHead.has(c.id));
  const head = new Set(fills.map((c) => c.id));
  const admit = (id: number) => head.has(id);
  const crown = firstLabelIn(
    labels,
    crop.width,
    { from: Math.max(0, f.top), to: f.eyeY - 0.2 * f.W, cx: f.cx, half: 0.25 * f.W },
    admit,
  );
  if (crown < 0) return Option.none();
  const beard = beardOf(labels, inkLike, crop.width, f, big);
  const onHead = fills.filter((c) => !Option.exists(beard, (b) => b.id === c.id && b.id !== crown));
  return Option.some({ crown, beard, lowest: Math.max(f.top, ...onHead.map((c) => c.box[3])) });
};

/** A body row: its left and right edge. */
interface SideRow {
  readonly y: number;
  readonly left: number;
  readonly right: number;
}

/** A hand's disc: its middle, its radius, and the radius its ink and soft edge take it to. */
interface HandDisc {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly clear: number;
}

/**
 * Each hand's disc. A hand read on its lit paper alone leaves its shaded
 * crescent out, so its radius is the larger of its region's and the one the
 * figure's measure reads (`hand`, its ink in) inside the ink; it is cleared
 * with its ink and a soft edge.
 */
const discsOf = (
  hands: ReadonlyArray<Region>,
  line: number,
  hand: Option.Option<number>,
): ReadonlyArray<HandDisc> =>
  hands.map((h) => {
    const [x0, y0, x1, y1] = h.box;
    const r = Math.max(
      Math.max(x1 - x0, y1 - y0) / 2,
      Option.getOrElse(
        Option.map(hand, (d) => d / 2 - line),
        () => 0,
      ),
    );
    return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, r, clear: r + 1.5 * line };
  });

/** A view's body rows: each row's left and right edge of what the ink closes, its hands' discs cleared. */
const sideRowsOf = (
  crop: Raster,
  closed: Uint8Array,
  discs: ReadonlyArray<HandDisc>,
  rows: { readonly from: number; readonly to: number },
): ReadonlyArray<SideRow> => {
  const out: Array<SideRow> = [];
  for (let y = Math.max(0, Math.round(rows.from)); y < rows.to && y < crop.height; y++) {
    let [left, right] = [crop.width, -1];
    for (let x = 0; x < crop.width; x++)
      if (
        closed[y * crop.width + x] === 1 &&
        !discs.some((d) => Math.hypot(x - d.x, y - d.y) <= d.clear)
      ) {
        left = Math.min(left, x);
        right = Math.max(right, x);
      }
    if (right >= left) out.push({ y, left, right });
  }
  return out;
};

/** The side of a row toward `toward` (+1 the right). */
const sideOf = (row: SideRow, toward: number) => (toward > 0 && row.right) || row.left;

/** What a reach is read from: the body as the ink closes it with the hands cut out, labelled, its body rows, the hands, its middle and the head. */
interface ReachFrame {
  readonly labels: Int32Array;
  readonly body: number;
  readonly width: number;
  readonly rows: ReadonlyArray<SideRow>;
  readonly discs: ReadonlyArray<HandDisc>;
  readonly middle: number;
  readonly line: number;
  readonly head: HeadFrame;
}

/** One hand's reach: read (its gap in hand diameters, 0 when free), or not read and why. */
type HandReach =
  | { readonly read: true; readonly reach: number }
  | { readonly read: false; readonly why: string };

/** Whether something joins a hand to the body: it crosses the circle just round the hand along more than a touch. */
const linked = (frame: ReachFrame, d: HandDisc) =>
  arcOf(frame.labels, frame.width, { x: d.x, y: d.y, radius: d.clear + 1 }, frame.body) >=
  LINK * d.r;

/**
 * How far a garment or an arm reaches to one hand, in hand diameters. The
 * house hand floats free, a hand's width out, with paper between it and the
 * body. A hand whose middle lies more than its radius past the body's side
 * just under it is held out; a hand above the shoulders is raised, held out
 * from the head's side. Either is reached when, its disc cut out, the
 * body still crosses the circle round it: a sleeve or an arm from any angle,
 * met as flat colour or across the hand's own ring; the reach is the gap it
 * closes. A hand at rest against the body, or in front of the head, cannot
 * tell a sleeve from a touch, and is said.
 */
const handReachOf = (frame: ReachFrame, d: HandDisc): HandReach => {
  const toward = Math.sign(d.x - frame.middle) || 1;
  const under = frame.rows
    .filter((row) => row.y > d.y + d.r + 2 * frame.line && row.y <= d.y + 3 * d.r)
    .map((row) => sideOf(row, toward));
  const raised = d.y + d.r < frame.head.chin + 0.25 * frame.head.W;
  if (!raised && under.length < 3)
    return { read: false, why: "the body's side under a hand does not read" };
  const side =
    (raised && frame.head.cx + toward * (frame.head.W / 2)) ||
    (under.sort((a, b) => a - b)[Math.floor(under.length / 2)] ?? d.x);
  const out = toward * (d.x - side);
  const gap = out - d.r - frame.line;
  const joined = linked(frame, d);
  if (out <= d.r || gap <= 0)
    return (
      (joined && {
        read: false,
        why:
          (raised && 'a hand in front of the head: a sleeve to it is not told from a touch') ||
          'a hand at rest against the body: a sleeve to it is not told from a touch',
      }) || { read: true, reach: 0 }
    );
  return { read: true, reach: (joined && gap / (2 * d.r)) || 0 };
};

/** A garment's rows: its fills (not skin, not hair) from 0.55 to 0.85 of the figure down. */
const garmentRowsOf = (
  crop: Raster,
  inside: Uint8Array,
  span: { readonly top: number; readonly height: number },
  skin: Option.Option<Rgb>,
): ReadonlyArray<ReadonlyArray<number>> => {
  const isSkin = Option.map(skin, (s) => skinTest(labOf(s)));
  const rows: Array<Array<number>> = [];
  for (
    let y = Math.round(span.top + 0.55 * span.height);
    y < span.top + 0.85 * span.height && y < crop.height;
    y++
  ) {
    const row: Array<number> = [];
    for (let x = 0; x < crop.width; x++) {
      const i = y * crop.width + x;
      const c = rgbAt(crop, i);
      if (
        inside[i] === 1 &&
        !Option.exists(isSkin, (test) => test(c)) &&
        lumaOf(c) >= DARK_LUMA * 0.6
      )
        row.push(i);
    }
    rows.push(row);
  }
  return rows;
};

const litOf = (votes: { readonly left: number; readonly right: number }): LitSide => {
  if (votes.left >= 3 && votes.left > 1.5 * votes.right) return 'left';
  if (votes.right >= 3 && votes.right > 1.5 * votes.left) return 'right';
  return 'even';
};

/** A view's crop as the ink closes it: inside the figure (not outside, not ink), and closed (not outside). */
interface Closed {
  readonly inside: Uint8Array;
  readonly closed: Uint8Array;
}

const closedOf = (crop: Raster): Closed => {
  const lumaInk = inkByLuma(crop);
  const outside = outsideOf(crop, lumaInk);
  return {
    inside: Uint8Array.from(outside, (o, i) => Number(o === 0 && lumaInk[i] === 0)),
    closed: Uint8Array.from(outside, (o) => Number(o === 0)),
  };
};

/** A view's reach: each hand's, cut out of the body as the ink closes it, read where it can be and said where it cannot. */
const reachesOf = (
  crop: Raster,
  closed: Uint8Array,
  frame: Omit<ReachFrame, 'labels' | 'body' | 'width'>,
) => {
  const cut = Uint8Array.from(closed, (v, i) => {
    const [x, y] = [i % crop.width, Math.floor(i / crop.width)];
    return Number(v === 1 && !frame.discs.some((d) => Math.hypot(x - d.x, y - d.y) <= d.clear));
  });
  const { components, labels } = componentsOf(cut, crop.width, crop.height, false);
  const body = [...components].sort((a, b) => b.area - a.area)[0]?.id ?? -1;
  const full = { ...frame, labels, body, width: crop.width };
  return frame.discs.map((d) => handReachOf(full, d));
};

/** The parts of a view read off its figure's measure: its head, hands, hair, skin, reaches and what it cannot read. */
const readMeasured = (
  crop: Raster,
  m: FigureMeasure,
  { inside, closed }: Closed,
  ctx: {
    readonly view: number;
    readonly kind: SheetKind;
    readonly headgear: boolean;
    readonly top: number;
    readonly height: number;
    readonly middle: number;
  },
) => {
  const f = headFrameOf(m);
  const skin = skinOf(crop, inside, f);
  const line = Option.getOrElse(ratioOf(m, 'outline'), () => 0.05) * f.W;
  const hands = ctx.kind !== 'heads';
  const regions = Option.match(skin, {
    onNone: () => [],
    onSome: (s) => skinRegionsOf(crop, inside, s),
  });
  const sole = ctx.top + ctx.height;
  const ink: Rgb = [m.ink[0], m.ink[1], m.ink[2]];
  const handSize = Option.map(ratioOf(m, 'hand'), (d) => d * f.W);
  const parts = Option.match(skin, {
    onNone: () => [],
    onSome: (s) => {
      const near = skinTest(labOf(s));
      const cloth = (i: number) => {
        const c = rgbAt(crop, i);
        return (
          inside[i] === 1 &&
          !near(c) &&
          offLine(c, s, ink) > SOFT_EDGE &&
          offLine(c, s, LIGHT_EDGE) > SOFT_EDGE
        );
      };
      return skinPartsOf(regions, f, {
        sole,
        height: ctx.height,
        hand: handSize,
        hands,
        cloth: (region) =>
          ringShareOf(crop, region, { near: 2, depth: Math.max(3, Math.round(0.8 * line)) }, cloth),
      });
    },
  });
  const handParts = parts.flatMap((p) => (p.kind === 'hand' && [p]) || []);
  const unmeasured: Array<SheetUnmeasured> = [];
  if (Option.isNone(skin))
    unmeasured.push(
      ...(['sleeveReach', 'bareArm'] as const).map((check) => ({
        check,
        view: ctx.view,
        why: 'no skin reads under the eyes',
      })),
    );
  // The face opening under a headcloth: the skin's own paper round the eyes, inside the head's box (a tan tunic joins no face).
  const faceOpening = Arr.findFirst(
    regions,
    (r) =>
      r.box[0] <= f.faceX &&
      r.box[2] > f.faceX &&
      r.box[1] <= f.eyeY &&
      r.box[3] > f.eyeY &&
      r.box[3] <= m.head[3] + 0.1 * f.H,
  );
  const head =
    (ctx.headgear && Option.map(faceOpening, (r) => r.box[3] - r.box[1])) ||
    Option.some(m.head[3] - m.head[1]);
  // Under a headcloth no hair shows: the dark the beard meets is the cloth's.
  const hair = Option.filter(hairOf(crop, m, f), () => !ctx.headgear);
  if (ctx.headgear)
    unmeasured.push({
      check: 'hairBeard',
      view: ctx.view,
      why: 'headgear: the cloth hides the hair, so no parting is read',
    });
  if (Option.isNone(hair) && !ctx.headgear)
    unmeasured.push({ check: 'hairBeard', view: ctx.view, why: 'no dark hair reads at the crown' });
  if (Option.exists(hair, (h) => Option.isNone(h.beard)))
    unmeasured.push({ check: 'hairBeard', view: ctx.view, why: 'no beard reads under the mouth' });
  // The side's rows start under the hair, which falls over the shoulders outside the garment's line.
  const fallen = Option.getOrElse(
    Option.map(hair, (h) => h.lowest + line),
    () => f.chin,
  );
  const discs = discsOf(
    handParts.map((p) => p.region),
    line,
    handSize,
  );
  const rows = sideRowsOf(crop, closed, discs, {
    from: Math.max(f.chin + 0.05 * ctx.height, fallen),
    to: sole - 0.08 * ctx.height,
  });
  const reaches =
    (hands && reachesOf(crop, closed, { rows, discs, middle: ctx.middle, line, head: f })) || [];
  const read = reaches.flatMap((r) => (r.read && [r.reach]) || []);
  const whys = [...new Set(reaches.flatMap((r) => (!r.read && [r.why]) || []))];
  unmeasured.push(
    ...whys.map((why) => ({ check: 'sleeveReach' as const, view: ctx.view, why })),
    ...((hands &&
      Option.isSome(skin) &&
      handParts.length === 0 && [
        {
          check: 'sleeveReach' as const,
          view: ctx.view,
          why: 'no round hand reads, so no sleeve is read to one',
        },
      ]) ||
      []),
  );
  return {
    f,
    skin,
    parts,
    head,
    hair,
    discs,
    reach: Option.liftPredicate(Math.max(0, ...read), () => read.length > 0),
    unmeasured,
  };
};

/** What a view whose face does not read (a back, a bowed head) cannot be checked for. */
const FACELESS: ReadonlyArray<SheetCheck> = ['facing', 'hairBeard', 'sleeveReach', 'bareArm'];

/** The body's width as a share of the figure's height: the median of the rows from `BODY_BAND` of it down, under the hands, its hands cleared, so hands that touch the robe never widen it. */
const BODY_BAND: readonly [number, number] = [0.76, 0.9];

const bodyWidthOf = (
  crop: Raster,
  closed: Uint8Array,
  discs: ReadonlyArray<HandDisc>,
  span: { readonly top: number; readonly height: number },
) => {
  const widths = sideRowsOf(crop, closed, discs, {
    from: span.top + BODY_BAND[0] * span.height,
    to: span.top + BODY_BAND[1] * span.height,
  })
    .map((row) => row.right - row.left + 1)
    .sort((a, b) => a - b);
  return (widths[Math.floor(widths.length / 2)] ?? 0) / span.height;
};

const readView = (
  sheet: Raster,
  figure: SheetFigure,
  view: number,
  slot: Slot,
  options: SheetOptions,
): ViewRead => {
  const [x0, y0, x1, y1] = figure.box;
  const [ox, oy] = [Math.max(0, x0 - PAD), Math.max(0, y0 - PAD)];
  const crop = cropRaster(sheet, [x0 - PAD, y0 - PAD, x1 + PAD, y1 + PAD]);
  const height = y1 - y0;
  const measure = Result.getSuccess(measureFigure(crop));
  const span = { top: y0 - oy, height };
  const middle = (figure.body[0] + figure.body[2]) / 2 - ox;
  const closed = closedOf(crop);
  const read = Option.map(measure, (m) =>
    readMeasured(crop, m, closed, {
      view,
      kind: options.kind,
      headgear: options.headgear === true,
      top: span.top,
      height,
      middle,
    }),
  );
  const skin = Option.flatMap(read, (r) => r.skin);
  const garment = garmentRowsOf(crop, closed.inside, span, skin);
  const papers = (options.kind !== 'heads' && papersOf(crop, garment.flat())) || [];
  const lit: LitSide = (options.kind !== 'heads' && litOf(litSideOf(crop, garment))) || 'even';
  const discs = Option.match(read, { onNone: () => [], onSome: (r) => r.discs });
  const record: SheetView = {
    view,
    slot,
    box: figure.box,
    height,
    widthToHeight: bodyWidthOf(crop, closed.closed, discs, span),
    lit,
    papers: papers.map((p) => ({ rgb: p.rgb, share: p.share })),
    bare: Option.match(read, {
      onNone: () => 0,
      onSome: (r) => r.parts.filter((p) => p.kind === 'bare').length,
    }),
    ...Option.match(Option.all([read, measure]), {
      onNone: () => ({}),
      onSome: ([r, m]) => measuredFields(r, height, m, options),
    }),
    ...Option.match(measure, { onNone: () => ({}), onSome: (m) => facingFields(m) }),
  };
  const unmeasured = Option.match(read, {
    onNone: () =>
      FACELESS.map((check) => ({
        check,
        view,
        why: 'no face reads (no pair of eyes), so no head, skin or hair to read from',
      })),
    onSome: (r) => r.unmeasured,
  });
  return { record, crop, measure, unmeasured };
};

const facingFields = (m: FigureMeasure) => ({ turn: m.facing.turn, roll: m.facing.roll });

/** A beard and the hair: one fill, or parted by a line. */
const partingOf = (merged: boolean): 'parted' | 'merged' => (merged && 'merged') || 'parted';

/**
 * The fields read off a view's measure. The hand and the hair's fall are
 * shares of the head's height (under headgear, the face opening's), which a
 * turn changes less than the width; under headgear the hair is not read. A
 * heads sheet draws no hands, so it reads none.
 */
const measuredFields = (
  r: ReturnType<typeof readMeasured>,
  height: number,
  m: FigureMeasure,
  options: SheetOptions,
) => {
  const head = Option.match(r.head, {
    onNone: () => ({}),
    onSome: (h) => ({ head: h, headWidth: r.f.W, headsTall: height / h }),
  });
  const hand = Option.match(
    Option.filter(Option.all([ratioOf(m, 'hand'), r.head]), () => options.kind !== 'heads'),
    {
      onNone: () => ({}),
      onSome: ([d, h]) => ({ hand: (d * r.f.W) / h }),
    },
  );
  const hair = Option.match(r.hair, {
    onNone: () => ({}),
    onSome: (h) => {
      const merged = Option.exists(h.beard, (b) => b.merged || b.id === h.crown);
      const beard = Option.match(h.beard, {
        onNone: () => ({}),
        onSome: () => ({ hairBeard: partingOf(merged) }),
      });
      const fall = ((merged || options.headgear === true) && {}) || {
        hairFall: (h.lowest - r.f.chin) / r.f.H,
      };
      return { ...beard, ...fall };
    },
  });
  const reach = Option.match(r.reach, { onNone: () => ({}), onSome: (v) => ({ reach: v }) });
  return { ...head, ...hand, ...hair, ...reach };
};

// ---------------------------------------------------------------------------
// The checks

const pct = (a: number, b: number) => (100 * (a - b)) / b;

const flag = (
  check: SheetCheck,
  views: ReadonlyArray<number>,
  value: number,
  limit: number,
  note: string,
): SheetFlag => ({
  check,
  views: [...views],
  value,
  limit,
  note,
});

/** Each view's turn against its slot: a front within ±0.06, a side past 0.04 its own way, no face on a back. */
const facingFlags = (views: ReadonlyArray<SheetView>): ReadonlyArray<SheetFlag> =>
  views.flatMap((v) =>
    Option.match(Option.fromUndefinedOr(v.turn), {
      onNone: () => [],
      onSome: (turn): ReadonlyArray<SheetFlag> => {
        if (v.slot === 'back')
          return [flag('facing', [v.view], turn, 0, 'a face reads on the back view')];
        if (v.slot === 'free') return [];
        if (v.slot === 'front')
          return (
            (Math.abs(turn) > FRONT_TURN && [
              flag(
                'facing',
                [v.view],
                turn,
                FRONT_TURN,
                'the front view turns to a side: a redraw',
              ),
            ]) ||
            []
          );
        const right = v.slot === 'right';
        const ok = (right && turn > SIDE_TURN) || (!right && turn < -SIDE_TURN);
        return (
          (!ok && [
            flag(
              'facing',
              [v.view],
              turn,
              SIDE_TURN,
              `the view's slot faces the viewer's ${v.slot}, its head does not: a redraw, never a rename`,
            ),
          ]) ||
          []
        );
      },
    }),
  );

const rollFlags = (views: ReadonlyArray<SheetView>, kind: SheetKind): ReadonlyArray<SheetFlag> =>
  views.flatMap((v) =>
    Option.match(
      Option.filter(
        Option.fromUndefinedOr(v.roll),
        (roll) => kind === 'turnaround' && Math.abs(roll) > ROLL_MAX,
      ),
      {
        onNone: () => [],
        onSome: (roll) => [
          flag('roll', [v.view], roll, ROLL_MAX, 'a turnaround head tipped: a redraw'),
        ],
      },
    ),
  );

/** The anchor's height in heads, and the squash a trace to the canon applies with the head held. */
const canonOf = (
  anchor: SheetView,
  headgear: boolean,
): { readonly heads?: number; readonly squash?: number } =>
  Option.match(
    Option.filter(Option.fromUndefinedOr(anchor.headsTall), () => !headgear),
    {
      onNone: () => ({}),
      onSome: (heads) => ({ heads, squash: 100 * (1 - (CANON_HEADS - 1) / (heads - 1)) }),
    },
  );

const squashFlags = (
  canon: { readonly squash?: number },
  anchor: number,
): ReadonlyArray<SheetFlag> =>
  Option.match(
    Option.filter(Option.fromUndefinedOr(canon.squash), (squash) => Math.abs(squash) > SQUASH_MAX),
    {
      onNone: () => [],
      onSome: (squash) => {
        const what = (squash > 0 && 'squash') || 'stretch';
        return [
          flag(
            'squash',
            [anchor],
            squash,
            SQUASH_MAX,
            `a trace to the canon (${CANON_HEADS} heads) would ${what} the body ${Math.abs(squash).toFixed(0)} %: a redraw`,
          ),
        ];
      },
    },
  );

/** A number each view and the anchor both read, held within a limit. */
const heldTo = (
  views: ReadonlyArray<SheetView>,
  anchor: SheetView,
  check: SheetCheck,
  read: (v: SheetView) => Option.Option<number>,
  within: (
    value: number,
    against: number,
  ) => Option.Option<{ readonly value: number; readonly limit: number; readonly note: string }>,
): ReadonlyArray<SheetFlag> =>
  views.flatMap((v) => {
    const off = Option.flatMap(Option.all([read(v), read(anchor)]), ([value, against]) =>
      Option.filter(within(value, against), () => v.view !== anchor.view),
    );
    return Option.match(off, {
      onNone: () => [],
      onSome: (d) => [flag(check, [v.view, anchor.view], d.value, d.limit, d.note)],
    });
  });

const percentOff =
  (what: string, whose = "the anchor's") =>
  (value: number, against: number) => {
    const d = pct(value, against);
    return Option.liftPredicate(
      { value: d, limit: TOLERANCE, note: `${what} ${d.toFixed(1)} % off ${whose}` },
      () => Math.abs(d) > TOLERANCE,
    );
  };

/**
 * The heads on a heads sheet: a turn changes a head's width and a nod its
 * height, so the height is held on the level heads alone, and the width
 * among the heads of one turn, each to that turn's first level head (the
 * anchor on its own turn). A bowed or lifted head is held to its own turn,
 * never read as drift for its nod.
 */
const headsFlags = (
  views: ReadonlyArray<SheetView>,
  anchor: SheetView,
  level: ReadonlyArray<number>,
): ReadonlyArray<SheetFlag> => [
  ...heldTo(
    views.filter((v) => level.includes(v.view)),
    anchor,
    'head',
    (v) => Option.filter(Option.fromUndefinedOr(v.head), () => level.includes(anchor.view)),
    percentOff('the head'),
  ),
  ...[...new Set(views.map((v) => v.slot))].flatMap((slot) => {
    const turn = views.filter((v) => v.slot === slot);
    const first = Option.orElse(
      Option.liftPredicate(anchor, (a) => a.slot === slot),
      () =>
        Option.orElse(
          Arr.findFirst(turn, (v) => level.includes(v.view)),
          () => Arr.head(turn),
        ),
    );
    return Option.match(first, {
      onNone: () => [],
      onSome: (to) =>
        heldTo(
          turn,
          to,
          'head',
          (v) => Option.fromUndefinedOr(v.headWidth),
          percentOff(
            "the head's width",
            (to.view === anchor.view && "the anchor's") || `view ${to.view}'s, its turn's first`,
          ),
        ),
    });
  }),
];

/**
 * Each view held to the anchor: the height on standing views, the head (on
 * a heads sheet, as `headsFlags` holds it), the hand, the hair's fall on
 * level heads, and the soles.
 */
const anchorFlags = (
  views: ReadonlyArray<SheetView>,
  anchor: SheetView,
  held: {
    readonly standing: ReadonlyArray<number>;
    readonly level: ReadonlyArray<number>;
    readonly heads: boolean;
  },
): ReadonlyArray<SheetFlag> => [
  ...heldTo(
    views,
    anchor,
    'height',
    (v) =>
      Option.liftPredicate(
        v.height,
        () => held.standing.includes(v.view) && held.standing.includes(anchor.view),
      ),
    percentOff('the height'),
  ),
  ...((held.heads && headsFlags(views, anchor, held.level)) ||
    heldTo(views, anchor, 'head', (v) => Option.fromUndefinedOr(v.head), percentOff('the head'))),
  ...heldTo(views, anchor, 'hand', (v) => Option.fromUndefinedOr(v.hand), percentOff('the hand')),
  ...heldTo(
    views,
    anchor,
    'hairFall',
    (v) =>
      Option.filter(
        Option.fromUndefinedOr(v.hairFall),
        () => held.level.includes(v.view) && held.level.includes(anchor.view),
      ),
    (value, against) =>
      Option.liftPredicate(
        {
          value: value - against,
          limit: HAIR_FALL,
          note: `the hair falls ${(value - against).toFixed(2)} head off the anchor's`,
        },
        () => Math.abs(value - against) > HAIR_FALL,
      ),
  ),
  ...views.flatMap((v) => {
    const sole = v.box[3];
    const off = Math.abs(sole - anchor.box[3]) / anchor.height;
    return (
      (off > GROUND && [
        flag(
          'ground',
          [v.view],
          100 * off,
          100 * GROUND,
          "the soles are off the sheet's ground line",
        ),
      ]) ||
      []
    );
  }),
];

/** Each view's papers against the anchor's three biggest: the farthest of them from its nearest. */
const paperFlags = (views: ReadonlyArray<SheetView>, anchor: SheetView): ReadonlyArray<SheetFlag> =>
  views.flatMap((v) => {
    const greys = v.papers.filter((p) => {
      const sv = saturationValueOf(p.rgb);
      return sv.saturation < 0.05 && sv.value < 0.75;
    });
    const grey = greys.map((p) =>
      flag(
        'grey',
        [v.view],
        100 * p.share,
        0,
        `a grey paper (${p.rgb.join(',')}): shade with a hue, never grey (CRAFT 12)`,
      ),
    );
    if (v.view === anchor.view || anchor.papers.length === 0 || v.papers.length === 0) return grey;
    const drift = Math.max(
      ...anchor.papers
        .slice(0, 3)
        .map((a) => Math.min(...v.papers.map((p) => deltaE(labOf(a.rgb), labOf(p.rgb))))),
    );
    return [
      ...grey,
      ...((drift > PAPER_DE && [
        flag(
          'papers',
          [v.view, anchor.view],
          drift,
          PAPER_DE,
          "a paper of another colour than the anchor's",
        ),
      ]) ||
        []),
    ];
  });

/** A view's sleeve: a garment that reaches out to a hand. */
const reachFlags = (v: SheetView): ReadonlyArray<SheetFlag> =>
  Option.match(
    Option.filter(Option.fromUndefinedOr(v.reach), (r) => r > REACH),
    {
      onNone: () => [],
      onSome: (r) => [
        flag(
          'sleeveReach',
          [v.view],
          r,
          REACH,
          'a sleeve reaches toward a hand: a sleeve may hang at rest, never reach',
        ),
      ],
    },
  );

const lookFlags = (views: ReadonlyArray<SheetView>): ReadonlyArray<SheetFlag> =>
  views.flatMap((v) => [
    ...((v.lit === 'right' && [
      flag(
        'lit',
        [v.view],
        1,
        0,
        'lit on its right: the key light is upper left, so a view lit right was flipped',
      ),
    ]) ||
      []),
    ...((v.bare > 0 && [
      flag(
        'bareArm',
        [v.view],
        v.bare,
        0,
        'skin below the neck that is not a round hand: never a bare arm',
      ),
    ]) ||
      []),
    ...reachFlags(v),
    ...((v.hairBeard === 'merged' && [
      flag(
        'hairBeard',
        [v.view],
        1,
        0,
        'the beard runs into the hair: part them as the kept concept does',
      ),
    ]) ||
      []),
  ]);

/** A turnaround's partners: front and back, the two three-quarters, the two profiles. */
const PARTNERS: ReadonlyArray<readonly [number, number]> = [
  [1, 4],
  [2, 6],
  [3, 5],
];

const pairsOf = (reads: ReadonlyArray<ViewRead>, kind: SheetKind) =>
  (kind === 'turnaround' &&
    PARTNERS.flatMap(([a, b]) =>
      Option.match(Option.all([Arr.get(reads, a - 1), Arr.get(reads, b - 1)]), {
        onNone: () => [],
        onSome: ([ra, rb]) => [
          {
            views: [a, b] as const,
            flipped: pairDiff(ra.crop, rb.crop, true),
            straight: pairDiff(ra.crop, rb.crop, false),
            widths: pct(ra.record.widthToHeight, rb.record.widthToHeight),
          },
        ],
      }),
    )) ||
  [];

/** A turnaround's profiles, each beside the three-quarter on its own side, whose facing the measure reads. */
const SIDES: ReadonlyArray<readonly [number, number]> = [
  [2, 3],
  [6, 5],
];

/** The top of a view a profile is held to its three-quarter on: the head and the shoulders, where the way it faces shows (the hair's mass behind, the face and beard in front); the body under them turns little between the two. */
const HEAD_BAND = 0.3;

/** A view's head band: the top `HEAD_BAND` of its figure. */
const headBandOf = (r: ViewRead) =>
  cropRaster(r.crop, [0, 0, r.crop.width, PAD + HEAD_BAND * (r.crop.height - 2 * PAD)]);

/** Each profile against its side's three-quarter, on their head bands: a profile reads no face, so it is held to the way the three-quarter faces. */
const sidesOf = (reads: ReadonlyArray<ViewRead>, kind: SheetKind) =>
  (kind === 'turnaround' &&
    SIDES.flatMap(([a, b]) =>
      Option.match(Option.all([Arr.get(reads, a - 1), Arr.get(reads, b - 1)]), {
        onNone: () => [],
        onSome: ([ra, rb]) => {
          const [ha, hb] = [headBandOf(ra), headBandOf(rb)];
          return [
            {
              views: [a, b] as const,
              flipped: pairDiff(ha, hb, true),
              straight: pairDiff(ha, hb, false),
            },
          ];
        },
      }),
    )) ||
  [];

/** A profile whose head matches its side's three-quarter's better flipped than not faces the other way (on the prototypes, a sheet drawn right reads 1.06 and up, one with a side facing two ways 0.96 and under). */
const PROFILE_WAY = 1;

/** A profile that matches its side's three-quarter better flipped than not faces the other way. */
const sideFlags = (sides: ReadonlyArray<typeof SheetSide.Type>): ReadonlyArray<SheetFlag> =>
  sides.flatMap(
    (p) =>
      (p.flipped < PROFILE_WAY * p.straight && [
        flag(
          'profileWay',
          p.views,
          p.flipped / p.straight,
          PROFILE_WAY,
          'the profile faces away from the three-quarter on its side: one of them is a redraw',
        ),
      ]) ||
      [],
  );

const pairFlags = (pairs: ReadonlyArray<typeof SheetPair.Type>): ReadonlyArray<SheetFlag> =>
  pairs.flatMap((p) => [
    ...((p.flipped < MIRROR_FLOOR && [
      flag(
        'mirror',
        p.views,
        p.flipped,
        MIRROR_FLOOR,
        'one view is the other flipped: each turn is its own drawing',
      ),
    ]) ||
      []),
    ...((p.views[0] !== 1 &&
      p.straight < SAME_WAY * p.flipped && [
        flag(
          'sameWay',
          p.views,
          p.straight / p.flipped,
          SAME_WAY,
          'the two views face one way: one of them is a redraw',
        ),
      ]) ||
      []),
    ...((Math.abs(p.widths) > TOLERANCE && [
      flag('width', p.views, p.widths, TOLERANCE, "the partners' widths differ"),
    ]) ||
      []),
  ]);

const conceptRows = (reads: ReadonlyArray<ViewRead>, concepts: ReadonlyArray<SheetConcept>) =>
  concepts.map((c) =>
    Option.match(
      Option.flatMap(Option.fromUndefinedOr(reads[c.view - 1]), (r) => r.measure),
      {
        onNone: () => ({
          name: c.name,
          view: c.view,
          rows: 0,
          flagged: ['the view does not read'],
        }),
        onSome: (m) => {
          const rows = compareFigures(c.measure, m);
          return {
            name: c.name,
            view: c.view,
            rows: rows.length,
            flagged: rows.filter((r) => r.flagged).map((r) => r.name),
          };
        },
      },
    ),
  );

/** Measure a cast sheet: its figures found, each view read, and every check run. */
export const measureSheet = (
  sheet: Raster,
  options: SheetOptions,
): Result.Result<SheetMeasure, SheetUnread> => {
  const { figures, found } = figuresOf(sheet, options.count);
  const slots =
    options.slots ??
    ((options.kind === 'turnaround' && TURNAROUND_SLOTS) || figures.map(() => 'free' as const));
  if (figures.length < options.count)
    return Result.fail(
      SheetUnread.make({
        reason: `${figures.length} figures found, the sheet names ${options.count}`,
      }),
    );
  if (slots.length !== options.count)
    return Result.fail(
      SheetUnread.make({ reason: `${slots.length} slots for ${options.count} figures` }),
    );
  if (options.anchor < 1 || options.anchor > options.count)
    return Result.fail(
      SheetUnread.make({
        reason: `the anchor ${options.anchor} is not one of the ${options.count} views`,
      }),
    );
  const reads = figures.map((f, k) => readView(sheet, f, k + 1, slots[k] ?? 'free', options));
  const views = reads.map((r) => r.record);
  return Option.match(Arr.get(views, options.anchor - 1), {
    onNone: () => Result.fail(SheetUnread.make({ reason: 'the anchor does not read' })),
    onSome: (anchor) => Result.succeed(checked(reads, views, anchor, { ...options, found })),
  });
};

const checked = (
  reads: ReadonlyArray<ViewRead>,
  views: ReadonlyArray<SheetView>,
  anchor: SheetView,
  options: SheetOptions & { readonly found: number },
): SheetMeasure => {
  const headgear = options.headgear === true;
  const heads = options.kind === 'heads';
  const canon = (heads && {}) || canonOf(anchor, headgear);
  const standing =
    options.standing ?? ((options.kind === 'turnaround' && views.map((v) => v.view)) || []);
  const pairs = pairsOf(reads, options.kind);
  const sides = sidesOf(reads, options.kind);
  const sheetUnmeasured: ReadonlyArray<SheetUnmeasured> =
    (heads && [
      { check: 'squash', view: 0, why: 'a heads sheet draws no body to hold to the canon' },
      { check: 'hand', view: 0, why: 'a heads sheet draws no hands' },
      { check: 'sleeveReach', view: 0, why: 'a heads sheet draws no hands' },
    ]) ||
    (headgear && [
      {
        check: 'squash',
        view: 0,
        why: 'headgear: the head reads the cloth, so the canon is read on the lock; the views hold to the face opening',
      },
    ]) ||
    (Option.isNone(Option.fromUndefinedOr(canon.heads)) && [
      { check: 'squash', view: 0, why: "the anchor's head does not read" },
    ]) ||
    [];
  const bodies = !heads;
  const level = options.level ?? views.map((v) => v.view);
  return {
    kind: options.kind,
    anchor: options.anchor,
    found: options.found,
    views: [...views],
    pairs,
    sides,
    canon,
    flags: [
      ...facingFlags(views),
      ...rollFlags(views, options.kind),
      ...pairFlags(pairs),
      ...sideFlags(sides),
      ...squashFlags(canon, anchor.view),
      ...anchorFlags(views, anchor, { standing, level, heads }).filter(
        (f) => bodies || (f.check !== 'ground' && f.check !== 'height'),
      ),
      ...((bodies && paperFlags(views, anchor)) || []),
      ...lookFlags(views),
    ],
    unmeasured: [...sheetUnmeasured, ...reads.flatMap((r) => r.unmeasured)],
    concepts: conceptRows(reads, options.concepts ?? []),
  };
};

// ---------------------------------------------------------------------------
// What a reader sees

/** An optional number as a table writes it: to `places`, or a dash. */
const fixed = (v: Option.Option<number>, places: number) =>
  Option.getOrElse(
    Option.map(v, (n) => n.toFixed(places)),
    () => '–',
  );
const some = Option.fromUndefinedOr;

/** The sheet's measure as Markdown: the canon, a row per view, the partners, the flags, what was not measured and the concepts. */
export const sheetTable = (name: string, m: SheetMeasure): string => {
  const canon = Option.match(some(m.canon.heads), {
    onNone: () => `Canon: not measured (view ${m.anchor} is the anchor).`,
    onSome: (heads) =>
      `Canon: the anchor (view ${m.anchor}) stands ${heads.toFixed(2)} heads against ${CANON_HEADS}; a trace with the head held scales the body by ${(100 - (m.canon.squash ?? 0)).toFixed(0)} %.`,
  });
  return [
    `### ${name}`,
    '',
    ...((m.found > m.views.length && [
      `${m.found} figures found, the sheet names ${m.views.length}: the ${m.views.length} largest are read.`,
      '',
    ]) ||
      []),
    `${m.kind}, ${m.views.length} views. ${canon} Held within ${TOLERANCE} %; papers within ΔE ${PAPER_DE}; a mirror under ${MIRROR_FLOOR}; a pair under ${SAME_WAY} of its flipped difference faces one way; a garment joined to a hand held out across more than ${REACH.toFixed(2)} of its diameter reaches.`,
    '',
    '| View | Slot | Turn | Roll | Height | Head | Heads tall | W/H | Hand | Hair fall | Hair/beard | Lit | Reach | Bare | Papers |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...m.views.map(
      (v) =>
        `| ${v.view} | ${v.slot} | ${fixed(some(v.turn), 2)} | ${fixed(some(v.roll), 0)} | ${v.height} | ${fixed(some(v.head), 0)} | ${fixed(some(v.headsTall), 2)} | ${v.widthToHeight.toFixed(3)} | ${fixed(some(v.hand), 3)} | ${fixed(some(v.hairFall), 2)} | ${v.hairBeard ?? '–'} | ${v.lit} | ${fixed(some(v.reach), 2)} | ${v.bare} | ${v.papers.map((p) => `${hexOf(p.rgb)} ${(100 * p.share).toFixed(0)}%`).join(' ')} |`,
    ),
    '',
    ...m.pairs.map(
      (p) =>
        `Pair ${p.views.join('↔')}: flipped ${p.flipped.toFixed(1)}, straight ${p.straight.toFixed(1)}, widths ${p.widths.toFixed(1)} %.`,
    ),
    ...m.sides.map(
      (p) =>
        `Side ${p.views.join('↔')}: flipped ${p.flipped.toFixed(1)}, straight ${p.straight.toFixed(1)}.`,
    ),
    '',
    ...((m.flags.length === 0 && ['No flags.']) ||
      m.flags.map(
        (f) =>
          `- **${f.check}** (view ${f.views.join(', ')}): ${f.note} (${f.value.toFixed(2)}, limit ${f.limit.toFixed(2)})`,
      )),
    '',
    ...m.unmeasured.map((u) => `- not measured: ${u.check} (view ${u.view}): ${u.why}`),
    ...m.concepts.map(
      (c) =>
        `- against ${c.name} (view ${c.view}): ${c.flagged.length} of ${c.rows} rows flagged${(c.flagged.length > 0 && `: ${c.flagged.join('; ')}`) || ''}`,
    ),
    '',
  ].join('\n');
};

const hexOf = (rgb: ReadonlyArray<number>) =>
  `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`;

/** The sheet's measure as the CLI prints it: a line for the sheet, then one per flag. */
export const sheetLines = (name: string, m: SheetMeasure): ReadonlyArray<string> => [
  `sheet ${name} kind=${m.kind} views=${m.views.length}${(m.found > m.views.length && ` found=${m.found}`) || ''} anchor=${m.anchor} flags=${m.flags.length} heads=${fixed(some(m.canon.heads), 2)} squash=${fixed(some(m.canon.squash), 0)}`,
  ...m.flags.map(
    (f) =>
      `${f.check} view=${f.views.join(',')} value=${f.value.toFixed(2)} limit=${f.limit.toFixed(2)} ${f.note}`,
  ),
];

const MAGENTA = [232, 0, 140] as const;
const BLUE = [0, 150, 200] as const;
const GREEN = [0, 170, 90] as const;

/** The sheet with each view's box (blue), the anchor's top and sole across it (magenta), and where the canon puts the top of a figure with the anchor's head (green). */
export const sheetOverlay = (sheet: Raster, m: SheetMeasure): Raster => {
  const across = (y: number): RasterPath => ({
    points: [
      [0, y],
      [sheet.width, y],
    ],
    closed: false,
  });
  const anchor = Arr.get(m.views, m.anchor - 1);
  const boxes = m.views.map((v): RasterPath => {
    const [x0, y0, x1, y1]: Box = v.box;
    return {
      points: [
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
      ],
      closed: true,
    };
  });
  const lined = Option.match(anchor, {
    onNone: () => sheet,
    onSome: (a) => strokeRaster(sheet, [across(a.box[1]), across(a.box[3])], MAGENTA, 2),
  });
  const band = Option.flatMap(anchor, (a) =>
    Option.map(Option.fromUndefinedOr(a.head), (head) => a.box[3] - CANON_HEADS * head),
  );
  const banded = Option.match(band, {
    onNone: () => lined,
    onSome: (y) => strokeRaster(lined, [across(y)], GREEN, 3),
  });
  return strokeRaster(banded, boxes, BLUE, 1);
};
