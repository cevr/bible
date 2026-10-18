// A paper, as a figure's piece takes it: its lit colour, its shade past the
// crease (a hue of its own, CRAFT rule 12, never the colour dimmed), and the
// light that rims the edge facing the light; where it turns (`crease`) and
// how wide its rim is (`rim`). Each figure's papers are its own, sampled
// from its concept; the house gives what a paper is, its ramp under the key
// light, and how a piece takes it. Pure.

import { type Hex, ramp } from '../canvas/colour.ts';
import { keyLight, shading } from './house.ts';
import type { Crease, PieceLook } from './rig/parts.ts';

/**
 * A paper as a piece takes it: its colour, its crease's far side, the light
 * on its edge; where it turns (`crease`) and how wide its rim is (`rim`,
 * units at a head's scale), when the concept says.
 */
export interface Paper {
  readonly color: Hex;
  /** Its far side past the crease; none for a flat paper (an ear). */
  readonly shade?: Hex;
  readonly light: Hex;
  readonly crease?: Crease;
  readonly rim?: number;
}

/** `base`'s ramp under the house's key light, as a paper. */
export const rampedPaper = (base: Hex): Paper => {
  const r = ramp(base, keyLight, shading);
  return { color: r.base, shade: r.shade, light: r.light };
};

/** `paper` as a piece's paint (`PieceLook`): its colours, crease and rim, and `extra` over them. */
export const looked = (paper: Paper, extra: Partial<PieceLook> = {}): PieceLook => ({
  ...paper,
  ...extra,
});
