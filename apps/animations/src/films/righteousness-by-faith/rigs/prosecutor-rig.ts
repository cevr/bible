// The prosecutor as a Rive rig, on the cold-studies generator's parts, in
// the kept concept's (`cold-34`) proportions: tall and narrow, a large
// rounded-rectangle head with an angular jaw, short dark hair with a side
// part laid flat in it, the house look's peach skin, a long narrow olive
// robe a little wider at the hem, dark shoes under it; the face kit at his
// size. His
// circle hands are the hand rig's (`hand-rig.ts`), drawn by the host where
// they work (laying a sheet on the stack, thrown up on `cover`).
//
// Units are the Board's pixels: in `cold.evidence` he stands 555 tall behind
// the table. His feet are the artboard's origin.
//
// The host poses him by the view model `Prosecutor`, every frame: the face
// kit's numbers (`FACE`) and `shout`, 0..1, his mouth thrown wide open (the
// kit's "oh" is a gasp, too small for a shout); `lean`, radians about his
// feet; `tilt`, radians, his head about his neck; `nod`, units, his head down
// toward his chest.
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
import { hairOutline, headOutline, roundedPolygon } from './shapes.ts';

/**
 * His measures, units, as the concept measures them against his head's
 * width (139 px there): the head 1.24 of its width tall with its hair, the
 * robe 0.8 of it across under the chin, 1.25 one head's width below and 1.5 at the hem, 3.35 heads
 * tall to his shoes.
 */
export const PROSECUTOR = {
  height: 555,
  head: { y: -478, rx: 59, ry: 76 },
  neck: -410,
  hem: -34,
} as const;

/** His head's squareness: a rounded rectangle whose sides draw in to an angular jaw. */
const SQUARE = { power: 3, jaw: 0.4, chin: 0.62 } as const;

/** The artboard, and where his feet stand on it. */
export const PROSECUTOR_ART = { width: 360, height: 640, feet: [180, 610] } as const;

/**
 * The face kit's scale on his head, how far below its middle it sits, and
 * its marks as the concept draws them (against his head's width): eyes 0.07
 * across and 0.12 high at the head's middle, 0.22 apart; heavy brows 0.17
 * above them; the mouth 0.37 below.
 */
export const PROSECUTOR_FACE = {
  scale: 1.35,
  y: 10,
  shape: {
    eye: [7.9, 12.8],
    eyes: [-11.6, 11.6],
    brows: [-12, 12],
    browY: -24,
    browHalf: 7.2,
    brow: 3.8,
    mouth: [0, 30],
  },
} as const;

/** The view model's numbers at rest: the face kit's, stern, his eyes on the dock (screen left), upright. */
export const PROSECUTOR_KNOBS = {
  ...FACE,
  gazeX: -400,
  gazeY: PROSECUTOR.head.y + 40,
  browTilt: -0.22,
  browY: 1.5,
  mouth: -1.2,
  shout: 0,
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

const KEY = { y: 14, rotation: 15, scaleY: 17, opacity: 18 } as const;

/** The shout: a wide open mouth, a quarter of his head across, where the kit's mouth sits. */
const SHOUT = { w: 36, h: 24 } as const;

/** His robe: long and narrow, widening fast below the chin and slower to the hem. */
export const ROBE = roundedPolygon(
  [
    [-40, PROSECUTOR.neck],
    [40, PROSECUTOR.neck],
    [73, PROSECUTOR.neck + 162],
    [98, PROSECUTOR.hem],
    [-98, PROSECUTOR.hem],
    [-73, PROSECUTOR.neck + 162],
  ],
  22,
);

/** Short black hair laid close on his square head: the temples clear, parted and swept to one side, one point at the back of the crown. */
const HAIR = {
  sides: -0.35,
  line: 0.6,
  loft: 0.02,
  curls: 0,
  curl: 0,
  sweep: 8,
  tuft: 0.16,
  power: SQUARE.power,
} as const;

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
          el(
            'Node',
            {
              y: PROSECUTOR_FACE.y + PROSECUTOR_FACE.shape.mouth[1] * PROSECUTOR_FACE.scale,
              name: 'shout',
            },
            [
              fig.bind('shout', KEY.opacity),
              el('Node', { name: 'shoutOpen', id: fig.idOf('shoutOpen') }, [
                fig.bind('shout', KEY.scaleY),
                piece(fig, 'shoutPaper', ellipse(0, 0, SHOUT.w / 2, SHOUT.h / 2, 16), {
                  color: '#3a2422',
                  light: '#3a2422',
                  ink: 'none',
                  shadow: 0,
                }),
              ]),
            ],
          ),
          faceKit(
            fig,
            { x: 0, y: PROSECUTOR_FACE.y, scale: PROSECUTOR_FACE.scale },
            PROSECUTOR_FACE.shape,
          ),
          piece(fig, 'headPaper', headOutline(head.rx, head.ry, SQUARE), skin),
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
    ...[-52, 52].map((x) =>
      piece(fig, `shoe${x < 0 ? 'L' : 'R'}`, ellipse(x, -11, 34, 13, 14), looked(PAPERS.shoe), {
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
