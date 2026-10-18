// Christ as a robed figure (`robed-rig.ts`), one cast member with one body,
// frame and face in every beat (character-design 3.2). His head and face
// are court-12's, traced there (`christ-traced.ts`): long brown hair from a
// parting down behind His ear to His shoulder, a full beard with His mouth
// smiling in it, the face kit where court-12 sets His eyes and brows. His
// robe, gold sash and sandals are robe-5's, the kept concept that shows Him
// whole, drawn to the court's canon: robe-5's body scaled 0.705 across and
// 0.632 down under the beard, which lays it on court-12's robe within a
// pixel or two from the shoulders to the hands.
//
// Units are the Board's pixels, court-12 at scale 1: He stands 468 tall from
// His hair to His soles, 3.4 times His head's height (hair to the beard's
// foot, 137), at the top of the cast's height band; the lead's head top meets
// His eyes. His feet are the artboard's origin.

import type { Pt } from '@bible/film/style';
import { ellipse } from '@bible/film/style/rig';
import { CHRIST_BEARD, CHRIST_EAR, CHRIST_HAIR, CHRIST_REGION } from './christ-traced.ts';
import { PAPERS, looked } from './papers.ts';
import { type Robed, robedKnobs } from './robed-rig.ts';
import { roundedPolygon } from './shapes.ts';

/** His head's centre from His feet, and the robe's top under His beard, units. */
const HEAD = { x: -2, y: -390.5 } as const;
const NECK = -322;

/** His lower lip under the smile in His beard, about His head's centre: court-12's pale crescent. */
const LIP = roundedPolygon(
  [
    [-38, 39.5],
    [-27.5, 42.5],
    [-17, 39.5],
    [-18, 45.5],
    [-27.5, 48],
    [-37, 45.5],
  ],
  2,
);

/** The light where the window catches His hair over the parting (court-12 #a0653f), soft. */
const SHEEN = [{ pts: ellipse(-30, -52, 16, 7, 14), color: '#8f5c3a', soft: true }] as const;

/**
 * His robe, as robe-5 cuts it on the court's canon: from under His beard
 * the shoulders fall to the sleeves' ends at His hands, the robe narrower
 * below them and flaring a little to a hem that sags at its middle.
 */
const ROBE = roundedPolygon(
  [
    [-32.4, -334],
    [31, -334],
    [51.5, -312],
    [57.1, -299.4],
    [64.9, -274.1],
    [71.2, -248.8],
    [75.4, -223.6],
    [79.7, -198.3],
    [80.4, -188.2],
    [60.6, -154.1],
    [62.7, -122.5],
    [65.6, -97.3],
    [67.7, -72],
    [70.5, -46.7],
    [71.9, -24],
    [0, -19],
    [-79.7, -24],
    [-77.6, -46.7],
    [-74.7, -72],
    [-71.9, -97.3],
    [-69.1, -122.5],
    [-66.3, -154.1],
    [-83.9, -188.2],
    [-82.5, -198.3],
    [-76.8, -223.6],
    [-71.2, -248.8],
    [-64.2, -274.1],
    [-56.4, -299.4],
    [-49.4, -312],
  ],
  [20, 20, 6, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 6, 60, 6, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 6],
);

/**
 * The gold sash's right edge, court-12's from His far shoulder down to where
 * the dock hides it, then robe-5's to its end at His near side; its left
 * edge runs off the robe there, so the robe's outline cuts it.
 */
const SASH_RIGHT: Pt[] = [
  [40, -345],
  [38, -322],
  [48, -306],
  [45, -282],
  [42, -266],
  [37, -250],
  [31, -226],
  [23, -202],
  [16, -186],
  [8, -170],
  [0, -154],
  [-9, -138],
  [-21, -122],
  [-38, -104],
  [-55, -86],
  [-66, -74],
  [-78, -62],
];
const SASH_LEFT: Pt[] = [
  [24, -345],
  [22, -322],
  [15, -306],
  [5, -282],
  [-7, -258],
  [-20, -234],
  [-35, -210],
  [-47, -194],
  [-55, -178],
  [-64, -162],
  [-73, -148],
  [-95, -140],
  [-95, -60],
];

/** The sash's shade: a band along its right edge, 7 units across (court-12 #b48457 on #dca561). */
const SASH_SHADE: Pt[] = [...SASH_RIGHT, ...SASH_RIGHT.map(([x, y]): Pt => [x - 7, y]).reverse()];

/** The neckline: His skin in the robe's V under the beard, its top in the beard's shadow. */
const NECKLINE = roundedPolygon(
  [
    [-25, -330],
    [13, -330],
    [-10, -285],
  ],
  4,
);
const NECK_SHADE: Pt[] = [
  [-25, -330],
  [13, -330],
  [6, -312],
  [-17, -312],
];

/** The robe's shade: all of it past the sash's right edge, a lilac (court-12 #cdbecb), its edge the sash's. */
const ROBE_SHADE: Pt[] = [...SASH_RIGHT, [140, -62], [140, -345]];

const ROBE_TONES = [
  { pts: ROBE_SHADE, color: '#cdbecb' },
  { pts: [...SASH_LEFT, ...[...SASH_RIGHT].reverse()], color: '#dca561' },
  { pts: SASH_SHADE, color: '#b8875a' },
  { pts: NECKLINE, color: '#fbbb87' },
  { pts: NECK_SHADE, color: '#e59a76' },
] as const;

/** A sandal's sole under a foot: its last 6.5 units, a dark leather (robe-5 draws it as heavy as the line). */
const SOLE = '#43291c';

/**
 * His feet under the hem, as robe-5 sets them, the toes out: the near foot's
 * toe to screen left, a strap across it; the far foot a dome to screen right.
 */
const NEAR_FOOT = roundedPolygon(
  [
    [-97, -1],
    [-97, -7],
    [-80, -16.5],
    [-31, -18],
    [-30, -1],
  ],
  [3, 5, 12, 2, 2],
);
const FAR_FOOT = roundedPolygon(
  [
    [22, -1],
    [22, -17],
    [52, -16.5],
    [70, -5],
    [70, -1],
  ],
  [2, 2, 12, 5, 3],
);
const soleOf = (x0: number, x1: number): Pt[] => [
  [x0 - 4, -6.5],
  [x1 + 4, -6.5],
  [x1 + 4, 4],
  [x0 - 4, 4],
];
const STRAP: Pt[] = [
  [-75, -19],
  [-63, -19],
  [-49, -6],
  [-57, -6],
];

export const CHRIST: Robed = {
  art: { width: 300, height: 520, feet: [150, 495] },
  head: HEAD,
  neck: NECK,
  outline: CHRIST_REGION,
  skin: looked(PAPERS.christSkin),
  face: { x: 0, y: 0, scale: 1 },
  marks: {
    eyes: [-41, -12.4],
    eyeY: 0.9,
    eye: [9.5, 17.5],
    turn: 0.5,
    brows: [-39.8, -7.3],
    browY: -19,
    browHalf: 7.6,
    brow: 5,
    mouth: [-27.5, 39.5],
    mouthHalf: 10.5,
    mouthLine: 3.5,
  },
  cut: [
    { key: 'lip', pts: LIP, look: { color: '#dc8e64', light: '#dc8e64', ink: 'none', shadow: 0 } },
    { key: 'beard', pts: CHRIST_BEARD, look: looked(PAPERS.beard) },
    { key: 'ear', pts: CHRIST_EAR, look: looked(PAPERS.christEar), boil: 0.6 },
    { key: 'hair', pts: CHRIST_HAIR, look: looked(PAPERS.brownHair, { tones: SHEEN }) },
  ],
  robe: ROBE,
  robeLook: looked(PAPERS.whiteRobe, { tones: ROBE_TONES }),
  feet: [
    {
      key: 'footNear',
      pts: NEAR_FOOT,
      look: looked(PAPERS.christSkin, {
        tones: [
          { pts: STRAP, color: '#6b4430' },
          { pts: soleOf(-97, -30), color: SOLE },
        ],
      }),
    },
    {
      key: 'footFar',
      pts: FAR_FOOT,
      look: looked(PAPERS.christSkin, { tones: [{ pts: soleOf(22, 70), color: SOLE }] }),
    },
  ],
  breath: 5,
};

/** His numbers at rest: His eyes on the accused at His right (screen left), the smile court-12 draws. */
export const CHRIST_KNOBS = robedKnobs([-300, HEAD.y], { mouth: 3 });
