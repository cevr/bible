// The look prototype's colours: complementary light, as Fortiche paints it.
// Shadows go cool (indigo, teal), key and rim light go warm (amber, ember,
// magenta at dusk); the moon is the one cold key. Values are kept far apart,
// so each shot reads as a few big shapes of light and dark first.

import type { Hex } from '@bible/film/canvas';

export const palette = {
  // Dusk sky, top to horizon, and the sun.
  night: '#121430',
  indigo: '#23224a',
  plum: '#4a2855',
  rose: '#a4445e',
  ember: '#e2683c',
  amber: '#ffa24f',
  sunGlow: '#ffd27e',
  sunCore: '#fff3d1',
  // The far hills and the lake, lost in the warm air.
  hillFar: '#8a5378',
  hillMid: '#5b3463',
  lakeLit: '#e58a68',
  lake: '#6a3a66',
  // The mount, its grass in the last light and in shade.
  grassLit: '#b0743c',
  grass: '#5e3c3e',
  grassShade: '#2c2440',
  // People in silhouette: the crowd's cloths, darkened by the dusk.
  crowd: '#2a1d36',
  crowdMid: '#3d2740',
  madder: '#6e2f34',
  woad: '#2f3557',
  ochre: '#6d4a2c',
  // A figure's lit robe, its shade, its skin and hair.
  robeLit: '#f1d3a4',
  robe: '#a77d68',
  robeShade: '#3b3157',
  mantle: '#9c3a2c',
  mantleShade: '#4a1e2c',
  skinLit: '#f0a671',
  skin: '#b8674a',
  skinShade: '#3e3558',
  hair: '#1d1420',
  // Firelight and the dark about it.
  fireCore: '#fff0c0',
  fire: '#ffb049',
  fireDeep: '#e2531f',
  teal: '#1d4f5c',
  tealDeep: '#0c2530',
  tealRim: '#8fd6d8',
  // The room at night: plaster, wood, clay and the moon.
  wall: '#4a3328',
  wallLit: '#b87a45',
  wallShade: '#1b1824',
  wood: '#2a1b18',
  woodLit: '#8a5430',
  clay: '#9a5534',
  clayShade: '#2c1c22',
  moon: '#bcd8f0',
  moonSky: '#25406e',
  moonDeep: '#0f1c3a',
  // The film's darkest shade: the vignette's and the letterbox's.
  shade: '#07080f',
} as const satisfies Record<string, Hex>;
