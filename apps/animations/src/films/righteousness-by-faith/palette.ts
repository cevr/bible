// The colour script is bright (BibleProject's Justice film: mean luma about
// 149, one black moment). Skies change per beat; the world is chipboard; the
// people are grey paper. Scarlet is sin (Isa 1:18), white the robe, gold the
// word and God's presence.
//
// The ground is lifted by one amount, the film's `GROUND` level: the world's
// chipboard and its skies rise toward light paper, and each act's light falls
// less far at the corners (`light.ts`). What the people are, wear and hold
// never moves: the figures, their `cut` chipboard (hair, headcloths, gear,
// the pallet), the parchment and the accents keep their values at every
// level. The world lifts past the figures' grey, never onto it: the walls go
// lighter than the figures while the floors and dark props stay under them,
// so a figure reads against both.

import { lerp } from '@bible/film/core';

/** A colour between two hex colours. */
export const mix = (a: string, b: string, t: number): string => {
  const ch = (hex: string, i: number) => Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const k = Math.min(1, Math.max(0, t));
  const out = [0, 1, 2].map((i) =>
    Math.round(lerp(ch(a, i), ch(b, i), k))
      .toString(16)
      .padStart(2, '0'),
  );
  return `#${out.join('')}`;
};

/**
 * How far the ground is lifted toward light paper, by level: `now` the
 * chipboard as first cut, `light` the committed lift, `lighter` a further
 * step. Pick one with `GROUND`; every value below and in `light.ts` and
 * `film.ts` follows it.
 */
export const GROUNDS = { now: 0, light: 0.5, lighter: 0.75 } as const;
export type Ground = keyof typeof GROUNDS;

/** The film's ground level: the one line that sets how light the world is. */
export const GROUND: Ground = 'light';

/** The lift, 0..1: the share of the way each ground colour rises toward `LIGHT_PAPER`. */
export const LIFT: number = GROUNDS[GROUND];

/** The warm light paper the ground rises toward: under the robe's white and the glow. */
const LIGHT_PAPER = '#f3ebdd';

/**
 * A ground colour lifted by `share` of the film's lift. Walls take all of it;
 * skies, floors and dark props less, so skies keep their colour and floors
 * stay under the figures.
 */
const ground = (base: string, share = 1) => mix(base, LIGHT_PAPER, LIFT * share);

/** The share of the lift a sky takes: enough to lighten it, not so much it washes out. */
const SKY = 0.4;

export const palette = {
  // IDEA: the parchment page and its ink.
  paper: '#eeddc8',
  paperTone: '#8c7f71',
  ink: '#332b23',
  inkSoft: '#665d52',
  // STORY: chipboard, lit and shaded: the walls, floors, houses and props the
  // people stand among, lifted with the ground.
  board: ground('#ab8163'),
  boardLight: ground('#c49a78'),
  boardShade: ground('#83644b', 0.55),
  boardDeep: ground('#423123', 0.4),
  // The people.
  figure: '#b7b2a8',
  figureShade: '#8f8a80',
  outline: '#2b2622',
  // Chipboard cut for what the people wear and carry (hair, headcloths, a
  // tunic, a helmet and cape, the gavel, the pallet): it never lifts.
  cut: '#ab8163',
  cutLight: '#c49a78',
  cutShade: '#83644b',
  cutDeep: '#423123',
  cutRust: '#8a4736',
  // The meaning colours.
  scarlet: '#ce0914',
  scarletShade: '#a4070e',
  robe: '#fcfefc',
  cream: '#fdf3dc',
  gold: '#e6b347',
  glow: '#fbefc8',
  // What grows (only what the word makes grow, and the fig leaves we sew),
  // the stone of the law, and water under the dawn.
  leaf: '#86b86a',
  leafPale: '#8fb06a',
  leafShade: '#5f9451',
  leafDry: '#9a7b52',
  stone: '#c9c1b2',
  water: '#48b39d',
  // Skies, top to bottom, lifted with the ground but less far, so they keep
  // more of their colour.
  tealTop: ground('#5dccb5', SKY),
  tealMid: ground('#a4f0b7', SKY),
  tealLow: ground('#e7fab0', SKY),
  peachTop: ground('#f4b18b', SKY),
  peachLow: ground('#f9d08e', SKY),
  sunsetTop: ground('#d3a27f', SKY),
  sunsetLow: ground('#8a4736', 0.4),
  dawnTop: ground('#cfddcf', SKY),
  dawnLow: ground('#ded7b1', SKY),
  night: '#1b150d',
} satisfies Record<string, string>;

export const fonts = {
  display: 'Fraunces',
  body: 'Inter',
  hand: 'Gaegu',
  greek: 'EB Garamond',
  hebrew: 'Frank Ruhl Libre',
} satisfies Record<string, string>;
