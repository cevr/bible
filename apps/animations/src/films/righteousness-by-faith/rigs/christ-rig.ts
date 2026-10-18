// Christ, composed of the house's parts (`figure`): one cast member with one
// body, frame and face in every beat (character-design 3.2), in two views of
// Him, each its own trace. His head and face are court-12's, traced there
// three-quarters (`christ-traced.ts`): long brown hair from a parting down
// behind His ear to His shoulder, a full beard with His mouth smiling in it
// and His lower lip under the smile, the face kit where court-12 sets His
// eyes and brows. Turned to us, they are court.you's (`christ-front-traced.ts`),
// and so are His robe's shoulders and His sash across His chest.
// His robe, gold sash and sandals are robe-5's, the kept concept that shows
// Him whole, drawn to the court's canon: robe-5's body scaled 0.705 across
// and 0.632 down under the beard, which lays it on court-12's robe within a
// pixel or two from the shoulders to the hands. How each part is cut, lit
// and drawn is the house's (`drawFigure`): His face lies over His beard, and
// each paper of His head tucks under those laid over it.
//
// Units are the Board's pixels, court-12 at scale 1: He stands 468 tall from
// His hair to His soles, 3.4 times His head's height (hair to the beard's
// foot, 137), at the top of the cast's height band; the lead's head top meets
// His eyes. His feet are the artboard's origin.
//
// The host poses Him by His view model, every frame: the face kit's numbers
// (`FACE`); `lean`, radians about His feet; `tilt`, radians, His head about
// His neck; `nod`, units, His head down toward His chest. The rig keeps its
// `breath` and the paper's `boil`.

import {
  Beard,
  Ear,
  Hair,
  Hands,
  Head,
  KitA,
  type Pt,
  Robe,
  Sandals,
  Stance,
  Stature,
  ellipse,
  figure,
  roundedPolygon,
  tracedKit,
} from '@bible/film/style';
import {
  FRONT_BEARD,
  FRONT_BEARD_LIT,
  FRONT_BEARD_SHADOW,
  FRONT_EARS,
  FRONT_HAIR,
  FRONT_LIP,
  FRONT_LIT,
  FRONT_LOCKS,
  FRONT_MARKS,
  FRONT_NECK,
  FRONT_NECK_SHADE,
  FRONT_PANEL,
  FRONT_REGION,
  FRONT_ROBE_SIDES,
  FRONT_SASH,
  FRONT_SHEEN,
} from './christ-front-traced.ts';
import {
  CHRIST_BEARD,
  CHRIST_BEARD_SHADOW,
  CHRIST_EAR,
  CHRIST_HAIR,
  CHRIST_LIT,
  CHRIST_REGION,
} from './christ-traced.ts';
import { PAPERS } from './papers.ts';

/** His head's centre from His feet, and the robe's top under His beard, units. */
const HEAD = { x: -2, y: -390.5 } as const;
const NECK = -322;

/** His breath: 5 s in and out, His trunk 0.8% taller from the hem at its top, His neck 2.5 units up with it. */
const BREATH = { period: 5, trunk: 1.008, neck: -2.5 } as const;

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

/**
 * The shade the beard lays on the hair beside it, the dark band both concepts
 * paint between the beard and the locks (court-12 and court.you, 0.13 to
 * 0.18 in value): a saturated brown at 0.16 (the ink's value, never its
 * grey), a step under each lock, so the beard's edge reads against the hair.
 */
const BEARD_SHADOW = '#29190f';

/**
 * His hair's tones (court-12): the window's soft light over the parting
 * (#a0653f), the lit chestnut cut just inside the ink over the fringe
 * (#ae6a41), and the beard's shade on the lock behind it.
 */
const HAIR_TONES = [
  { pts: ellipse(-30, -52, 16, 7, 14), color: '#8f5c3a', soft: true },
  { pts: CHRIST_LIT, color: '#a86640' },
  { pts: CHRIST_BEARD_SHADOW, color: BEARD_SHADOW },
] as const;

/**
 * His robe, as robe-5 cuts it on the court's canon: from under His beard
 * the shoulders fall to the sleeves' ends at His hands, the robe narrower
 * below them and flaring a little to a hem that sags at its middle.
 */
const ROBE_CUT: Pt[] = [
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
];
const ROBE_RADII = [
  20, 20, 6, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 6, 60, 6, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 6,
];

/** A cut robe's hem: the foot of its sagging middle, where the robe breathes about. */
const hemOf = (corners: ReadonlyArray<Pt>, radii: ReadonlyArray<number>) =>
  Math.max(...roundedPolygon(corners, radii).map(([, y]) => y));

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
const sashShade = (right: ReadonlyArray<Pt>): Pt[] => [
  ...right,
  ...right.map(([x, y]): Pt => [x - 7, y]).reverse(),
];
const SASH_SHADE = sashShade(SASH_RIGHT);

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

const ROBE_SHADING = { pts: ROBE_SHADE, color: '#cdbecb' } as const;
const SASH_TONES = [
  { pts: [...SASH_LEFT, ...[...SASH_RIGHT].reverse()], color: '#dca561' },
  { pts: SASH_SHADE, color: '#b8875a' },
] as const;
const NECK_SKIN = '#fbbb87';
const NECK_SKIN_SHADE = '#e59a76';

/** What lies on His robe three-quarters on: its shade, the sash, His skin in the robe's V. */
const ROBE_TONES = [
  ROBE_SHADING,
  ...SASH_TONES,
  { pts: NECKLINE, color: NECK_SKIN },
  { pts: NECK_SHADE, color: NECK_SKIN_SHADE },
] as const;

/** A sandal's sole: a dark leather (robe-5 draws it as heavy as the line). */
const SOLE = '#43291c';

/**
 * His sandals under the hem, as robe-5 sets them, the toes out: the near
 * foot's toe to screen left, a strap across it; the far foot a dome to
 * screen right.
 */
const SANDALS = Sandals({
  paper: PAPERS.christSkin,
  near: {
    corners: [
      [-97, -1],
      [-97, -7],
      [-80, -16.5],
      [-31, -18],
      [-30, -1],
    ],
    radii: [3, 5, 12, 2, 2],
    tones: [
      {
        pts: [
          [-75, -19],
          [-63, -19],
          [-49, -6],
          [-57, -6],
        ],
        color: '#6b4430',
      },
    ],
  },
  far: {
    corners: [
      [22, -1],
      [22, -17],
      [52, -16.5],
      [70, -5],
      [70, -1],
    ],
    radii: [2, 2, 12, 5, 3],
  },
  sole: SOLE,
});

/**
 * What every view of Him is: His artboard, His canon, His stance, His
 * sandals and His hands, 0.35 of His head across (the court lays each at
 * 1.08 times the house hand, `court-cast.ts`: 41 units across against His
 * head's 116).
 */
const HIM = {
  // Room round Him for His lean and His outline; His feet are the rig's origin.
  art: { width: 300, height: 520, feet: [150, 495] },
  stature: Stature.Canon(),
  stance: Stance.Standing({ breath: BREATH }),
  feet: SANDALS,
  hands: Hands({ paper: PAPERS.christHand, share: 0.35 }),
} as const;

/** His robe three-quarters on: robe-5's cut and paper. */
const ROBE = {
  corners: ROBE_CUT,
  radii: ROBE_RADII,
  hem: hemOf(ROBE_CUT, ROBE_RADII),
  paper: PAPERS.whiteRobe,
};

/** His lip's look: court-12's crescent, in either view. */
const lipOf = (outline: ReadonlyArray<Pt>) => ({ outline, paper: PAPERS.christLip });

/**
 * Christ three-quarters on (court-12), His face toward the accused at His
 * right (screen left): His head set 2 units left of His robe's middle,
 * uncanted; His ear in His hair; His face Kit A's marks where court-12
 * draws them, at rest the smile court-12 draws, His eyes on the accused.
 */
export const christ = figure({
  ...HIM,
  // `film match`'s concept: Christ beside the accused in court.12, the kept concept His head and face are traced from.
  concept: {
    image: { set: 'rbf-v3-concepts-2026-10-15', file: 'images/5-court-12.png' },
    box: [370, 270, 575, 760],
  },
  head: Head.Traced({
    view: 'threeQuarter',
    outline: CHRIST_REGION,
    y: HEAD.y,
    neck: NECK,
    set: { x: HEAD.x },
    paper: PAPERS.christSkin,
  }),
  beard: Beard({ outline: CHRIST_BEARD, paper: PAPERS.beard, lip: lipOf(LIP) }),
  ear: Ear.Traced({ outline: CHRIST_EAR, paper: PAPERS.christEar }),
  hair: Hair.Traced({ outline: CHRIST_HAIR, paper: PAPERS.brownHair, tones: HAIR_TONES }),
  face: KitA({
    x: 0,
    y: 0,
    scale: 1,
    shape: {
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
    rest: { mouth: 3 },
    gaze: [-300, 0],
  }),
  body: Robe.Cut({ ...ROBE, tones: ROBE_TONES }),
});

/** His numbers at rest: His eyes on the accused at His right (screen left), the smile court-12 draws. */
export const CHRIST_KNOBS = christ.knobs;

/** court.you's pixels to units about His head's centre. */
const fromFront = ([x, y]: Pt): Pt => [
  +((x - FRONT_PANEL.head[0]) * FRONT_PANEL.scale).toFixed(2),
  +((y - FRONT_PANEL.head[1]) * FRONT_PANEL.scale).toFixed(2),
];
const front = (pts: ReadonlyArray<Pt>) => pts.map(fromFront);
/** court.you's pixels to units from His feet, for what lies on the robe. */
const frontBody = (pts: ReadonlyArray<Pt>) =>
  front(pts).map(([x, y]): Pt => [+(x + HEAD.x).toFixed(2), +(y + HEAD.y).toFixed(2)]);

/**
 * The robe turned to us, court.you's sides on robe-5's cut: the shoulders
 * as court.you draws them, wider than the three-quarter figure's; past where
 * His hands cover court.you's edges, the far side runs on to the sleeve's
 * end and the near side down to robe-5's, and from the sleeves' ends round
 * the hem the robe is robe-5's (`ROBE_CUT`).
 */
const FRONT_ROBE_CUT: Pt[] = [
  [-32.4, -334],
  [44, -334],
  ...frontBody(FRONT_ROBE_SIDES.far),
  [100.5, -240],
  [101.5, -222],
  [101, -205],
  [100, -190],
  ...ROBE_CUT.slice(9, 26),
  ...frontBody(FRONT_ROBE_SIDES.near),
];
const FRONT_ROBE_RADII = [
  20,
  20,
  ...FRONT_ROBE_SIDES.far.map(() => 4),
  4,
  4,
  4,
  4,
  ...ROBE_RADII.slice(9, 26),
  ...FRONT_ROBE_SIDES.near.map(() => 4),
];
const FRONT_ROBE = {
  corners: FRONT_ROBE_CUT,
  radii: FRONT_ROBE_RADII,
  hem: hemOf(FRONT_ROBE_CUT, FRONT_ROBE_RADII),
  paper: PAPERS.whiteRobe,
};

/**
 * The sash turned to us, court.you's: from over the far shoulder across the
 * chest; past the rail's last baluster it runs on to robe-5's near hip, and
 * the robe's outline cuts what runs off it.
 */
const FRONT_SASH_RIGHT: Pt[] = [
  [80, -345],
  ...frontBody(FRONT_SASH.right),
  [-55, -86],
  [-66, -74],
  [-78, -62],
];
const FRONT_SASH_LEFT: Pt[] = [[40, -345], ...frontBody(FRONT_SASH.left), [-95, -130], [-95, -60]];

/** The robe turned to us: court.you's broad V under the beard, the sash laid over its right side. */
const FRONT_ROBE_TONES = [
  { pts: [...FRONT_SASH_RIGHT, [140, -62], [140, -345]] satisfies Pt[], color: ROBE_SHADING.color },
  { pts: frontBody(FRONT_NECK), color: NECK_SKIN },
  { pts: frontBody(FRONT_NECK_SHADE), color: NECK_SKIN_SHADE, soft: true },
  { pts: [...FRONT_SASH_LEFT, ...[...FRONT_SASH_RIGHT].reverse()], color: SASH_TONES[0].color },
  { pts: sashShade(FRONT_SASH_RIGHT), color: SASH_TONES[1].color },
] as const;
/** His head turned to us, in units about its centre: court.you's outline inside the ink. */
const FRONT_HEAD = front(FRONT_REGION);
/**
 * The locks beside the beard, as court.you paints them: the far one in the
 * shade (0.23 in value), the near one toward the window a step lighter
 * (0.30); the beard's shade band lies between each and the beard.
 */
const LOCK = { near: '#4c2e1e', far: '#3a241c' } as const;

/**
 * Christ turned to us (`court.you`, the kept try 2): the same figure, frame,
 * feet and hands, His robe and sash turned with Him, His head as court.you
 * draws it facing the viewer, both ears in His hair, His mouth open in the
 * smile, His face Kit A's marks traced there and turned as His eye line tips. The scene turns Him by showing
 * this artboard in place of `christ`'s.
 */
export const christFront = figure({
  ...HIM,
  // `film match`'s concept: court.you's kept try 2, His head turned to us.
  concept: {
    image: { set: 'rbf-v3-cast-2026-10-18', file: 'aids/court-you-2.png' },
    box: [700, 70, 1080, 760],
  },
  head: Head.Traced({
    view: 'front',
    outline: FRONT_HEAD,
    y: HEAD.y,
    neck: NECK,
    set: { x: HEAD.x },
    paper: PAPERS.christSkin,
  }),
  beard: Beard({
    outline: front(FRONT_BEARD),
    paper: PAPERS.beard,
    tones: [{ pts: front(FRONT_BEARD_LIT), color: PAPERS.beard.light, soft: true }],
    lip: lipOf(front(FRONT_LIP)),
  }),
  ear: Ear.Both({
    near: front(FRONT_EARS.near),
    far: front(FRONT_EARS.far),
    paper: PAPERS.christEar,
  }),
  hair: Hair.Traced({
    outline: front(FRONT_HAIR),
    paper: PAPERS.brownHair,
    tones: [
      { pts: front(FRONT_SHEEN), color: '#8d4f29', soft: true },
      { pts: front(FRONT_LIT), color: '#d08445' },
      { pts: front(FRONT_LOCKS.near), color: LOCK.near },
      { pts: front(FRONT_LOCKS.far), color: LOCK.far },
      { pts: front(FRONT_BEARD_SHADOW.near), color: BEARD_SHADOW },
      { pts: front(FRONT_BEARD_SHADOW.far), color: BEARD_SHADOW },
    ],
  }),
  face: KitA({ ...tracedKit(FRONT_MARKS, FRONT_PANEL, 0.5), rest: { mouth: 3 }, gaze: [0, 40] }),
  body: Robe.Cut({ ...FRONT_ROBE, tones: FRONT_ROBE_TONES }),
});

/** His numbers turned to us: His eyes on the viewer, the smile court.you draws. */
export const CHRIST_FRONT_KNOBS = christFront.knobs;

/** His timelines, either view: His breath and the paper's boil. */
export const CHRIST_TIMELINES = {
  breath: { seconds: BREATH.period, move: 5 },
  boil: { seconds: 4, move: 4 },
} as const;
export type ChristTimeline = keyof typeof CHRIST_TIMELINES;

/** The face `check` reads, in a view: its node, and His head's height in that view. */
const faceCheckOf = (outline: ReadonlyArray<Pt>) => {
  const ys = outline.map(([, y]) => y);
  return { node: 'face', height: Math.max(...ys) - Math.min(...ys) } as const;
};
export const CHRIST_FACE_CHECK = faceCheckOf(CHRIST_REGION);
export const CHRIST_FRONT_FACE_CHECK = faceCheckOf(FRONT_HEAD);
