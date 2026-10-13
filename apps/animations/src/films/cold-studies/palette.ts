// The study's one choice: the art direction the moment is drawn in. Each
// level is a look of its own (`looks/<name>/`, registered in
// `looks/index.ts`); the lab's Choices lists them as `look:style`, `bun run
// look cold-studies --level style=<name>` draws one, and a pick rewrites
// `play`. The option values are only the levels' order: a look is chosen by
// its name.
//
// The film's own colours are the frame's around the looks (its paper, the
// caption plate); each look brings its own palette.

import { type Hex, type Ramp, type Shading, ramp } from '@bible/film/canvas';
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
 * throws on parchment. Every shade turns toward its complement, a cool blue
 * (a warm paper's through violet), and every light leans to it (CRAFT 12,
 * `ramp`).
 */
export const keyLight: Hex = '#f3e9c8';

/**
 * How the paper-cut look shades (`ramp`'s knobs, held above CRAFT 12's
 * floors): fitted to K1, the owner's pick (2026-10-13), as the
 * least-squares nearest (CIE ΔE) to the swatches K1 was drawn with, its two
 * near-grey lights left out. The shade's knobs (`dark`, `deep`, `neutral`)
 * are fitted to K1's hand shades, so a near-neutral's shade stops short of
 * the complement as K1's did: the people's crease a lavender (h 299), not a
 * slate blue. `neutral: 1` gives a slate blue, `#7e889f` at these knobs
 * (P1's `#858c9d` also had `dark: 0.2`, `deep: 10`).
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

export type { Ramp };

/** The ramp of a base under the court's key: its shade, the base and its light (CRAFT 12). */
const shaded = (base: Hex): Ramp => ramp(base, keyLight, shading);

/**
 * The ramps the paper-cut figures (`papercut`, `looks/rive/parts.ts`) shade
 * from (CRAFT 12, "Shade with colour, never with black"), each on a colour of
 * the court the control draws (Righteousness by Faith's) and derived from it
 * under the court's key (`ramp`): every shade darker and turned toward the
 * key's complement (sin's scarlet toward crimson), at least as saturated as
 * its base; every light, the colour a cut edge catches (its light core),
 * lighter and leaning to the key, never grey. A crease's far side is its
 * paper's shade; a cast shadow is the shade of the surface it falls on.
 * `looks/rive/direction.test.ts` holds every colour a rig paints to them.
 */
export const ramps = {
  /** The people's grey paper. */
  figure: shaded(court.figure),
  /** The people's deeper grey, their legs under the court's grey (C1). */
  figureDeep: shaded('#9a92ab'),
  /** The judge's robe under C1: ink-dark paper. */
  robe: shaded(court.ink),
  /** The ink of a figure's outline and face. */
  ink: shaded(court.outline),
  /** Sin's scarlet, on the cloth that carries it; its light a warm coral. */
  scarlet: shaded(court.scarlet),
  /** The parchment sheet: the court's wall and floor. */
  paper: shaded(court.paper),
  /** The toned paper of the bench under C1. */
  paperTone: shaded(court.paperTone),
} as const satisfies Record<string, Ramp>;

/**
 * The judge's robe under C2: three dark papers, each a base its ramp shades.
 * Indigo is drawn (K1); slate and violet are the owner's other options, one
 * edit to `hues.robe` and a rebuild (`direction.test.ts` checks each).
 */
export const robes = {
  /** Indigo, hsv(247, .30, .32): its shade navy, its light a dusk mauve. */
  indigo: shaded('#3c3952'),
  /** Slate, hsv(219, .33, .37): cooler and a touch lighter; its shade barely turns, being blue already. */
  slate: shaded('#3f4a5e'),
  /** Violet, hsv(278, .34, .31): the warmest; its shade turns furthest, to blue-violet. */
  violet: shaded('#45344f'),
} as const satisfies Record<string, Ramp>;

/**
 * The paper-cut look's garment and prop hues, for the colour axis's second
 * option (C2, `looks/rive/direction.ts`): a person is told by the hue of what
 * they wear, not by a new accent. Every base sits inside the film's
 * saturation band (HSV 0.20–0.35) and scarlet stays the figure's one accent;
 * the band holds bases, not their shades, which turn and deepen past it
 * (CRAFT 12 raises a shade's saturation as its value drops). Each garment is
 * a ramp like `ramps`'. Heads and hands stay the people's one figure paper
 * (`ramps.figure`): a garment tells a person, not a skin.
 */
export const hues = {
  /** The accused's sage tunic, hsv(93, .27, .68). */
  tunic: shaded('#94ad7f'),
  /** The accused's slate legs, hsv(215, .28, .48); their shade is where the tunic's shadow falls. */
  legs: shaded('#58667a'),
  /** The judge's robe: indigo (`robes`). */
  robe: robes.indigo,
  /**
   * The walnut bench, hsv(24, .25, .54): toned to the band's low end, since
   * it is the frame's largest mass and must not outshout the people before
   * it. Its shade is where the judge's hand's shadow falls on it.
   */
  bench: shaded('#8a7567'),
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
