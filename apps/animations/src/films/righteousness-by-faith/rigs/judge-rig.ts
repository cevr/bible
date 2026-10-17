// The judge as a Rive rig, on the cold-studies generator's parts, in the
// kept concept's (`cold-34`) proportions and shading: a large, squarish head
// with a firm jaw turned three-quarters toward screen left (his features and
// chin carried left, his ear behind them), fluffy grey hair swept back off a
// high brow in soft lighter and violet lumps, one ink line round head, hair
// and ear together (`silhouette`), the concept's peach skin, a dark purple
// robe broad at the shoulders with white bands; the face kit at his size,
// its marks large on the head. He sits behind the bench,
// so the rig is the part of him above it. His circle hands are the hand
// rig's (`hand-rig.ts`), drawn by the host over the bench (resting on it,
// taking up the gavel). The cold-studies judge (`judge-rig.ts` there) is
// another figure (bald, indigo, the cold-studies court's geometry): this one
// is drawn to RBF's Board.
//
// Units are the Board's pixels: in `cold.evidence` his head is 150 tall with
// its hair. His head's centre is the artboard's origin.
//
// The host poses him by the view model `Judge`, every frame: the face kit's
// numbers (`FACE`); `lean`, radians about his robe's foot (behind the
// bench), negative toward the dock; `tilt`, radians, his head about his neck;
// `nod`, units, his head down. The rig keeps its `breath` and `boil`.

import {
  FACE,
  type Figure,
  artboard,
  boilTimeline,
  ellipse,
  faceKit,
  gazeTarget,
  piece,
  silhouette,
  timeline,
  type Pt,
} from '../../cold-studies/looks/rive/parts.ts';
import { el } from '../../cold-studies/looks/rive/rml.ts';
import { PAPERS, looked } from './papers.ts';
import { capOutline, headOutline, roundedPolygon, shifted } from './shapes.ts';

/** His measures from his head's centre, units: the head, his neck, where his lean pivots (the robe's foot). */
export const JUDGE = {
  head: { rx: 58.5, ry: 70 },
  neck: 52,
  pivot: 300,
} as const;

/** The artboard, and where his head's centre sits on it. */
export const JUDGE_ART = { width: 460, height: 520, head: [230, 140] } as const;

/**
 * His head's squareness and turn: squarer than round, its sides drawing in
 * only a little to a broad jaw, the chin carried toward screen left and the
 * jaw rising toward his ear on the far side.
 */
const SQUARE = { power: 2.6, jaw: 0.5, chin: 0.8, turn: 0.1, back: 0.3 } as const;

/** How far right of the robe's middle his head sits, units: cold-34 sets his face's near side in over his robe. */
const HEAD_X = 3.5;

/** His ear, behind his features on the far side, from his head's centre: centre and half-sizes, units. */
const EAR = { x: 55, y: 22, rx: 10, ry: 17 } as const;

/** How far his features sit toward screen left of his head's centre, units: his head turned three-quarters. */
const TURNED = -11;

/**
 * The face kit's scale on his head, how far below its middle it sits, and
 * its marks as the concept draws them (against his head's width): dark oval
 * eyes 0.06 across and 0.10 high at its middle, 0.20 apart; heavy
 * angled brows 0.13 above them; the mouth 0.26 below them.
 */
export const JUDGE_FACE = {
  x: TURNED,
  scale: 1.3,
  y: 5,
  shape: {
    eye: [7.8, 12.3],
    eyes: [-11.2, 11.2],
    brows: [-11.5, 11.5],
    browY: -24,
    browHalf: 5.8,
    brow: 3.6,
    mouth: [0, 25],
    mouthHalf: 8.2,
  },
} as const;

/** The view model's numbers at rest: the face kit's, stern, his eyes on the dock, upright. */
export const JUDGE_KNOBS = {
  ...FACE,
  gazeX: -900,
  gazeY: 160,
  browTilt: -0.24,
  browY: 1.5,
  mouth: -1.4,
  lean: 0,
  tilt: 0,
  nod: 0,
} as const;

export const JUDGE_TIMELINES = {
  breath: { seconds: 5, move: 5 },
  boil: { seconds: 4, move: 4 },
} as const;
export type JudgeTimeline = keyof typeof JUDGE_TIMELINES;

/** The face `check` reads: its node, and his head's height. */
export const JUDGE_FACE_CHECK = { node: 'face', height: 2 * JUDGE.head.ry } as const;

const KEY = { y: 14, rotation: 15 } as const;

/**
 * His robe, from his head's centre, traced from cold-34 (the concept's
 * robe's edge, at his head's height there): the
 * shoulders risen to his jaw and sloping out to 2.2 head-heights across at
 * the bench, down behind it.
 */
export const JUDGE_ROBE = roundedPolygon(
  [
    [-40, 28],
    [40, 28],
    [72, 31],
    [95, 38],
    [117, 48],
    [140, 69],
    [161, 106],
    [183, 156],
    [203, 206],
    [212, JUDGE.pivot],
    [-202, JUDGE.pivot],
    [-192, 206],
    [-174, 158],
    [-153, 113],
    [-132, 76],
    [-110, 49],
    [-88, 39],
    [-68, 34],
  ],
  10,
);

/**
 * Fluffy grey hair swept back off a high brow: a rounder, lumpy crown
 * standing off his square head, its hairline rising from his brow toward
 * the back, fuller over the back of his head and down behind his ear.
 */
const HAIR = capOutline(JUDGE.head.rx, JUDGE.head.ry, {
  power: 2.2,
  loft: 0.08,
  back: 0.14,
  front: 0.3,
  rear: 0.15,
  line: 0.7,
  brow: 0.42,
  temple: 0.5,
  nape: 0.1,
  lumps: 5,
  lump: 0.11,
});

/** The lumps of his hair: lighter toward the window, violet-grey toward the back, each fading into the grey. */
const LUMPS = [
  { pts: ellipse(-25, -55, 22, 12, 14), color: '#c9bdbc', soft: true },
  { pts: ellipse(5, -62, 18, 10, 14), color: '#c4b7b8', soft: true },
  { pts: ellipse(48, -12, 18, 22, 14), color: '#8b7c96', soft: true },
  { pts: ellipse(30, -50, 14, 12, 14), color: '#9a8ba2', soft: true },
] as const;

/** The shade his hair lays on his brow: its own outline a little lower, twice, fading. */
const UNDER_HAIR = [
  { pts: shifted(HAIR, 0, 2.5), color: '#ec9a77', alpha: 0.7 },
  { pts: shifted(HAIR, 0, 5), color: '#ec9a77', alpha: 0.35 },
] as const;

/**
 * His bands as cold-34 draws them, from under his chin: two white tabs a
 * narrow gap apart, each wider at its end and splaying a little outward;
 * units, from his head's centre.
 */
const BAND = {
  gap: 3.25,
  top: 17,
  bottom: 25,
  splay: 4,
  from: JUDGE.neck + 10,
  to: JUDGE.neck + 74,
} as const;

/** The band on `side` of his middle (-1 screen left), clockwise. */
const bandOutline = (side: -1 | 1): Pt[] => {
  const x = (share: number) => HEAD_X + side * share;
  const top: Pt[] = [
    [x(BAND.gap), BAND.from],
    [x(BAND.gap + BAND.top), BAND.from],
  ];
  const bottom: Pt[] = [
    [x(BAND.gap + BAND.splay + BAND.bottom), BAND.to],
    [x(BAND.gap + BAND.splay), BAND.to],
  ];
  const corners = [...top, ...bottom];
  return roundedPolygon(side < 0 ? [...corners].reverse() : corners, 2);
};

/** The bands' paper, no ink, the chin's lilac shade across their tops (cold-34 #dbd0d5). */
const BAND_LOOK = looked(PAPERS.bands, {
  ink: 'none',
  tones: [{ pts: ellipse(0, BAND.from, 40, 22, 16), color: '#dbd0d5', soft: true }],
});

export const judgeRig = (fig: Figure) => {
  const { head } = JUDGE;
  const headNode = el('Node', { y: JUDGE.neck, name: 'neck', id: fig.idOf('neck') }, [
    el('Node', { name: 'head', id: fig.idOf('head') }, [
      fig.bind('tilt', KEY.rotation),
      el('Node', { name: 'nodded', id: fig.idOf('nodded') }, [
        fig.bind('nod', KEY.y),
        el('Node', { x: HEAD_X, y: -JUDGE.neck, name: 'skull' }, [
          silhouette(fig, 'headCut', [
            {
              key: 'ear',
              pts: ellipse(EAR.x, EAR.y, EAR.rx, EAR.ry, 12),
              look: looked(PAPERS.ear),
              boil: 0.6,
            },
            { key: 'hair', pts: HAIR, look: looked(PAPERS.greyHair, { tones: LUMPS }) },
            faceKit(
              fig,
              { x: JUDGE_FACE.x, y: JUDGE_FACE.y, scale: JUDGE_FACE.scale },
              JUDGE_FACE.shape,
            ),
            {
              key: 'headPaper',
              pts: headOutline(head.rx, head.ry, SQUARE),
              look: looked(PAPERS.skin, { tones: UNDER_HAIR }),
            },
          ]),
        ]),
      ]),
    ]),
  ]);
  const bands = ([-1, 1] as const).map((side) =>
    piece(fig, `band${side < 0 ? 'L' : 'R'}`, bandOutline(side), BAND_LOOK, { boil: 0.5 }),
  );
  const body = el('Node', { y: JUDGE.pivot, name: 'leanPivot', id: fig.idOf('leanPivot') }, [
    fig.bind('lean', KEY.rotation),
    // Rive draws a node's children front first: the head over the bands over the robe.
    el('Node', { y: -JUDGE.pivot, name: 'upright' }, [
      headNode,
      el('Node', { name: 'robeSide', id: fig.idOf('robeSide') }, [
        ...bands,
        piece(fig, 'robe', JUDGE_ROBE, looked(PAPERS.judgeRobe)),
      ]),
    ]),
  ]);
  const figure = el('Node', { x: JUDGE_ART.head[0], y: JUDGE_ART.head[1], name: 'figure' }, [
    gazeTarget(fig, JUDGE_KNOBS),
    body,
  ]);
  const breath = timeline(
    fig,
    'breath',
    JUDGE_TIMELINES.breath.seconds,
    {
      robeSide: {
        scaleX: [
          [0, 1],
          [2.5, 1.008],
          [5, 1],
        ],
      },
      neck: {
        y: [
          [0, JUDGE.neck],
          [2.5, JUDGE.neck - 2],
          [5, JUDGE.neck],
        ],
      },
    },
    { loop: true },
  );
  return artboard(fig, JUDGE_ART, [figure], [breath, boilTimeline(fig)], JUDGE_KNOBS);
};
