// The farmer of James 5:7, who waits for the early and the latter rain: one
// cast member, a robed figure (`robed-rig.ts`) in rain.rain's dress: a tan
// tunic under a brown vest, and an off-white headcloth bound with a brown
// band. His head, headcloth and beard are rain.rain's, the kept
// Board try (`farmer-traced.ts`), his face lifted toward screen right. No
// kept frame shows him whole, so his body below the beard is robe-5's middle
// figure, the nearest kept full figure, drawn to the cast's canon: 0.705
// across, as Christ's body is from the same concept, and 0.667 down, his
// shoulders to his soles.
//
// Units are the Board's pixels at the canon: he stands 450 tall from his
// headcloth to his soles, 3.4 times his head's height (133), 0.96 of Christ's
// height, inside the cast's height band. His feet are the artboard's origin.

import type { Pt } from '@bible/film/style';
import {
  FARMER_BAND,
  FARMER_BEARD,
  FARMER_CLOTH,
  FARMER_HEAD,
  FARMER_LIP,
} from './farmer-traced.ts';
import { PAPERS, looked } from './papers.ts';
import { type Robed, robedKnobs } from './robed-rig.ts';
import { roundedPolygon } from './shapes.ts';

/** His head's centre from his feet, and the robe's top under his beard, units. */
const HEAD = { x: -11, y: -379.8 } as const;
const NECK = -313;

/** His vest, as rain.rain paints it: a dark brown wool, its shade turned toward rose. */
const WALNUT = '#7a5039';
const WALNUT_SHADE = '#6c4445';
/** His headcloth's band across his brow: a lighter brown than the vest. */
const BAND = '#8a5f45';

/**
 * His tunic, as robe-5's middle figure cuts it: from under his beard the
 * shoulders fall to the sleeves' ends at his hands, the tunic narrower below
 * them and flaring a little to a hem that sags at its middle.
 */
const TUNIC = roundedPolygon(
  [
    [-28, -325],
    [28, -325],
    [48, -311],
    [55.3, -298],
    [61.7, -278],
    [68.7, -251.3],
    [75.1, -224.6],
    [81.4, -198],
    [87, -187],
    [69.4, -150],
    [73, -117.9],
    [78.6, -64.5],
    [81.4, -37.9],
    [85.7, -23.2],
    [0, -19],
    [-89.2, -23.2],
    [-82.8, -37.9],
    [-79.3, -64.5],
    [-70.9, -117.9],
    [-66.6, -150],
    [-89, -187],
    [-83.5, -198],
    [-77.9, -224.6],
    [-70.9, -251.3],
    [-62.4, -278],
    [-54.6, -298],
    [-48, -311],
  ],
  [18, 18, 6, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 6, 60, 6, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 6],
);

/**
 * The mantle's two fronts, open down his middle over the tunic (rain.rain:
 * about 30 units of tunic each side of his middle), their outer edges inside
 * his sleeves down to his hands and out past the tunic's sides below them,
 * where the tunic's outline cuts them.
 */
const mantle = (side: 1 | -1): Pt[] =>
  (
    [
      [27, -335],
      [44, -335],
      [46, -290],
      [50, -240],
      [54, -190],
      [56, -160],
      [120, -150],
      [120, -10],
      [36, -10],
      [32, -150],
      [29, -250],
    ] as const
  ).map(([x, y]): Pt => [side * x, y]);

/** The tunic's shade: its far half, from his middle out, its tan turned toward rose. */
const TUNIC_SHADE: Pt[] = [
  [8, -340],
  [12, -10],
  [140, -10],
  [140, -340],
];

/** The neckline: his skin in the tunic's V under the beard, its top in the beard's shadow. */
const NECKLINE = roundedPolygon(
  [
    [-27, -326],
    [27, -326],
    [4, -272],
  ],
  4,
);
const NECK_SHADE: Pt[] = [
  [-27, -326],
  [27, -326],
  [19, -308],
  [-19, -308],
];

const TUNIC_TONES = [
  { pts: TUNIC_SHADE, color: PAPERS.linen.shade },
  { pts: mantle(-1), color: WALNUT },
  { pts: mantle(1), color: WALNUT_SHADE },
  { pts: NECKLINE, color: '#f0ad70' },
  { pts: NECK_SHADE, color: '#d98d68' },
] as const;

/** A sandal's sole under a foot: its last 6.5 units, a dark leather. */
const SOLE = '#43291c';

/** His feet under the hem, as robe-5's middle figure sets them, the toes out. */
const NEAR_FOOT = roundedPolygon(
  [
    [-80, -1],
    [-80, -8],
    [-68, -17],
    [-34, -18],
    [-33, -1],
  ],
  [3, 5, 10, 2, 2],
);
const FAR_FOOT = roundedPolygon(
  [
    [27, -1],
    [27, -18],
    [60, -17],
    [90, -6],
    [90, -1],
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
  [-62, -18],
  [-51, -18],
  [-40, -6],
  [-48, -6],
];

export const FARMER: Robed = {
  art: { width: 300, height: 500, feet: [150, 475] },
  head: HEAD,
  neck: NECK,
  outline: FARMER_HEAD,
  skin: looked(PAPERS.farmerSkin),
  face: { x: 0, y: 0, scale: 1 },
  marks: {
    eyes: [13.1, 42.5],
    eyeY: -7.1,
    eye: [6.8, 12.5],
    turn: 1.5,
    brows: [3.1, 36.7],
    browY: -25.7,
    browHalf: 5.8,
    brow: 4.4,
    mouth: [41.7, 32.3],
    mouthHalf: 5,
    mouthLine: 3,
  },
  cut: [
    {
      key: 'lip',
      pts: FARMER_LIP,
      look: { color: '#dd9262', light: '#dd9262', ink: 'none', shadow: 0 },
    },
    { key: 'beard', pts: FARMER_BEARD, look: looked(PAPERS.beard) },
    {
      key: 'band',
      pts: FARMER_BAND,
      look: { color: BAND, light: BAND, ink: 'none', shadow: 0 },
    },
    { key: 'cloth', pts: FARMER_CLOTH, look: looked(PAPERS.headcloth) },
  ],
  robe: TUNIC,
  robeLook: looked(PAPERS.linen, { tones: TUNIC_TONES }),
  feet: [
    {
      key: 'footNear',
      pts: NEAR_FOOT,
      look: looked(PAPERS.farmerSkin, {
        tones: [
          { pts: STRAP, color: '#6b4430' },
          { pts: soleOf(-80, -33), color: SOLE },
        ],
      }),
    },
    {
      key: 'footFar',
      pts: FAR_FOOT,
      look: looked(PAPERS.farmerSkin, { tones: [{ pts: soleOf(27, 90), color: SOLE }] }),
    },
  ],
  breath: 5,
};

/** His numbers at rest: his face lifted to the rain at screen right, the smile rain.rain draws. */
export const FARMER_KNOBS = robedKnobs([260, HEAD.y - 160], { mouth: 2.5 });
