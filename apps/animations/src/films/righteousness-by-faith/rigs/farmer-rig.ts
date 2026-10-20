// The farmer of James 5:7, who waits for the early and the latter rain: one
// cast member, composed of the house's parts (`figure`), drawn whole from
// rain.rain's kept try (try 2, `farmer-traced.ts`): his head turned
// three-quarters to his left and tipped up to the rain, a round face, full
// cheeks, his eyes set wide and his nose turned toward screen right, a round
// beard; an off-white headcloth bound with a brown band, its flap over his
// near shoulder; a tan tunic under a brown vest, his shoulders turned with
// his head; his arms in the tunic's sleeves to the wrist, a circle hand at
// the end of each: the near one down his side on the tunic, the far one his
// own paper behind the tunic's, cut in one outline with it, that the host
// swings from his side up to the rain (`FARMER_ARM`). His face's marks are
// the face kit's, set and tipped where the panel draws them. The panel cuts
// him at his knees; below it his tunic runs straight on to its hem and his
// feet stand under it. How each part is cut, lit and drawn is the house's
// (`drawFigure`): his face lies over his beard, and each paper of his head
// tucks under those laid over it.
//
// Units are the cast's canon, the panel's pixels times 0.555 (`PANEL`): he
// stands 450 tall from his headcloth to his soles, 3.4 times his head's
// height (133), 0.96 of Christ's height, inside the cast's height band. His
// feet are the artboard's origin.
//
// The host poses him by his view model, every frame: the face kit's numbers
// (`FACE`); `lean`, radians about his feet; `tilt`, radians, his head about
// his neck; `nod`, units, his head down toward his chest; `farArm`, radians,
// his far arm about its pivot from the raised pose it is traced in. The rig
// keeps its `breath` and the paper's `boil`.

import {
  Arm,
  Beard,
  Hands,
  Head,
  Headcloth,
  KitA,
  type Pt,
  Robe,
  Sandals,
  Stance,
  Stature,
  figure,
  armHand,
  tracedKit,
} from '@bible/film/style';
import {
  ARM_PIVOT,
  BAND,
  BAND_LIT,
  BEARD,
  CHEEK_SHADE,
  CHEEK_SOFT,
  CLOTH,
  CLOTH_BROW,
  CLOTH_EDGE,
  CLOTH_EDGE_BROWN,
  CLOTH_EDGE_DUSK,
  FACE,
  FAR_CUFF,
  FAR_SLEEVE,
  FAR_SLEEVE_LIT,
  HANDS,
  LIP,
  MARKS,
  NEAR_SLEEVE,
  NECK,
  NOSE,
  PANEL,
  TUNIC,
  TUNIC_FOLD,
  VEST_FAR,
  VEST_NEAR,
} from './farmer-traced.ts';
import { PAPERS } from './papers.ts';

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

/** His breath: 5 s in and out, his trunk 0.8% taller from the hem at its top, his neck 2.5 units up with it. */
const BREATH = { period: 5, trunk: 1.008, neck: -2.5 } as const;

/** His vest, as rain.rain paints it (sampled): a dark brown wool, its far front turned toward rose. */
const WALNUT = '#714b38';
const WALNUT_SHADE = '#7a4d3f';
/** The band's near end in the light: a tan. */
const BAND_TAN = '#d4965b';
/** The cloth's edge above his cheek, as the panel paints it (sampled): a brown at his eyes, a darker one under them. */
const CLOTH_EDGE_UPPER = '#553a26';
const CLOTH_EDGE_MID = '#46301f';
/** The shade down his nose, as the panel paints it: richer than the skin, toward rose. */
const NOSE_SHADE = '#db8b59';
/** His near cheek in the cloth's shadow, as the panel paints it: turned 5° toward rose from the lit skin (CRAFT rule 12). */
const CHEEK_SKIN = '#e39964';
/** Half way from the lit skin to the cheek's shade: the shade's soft inner edge. */
const CHEEK_HALF = '#eca66b';
/** His near sleeve, as the panel paints it: the tunic's tan a step into its shade. */
const NEAR_SLEEVE_TAN = '#cb9f74';
/** The far sleeve's open cuff in shadow under his hand, as the panel paints it. */
const CUFF_SHADE = '#946f56';
/** His neck in the tunic's V, in the beard's shadow. */
const NECK_SKIN = '#e29662';

/** His eyes' lean past the eye line's tip: the panel leans them 20° from upright, the line tips them 10°. */
const EYE_LEAN = -0.175;

/** His face's marks as the panel draws them, in the face kit's frame about his eyes' middle, the features' turn 1.5. */
const KIT = tracedKit(MARKS, PANEL, 1.5);

/** Half his far brow's length, units: the kit draws both his brows that long. */
const BROW_HALF = (() => {
  const [[x0, y0], [x1, y1]] = MARKS.brows[1];
  return +((Math.hypot(x1 - x0, y1 - y0) / 2) * PANEL.scale).toFixed(2);
})();

/** A sandal's sole under a foot: a dark leather. */
const SOLE = '#43291c';

/** His sandals under the hem, the toes out, as wide apart as his tunic is wide: a strap across the near foot. */
const SANDALS = Sandals({
  paper: PAPERS.farmerSkin,
  near: {
    corners: [
      [-88, -1],
      [-88, -8],
      [-76, -17],
      [-40, -18],
      [-39, -1],
    ],
    radii: [3, 5, 10, 2, 2],
    tones: [
      {
        pts: [
          [-70, -18],
          [-59, -18],
          [-48, -6],
          [-56, -6],
        ],
        color: '#6b4430',
      },
    ],
  },
  far: {
    corners: [
      [30, -1],
      [30, -18],
      [64, -17],
      [94, -6],
      [94, -1],
    ],
    radii: [2, 2, 12, 5, 3],
  },
  sole: SOLE,
});

/** His tunic from his feet, as the panel cuts it and below its foot runs on to the hem. */
const TUNIC_OUTLINE = bodyParts(TUNIC);

/** His tunic's hem: its lowest point, where it breathes about. */
const HEM = Math.max(...TUNIC_OUTLINE.map(([, y]) => y));

/** His hands' centres from his feet, units: the near one at its cuff, the far one at rest and raised (`HANDS`). */
export const FARMER_HANDS = {
  near: fromFeet(HANDS.near),
  far: fromFeet(HANDS.far),
  raised: fromFeet(HANDS.raised),
} as const;

/** His far arm's pivot, and its hand raised at its cuff: the pose its sleeve is traced in (`HANDS.raised`). */
const PIVOT = fromFeet(ARM_PIVOT);
const RAISED = FARMER_HANDS.raised;

/** The turn about `PIVOT` that takes the raised hand to the hand at rest by his side: his far arm's number at rest. */
const REST = (() => {
  const angle = ([x, y]: Pt) => Math.atan2(y - PIVOT[1], x - PIVOT[0]);
  return +(angle(FARMER_HANDS.far) - angle(RAISED)).toFixed(4);
})();

/** His far arm in its sleeve, traced raised, its paper his tunic's sleeve's with the light along its top and its cuff's shade. */
const FAR_ARM = Arm({
  pivot: PIVOT,
  rest: REST,
  outline: bodyParts(FAR_SLEEVE),
  hand: RAISED,
  paper: PAPERS.farmerSleeve,
  tones: [
    { pts: bodyParts(FAR_SLEEVE_LIT), color: PAPERS.linen.light },
    { pts: bodyParts(FAR_CUFF), color: CUFF_SHADE },
  ],
});

/**
 * The farmer in rain.rain: his headcloth, his beard with his lip in it, his
 * face Kit A's marks where the panel draws them, at rest the smile it
 * draws, his face lifted to the rain at screen right; his tunic with his
 * near sleeve, his vest and the shade of a fold laid on it; his far arm in
 * its sleeve behind it, at rest down his side; his hands 0.4 of his head
 * across (rain.rain draws them 66 px across, his face 165).
 */
export const farmer = figure({
  // Room round him for his lean and his outline; his feet are the rig's origin.
  art: { width: 360, height: 520, feet: [160, 495] },
  // `film match`'s concept: the farmer in rain.rain, the kept Board try his head is traced from, its
  // ink closed under his beard and where his headcloth meets his mantle (the Board draws none there,
  // so the face's fill ran into his body); cut at his chest, as the Board cuts him at his waist.
  concept: {
    image: { set: 'rbf-v3-cast-2026-10-18', file: 'aids/farmer-head-closed.png' },
    box: [190, 280, 720, 760],
  },
  stature: Stature.Canon(),
  stance: Stance.Standing({ breath: BREATH }),
  head: Head.Traced({
    view: 'threeQuarter',
    outline: headParts(FACE),
    y: HEAD.y,
    neck: NECK_Y,
    set: { x: HEAD.x },
    paper: PAPERS.farmerFace,
    tones: [
      { pts: headParts(CLOTH_BROW), color: PAPERS.headcloth.shade },
      { pts: headParts(NOSE), color: NOSE_SHADE },
      { pts: headParts(CHEEK_SOFT), color: CHEEK_HALF },
      { pts: headParts(CHEEK_SHADE), color: CHEEK_SKIN },
    ],
  }),
  beard: Beard({
    outline: headParts(BEARD),
    paper: PAPERS.farmerBeard,
    lip: { outline: headParts(LIP), paper: PAPERS.farmerLip },
  }),
  headcloth: Headcloth({
    outline: headParts(CLOTH),
    paper: PAPERS.headcloth,
    band: {
      outline: headParts(BAND),
      paper: PAPERS.headclothBand,
      tones: [{ pts: headParts(BAND_LIT), color: BAND_TAN }],
    },
    edge: {
      outline: headParts(CLOTH_EDGE),
      paper: PAPERS.headclothEdge,
      tones: [
        { pts: headParts(CLOTH_EDGE_BROWN), color: CLOTH_EDGE_UPPER },
        { pts: headParts(CLOTH_EDGE_DUSK), color: CLOTH_EDGE_MID },
      ],
    },
  }),
  face: KitA({
    ...KIT,
    shape: { ...KIT.shape, browHalf: BROW_HALF },
    eyeLean: EYE_LEAN,
    rest: { mouth: 2.5, browTilt: 0.25 },
    gaze: [260, -160],
  }),
  body: Robe.Traced({
    outline: TUNIC_OUTLINE,
    hem: HEM,
    paper: PAPERS.linen,
    tones: [
      { pts: bodyParts(NEAR_SLEEVE), color: NEAR_SLEEVE_TAN },
      { pts: bodyParts(TUNIC_FOLD), color: PAPERS.linen.shade },
      { pts: bodyParts(VEST_NEAR), color: WALNUT },
      { pts: bodyParts(VEST_FAR), color: WALNUT_SHADE },
      { pts: bodyParts(NECK), color: NECK_SKIN, skin: true },
    ],
  }),
  arms: {
    far: FAR_ARM,
  },
  feet: SANDALS,
  hands: Hands({ paper: PAPERS.farmerHand, share: 0.4 }),
});

/**
 * His far arm: its turn at rest, radians from the raised pose it is traced
 * in, and `hand`, the centre of its hand at its cuff at a turn (`armHand`).
 */
export const FARMER_ARM = {
  rest: REST,
  hand: (turn: number): Pt => armHand(FAR_ARM, turn),
} as const;

/** His numbers at rest: his face lifted to the rain at screen right, the smile rain.rain draws, his far arm down. */
export const FARMER_KNOBS = farmer.knobs;

/** The face `check` reads: its node, and his head's height. */
export const FARMER_FACE_CHECK = (() => {
  const ys = headParts(FACE).map(([, y]) => y);
  return { node: 'face', height: Math.max(...ys) - Math.min(...ys) } as const;
})();
