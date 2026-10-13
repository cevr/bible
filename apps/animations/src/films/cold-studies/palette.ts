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

export const fonts = {
  display: 'Fraunces',
  body: 'Inter',
} satisfies Record<string, string>;
