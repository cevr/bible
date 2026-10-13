// The judge as a Rive rig, from the same figure parts as the accused
// (`parts.ts`): his dark robe with its two bands, his head and hand of the
// people's one figure paper, the face kit at his size. He sits behind the
// bench, so the rig is the part of him above it; the hand that takes up the gavel floats over the bench,
// so it is its own small artboard (`Hand`), the same part drawn there.
//
// - bones: chest → head, under a lean pivot at the robe's foot: `lean`
//   (radians) tips him toward the accused, and the head's look-at turns it
//   `follow` of the way after his gaze;
// - the face kit, scaled to his head (`JUDGE_FACE`), moved by the view model
//   `Judge` (`FACE` plus `lean`);
// - a `breath` loop and the paper's `boil`.

import { ramps as R } from '../../palette.ts';
import { accusedHead } from './accused-rig.ts';
import { type Direction, dressOf } from './direction.ts';
import {
  type BoneSpec,
  FACE,
  FIGURE,
  type Figure,
  UP,
  artboard,
  boilTimeline,
  ellipse,
  faceKit,
  gazeTarget,
  hand,
  lookAt,
  piece,
  roundRect,
  skeleton,
  timeline,
} from './parts.ts';
import { el } from './rml.ts';

/**
 * The artboard, and where the judge's head centre stands on it at D2 (its
 * origin; under another head option the neck stays put and the head grows
 * from it): room above the head for the largest option (D3) with its
 * outline, shadow and moves, since `webgl2` draws only what lies inside the
 * artboard.
 */
export const JUDGE_ART = { width: 360, height: 360, head: [180, 140] } as const;

/** The view model's numbers at rest: the face kit's, his eyes down on the papers before him, upright. */
export const JUDGE_KNOBS = { ...FACE, gazeX: 10, gazeY: 220, eyes: 0.62, lean: 0 } as const;

export const JUDGE_TIMELINES = {
  breath: { seconds: 5, move: 5 },
  boil: { seconds: 4, move: 4 },
} as const;
export type JudgeTimeline = keyof typeof JUDGE_TIMELINES;

/** The face kit's scale on his head: his head is 1.7 times the accused's, his features a little closer set. */
export const JUDGE_FACE = 1.62;

/** Where the lean pivots: the robe's foot, behind the bench. */
const PIVOT = 175;

/** His head's half-width and half-height as drawn: 1.7 times the accused's. */
const HEAD = { rx: 60, ry: 65 } as const;

/** The face `check` reads under `d` (`RivePropSpec.face`): its node, and the head's height at the axis's scale. */
export const judgeFace = (d: Direction) => ({
  node: 'face',
  height: 2 * HEAD.ry * accusedHead(d).scale,
});

/**
 * His robe, cut in the lean's frame (its origin at the pivot, `PIVOT` below
 * his head's centre): what the host knows of him to lay his hand's shadow on.
 */
export const ROBE = { pivot: PIVOT, outline: roundRect(0, 120 - PIVOT, 250, 120, 40, 4) } as const;

/** His chain from the pivot, his head scaled `hs`: the chest up to the neck, the head to its centre. */
const bones = (hs: number): ReadonlyArray<BoneSpec> => [
  { name: 'chest', x: 0, y: 0, rotation: UP, length: PIVOT - 60 },
  { name: 'head', parent: 'chest', rotation: 0, length: HEAD.rx * hs },
];

/** The judge's artboard and view model. */
export const judgeRig = (fig: Figure) => {
  const hs = accusedHead(fig.direction).scale;
  const dress = dressOf(fig.direction);
  const sk = skeleton(fig, bones(hs));
  // The head's pieces in its bone's frame turned upright (origin at the neck); the robe's in the
  // lean's frame (origin at the pivot), off the bones, so it draws under the head.
  // His head lies over his robe's shoulders and its bands: its shadow falls on them in their
  // shades, and on the wall behind him past them.
  const bands = [-9, 9].map((x) => `band${x}`);
  const headSpace = el('Node', { rotation: Math.PI / 2, name: 'headSpace' }, [
    faceKit(fig, { x: 0, y: (-HEAD.rx + 2) * hs, scale: JUDGE_FACE * hs }),
    piece(fig, 'head', ellipse(0, -HEAD.rx * hs, HEAD.rx * hs, HEAD.ry * hs, 22), {
      ...FIGURE,
      over: {
        surfaces: [
          ...bands.map((key) => ({ key, shade: R.paper.shade })),
          { key: 'robe', shade: dress.robe.shade },
        ],
        behind: 'robe',
      },
    }),
  ]);
  const robe = el('Node', { name: 'robeSide', id: fig.idOf('robeSide') }, [
    ...[-9, 9].map((x) =>
      piece(
        fig,
        `band${x}`,
        roundRect(x, 88 - PIVOT, 14, 30, 3, 2),
        {
          color: R.paper.base,
          light: R.paper.light,
          ink: 'trim',
          shadow: 0.15,
          cast: dress.robe.shade,
        },
        { boil: 0.6 },
      ),
    ),
    piece(fig, 'robe', ROBE.outline, dress.robe),
  ]);
  const body = el('Node', { y: PIVOT, name: 'leanPivot', id: fig.idOf('leanPivot') }, [
    fig.bind('lean', 15),
    // The head first: it draws over the robe's shoulders.
    sk.element('chest', [sk.element('head', [headSpace, lookAt(fig)])]),
    robe,
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
      'bone:chest': {
        scaleX: [
          [0, 1],
          [2.5, 1.012],
          [5, 1],
        ],
      },
      robeSide: {
        scaleY: [
          [0, 1],
          [2.5, 1.012],
          [5, 1],
        ],
      },
    },
    { loop: true },
  );
  return artboard(fig, JUDGE_ART, [figure], [breath, boilTimeline(fig)], JUDGE_KNOBS);
};

/**
 * The hand artboard: one circle hand at its centre, for a hand that works
 * over scenery the figure stands behind (the bench and what lies on it, his
 * robe, the wall). Its cast falls on that scenery, so the host lays it
 * (`judge.ts`), in the shade of each surface it falls on.
 */
export const HAND_ART = { width: 48, height: 48, r: 15 } as const;

export const handRig = (fig: Figure) =>
  artboard(
    fig,
    HAND_ART,
    [
      el('Node', { x: HAND_ART.width / 2, y: HAND_ART.height / 2, name: 'hand' }, [
        hand(fig, 'palm', HAND_ART.r, { ...FIGURE, ground: 'host' }),
      ]),
    ],
    [boilTimeline(fig)],
  );
