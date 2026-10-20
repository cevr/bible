// The lead of RBF, composed of the house's parts (`figure`), traced from the
// front view of the cast sheets the owner kept as him (candidate 9, ask
// `a8fb2170353`; `lead-traced.ts`): wavy brown hair over his ears' tops and
// down beside them, no beard; a teal top with a round neck, his chin met by
// the shade it lays on his neck and no line (`chin: 'open'`); his arms in
// its sleeves, each bent at its elbow, lying on the top in one outline with
// it, a crease of shade down each arm's inner edge, each upper sleeve
// turning on a ball at its shoulder under the shoulder the top keeps in the
// sleeve's colour (`YOKE`); khaki trousers, two legs either side of a line,
// a brown waist band under the hem, which meets them with no line; brown
// shoes. His
// face is Kit A's marks where the sheet draws them; the stain on his top and
// the white top he is given over it. His circle hands are drawn by the host
// where his arms reach (`LEAD_ARMS`, each from its own artboard,
// `drawHand`), so the rig is the body alone. How each part is cut, lit and
// drawn is the house's (`drawFigure`). The owner locked him (ask
// `a92f276635e`, 2026-10-17): `lead.lock.json` holds his print, and only an
// override citing the owner's decision on him, filed after the lock, frees
// a change to it (FigureLock, `@bible/film/style`'s `lock.ts`).
//
// Units are the cast's canon, the sheet's pixels times 0.693 (`PANEL`): he
// stands 440 tall from his hair to his soles, 3.36 times his head's height,
// 0.94 of Christ's. His feet are the artboard's origin.
//
// The host poses him by the view model `Lead`, every frame:
// - the face kit's numbers (`FACE`);
// - `lean`, radians about his feet; `tilt`, radians, his head about his
//   neck; `nod`, units, his head sinking toward his top (a bow);
// - `nearArm`, `farArm`, radians, each upper sleeve about its shoulder, and
//   `nearElbow`, `farElbow`, each forearm about its elbow, from the pose he
//   stands in (`LEAD_ARMS` reaches a hand to a point);
// - `stain`, the scarlet blot on his top, 0..1; `robe`, the white top laid
//   over his own, 0..1.
// The rig keeps its `breath` and the paper's `boil`.

import {
  Ear,
  GivenRobe,
  Hands,
  Head,
  HAND_ART,
  Hair,
  JointedArm,
  KitA,
  type Pt,
  Robe,
  Stain,
  Stance,
  Stature,
  Trousers,
  armReach,
  figure,
  tracedKit,
} from '@bible/film/style';
import LEAD_LOCK from './lead.lock.json' with { type: 'json' };
import {
  CHIN,
  EAR_FAR,
  EAR_NEAR,
  FACE_LIT,
  FAR_ARM,
  FAR_CREASE,
  HAIR,
  HAIR_LIT,
  HAIR_SHADE,
  HANDS,
  HEAD,
  LEG_FAR,
  LEG_LIT,
  LEG_NEAR,
  MARKS,
  NEAR_ARM,
  NEAR_CREASE,
  NEAR_LIT,
  NECK,
  NECK_SHADE,
  PANEL,
  SHOE_FAR,
  SHOE_LIT,
  SHOE_NEAR,
  TOP,
  TOP_SHADE,
  WAIST_FAR,
  WAIST_NEAR,
  YOKE,
} from './lead-traced.ts';
import { PAPERS, STAIN } from './papers.ts';

/** A sheet point in canon units about `origin` (a sheet point). */
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
type SheetTones = ReadonlyArray<{ readonly pts: ReadonlyArray<Pt>; readonly color: `#${string}` }>;
const headTones = (ts: SheetTones) => ts.map((t) => ({ pts: headParts(t.pts), color: t.color }));
const bodyTones = (ts: SheetTones) => ts.map((t) => ({ pts: bodyParts(t.pts), color: t.color }));

/** His head's outline from its centre, units. */
const HEAD_OUTLINE = headParts(HEAD);

/** His top from his feet, as the sheet cuts it, and its hem: its lowest point, where it breathes about. */
const TOP_OUTLINE = bodyParts(TOP);
const HEM = Math.max(...TOP_OUTLINE.map(([, y]) => y));

/** His measures, units from his feet: height, his head's centre and height, the neck he turns about, the hem. */
export const LEAD = {
  height: 440,
  head: {
    y: fromFeet(PANEL.head)[1],
    height:
      Math.max(...HEAD_OUTLINE.map(([, y]) => y)) - Math.min(...HEAD_OUTLINE.map(([, y]) => y)),
  },
  neck: fromFeet([0, CHIN])[1],
  hem: HEM,
  /** Where the stain's middle sits on his chest, and its half-width and half-height. */
  stain: { x: -4, y: -232, rx: 22, ry: 29 },
} as const;

/**
 * The stain's soaked edge: each ring's size against the blot and its
 * opacity, inner first. Every ring wanders as the blot does (one seed), so
 * the rings nest into one feathered edge.
 */
const SOAK = [
  [1.03, 0.5],
  [1.06, 0.3],
  [1.09, 0.15],
] as const;

/** His breath: 4 s in and out, his trunk 1% taller from the hem at its top, his neck 2 units up with it. */
const BREATH = { period: 4, trunk: 1.01, neck: -2 } as const;

/** His top's outline, units from his feet: the within scene traces inside it. */
export const TUNIC = TOP_OUTLINE;

/** The point at height `y` on the line from `a` to `b`. */
const onLine = (a: Pt, b: Pt, y: number): Pt => [
  a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]),
  y,
];

/**
 * An arm of his as the sheet stands it, its elbow on the line from its
 * shoulder to its hand, so it hangs straight and reaches each point with
 * one elbow there (`armReach`): on its paper, its upper sleeve and its
 * forearm each with the colour the sheet lays on it.
 */
const armOf = (
  traced: typeof NEAR_ARM,
  hand: Pt,
  paper: typeof PAPERS.leadSleeve | typeof PAPERS.leadFarSleeve,
  tones: SheetTones,
) =>
  JointedArm({
    pivot: fromFeet(traced.pivot),
    rest: 0,
    outline: bodyParts(traced.upper),
    elbow: fromFeet(onLine(traced.pivot, hand, traced.elbow[1])),
    bend: 0,
    forearm: bodyParts(traced.forearm),
    hand: fromFeet(hand),
    paper,
    tones: bodyTones(tones),
    forearmTones: bodyTones(tones),
  });

/** His arms: the near one lit along its outer edge, the far one in the top's shade; each with its crease down its inner edge. */
const NEAR = armOf(NEAR_ARM, HANDS.near, PAPERS.leadSleeve, [...NEAR_LIT, ...NEAR_CREASE]);
const FAR = armOf(FAR_ARM, HANDS.far, PAPERS.leadFarSleeve, FAR_CREASE);

/** His head's width as the house measures it: the hands are a share of it. */
const HEAD_WIDTH =
  Math.max(...HEAD_OUTLINE.map(([x]) => x)) - Math.min(...HEAD_OUTLINE.map(([x]) => x));

/** His hands' circle across, against his head's width, as the sheet draws them. */
const HAND_SHARE = +((2 * HANDS.r * PANEL.scale) / HEAD_WIDTH).toFixed(3);

/** The waist band under his top's hem, laid on each leg. */
const WAIST = PAPERS.leadWaist.color;

/**
 * The lead. His face is Kit A's marks as his sheet draws them: tall oval
 * eyes, arched brows, a smile, his eyes on us at rest. His hands are the
 * share of his head's width the sheet draws them.
 */
export const lead = figure({
  // The owner locked him (ask `a92f276635e`); he kept candidate 9's sheets as the lead (ask
  // `a8fb2170353`, filed at the point item:lead after the lock), and this print is traced from
  // them, its ink bound to the shot.
  lock: {
    ...LEAD_LOCK,
    override: {
      rule: 'FigureLock',
      place: 'lead',
      reason: "traced from candidate 9's cast sheets, which the owner kept as the lead",
      answer: { ask: 'a8fb2170353', question: 'keep', value: 'keep' },
      frees: '55c5cc12ed69f14fef1899ab4f76e574b2fc8dcdd1b440aee09518ac7318a724',
    },
  },
  // `film match`'s concept: candidate 9's turnaround, his front view.
  concept: {
    image: { set: 'rbf-lead-sheets-2026-10-19', file: 'images/1-turnaround.png' },
    box: [44, 195, 259, 834],
  },
  // Room round him for his head's tilt, his arms' reach and his outline; his feet are the rig's origin.
  art: { width: 360, height: 560, feet: [180, 530] },
  stature: Stature.Canon(),
  stance: Stance.Standing({ breath: BREATH }),
  head: Head.Traced({
    view: 'front',
    outline: HEAD_OUTLINE,
    y: LEAD.head.y,
    neck: LEAD.neck,
    set: { x: fromFeet(PANEL.head)[0] },
    paper: PAPERS.leadSkin,
    tones: headTones(FACE_LIT),
    chin: 'open',
  }),
  hair: Hair.Traced({
    outline: headParts(HAIR),
    paper: PAPERS.leadHair,
    tones: [...headTones(HAIR_SHADE), ...headTones(HAIR_LIT)],
  }),
  ear: Ear.Both({ near: headParts(EAR_NEAR), far: headParts(EAR_FAR), paper: PAPERS.leadEar }),
  face: KitA({ ...tracedKit(MARKS, PANEL, 0.5), rest: { mouth: 2.5 }, gaze: [0, 40] }),
  body: Robe.Traced({
    outline: TOP_OUTLINE,
    hem: HEM,
    paper: PAPERS.leadTop,
    tones: [
      ...bodyTones(TOP_SHADE),
      ...bodyTones(YOKE),
      { pts: bodyParts(NECK), color: PAPERS.leadSkin.color, skin: true },
      { pts: bodyParts(NECK_SHADE), color: PAPERS.leadNeckShade.color, skin: true },
    ],
  }),
  arms: { near: NEAR, far: FAR },
  states: [
    GivenRobe(PAPERS.robe),
    Stain({
      at: [LEAD.stain.x, LEAD.stain.y],
      r: [LEAD.stain.rx, LEAD.stain.ry],
      soak: SOAK,
      seed: 11,
      paper: STAIN,
    }),
  ],
  feet: Trousers({
    paper: PAPERS.leadTrousers,
    near: {
      outline: bodyParts(LEG_NEAR),
      tones: [{ pts: bodyParts(WAIST_NEAR), color: WAIST }, ...bodyTones(LEG_LIT)],
    },
    far: { outline: bodyParts(LEG_FAR), tones: [{ pts: bodyParts(WAIST_FAR), color: WAIST }] },
    shoes: {
      paper: PAPERS.leadShoe,
      near: { outline: bodyParts(SHOE_NEAR), tones: bodyTones(SHOE_LIT.slice(0, 1)) },
      far: { outline: bodyParts(SHOE_FAR), tones: bodyTones(SHOE_LIT.slice(1)) },
    },
  }),
  hands: Hands({ paper: PAPERS.leadHand, share: HAND_SHARE }),
});

/** The view model's numbers at rest: the face kit's, his eyes on us, upright, his arms down, stained, in his own top. */
export const LEAD_KNOBS = lead.knobs;

/**
 * His arms, for the host that draws his hands: each one's numbers that take
 * its hand to a point (units from his feet, `reach`), and where its hand
 * then lies; its hand at rest; the shoulder it swings from. Each is named
 * by its side on the screen: his near arm is the left one, lit along its
 * outer edge; his far arm the right one.
 */
export const LEAD_ARMS = {
  left: { reach: (target: Pt) => armReach(NEAR, target), rest: NEAR.hand, shoulder: NEAR.pivot },
  right: { reach: (target: Pt) => armReach(FAR, target), rest: FAR.hand, shoulder: FAR.pivot },
  /** His hands' circle across, units. */
  hand: +(2 * HANDS.r * PANEL.scale).toFixed(2),
} as const;

/** His hands' size against the hand rig's (`HAND_ART`), at his own size: the circle the sheet draws. */
export const LEAD_HAND_SIZE = +(LEAD_ARMS.hand / (2 * HAND_ART.r)).toFixed(3);

/** The view model's numbers `reachHands` reads (his lean) and sets (his arms'). */
type ArmNumbers = {
  readonly lean: number;
  nearArm: number;
  nearElbow: number;
  farArm: number;
  farElbow: number;
};

/** Where his two hands lie, units from his feet. */
type HandsAt = { readonly left: Pt; readonly right: Pt };

/** `p` turned by `by` radians about his feet. */
const leaned = ([x, y]: Pt, by: number): Pt => {
  const [c, s] = [Math.cos(by), Math.sin(by)];
  return [x * c - y * s, x * s + y * c];
};

/**
 * Reaches his arms toward `left` and `right`, his hands' targets on the
 * screen (units from his feet, upright on the page however he leans), and
 * writes the arms' numbers into `numbers`; answers where each hand then
 * lies, at the end of its sleeve: at its target, else as near as the arm
 * reaches along the line to it.
 */
export const reachHands = (numbers: ArmNumbers, left: Pt, right: Pt): HandsAt => {
  const near = LEAD_ARMS.left.reach(leaned(left, -numbers.lean));
  const far = LEAD_ARMS.right.reach(leaned(right, -numbers.lean));
  numbers.nearArm = near.turn;
  numbers.nearElbow = near.bend;
  numbers.farArm = far.turn;
  numbers.farElbow = far.bend;
  return { left: leaned(near.hand, numbers.lean), right: leaned(far.hand, numbers.lean) };
};

/** The face `check` reads (`RivePropSpec.face`): its node, and his head's height. */
export const LEAD_FACE_CHECK = { node: 'face', height: LEAD.head.height } as const;
