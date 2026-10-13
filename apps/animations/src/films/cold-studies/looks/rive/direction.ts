// The paper-cut figures' four open art-direction axes, from the RimWorld
// study's questions (`apps/animations/docs/rimworld-study.md` §3): a
// `Direction` picks one option on each. The rigs (`parts.ts`,
// `accused-rig.ts`, `judge-rig.ts`) are built from a direction, and
// `build.ts` writes `figures.riv` from `DIRECTION`; the papercut looks
// (`looks/papercut/`) draw the court's props from the same one. Picking
// another option is one edit to `DIRECTION` and a rebuild, and
// `direction.test.ts` builds and checks every option of every axis.
//
// PROVISIONAL (2026-10-13): `DIRECTION` is K1, the rimproto unit's
// recommendation (A3 + B1 + C2 + D2), while the owner is away. The owner
// reviews each axis's options on the rimproto sheets
// (`tmp/orchestrate/p5/rimproto/`: `A-outline.png`, `B-ink.png`,
// `C-colour.png`, `D-head.png`) and may pick others.

import { type Ramp, hues, ramps } from '../../palette.ts';
import { type Props, paperProps } from '../cutpaper/court.ts';

/**
 * A. The figure's edge:
 * - `line` (A0): one warm line centred on every cut edge, its weight by what
 *   it carries (`INK` in `parts.ts`);
 * - `thick` (A1): RimWorld's outline, laid outside a silhouette piece (head,
 *   tunic, legs, hands, robe: an `outer` or `small` line), about 3 % of the
 *   figure's height; trim keeps its centred line;
 * - `edge` (A2): no ink, a light core on every cut edge;
 * - `both` (A3): the thick outline with the light core inside it, so the
 *   edge stays cut paper, not a sticker (the study's conflict B).
 */
export type Outline = 'line' | 'thick' | 'edge' | 'both';

/** B. The ink of every figure line and face mark, and of the evidence sheets' and the gavel block's lines. */
export const INKS = { warm: ramps.ink.base, black: '#000000' } as const;

/**
 * C. Colour: `grey` (C1), the people in the court's grey paper and the
 * props in its browns; `hues` (C2), each person told by the hue of their
 * garment and the props in walnut (`hues` in the palette).
 */
export type Colour = 'grey' | 'hues';

/**
 * D. The accused's head as a share of his height, the judge's scaled with
 * it: D1 ¼, D2 as drawn (76 of 203 units, about ⅓), D3 0.45.
 */
export const HEADS = { quarter: 0.25, third: null, large: 0.45 } as const;

/** One option on each axis. */
export interface Direction {
  readonly outline: Outline;
  readonly ink: keyof typeof INKS;
  readonly colour: Colour;
  readonly head: keyof typeof HEADS;
}

/** Every option of every axis, by the study's names: what each sets. */
export const OPTIONS = {
  A0: { outline: 'line' },
  A1: { outline: 'thick' },
  A2: { outline: 'edge' },
  A3: { outline: 'both' },
  B1: { ink: 'warm' },
  B2: { ink: 'black' },
  C1: { colour: 'grey' },
  C2: { colour: 'hues' },
  D1: { head: 'quarter' },
  D2: { head: 'third' },
  D3: { head: 'large' },
} as const satisfies Record<string, Partial<Direction>>;

/** K1: A3 + B1 + C2 + D2, the rimproto unit's recommendation. */
export const K1: Direction = { outline: 'both', ink: 'warm', colour: 'hues', head: 'third' };

/** The figures' direction: what `figures.riv` is built from and the looks draw with. Provisional: K1. */
export const DIRECTION: Direction = K1;

/** The ink of `d`. */
export const inkOf = (d: Direction): string => INKS[d.ink];

/** A paper as a piece takes it, from its ramp: its colour, its crease's far side and its cut edge's light. */
export interface Paper {
  readonly color: string;
  readonly shade: string;
  readonly light: string;
}

/** A ramp as a piece's paper. */
const paperOf = (ramp: Ramp): Paper => ({ color: ramp.base, shade: ramp.shade, light: ramp.light });

/**
 * What the people wear: the accused's tunic and legs, the judge's robe.
 * Heads and hands are the people's one figure paper (`FIGURE` in `parts.ts`)
 * under either colour: a garment tells a person, not their skin.
 */
export interface Dress {
  readonly tunic: Paper;
  readonly legs: Paper;
  readonly robe: Paper;
  /** The bench's paper, under the judge's hand. */
  readonly bench: Paper;
}

/** What the people wear under `d`'s colour. */
export const dressOf = (d: Direction): Dress =>
  d.colour === 'hues'
    ? {
        tunic: paperOf(hues.tunic),
        legs: paperOf(hues.legs),
        robe: paperOf(hues.robe),
        bench: paperOf(hues.bench),
      }
    : {
        tunic: paperOf(ramps.figure),
        legs: paperOf(ramps.figureDeep),
        robe: paperOf(ramps.robe),
        bench: paperOf(ramps.paperTone),
      };

/**
 * The court's props under `d`: under `hues` in walnut, the sheets, the block
 * and the gavel lined in `d`'s ink; under `grey` the control's own props
 * (`paperProps`), lined in its own inks unless `d`'s ink is black, which
 * reaches every line it names.
 */
export const propsOf = (d: Direction): Props =>
  d.colour === 'hues'
    ? {
        bench: hues.bench.base,
        rim: hues.rim,
        panel: hues.panel,
        block: hues.block,
        sheets: hues.sheets,
        sheetInk: inkOf(d),
        blockInk: inkOf(d),
        gavelInk: inkOf(d),
      }
    : d.ink === 'black'
      ? { ...paperProps, sheetInk: INKS.black, blockInk: INKS.black, gavelInk: INKS.black }
      : paperProps;
