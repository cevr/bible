// The papers of RBF's figures: each a ramp of its own base under the
// cold-studies key light and shading (`ramp`, CRAFT rule 12), so every rig in
// the house look shades by one colour model, its far side a hue of its own.
// The plain lead keeps the shade his sheet names (character-design 2.3: lit
// `#dbd6dc`, shade `#b5a9d0`): the ramp's slate (`#9ba3bb`, hue 225°) would
// leave the sheet's violet. Pure.

import { type Hex, ramp } from '@bible/film/canvas';
import { keyLight, shading } from '../../cold-studies/palette.ts';
import type { PieceLook } from '../../cold-studies/looks/rive/parts.ts';

/** A paper as a piece takes it: its colour, its crease's far side and its cut edge's light. */
export interface Paper {
  readonly color: Hex;
  readonly shade: Hex;
  readonly light: Hex;
}

/** `base`'s ramp under the court's key light, as a paper. */
const paperOf = (base: Hex): Paper => {
  const r = ramp(base, keyLight, shading);
  return { color: r.base, shade: r.shade, light: r.light };
};

/** The figures' papers, by what each is. */
export const PAPERS = {
  /** The plain lead's one paper: head, tunic, legs and hands (sheet 2.3). */
  lead: { ...paperOf('#dbd6dc'), shade: '#b5a9d0' },
  /** The white tunic the lead is given (`court.back`). */
  robe: paperOf('#fcfbfc'),
  /** Skin: the house look's warm peach (the judge, the prosecutor). */
  skin: paperOf('#f1c29c'),
  /** The judge's robe: dark purple. */
  judgeRobe: paperOf('#4b3658'),
  /** The judge's hair, grey, flat in the head. */
  greyHair: paperOf('#aaa6b2'),
  /** The prosecutor's full-length robe: olive. */
  olive: paperOf('#706c47'),
  /** The prosecutor's short dark hair. */
  darkHair: paperOf('#2f2a2f'),
  /** Shoes. */
  shoe: paperOf('#4e3b31'),
  /** The judge's bands: white linen. */
  bands: paperOf('#fbf8f2'),
} as const satisfies Record<string, Paper>;

/** The flat scarlet stain (Isa 1:18): one colour, no crease, no ink. */
export const STAIN: Hex = '#cc2b2b';

/** `paper` as a piece's paint (`PieceLook`). */
export const looked = (paper: Paper, extra: Partial<PieceLook> = {}): PieceLook => ({
  color: paper.color,
  shade: paper.shade,
  light: paper.light,
  ...extra,
});
