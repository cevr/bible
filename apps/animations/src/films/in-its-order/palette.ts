// The colour script is bright, as the series opener should be: teal day at
// the feast, peach on the parchment, dawn coming in with `math`, dawn gold
// behind the veil, and the landing's teal going to yellow. The film has no
// black moment; its one valley is a short dusk in Corinth (`bottle`). The
// world is chipboard; the plain figures are the house's grey paper; the Bible
// figures wear the story cloth. Gold is the word and the light from the
// cross; white is the milk and the priest's robe.

import type { Hex } from '@bible/film/canvas';
import { parchment, peoplePaper } from '@bible/film/style';

export const palette = {
  // IDEA: the parchment page (the house's) and its ink.
  paper: parchment,
  paperTone: '#8c7f71',
  ink: '#332b23',
  inkSoft: '#665d52',
  // STORY: chipboard, lit and shaded: the courtyard, the field's wall, the
  // rooms of Corinth and Jerusalem.
  board: '#ab8163',
  boardLight: '#c49a78',
  boardShade: '#83644b',
  boardDeep: '#423123',
  // The plain figures: the house's grey paper.
  figure: peoplePaper,
  figureShade: '#8f8a80',
  outline: '#2b2622',
  // The story cloth the Bible figures wear (casting.md): linen, walnut,
  // indigo, olive, camel.
  linen: '#d1c6b4',
  walnut: '#ab8163',
  indigo: '#4b566b',
  olive: '#768059',
  camel: '#8c7762',
  // The meaning colours: the milk and the robe, the word's gold.
  milk: '#fcfefc',
  robe: '#fcfefc',
  cream: '#fdf3dc',
  gold: '#e6b347',
  goldShade: '#b8862b',
  // What grows: the blade, the ear, the full corn.
  leaf: '#86b86a',
  leafShade: '#5f9451',
  corn: '#e2c46f',
  // Skies, top to bottom.
  tealTop: '#5dccb5',
  tealMid: '#a4f0b7',
  tealLow: '#e7fab0',
  peachTop: '#f4b18b',
  peachLow: '#f9d08e',
  duskTop: '#d3a27f',
  duskLow: '#8a4736',
  dawnTop: '#cfddcf',
  dawnLow: '#ded7b1',
  landingLow: '#f6e6a0',
  night: '#1b150d',
} satisfies Record<string, Hex>;

export const fonts = {
  display: 'Fraunces',
  body: 'Inter',
  hand: 'Gaegu',
  greek: 'EB Garamond',
  hebrew: 'Frank Ruhl Libre',
} satisfies Record<string, string>;
