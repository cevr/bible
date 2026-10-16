// The prosecutor as a Rive rig, on the cold-studies generator's parts: short
// dark hair laid flat in the head, the house look's peach skin, an olive robe
// to the floor and dark shoes under its hem; the face kit at his size. His
// circle hands are the hand rig's (`hand-rig.ts`), drawn by the host where
// they work (laying a sheet on the stack, thrown up on `cover`).
//
// Units are the Board's pixels: in `cold.evidence` he stands 555 tall behind
// the table. His feet are the artboard's origin.
//
// The host poses him by the view model `Prosecutor`, every frame: the face
// kit's numbers (`FACE`); `lean`, radians about his feet; `tilt`, radians,
// his head about his neck; `nod`, units, his head down toward his chest.
// The rig keeps its `breath` and the paper's `boil`.

import {
  FACE,
  type Figure,
  artboard,
  boilTimeline,
  ellipse,
  faceKit,
  gazeTarget,
  piece,
  timeline,
} from '../../cold-studies/looks/rive/parts.ts';
import { el } from '../../cold-studies/looks/rive/rml.ts';
import { PAPERS, looked } from './papers.ts';
import { hairOutline, roundedPolygon } from './shapes.ts';

/** His measures, units. */
export const PROSECUTOR = {
  height: 555,
  head: { y: -488, rx: 56, ry: 66 },
  neck: -424,
  hem: -22,
} as const;

/** The artboard, and where his feet stand on it. */
export const PROSECUTOR_ART = { width: 360, height: 640, feet: [180, 610] } as const;

/** The face kit's scale on his head, and how far below its middle it sits. */
export const PROSECUTOR_FACE = { scale: 1.22, y: 20 } as const;

/** The view model's numbers at rest: the face kit's, stern, his eyes on the dock (screen left), upright. */
export const PROSECUTOR_KNOBS = {
  ...FACE,
  gazeX: -400,
  gazeY: PROSECUTOR.head.y + 40,
  browTilt: -0.22,
  browY: 1.5,
  mouth: -1.2,
  lean: 0,
  tilt: 0,
  nod: 0,
} as const;

export const PROSECUTOR_TIMELINES = {
  breath: { seconds: 4.5, move: 4.5 },
  boil: { seconds: 4, move: 4 },
} as const;
export type ProsecutorTimeline = keyof typeof PROSECUTOR_TIMELINES;

/** The face `check` reads: its node, and his head's height. */
export const PROSECUTOR_FACE_CHECK = { node: 'face', height: 2 * PROSECUTOR.head.ry } as const;

const KEY = { y: 14, rotation: 15 } as const;

/** His robe: narrow at the neck, the shoulders rounding off, wide at the hem. */
export const ROBE = roundedPolygon(
  [
    [-32, PROSECUTOR.neck],
    [32, PROSECUTOR.neck],
    [74, PROSECUTOR.neck + 26],
    [88, PROSECUTOR.neck + 94],
    [108, PROSECUTOR.hem],
    [-108, PROSECUTOR.hem],
    [-88, PROSECUTOR.neck + 94],
    [-74, PROSECUTOR.neck + 26],
  ],
  26,
);

/** Short hair, swept: down the sides to the temples, tufted round the top, the fringe dipping to one side. */
const HAIR = { sides: 0.2, line: 0.5, loft: 0.07, curls: 5, curl: 0.05, sweep: 12 } as const;

export const prosecutorRig = (fig: Figure) => {
  const { head } = PROSECUTOR;
  const skin = looked(PAPERS.skin);
  const headNode = el('Node', { y: PROSECUTOR.neck, name: 'neck', id: fig.idOf('neck') }, [
    el('Node', { name: 'head', id: fig.idOf('head') }, [
      fig.bind('tilt', KEY.rotation),
      el('Node', { name: 'nodded', id: fig.idOf('nodded') }, [
        fig.bind('nod', KEY.y),
        el('Node', { y: head.y - PROSECUTOR.neck, name: 'skull' }, [
          piece(fig, 'hair', hairOutline(head.rx, head.ry, HAIR), looked(PAPERS.darkHair)),
          faceKit(fig, { x: 0, y: PROSECUTOR_FACE.y, scale: PROSECUTOR_FACE.scale }),
          piece(fig, 'headPaper', ellipse(0, 0, head.rx, head.ry, 22), skin),
        ]),
      ]),
    ]),
  ]);
  // Rive draws a node's children front first: the head over the robe, the robe over the shoes.
  const body = el('Node', { name: 'body', id: fig.idOf('body') }, [
    fig.bind('lean', KEY.rotation),
    headNode,
    el('Node', { y: PROSECUTOR.hem, name: 'trunk', id: fig.idOf('trunk') }, [
      el('Node', { y: -PROSECUTOR.hem, name: 'robeSide' }, [
        piece(fig, 'robe', ROBE, looked(PAPERS.olive)),
      ]),
    ]),
    ...[-36, 36].map((x) =>
      piece(fig, `shoe${x < 0 ? 'L' : 'R'}`, ellipse(x, -8, 30, 14, 14), looked(PAPERS.shoe), {
        boil: 0.6,
      }),
    ),
  ]);
  const figure = el(
    'Node',
    { x: PROSECUTOR_ART.feet[0], y: PROSECUTOR_ART.feet[1], name: 'figure' },
    [gazeTarget(fig, PROSECUTOR_KNOBS), body],
  );
  const breath = timeline(
    fig,
    'breath',
    PROSECUTOR_TIMELINES.breath.seconds,
    {
      trunk: {
        scaleY: [
          [0, 1],
          [2.25, 1.008],
          [4.5, 1],
        ],
      },
      neck: {
        y: [
          [0, PROSECUTOR.neck],
          [2.25, PROSECUTOR.neck - 2.5],
          [4.5, PROSECUTOR.neck],
        ],
      },
    },
    { loop: true },
  );
  return artboard(fig, PROSECUTOR_ART, [figure], [breath, boilTimeline(fig)], PROSECUTOR_KNOBS);
};
