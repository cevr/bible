// The study's one choice: the art direction the moment is drawn in. Each
// level is a look of its own (`looks/<name>/`, registered in
// `looks/index.ts`); the lab's Choices lists them as `look:style`, `bun run
// look cold-studies --level style=<name>` draws one, and a pick rewrites
// `play`. The option values are only the levels' order: a look is chosen by
// its name.
//
// The film's own colours are the frame's around the looks (its paper, the
// caption plate); each look brings its own palette.

import type { Hex } from '@bible/film/canvas';
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
 * while every light leans to a warm cream. A crease's far side is its
 * paper's shade; a cast shadow is the shade of the surface it falls on.
 */
export const ramps = {
  /** The people's grey paper. */
  figure: { shade: '#9a92ab', base: court.figure, light: '#c6c0b3' },
  /** The judge's robe: ink-dark paper. */
  robe: { shade: '#261c2e', base: court.ink, light: '#4a3d2f' },
  /** The ink of a figure's outline and face. */
  ink: { shade: '#221f2e', base: court.outline, light: '#4a4038' },
  /** Sin's scarlet, on the cloth that carries it. */
  scarlet: { shade: '#8c0238', base: court.scarlet, light: '#e8392a' },
  /** The parchment sheet: the court's wall and floor. */
  paper: { shade: '#b4a6cc', base: court.paper, light: '#f6ecdc' },
  /** The toned paper of the bench. */
  paperTone: { shade: '#6a6284', base: court.paperTone, light: '#a69886' },
} as const satisfies Record<string, Ramp>;

/** A paper's colour and its crease's far side. */
export interface Hue {
  readonly base: Hex;
  readonly shade: Hex;
}

/**
 * The paper-cut look's garment and prop hues, for the colour axis's second
 * option (C2, `looks/rive/direction.ts`; provisional until the owner picks): a
 * person is told by the hue of what they wear, not by a new accent. Every
 * value sits inside the film's saturation band (HSV 0.20–0.35) and scarlet
 * stays the figure's one accent. Each shade turns its hue toward the key's
 * complement (blue-violet) and keeps or raises saturation (CRAFT 12). Heads
 * and hands stay the people's one figure paper (`ramps.figure`): a garment
 * tells a person, not a skin.
 */
export const hues = {
  /** The accused's sage tunic, hsv(92, .27, .68) shading to hsv(125, .30, .57). */
  tunic: { base: '#94ad7f', shade: '#669169' },
  /** The accused's slate legs, hsv(215, .28, .48). */
  legs: '#58667a',
  /**
   * The judge's indigo robe, hsv(248, .30, .32) shading to hsv(290, .35, .24):
   * past violet toward plum, so three quarters of the dark paper's step is
   * hue (LCh hue 298 → 322), not the robe dimmed.
   */
  robe: { base: '#3c3952', shade: '#3a283d' },
  /**
   * The walnut bench, hsv(24, .25, .54), its shade hsv(6, .29, .45) where a
   * hand's shadow falls on it: toned to the band's low end, since it is the
   * frame's largest mass and must not outshout the people before it.
   */
  bench: { base: '#8a7567', shade: '#735551' },
  /** The bench's rim, panels and gavel block, walnuts darker. */
  rim: '#614940',
  panel: '#664b47',
  block: '#4d3932',
  /** The evidence sheets, cycling cream, pale blue, pale sage and blush. */
  sheets: ['#edddb9', '#b6d0e3', '#c6deb1', '#e8c4b5'],
} as const satisfies Record<string, Hex | Hue | ReadonlyArray<Hex>>;

export const fonts = {
  display: 'Fraunces',
  body: 'Inter',
} satisfies Record<string, string>;
