// The study's one choice: the art direction the moment is drawn in. Each
// level is a look of its own (`looks/<name>/`, registered in
// `looks/index.ts`); the lab's Choices lists them as `look:style`, `bun run
// look cold-studies --level style=<name>` draws one, and a pick rewrites
// `play`. The option values are only the levels' order: a look is chosen by
// its name.
//
// The film's own colours are the frame's around the looks (its paper, the
// caption plate); each look brings its own palette.

import type { Hex, Shading } from '@bible/film/canvas';
import type { Looks } from '@bible/film/core';
import { palette as court } from '../righteousness-by-faith/palette.ts';

export const looks = {
  style: {
    options: {
      cutpaper: 0,
      ps1: 1,
      painterly: 2,
      engraving: 3,
      bold: 4,
      rive: 5,
      rivegl: 6,
      papercut: 7,
      papercutgl: 8,
    },
    play: 'cutpaper',
  },
} as const satisfies Looks;

/** A look's name. */
export type Style = keyof typeof looks.style.options;

/** The look the study plays. */
export const STYLE: Style = looks.style.play;

export const palette = {
  paper: '#eeddc8',
  paperTone: '#8c7f71',
  ink: '#332b23',
  plate: '#fcfefc',
  shade: '#423123',
} satisfies Record<string, Hex>;

/**
 * The court's key light, by its colour: a pale gold, the warm cream a lamp
 * throws on parchment. Every shade turns toward its complement, a violet-blue,
 * and every light leans to it (CRAFT 12, `ramp`).
 */
export const keyLight: Hex = '#f3e9c8';

/** How the paper-cut look shades (`ramp`'s knobs), tuned on K1's stills. */
export const shading: Shading = { turn: 25, dark: 0.16, lift: 0.45, deep: 14, warm: 7, fade: 0.6 };

/** A colour's ramp: its shade (a neighbouring hue, never the base dimmed), the base, and its light. */
export interface Ramp {
  readonly shade: Hex;
  readonly base: Hex;
  readonly light: Hex;
}

/**
 * The ramps the paper-cut figures (`papercut`, `looks/rive/parts.ts`) shade
 * from (CRAFT 12, "Shade with colour, never with black"), each on a colour of
 * the court the control draws (Righteousness by Faith's), under the court's
 * key: a neutral room light on warm parchment, so the paper's own warmth is
 * the light and every shade turns to its complement, a violet-blue (sin's
 * scarlet toward crimson), darker and at least as saturated as its base,
 * while every light, the colour a cut edge catches (its light core), leans
 * to a warm cream. A crease's far side is its paper's shade; a cast shadow is
 * the shade of the surface it falls on. `looks/rive/direction.test.ts` holds
 * every ramp here and in `hues` to it.
 */
export const ramps = {
  /** The people's grey paper. */
  figure: { shade: '#9a92ab', base: court.figure, light: '#d7cfc2' },
  /** The people's deeper grey, their legs under the court's grey (C1). */
  figureDeep: { shade: '#787f9e', base: '#9a92ab', light: '#c8bfc4' },
  /** The judge's robe: ink-dark paper. */
  robe: { shade: '#261c2e', base: court.ink, light: '#958c80' },
  /** The ink of a figure's outline and face. */
  ink: { shade: '#221f2e', base: court.outline, light: '#484038' },
  /** Sin's scarlet, on the cloth that carries it; its light a warm coral. */
  scarlet: { shade: '#8c0238', base: court.scarlet, light: '#e8805e' },
  /** The parchment sheet: the court's wall and floor. */
  paper: { shade: '#b4a6cc', base: court.paper, light: '#f2e5d2' },
  /** The toned paper of the bench. */
  paperTone: { shade: '#6a6284', base: court.paperTone, light: '#a69886' },
} as const satisfies Record<string, Ramp>;

/**
 * The judge's robe under C2, three ways to shade one dark paper toward the
 * key's complement. No shade of the indigo `#3c3952` is darker, turned toward
 * the complement, at least half hue, as chromatic (LCh) and inside the
 * film's saturation band (HSV ≤ 0.35) with a step that shows (the largest
 * such step is ΔE 2.9): one of the last two rules gives. PROVISIONAL
 * (2026-10-13), the owner's pick; `hues.robe` names the one drawn, and
 * `direction.test.ts` holds all three to CRAFT 12.
 */
export const robes = {
  /** Slate: indigo shading to slate blue, hsv(226, .34, .28); the band kept, the chroma gives (LCh C 16.6 → 12.9), ΔE 6.0, 57 % hue. */
  slate: { base: '#3c3952', shade: '#2f3447', light: '#999397' },
  /** Navy: indigo shading to navy, hsv(219, .52, .29); the chroma kept (17.4), the band gives, ΔE 7.8, 71 % hue. */
  navy: { base: '#3c3952', shade: '#233049', light: '#999397' },
  /** Violet: the base re-picked violet, hsv(278, .34, .31), shading to blue-violet hsv(240, .41, .29); the band gives in the shade, ΔE 9.0, 76 % hue. */
  violet: { base: '#45344f', shade: '#2b2b49', light: '#9d9190' },
} as const satisfies Record<string, Ramp>;

/**
 * The paper-cut look's garment and prop hues, for the colour axis's second
 * option (C2, `looks/rive/direction.ts`; provisional until the owner picks): a
 * person is told by the hue of what they wear, not by a new accent. Every
 * base sits inside the film's saturation band (HSV 0.20–0.35) and scarlet
 * stays the figure's one accent. Each is a ramp like `ramps`' (CRAFT 12).
 * Heads and hands stay the people's one figure paper (`ramps.figure`): a
 * garment tells a person, not a skin.
 */
export const hues = {
  /** The accused's sage tunic, hsv(92, .27, .68) shading to hsv(125, .30, .57). */
  tunic: { shade: '#669169', base: '#94ad7f', light: '#c5cdae' },
  /** The accused's slate legs, hsv(215, .28, .48), shading to hsv(208, .39, .42) where the tunic's shadow falls. */
  legs: { shade: '#425a6c', base: '#58667a', light: '#a7a59f' },
  /**
   * The judge's robe (`robes`; provisional): navy, picked on the court's
   * renders (2026-10-13, `papercut/r3/crops/judge-robe-*-2x.png`). Slate's
   * step barely shows on the indigo; violet's shows, but re-picks the base;
   * navy keeps the indigo and its far side reads as a cool shadow. The band
   * holds the bases, so the shade is the rule that gives.
   */
  robe: robes.navy,
  /**
   * The walnut bench, hsv(24, .25, .54), its shade hsv(8, .29, .46) where a
   * hand's shadow falls on it: toned to the band's low end, since it is the
   * frame's largest mass and must not outshout the people before it.
   */
  bench: { shade: '#755753', base: '#8a7567', light: '#c0b1a2' },
  /** The bench's rim, panels and gavel block, walnuts darker. */
  rim: '#614940',
  panel: '#664b47',
  block: '#4d3932',
  /** The evidence sheets, cycling cream, pale blue, pale sage and blush. */
  sheets: ['#edddb9', '#b6d0e3', '#c6deb1', '#e8c4b5'],
} as const satisfies Record<string, Hex | Ramp | ReadonlyArray<Hex>>;

export const fonts = {
  display: 'Fraunces',
  body: 'Inter',
} satisfies Record<string, string>;
