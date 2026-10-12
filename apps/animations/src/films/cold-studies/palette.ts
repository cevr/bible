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

export const fonts = {
  display: 'Fraunces',
  body: 'Inter',
} satisfies Record<string, string>;
