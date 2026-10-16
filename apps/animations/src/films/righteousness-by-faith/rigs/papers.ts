// The papers of RBF's figures, as the kept concept (`cold-34`) and the lead's
// sheet paint them, sampled there: each a lit colour, its shade a hue of its
// own past the crease (CRAFT rule 12, never the colour dimmed), and the
// light that rims the edge facing the light. Where and how softly each
// paper turns is the concept's too (`crease`): a face turns gently and late,
// a robe sharply. The plain lead keeps the shade his sheet names
// (character-design 2.3). Pure.

import { type Hex, ramp } from '@bible/film/canvas';
import { keyLight, shading } from '../../cold-studies/palette.ts';
import type { Crease, PieceLook } from '../../cold-studies/looks/rive/parts.ts';

/**
 * A paper as a piece takes it: its colour, its crease's far side, the light
 * on its edge; where it turns (`crease`) and how wide its rim is (`rim`,
 * units at a head's scale), when the concept says.
 */
export interface Paper {
  readonly color: Hex;
  readonly shade: Hex;
  readonly light: Hex;
  readonly crease?: Crease;
  readonly rim?: number;
}

/** `base`'s ramp under the court's key light, as a paper. */
const paperOf = (base: Hex): Paper => {
  const r = ramp(base, keyLight, shading);
  return { color: r.base, shade: r.shade, light: r.light };
};

/**
 * The concept's rim, units: about 0.04 of a head's width, the light band
 * just inside the outline on the side facing the window.
 */
const RIM = 5.5;

/**
 * The concept's turns, sampled on its pieces: a face shades only its far
 * side, its edge a little soft and leaning (about 30° off upright); a robe
 * turns sharply nearer upright (about 13°); the judge's robe darkens across
 * its whole width; a hand only at its far edge; the lead's sheet turns its
 * head and tunic sharply at the light's own angle.
 */
const TURN = {
  face: { at: 0.72, soft: 0.06, toward: 0.5 },
  robe: { at: 0.55, soft: 0.01, toward: 0.23 },
  wideRobe: { at: 0.55, soft: 0.5, toward: 0.2 },
  hand: { at: 0.75, soft: 0.06 },
  sheet: { at: 0.64 },
} as const satisfies Record<string, Crease>;

/** The figures' papers, by what each is. */
export const PAPERS = {
  /** The plain lead's one paper: head, tunic, legs and hands, a lilac white as cold-34 paints him in the room, his shade a clear violet, his rim near white. */
  lead: { color: '#ece7fa', shade: '#c9bcf2', light: '#fffffb', crease: TURN.sheet, rim: RIM },
  /** The white tunic the lead is given (`court.back`). */
  robe: { ...paperOf('#fcfbfc'), crease: TURN.sheet, rim: RIM },
  /** Skin, as cold-34 paints the prosecutor's and the judge's faces: warm peach, its shade rosier and barely darker. */
  skin: { color: '#f7b284', shade: '#f0a27c', light: '#fbd2b6', crease: TURN.face, rim: RIM },
  /** Skin on a hand: the same peach, shaded only at its far edge. */
  skinHand: { color: '#f7b284', shade: '#f0a27c', light: '#fbd2b6', crease: TURN.hand, rim: RIM },
  /** The judge's robe: a plum that darkens toward violet across its width. */
  judgeRobe: {
    color: '#5c3f4d',
    shade: '#3c2c3e',
    light: '#76565f',
    crease: TURN.wideRobe,
    rim: RIM,
  },
  /** The judge's hair: warm grey, its shade a violet grey. */
  greyHair: { color: '#b2a4a5', shade: '#8f8098', light: '#d9cbc6', crease: TURN.face },
  /** The prosecutor's full-length robe: olive, its shade a deeper olive. */
  olive: { color: '#847456', shade: '#645b46', light: '#9a8763', crease: TURN.robe, rim: RIM },
  /** The prosecutor's short black hair: a warm black, its back darker. */
  darkHair: { color: '#433736', shade: '#2e2a2c', light: '#5a4846', crease: TURN.face },
  /** Shoes. */
  shoe: paperOf('#4e3b31'),
  /** The judge's bands: white linen. */
  bands: paperOf('#fbf8f2'),
} as const satisfies Record<string, Paper>;

/** The flat scarlet stain (Isa 1:18): one colour, no crease, no ink; the kept panels' soaked scarlet. */
export const STAIN: Hex = '#cf4a44';

/** `paper` as a piece's paint (`PieceLook`): its colours, crease and rim, and `extra` over them. */
export const looked = (paper: Paper, extra: Partial<PieceLook> = {}): PieceLook => ({
  ...paper,
  ...extra,
});
