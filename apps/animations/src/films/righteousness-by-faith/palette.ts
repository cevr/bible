// The colour script is bright (BibleProject's Justice film: mean luma about
// 149, one black moment). Skies change per beat; the world is chipboard; the
// people are grey paper. Scarlet is sin (Isa 1:18), white the robe, gold the
// word and God's presence.

export const palette = {
  // IDEA: the parchment page and its ink.
  paper: '#eeddc8',
  paperTone: '#8c7f71',
  ink: '#332b23',
  inkSoft: '#665d52',
  // STORY: chipboard, lit and shaded.
  board: '#ab8163',
  boardLight: '#c49a78',
  boardShade: '#83644b',
  boardDeep: '#423123',
  // The people.
  figure: '#b7b2a8',
  figureShade: '#8f8a80',
  outline: '#2b2622',
  // The meaning colours.
  scarlet: '#ce0914',
  scarletShade: '#a4070e',
  robe: '#fcfefc',
  cream: '#fdf3dc',
  gold: '#e6b347',
  glow: '#fbefc8',
  // Skies, top to bottom.
  tealTop: '#5dccb5',
  tealMid: '#a4f0b7',
  tealLow: '#e7fab0',
  peachTop: '#f4b18b',
  peachLow: '#f9d08e',
  sunsetTop: '#d3a27f',
  sunsetLow: '#8a4736',
  dawnTop: '#cfddcf',
  dawnLow: '#ded7b1',
  night: '#1b150d',
} satisfies Record<string, string>;

export const fonts = {
  display: 'Fraunces',
  body: 'Inter',
  hand: 'Gaegu',
  greek: 'EB Garamond',
  hebrew: 'Frank Ruhl Libre',
} satisfies Record<string, string>;
