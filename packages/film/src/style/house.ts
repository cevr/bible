// The house look's numbers, as the generator (`rig/parts.ts`) reads them:
// K1, the owner's pick (2026-10-13,
// `.claude/skills/film/reference/character-design.md`). The key light and
// how a paper shades under it (CRAFT 12), the people's papers, the one
// light's angle, and the figure's line: the edge of a cut and its ink, from
// the RimWorld study's questions
// (`.claude/skills/film/reference/rimworld-study.md` §3), A3 in B1.

import { type Hex, type Ramp, type Shading, ramp } from '../canvas/colour.ts';

/**
 * The key light, by its colour: a pale gold, the warm cream a lamp throws on
 * parchment. Every shade turns toward its complement, a cool blue (a warm
 * paper's through violet), and every light leans to it (CRAFT 12, `ramp`).
 */
export const keyLight: Hex = '#f3e9c8';

/**
 * How the house shades (`ramp`'s knobs, held above CRAFT 12's floors):
 * fitted to K1 as the least-squares nearest (CIE ΔE) to the swatches K1 was
 * drawn with, its two near-grey lights left out. The shade's knobs (`dark`,
 * `deep`, `neutral`) are fitted to K1's hand shades, so a near-neutral's
 * shade stops short of the complement as K1's did: the people's crease a
 * lavender (h 299), not a slate blue. `neutral: 1` gives a slate blue,
 * `#7e889f` at these knobs.
 */
export const shading: Shading = {
  turn: 20,
  dark: 0.22,
  lift: 0.4,
  deep: 13.5,
  neutral: 0.65,
  warm: 8.5,
  fade: 0.6,
};

/** The ramp of a base under the key light: its shade, the base and its light (CRAFT 12). */
const shaded = (base: Hex): Ramp => ramp(base, keyLight, shading);

/**
 * The papers a figure is cut from when its rig names none: the people's grey
 * paper, and the parchment sheet a cast falls on past the figure.
 */
export const ramps = {
  figure: shaded('#b7b2a8'),
  paper: shaded('#eeddc8'),
} as const satisfies Record<string, Ramp>;

/**
 * The one light, from the upper left: the direction a piece's paper darkens
 * toward (radians, y down), and how far across a piece, along it, the crease
 * falls. One angle for the whole cast, so a crease reads as light, never as
 * a drawn line.
 */
export const LIGHT = { toward: 0.42, crease: 0.63 } as const;

/**
 * The figure's edge:
 * - `line` (A0): one warm line centred on every cut edge, its weight by what
 *   it carries (`INK` in `rig/parts.ts`);
 * - `thick` (A1): RimWorld's outline, laid outside a silhouette piece (head,
 *   tunic, legs, hands, robe: an `outer` or `small` line), about 3 % of the
 *   figure's height; trim keeps its centred line;
 * - `edge` (A2): no ink, a light core on every cut edge;
 * - `both` (A3): the thick outline with the light core inside it, so the
 *   edge stays cut paper, not a sticker (the study's conflict B).
 */
type Outline = 'line' | 'thick' | 'edge' | 'both';

/** The ink of every figure line and face mark: K1's warm ink, or black, which an outline may be. */
const INKS = { warm: '#2b2622', black: '#000000' } as const satisfies Record<string, Hex>;

/** A figure's line: its edge, its ink and its weight. */
export interface Direction {
  readonly outline: Outline;
  readonly ink: keyof typeof INKS;
  /**
   * The silhouette and trim ink's weight against the study's (1, the
   * default): a film whose concept draws its people's line heavier sets it.
   */
  readonly weight?: number;
}

/** The figures' line: K1's, A3 in B1. */
export const DIRECTION: Direction = { outline: 'both', ink: 'warm' };

/** The ink of `d`. */
export const inkOf = (d: Direction): Hex => INKS[d.ink];
