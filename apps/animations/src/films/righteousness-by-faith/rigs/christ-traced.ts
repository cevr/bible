// Christ's head as court-12 (the kept concept) draws it, traced there: the
// region inside its ink (the head's paper), the hair over it from the crown
// down behind His ear to His shoulder, the beard from cheek to cheek round
// His chin, and His ear; each outline the inner edge of the concept's ink,
// in units (the Board's pixels, court-12 at scale 1) about the head's
// centre. Front-facing as court-12 turns Him, a little toward screen left.

import type { Pt } from '@bible/film/style';

export const CHRIST_REGION: Pt[] = [
  [-15.6, -69.1],
  [1, -69.5],
  [9.2, -67.7],
  [16.4, -64.9],
  [24.8, -59.3],
  [29.4, -53.9],
  [40.6, -50.1],
  [47.8, -45.3],
  [55.4, -33.9],
  [58, -24.5],
  [58, -4.5],
  [50, 28.5],
  [50, 31.5],
  [54, 45.5],
  [53.4, 54.9],
  [50.8, 58.3],
  [45.8, 61.9],
  [38.4, 58.1],
  [22.4, 52.1],
  [16.4, 53.9],
  [11.2, 58.7],
  [-1.8, 66.7],
  [-9, 68.5],
  [-20, 69.5],
  [-32.4, 66.9],
  [-39.4, 63.9],
  [-47.6, 66.1],
  [-52.6, 61.1],
  [-54, 55.5],
  [-51, 43.5],
  [-56, 20.5],
  [-56, -5.5],
  [-53, -22.5],
  [-58, -37.5],
  [-56.4, -45.9],
  [-52.8, -50.3],
  [-48.6, -53.1],
  [-40.4, -55.9],
  [-34.8, -61.3],
  [-29.4, -64.9],
];
/**
 * His hair: the crown, the parting and the hair down behind His ear, and
 * under the jaw behind the beard (the lock court-12 hangs there, 0.27 to
 * 0.31 in value), its inner edge under the beard and the ear, which lie
 * over it.
 */
export const CHRIST_HAIR: Pt[] = [
  [-15.6, -69.1],
  [1, -69.5],
  [14.4, -65.9],
  [24.8, -59.3],
  [29.4, -53.9],
  [40.6, -50.1],
  [47.8, -45.3],
  [55.4, -33.9],
  [58, -24.5],
  [58, -4.5],
  [50, 28.5],
  [50, 31.5],
  [54, 45.5],
  [54, 52.5],
  [51.8, 57.3],
  [45.8, 61.9],
  [37.8, 57.7],
  [29, 54.5],
  [23, 51],
  [26, 44],
  [31, 36],
  [36, 29],
  [40, 22],
  [46.6, 24.1],
  [48.4, 20.9],
  [50, 14.5],
  [48.4, 8.1],
  [46.2, 5.3],
  [44, 4.5],
  [41.2, 5.7],
  [36.4, 11.9],
  [34.2, 24.7],
  [26, 24.5],
  [23.4, 23.1],
  [27, 7.5],
  [27, -3.5],
  [22.4, -11.9],
  [18.8, -21.3],
  [17, -30.5],
  [18, -40.5],
  [16.6, -43.1],
  [-10, -37.5],
  [-20, -36.5],
  [-45, -36.5],
  [-47.8, -35.3],
  [-47.6, -32.9],
  [-47.4, -25.6],
  [-50.2, -22.4],
  [-53, -22.4],
  [-58, -31.4],
  [-59, -37.5],
  [-56.4, -45.9],
  [-54.8, -48.3],
  [-48.6, -53.1],
  [-40.4, -55.9],
  [-34.8, -61.3],
  [-29.4, -64.9],
];
/**
 * His beard from cheek to cheek round His chin: its back edge where court-12
 * ends it, at the dark band under His ear (499,386 down to 486,410), not
 * the lock behind it.
 */
export const CHRIST_BEARD: Pt[] = [
  [22.4, 24.9],
  [29, 25.2],
  [34.4, 29.6],
  [35.6, 31.6],
  [34.2, 33.6],
  [32.6, 37],
  [30.8, 41],
  [28.8, 45],
  [26.4, 49],
  [22.4, 52.1],
  [16.4, 53.9],
  [7.8, 61.3],
  [-1.8, 66.7],
  [-9, 68.5],
  [-20, 69.5],
  [-34.4, 65.9],
  [-40.6, 63.9],
  [-47.6, 66.1],
  [-52.6, 61.1],
  [-54, 55.5],
  [-51, 43.5],
  [-51.6, 39.9],
  [-47.2, 38.3],
  [-40.8, 30.7],
  [-38.4, 29.1],
  [-32.8, 27.7],
  [-19.8, 29.3],
  [-10.8, 34.3],
  [-4.8, 43.3],
  [0, 44.5],
  [5.4, 42.9],
  [10.8, 39.3],
  [16.8, 33.3],
];
export const CHRIST_EAR: Pt[] = [
  [41.6, 5.2],
  [44.6, 4.6],
  [47.4, 6],
  [49.4, 9],
  [50.2, 13.4],
  [49.6, 18.2],
  [47.8, 22.8],
  [45, 26.8],
  [41.4, 29.6],
  [37.4, 31],
  [34.2, 30.2],
  [34.4, 25],
  [36, 16.5],
  [38.2, 9.4],
];

/**
 * The hair's lit chestnut, cut: the band court-12 paints just inside the ink
 * over the fringe, from the parting's top (457,289) down the brow's side to
 * (412,313), 4 to 11 pixels wide, #ae6a41 at its peak; the soft sheen falls
 * off inside it. Clipped to the hair.
 */
export const CHRIST_LIT: Pt[] = [
  [-3, -72],
  [-20, -72],
  [-29, -68],
  [-35, -63],
  [-42, -60],
  [-48, -56],
  [-52, -52],
  [-56, -47],
  [-57, -42],
  [-50, -41],
  [-48, -44],
  [-46, -47],
  [-42, -50],
  [-34, -53],
  [-30, -56],
  [-26, -59],
  [-21, -62],
  [-15, -65],
  [-6, -68],
  [-3, -69],
];

/**
 * The shade the beard lays on the lock behind it: court-12's dark band
 * between the beard's back edge and the lock (0.13 to 0.18 in value, 4 to 8
 * pixels wide), from under His ear to the jaw's ink. Its front edge runs
 * under the beard, which covers it; clipped to the hair.
 */
export const CHRIST_BEARD_SHADOW: Pt[] = [
  [34.5, 29],
  [32, 33.5],
  [30.5, 37],
  [28.6, 41],
  [26.6, 45],
  [24.2, 49],
  [20, 53],
  [26, 56],
  [34, 57],
  [35, 52],
  [33.5, 49],
  [35.5, 45],
  [37.5, 41],
  [38.5, 37],
  [38.5, 33],
  [38, 29.5],
];
