// The house look's numbers, as the generator (`rig/parts.ts`) reads them:
// K1, the owner's pick (2026-10-13,
// `.claude/skills/film/reference/character-design.md`). The key light and
// how a paper shades under it (CRAFT 12), the people's papers, the rim, the
// one light's angle, and the figure's line: the edge of a cut and its ink, from
// the RimWorld study's questions
// (`.claude/skills/film/reference/rimworld-study.md` §3), A3 in B1, and how
// thin the line draws in a close shot (`CLOSE_SHOT`, `inkAt`).

import { type Hex, type Ramp, type Shading, ramp } from '../canvas/colour.ts';
import { lerp, progress } from '../core/time.ts';

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

/** The ramp of a base under the key light: its shade, the base and its light (CRAFT 12); a paper ramped from a base is this ramp (`rampedPaper`). */
export const shaded = (base: Hex): Ramp => ramp(base, keyLight, shading);

/** The people's grey paper: what a figure is cut from when its rig names none, and a film's canvas people. */
export const peoplePaper: Hex = '#b7b2a8';

/** The parchment: the sheet a cast falls on past the figure, and a film's page. */
export const parchment: Hex = '#eeddc8';

/** The ramps of the two house papers under the key light: the people's and the parchment. */
export const ramps = {
  figure: shaded(peoplePaper),
  paper: shaded(parchment),
} as const satisfies Record<string, Ramp>;

/**
 * The rim, units at a head's scale: the light band just inside the outline
 * on the side facing the light, about 0.04 of a head's width, as the kept
 * concept `cold-34` lays it on its faces and robes (6 px wide, `#fbd0b3` on
 * `#f8b48a` skin, `#96825e` on `#817154` olive).
 */
export const RIM = 5.5;

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
  /**
   * The ink's widths written into the print, bound to no `ink` number, so
   * the shot cannot thin them (`inkAt`): for a film whose locked prints hold
   * the line as it was cut. Left out, every ink stroke of the figure and its
   * hands binds its width to its view model's `ink`.
   */
  readonly baked?: boolean;
}

/** The figures' line: K1's, A3 in B1. */
export const DIRECTION: Direction = { outline: 'both', ink: 'warm' };

/** The ink of `d`. */
export const inkOf = (d: Direction): Hex => INKS[d.ink];

/**
 * A house head's height, units: the plain lead's (`r` 72 high, twice). The
 * house cuts every rig at one scale, so a shot's scale reads as how much of
 * the frame a head fills.
 */
const HEAD = 144;

/**
 * The close shot, where the figures' line is drawn thinner (the owner's answer
 * `line`: thin, on RBF's cast): a head filling `from` of the frame's height or less keeps
 * the line as cut (the court's wide shot fills 0.15); one filling `full` or
 * more (the farmer of the rain, 0.31) draws it `ink` times as wide; between,
 * the line eases from one to the other, so a push-in thins it as it closes
 * and never pops it.
 */
const CLOSE_SHOT = { from: 0.2, full: 0.3, ink: 0.75 } as const;

/**
 * The figures' ink at a shot's scale (frame heights per unit, as the
 * engine reads the shot, `@bible/film/rive`): 1 in a wide shot,
 * `CLOSE_SHOT.ink` in a close one. A figures file's rigs follow the shot
 * with it (`RivePropSpec.ink`) unless the file bakes its ink. Pure.
 */
export const inkAt = (scale: number): number =>
  lerp(
    1,
    CLOSE_SHOT.ink,
    progress(HEAD * scale, CLOSE_SHOT.from, CLOSE_SHOT.full - CLOSE_SHOT.from),
  );
