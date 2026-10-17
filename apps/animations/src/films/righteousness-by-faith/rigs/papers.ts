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
  /** Its far side past the crease; none for a flat paper (an ear). */
  readonly shade?: Hex;
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
 * just inside the outline on the side facing the window (cold-34's faces
 * and robes: 6 px wide, #fbd0b3 on #f8b48a skin, #96825e on #817154 olive).
 */
const RIM = 5.5;

/**
 * The concept's turns, sampled on its pieces: a face shades only its far
 * side, its edge a little soft and leaning (about 30° off upright); the
 * prosecutor's and the judge's faces each in one broad band from the temple
 * to the jaw, where cold-34 lays it on each (their heads' boxes, in their
 * skull frames: the prosecutor's 11° off upright, 10 px soft; the judge's
 * 20°, 6 px soft), and the lead's head cut straight across its far side
 * (27°, 7 px soft); a robe turns sharply nearer upright (about 13°); the
 * judge's robe darkens across its whole width; a hand only at its far edge;
 * the lead's sheet turns his tunic sharply at the light's own angle.
 */
const TURN = {
  face: { at: 0.72, soft: 0.06, toward: 0.5 },
  prosecutorFace: { at: 0.697, soft: 0.066, toward: 0.185 },
  judgeFace: { at: 0.686, soft: 0.04, toward: 0.352 },
  robe: { at: 0.55, soft: 0.01, toward: 0.23 },
  wideRobe: { at: 0.55, soft: 0.5, toward: 0.2 },
  hand: { at: 0.75, soft: 0.06 },
  sheet: { at: 0.64, crescent: 0.45 },
  leadHead: { at: 0.648, soft: 0.037, toward: 0.464 },
  shoe: { at: 0.4, soft: 0.04, toward: -0.7 },
  farShoe: { at: 0.3, soft: 0.04, toward: -0.7 },
  whiteRobe: { at: 0.72, soft: 0.02, toward: 0.2 },
} as const satisfies Record<string, Crease>;

/** The figures' papers, by what each is. */
export const PAPERS = {
  /** The plain lead's one paper: head, tunic, legs and hands, a lilac white as cold-34 paints him in the room, his shade a clear violet, his rim near white. */
  lead: { color: '#ece7fa', shade: '#c9bcf2', light: '#fffffb', crease: TURN.sheet, rim: RIM },
  /** The lead's head: his paper, its shade cut straight across the far side as cold-34 cuts it (27° off upright). */
  leadHead: {
    color: '#ece7fa',
    shade: '#c9bcf2',
    light: '#fffffb',
    crease: TURN.leadHead,
    rim: RIM,
  },
  /** The white tunic the lead is given (`court.back`). */
  robe: { ...paperOf('#fcfbfc'), crease: TURN.sheet, rim: RIM },
  /** Skin, as cold-34 paints the prosecutor's face: warm peach, its shade rosier and barely darker. */
  prosecutorSkin: {
    color: '#f7b284',
    shade: '#f0a27c',
    light: '#fbd2b6',
    crease: TURN.prosecutorFace,
    rim: RIM,
  },
  /** The judge's face: the same peach, turned in his own band. */
  judgeSkin: {
    color: '#f7b284',
    shade: '#f0a27c',
    light: '#fbd2b6',
    crease: TURN.judgeFace,
    rim: RIM,
  },
  /** An ear: flat skin, a touch deeper than the lit face, no crease and no rim (cold-34 samples it #f4a880 to #f7b386). */
  ear: { color: '#f4aa80', light: '#f4aa80' },
  /** Christ's ear, on his head's far side: flat, in the shade's warmth (court-12). */
  christEar: { color: '#e9976f', light: '#e9976f' },
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
  /** Christ's skin, as court-12 paints it: a warmer peach than the court's, its shade toward rose. */
  christSkin: { color: '#f8a874', shade: '#ea9470', light: '#fbc49a', crease: TURN.face, rim: RIM },
  /** Christ's long brown hair: a warm brown, its back darker. */
  brownHair: { color: '#5f3d2c', shade: '#4a3027', light: '#7f5237', crease: TURN.face },
  /** His beard: the hair's brown, a little deeper. */
  beard: { color: '#583828', shade: '#4c3024', light: '#6e4632', crease: TURN.face },
  /** Christ's white robe: a warm white, its far side a lilac (court-12). */
  whiteRobe: {
    color: '#f7e9d9',
    shade: '#d3c2cd',
    light: '#fef7e5',
    crease: TURN.whiteRobe,
    rim: RIM,
  },
  /** Sandals: a leather brown. */
  sandal: { color: '#955b3a', shade: '#7c4a30', light: '#a86c48' },
  /**
   * Shoes, as cold-34 paints the prosecutor's: a warm brown leather lit on
   * its left, toward the window (#765949 there), the rest a deeper brown
   * (#5c463e); the near shoe lit over two fifths of it, a 6 px rim of
   * #9d7559 down its left curve; the far one all in the deeper brown, lit
   * only by a fainter rim at its left edge (#6a4f44, 4 px).
   */
  shoe: { color: '#765949', shade: '#5c463e', light: '#9d7559', crease: TURN.shoe, rim: RIM },
  farShoe: { color: '#5c463e', shade: '#5c463e', light: '#6a4f44', crease: TURN.farShoe, rim: 4 },
  /** The judge's bands: a warm white linen, flat (cold-34 samples #fcf4ec), no rim. */
  bands: { color: '#fcf4ec', light: '#fcf4ec' },
} as const satisfies Record<string, Paper>;

/** The flat scarlet stain (Isa 1:18): one colour, no crease, no ink; the kept panels' soaked scarlet. */
export const STAIN: Hex = '#cf4a44';

/** `paper` as a piece's paint (`PieceLook`): its colours, crease and rim, and `extra` over them. */
export const looked = (paper: Paper, extra: Partial<PieceLook> = {}): PieceLook => ({
  ...paper,
  ...extra,
});
