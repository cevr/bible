// The paper-cut figures' four open art-direction axes, from the RimWorld
// study's questions (`apps/animations/docs/rimworld-study.md` §3), one
// constant each: the rigs (`parts.ts`, `accused-rig.ts`, `judge-rig.ts`)
// read them when `build.ts` writes `figures.riv`, and the papercut looks
// (`looks/papercut/`) when they draw the court's props, so picking another
// option is one edit here and a rebuild.
//
// PROVISIONAL (2026-10-13): every axis is set to K1, the rimproto unit's
// recommendation (A3 + B1 + C2 + D2), while the owner is away. The owner
// reviews each axis's options on the rimproto sheets
// (`tmp/orchestrate/p5/rimproto/`: `A-outline.png`, `B-ink.png`,
// `C-colour.png`, `D-head.png`) and may pick others.

import { palette as court } from '../../../righteousness-by-faith/palette.ts';
import { hues, ramps } from '../../palette.ts';
import type { Props } from '../cutpaper/court.ts';

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
/** Provisional: A3. */
export const OUTLINE: Outline = 'both';

/** B. The ink of every figure line and face mark, and of the evidence sheets' and the gavel block's lines. */
export const INKS = { warm: ramps.ink.base, black: '#000000' } as const;
/** Provisional: B1, the warm ink. */
export const INK_TONE: keyof typeof INKS = 'warm';
export const ink: string = INKS[INK_TONE];

/**
 * C. Colour: `grey` (C1), the people in the court's grey paper and the
 * props in its browns; `hues` (C2), each person told by the hue of their
 * garment and the props in walnut (`hues` in the palette).
 */
export type Colour = 'grey' | 'hues';
/** Provisional: C2. */
export const COLOUR: Colour = 'hues';

/** A paper as a piece takes it: its colour and its crease's far side. */
export interface Paper {
  readonly color: string;
  readonly shade: string;
}

/** What the people wear under `COLOUR`: the accused's tunic and legs, the judge's skin (his head and hand) and robe. The accused's head and hands stay grey either way. */
export const dress: {
  readonly tunic: Paper;
  readonly legs: string;
  readonly skin: Paper;
  readonly robe: Paper;
  /** The bench's paper, under the judge's hand. */
  readonly bench: Paper;
} =
  COLOUR === 'hues'
    ? {
        tunic: { color: hues.tunic.base, shade: hues.tunic.shade },
        legs: hues.legs,
        skin: { color: hues.skin.base, shade: hues.skin.shade },
        robe: { color: hues.robe.base, shade: hues.robe.shade },
        bench: { color: hues.bench.base, shade: hues.bench.shade },
      }
    : {
        tunic: { color: ramps.figure.base, shade: ramps.figure.shade },
        legs: ramps.figure.shade,
        skin: { color: ramps.figure.base, shade: ramps.figure.shade },
        robe: { color: ramps.robe.base, shade: ramps.robe.shade },
        bench: { color: ramps.paperTone.base, shade: ramps.paperTone.shade },
      };

/** The court's props under `COLOUR`, lined in `ink` (the control's own colours under `grey`). */
export const props: Props = {
  ...(COLOUR === 'hues'
    ? {
        bench: hues.bench.base,
        rim: hues.rim,
        panel: hues.panel,
        block: hues.block,
        sheets: hues.sheets,
      }
    : {
        bench: court.paperTone,
        rim: court.inkSoft,
        panel: court.inkSoft,
        block: court.boardDeep,
        sheets: [court.paper],
      }),
  sheetInk: ink,
  blockInk: ink,
};

/**
 * D. The accused's head as a share of his height, the judge's scaled with
 * it: D1 ¼, D2 as drawn (76 of 203 units, about ⅓), D3 0.45.
 */
export const HEADS = { quarter: 0.25, third: null, large: 0.45 } as const;
/** Provisional: D2. */
export const HEAD: keyof typeof HEADS = 'third';
/** The share `HEAD` asks for; null keeps the head as drawn. */
export const headShare: number | null = HEADS[HEAD];
