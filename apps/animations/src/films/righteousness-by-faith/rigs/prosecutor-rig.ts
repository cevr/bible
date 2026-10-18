// The prosecutor, composed of the house's parts (`figure`) in the kept
// concept's (`cold-34`) proportions and shading: tall and narrow, a large
// rounded block of a head turned three-quarters toward screen left and
// canted, its jaw one curve into a broad chin, short black hair peaked in a
// tuft over his brow, his head and hair traced from the concept
// (`traced.ts`), one ink line round head, hair and ear together, the
// concept's peach skin, a long narrow olive robe a little wider at the hem,
// dark shoes under it; Kit A at his size, and a mouth that opens wide for
// his shout. His circle hands are drawn by the host where they work (laying
// a sheet on the stack, thrown up on `cover`), each from its own artboard
// (`drawHand`). How each part is cut, lit and drawn is the house's
// (`drawFigure`). The owner locked him (ask `a92f276635e`, 2026-10-17, the
// shoe's sole fixed in passing): `prosecutor.lock.json` holds his print, and
// only an override citing the owner's words or his pick frees a change to it
// (FigureLock, `@bible/film/style`'s `lock.ts`).
//
// Units are the Board's pixels: in `cold.evidence` he stands 540 tall behind
// the table. His feet are the artboard's origin.
//
// The host poses him by the view model `Prosecutor`, every frame: the face
// kit's numbers (`FACE`) and `shout`, 0..1, his mouth thrown wide open (the
// kit's "oh" is a gasp, too small for a shout); `lean`, radians about his
// feet; `tilt`, radians, his head about his neck; `nod`, units, his head down
// toward his chest.
// The rig keeps its `breath` and the paper's `boil`.

import {
  Ear,
  Hair,
  Hands,
  Head,
  KitA,
  OpenMouth,
  Robe,
  Shoes,
  Stance,
  Stature,
  figure,
} from '@bible/film/style';
import { ellipse, shifted } from '@bible/film/style/rig';
import PROSECUTOR_LOCK from './prosecutor.lock.json' with { type: 'json' };
import { PAPERS } from './papers.ts';
import { PROSECUTOR_HAIR, PROSECUTOR_HEAD } from './traced.ts';

/**
 * His measures, units, as the concept measures them against his head's
 * width (139 px there): the head 1.24 of its width tall with its hair, the
 * robe 0.8 of it across under the chin, 1.25 one head's width below and
 * 1.5 at the hem; from his hair to his soles, 3.3 times his head's height
 * (hair to chin).
 */
const PROSECUTOR = {
  height: 540,
  head: { y: -463, rx: 59, ry: 76 },
  neck: -395,
  hem: -34,
} as const;

/** His breath: 4.5 s in and out, his trunk 0.8% taller from the hem at its top, his neck 2.5 units up with it. */
const BREATH = { period: 4.5, trunk: 1.008, neck: -2.5 } as const;

/**
 * Over his skin: the shade his hair lays on his brow (its own outline a
 * little lower, twice, fading), and the warm blush on his far cheek beside
 * his ear (cold-34 #ef9c74).
 */
const SKIN_TONES = [
  { pts: shifted(PROSECUTOR_HAIR, 0, 2.5), color: '#ec9a77', alpha: 0.8 },
  { pts: shifted(PROSECUTOR_HAIR, 0, 5), color: '#ec9a77', alpha: 0.4 },
  { pts: ellipse(34, 18, 12, 9, 14), color: '#ec9672', alpha: 0.7, soft: true },
] as const;

/** The light on his tuft, where the window catches it in cold-34 (#5e4a47 there): soft, fading into the black. */
const TUFT = [{ pts: ellipse(-46, -63, 12, 7, 14), color: '#5e4a47', soft: true }] as const;

/**
 * The prosecutor. His head sits on his robe as cold-34 sets it: canted
 * 0.22 radians, its crown toward screen right and its chin toward the dock
 * (the slope of its eyes there), and carried 8 units right of the robe's
 * middle, so the chin sits over the robe's top; his ear behind his features
 * on the far side, where cold-34 cuts it. His face is Kit A's marks where
 * cold-34 draws them once his eyes are on the dock: eyes 0.07 across and
 * 0.11 high, 0.18 apart; heavy brows 0.12 above them, the far one nearer
 * the middle; the mouth 0.25 below them; at rest stern, his eyes on the
 * dock (screen left). His shout is a quarter of his head across. His robe
 * is long and narrow, widening fast below the chin and slower to the hem,
 * the hem's corners tight and its edge sagging a little in the middle, as
 * cold-34 cuts it. His shoes are 0.49 of his head's width across under
 * their ink, set under the hem's corners, the toes out; the light down
 * each one's left edge as cold-34 lays it, each 6 px across there and
 * #9d7559 on the near shoe, 4 to 6 px and #6a4f44 on the far one: the near
 * shoe's up its toe's curve from just over the sole to two fifths across
 * (the shoe's points 0 to 7), the far shoe's up its steep side (its points
 * 16 to 11), the depths (6 and 5 units) giving those widths across, the
 * band lying at a slant there; the sole stays dark. His hands are 0.44 of
 * his head across, as the concept draws them.
 */
export const prosecutor = figure({
  // The owner locked him (ask `a92f276635e`): his print is the one this lock holds.
  lock: PROSECUTOR_LOCK,
  // `film match`'s concept: the prosecutor pointing in cold.34, the kept concept.
  concept: {
    image: { set: 'rbf-v3-concepts-2026-10-15', file: 'images/1-cold-34.png' },
    box: [560, 200, 900, 830],
  },
  // Room round him for his lean and his outline; his feet are the rig's origin.
  art: { width: 360, height: 640, feet: [180, 610] },
  stature: Stature.Canon(),
  stance: Stance.Standing({ breath: BREATH }),
  head: Head.Traced({
    outline: PROSECUTOR_HEAD,
    y: PROSECUTOR.head.y,
    neck: PROSECUTOR.neck,
    set: { x: 8, cant: 0.22 },
    paper: PAPERS.prosecutorSkin,
    tones: SKIN_TONES,
  }),
  hair: Hair.Traced({ outline: PROSECUTOR_HAIR, paper: PAPERS.darkHair, tones: TUFT }),
  ear: Ear({ at: [53, 17.5], r: [10, 16.5], paper: PAPERS.ear }),
  face: KitA({
    x: -10.5,
    y: 10.5,
    scale: 1.35,
    shape: {
      eye: [8.45, 14.1],
      eyes: [-10.9, 10.9],
      brows: [-14, 10.3],
      browY: -22.3,
      browHalf: 7.2,
      brow: 3.8,
      mouth: [0, 26.5],
    },
    rest: { browTilt: -0.22, browY: 1.5, mouth: -1.2 },
    gaze: [-400, 40],
  }),
  mouth: OpenMouth({ w: 36, h: 24, paper: '#3a2422' }),
  body: Robe.Cut({
    corners: [
      [-40, PROSECUTOR.neck],
      [40, PROSECUTOR.neck],
      [73, PROSECUTOR.neck + 162],
      [98, PROSECUTOR.hem],
      [0, PROSECUTOR.hem + 5],
      [-98, PROSECUTOR.hem],
      [-73, PROSECUTOR.neck + 162],
    ],
    radii: [22, 22, 30, 6, 90, 6, 30],
    hem: PROSECUTOR.hem,
    paper: PAPERS.olive,
  }),
  feet: Shoes({
    x: 60,
    w: 58,
    h: 28,
    near: { paper: PAPERS.shoe, light: { color: '#9d7559', from: 0, to: 7, depth: 6 } },
    far: { paper: PAPERS.farShoe, light: { color: '#6a4f44', from: 16, to: 11, depth: 5 } },
  }),
  hands: Hands({ paper: PAPERS.skinHand, share: 0.44 }),
});

/** The view model's numbers at rest: the face kit's, stern, his eyes on the dock (screen left), upright. */
export const PROSECUTOR_KNOBS = prosecutor.knobs;

export const PROSECUTOR_TIMELINES = {
  breath: { seconds: BREATH.period, move: 4.5 },
  boil: { seconds: 4, move: 4 },
} as const;
export type ProsecutorTimeline = keyof typeof PROSECUTOR_TIMELINES;

/** The face `check` reads: its node, and his head's height. */
export const PROSECUTOR_FACE_CHECK = { node: 'face', height: 2 * PROSECUTOR.head.ry } as const;
