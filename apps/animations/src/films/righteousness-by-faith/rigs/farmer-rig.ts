// The farmer of James 5:7, who waits for the early and the latter rain: one
// cast member, a robed figure (`robed-rig.ts`) drawn whole from rain.rain's
// kept try (try 2, `farmer-traced.ts`): his head turned three-quarters to
// his left and tipped up to the rain, a round face, full cheeks, his eyes
// set wide and his nose turned toward screen right, a round beard; an
// off-white headcloth bound with a brown band, its flap over his near
// shoulder; a tan tunic under a brown vest, his shoulders turned with his
// head; his hands free beside him, as every hand in the cast is. His
// face's marks are the face kit's, set and tipped where the panel draws
// them. The panel cuts him at his knees; below it his tunic runs straight
// on to its hem and his feet stand under it.
//
// Units are the cast's canon, the panel's pixels times 0.555 (`PANEL`): he
// stands 450 tall from his headcloth to his soles, 3.4 times his head's
// height (133), 0.96 of Christ's height, inside the cast's height band. His
// feet are the artboard's origin.

import type { Pt } from '@bible/film/style';
import {
  BAND,
  BAND_LIT,
  BEARD,
  CHEEK_SHADE,
  CLOTH,
  CLOTH_EDGE,
  FACE,
  HANDS,
  LIP,
  MARKS,
  NECK,
  NOSE,
  PANEL,
  TUNIC,
  TUNIC_FOLD,
  VEST_FAR,
  VEST_NEAR,
} from './farmer-traced.ts';
import { PAPERS, looked } from './papers.ts';
import { type Robed, robedKnobs } from './robed-rig.ts';
import { roundedPolygon } from './shapes.ts';

/** A panel point in canon units about `origin` (a panel point). */
const canon =
  (origin: Pt) =>
  ([x, y]: Pt): Pt => [
    +((x - origin[0]) * PANEL.scale).toFixed(2),
    +((y - origin[1]) * PANEL.scale).toFixed(2),
  ];
const fromHead = canon(PANEL.head);
const fromFeet = canon(PANEL.feet);
const headParts = (pts: ReadonlyArray<Pt>) => pts.map(fromHead);
const bodyParts = (pts: ReadonlyArray<Pt>) => pts.map(fromFeet);

/** His head's centre from his feet, and the tunic's top under his beard, units. */
const HEAD = { x: fromFeet(PANEL.head)[0], y: fromFeet(PANEL.head)[1] } as const;
const NECK_Y = fromFeet([0, 540])[1];

/** His vest, as rain.rain paints it (sampled): a dark brown wool, its far front turned toward rose. */
const WALNUT = '#714b38';
const WALNUT_SHADE = '#7a4d3f';
/** His headcloth's band: a brown a little warmer than the vest. */
const BAND_BROWN = '#7a5340';
/** The band's near end in the light: a tan. */
const BAND_TAN = '#d4965b';
/** The cloth's dark edge down his near cheek, as the panel paints it: near the ink, a warm black-brown. */
const CLOTH_DARK = '#35261c';
/** The shade down his nose, toward rose. */
const NOSE_SHADE = '#e3946a';
/** His near cheek in the cloth's shadow, as the panel paints it, turned 10° toward rose (CRAFT rule 12). */
const CHEEK_SKIN = '#e2906a';
/** His beard: one flat brown, as the panel paints it, with no turn across it. */
const BEARD_BROWN = '#5f412a';
/** His neck in the tunic's V, in the beard's shadow. */
const NECK_SKIN = '#e29662';

/**
 * His face's marks, panel pixels to the face kit's frame: about the middle
 * of his eyes, turned back by the tip of his head (the line through his
 * eyes, which the brows' follows), in canon units.
 */
const face = (() => {
  const [l, r] = MARKS.eyes;
  const c: Pt = [(l[0] + r[0]) / 2, (l[1] + r[1]) / 2];
  const rotation = Math.atan2(r[1] - l[1], r[0] - l[0]);
  const [cos, sin] = [Math.cos(-rotation), Math.sin(-rotation)];
  const local = ([x, y]: Pt): Pt => {
    const [dx, dy] = [x - c[0], y - c[1]];
    return [(dx * cos - dy * sin) * PANEL.scale, (dx * sin + dy * cos) * PANEL.scale];
  };
  const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const half = (a: Pt, b: Pt) => (Math.hypot(b[0] - a[0], b[1] - a[1]) / 2) * PANEL.scale;
  const [eyeL, eyeR] = [local(l), local(r)];
  const [browL, browR] = MARKS.brows.map(([a, b]) => local(mid(a, b)));
  const [mouthL, mouthR] = MARKS.mouth;
  const mouth = local(mid(mouthL, mouthR));
  const at = fromHead(c);
  const r2 = (v: number) => +v.toFixed(2);
  return {
    at: { x: at[0], y: at[1], scale: 1, rotation: r2(rotation) },
    marks: {
      eyes: [r2(eyeL[0]), r2(eyeR[0])],
      eyeY: r2((eyeL[1] + eyeR[1]) / 2),
      eye: [r2(MARKS.eye[0] * PANEL.scale), r2(MARKS.eye[1] * PANEL.scale)],
      turn: 1.5,
      brows: [r2(browL?.[0] ?? 0), r2(browR?.[0] ?? 0)],
      browY: r2(((browL?.[1] ?? 0) + (browR?.[1] ?? 0)) / 2),
      browHalf: r2(half(...MARKS.brows[1])),
      brow: r2(MARKS.brow * PANEL.scale),
      mouth: [r2(mouth[0]), r2(mouth[1])],
      mouthHalf: r2(half(mouthL, mouthR)),
      mouthLine: r2(MARKS.mouthLine * PANEL.scale),
    },
  } as const;
})();

/** A sandal's sole under a foot: its last 6.5 units, a dark leather. */
const SOLE = '#43291c';

/** His feet under the hem, the toes out, as wide apart as his tunic is wide. */
const NEAR_FOOT = roundedPolygon(
  [
    [-88, -1],
    [-88, -8],
    [-76, -17],
    [-40, -18],
    [-39, -1],
  ],
  [3, 5, 10, 2, 2],
);
const FAR_FOOT = roundedPolygon(
  [
    [30, -1],
    [30, -18],
    [64, -17],
    [94, -6],
    [94, -1],
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
  [-70, -18],
  [-59, -18],
  [-48, -6],
  [-56, -6],
];

export const FARMER: Robed = {
  art: { width: 360, height: 520, feet: [160, 495] },
  head: HEAD,
  neck: NECK_Y,
  outline: headParts(FACE),
  skin: looked(PAPERS.farmerFace, {
    tones: [
      { pts: headParts(NOSE), color: NOSE_SHADE },
      { pts: headParts(CHEEK_SHADE), color: CHEEK_SKIN },
    ],
  }),
  face: face.at,
  marks: face.marks,
  cut: [
    {
      key: 'lip',
      pts: headParts(LIP),
      look: { color: '#dd9262', light: '#dd9262', ink: 'none', shadow: 0 },
    },
    {
      key: 'beard',
      pts: headParts(BEARD),
      look: { color: BEARD_BROWN, light: BEARD_BROWN, ink: 'none', shadow: 0 },
    },
    {
      key: 'band',
      pts: headParts(BAND),
      look: {
        color: BAND_BROWN,
        light: BAND_BROWN,
        ink: 'none',
        shadow: 0,
        tones: [{ pts: headParts(BAND_LIT), color: BAND_TAN }],
      },
    },
    {
      key: 'cloth',
      pts: headParts(CLOTH),
      look: looked(PAPERS.headcloth, {
        tones: [{ pts: headParts(CLOTH_EDGE), color: CLOTH_DARK }],
      }),
    },
  ],
  robe: bodyParts(TUNIC),
  robeLook: looked(PAPERS.linen, {
    tones: [
      { pts: bodyParts(TUNIC_FOLD), color: PAPERS.linen.shade },
      { pts: bodyParts(VEST_NEAR), color: WALNUT },
      { pts: bodyParts(VEST_FAR), color: WALNUT_SHADE },
      { pts: bodyParts(NECK), color: NECK_SKIN },
    ],
  }),
  feet: [
    {
      key: 'footNear',
      pts: NEAR_FOOT,
      look: looked(PAPERS.farmerSkin, {
        tones: [
          { pts: STRAP, color: '#6b4430' },
          { pts: soleOf(-88, -39), color: SOLE },
        ],
      }),
    },
    {
      key: 'footFar',
      pts: FAR_FOOT,
      look: looked(PAPERS.farmerSkin, { tones: [{ pts: soleOf(30, 94), color: SOLE }] }),
    },
  ],
  breath: 5,
};

/** His hands' centres from his feet, units: the near one down, the far one at rest and raised (`HANDS`). */
export const FARMER_HANDS = {
  near: fromFeet(HANDS.near),
  far: fromFeet(HANDS.far),
  raised: fromFeet(HANDS.raised),
} as const;

/** His numbers at rest: his face lifted to the rain at screen right, the smile rain.rain draws. */
export const FARMER_KNOBS = robedKnobs([260, HEAD.y - 160], { mouth: 2.5, browTilt: 0.25 });
