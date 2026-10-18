// The prosecutor as a Rive rig, on the house generator's parts, in
// the kept concept's (`cold-34`) proportions and shading: tall and narrow,
// a large rounded block of a head turned three-quarters toward screen left
// and canted, its jaw one curve into a broad chin, short black hair peaked in
// a tuft over his brow, his head and hair traced from the concept
// (`traced.ts`), one ink line round head, hair and ear together
// (`silhouette`), the concept's peach skin, a long narrow olive
// robe a little wider at the hem, dark shoes under it; the face kit at his
// size. His circle hands are the hand rig's (`hand-rig.ts`), drawn by the host where
// they work (laying a sheet on the stack, thrown up on `cover`).
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

import { looked } from '@bible/film/style';
import {
  FACE,
  type Figure,
  artboard,
  boilTimeline,
  el,
  ellipse,
  faceKit,
  gazeTarget,
  piece,
  roundedPolygon,
  shifted,
  shoeLight,
  shoeOutline,
  silhouette,
  timeline,
} from '@bible/film/style/rig';
import { PAPERS } from './papers.ts';
import { PROSECUTOR_HEAD, PROSECUTOR_HAIR } from './traced.ts';

/**
 * His measures, units, as the concept measures them against his head's
 * width (139 px there): the head 1.24 of its width tall with its hair, the
 * robe 0.8 of it across under the chin, 1.25 one head's width below and
 * 1.5 at the hem; from his hair to his soles, 3.3 times his head's height
 * (hair to chin).
 */
export const PROSECUTOR = {
  height: 540,
  head: { y: -463, rx: 59, ry: 76 },
  neck: -395,
  hem: -34,
} as const;

/**
 * His head as cold-34 sets it on his robe: canted, radians, its crown toward
 * screen right and its chin toward the dock (the slope of its eyes there), and
 * carried right of the robe's middle, units, so the chin sits over the robe's
 * top.
 */
const SET = { cant: 0.22, x: 8 } as const;

/** His ear, behind his features on the far side, where cold-34 cuts it: centre and half-sizes, units. */
const EAR = { x: 53, y: 17.5, rx: 10, ry: 16.5 } as const;

/** The artboard, and where his feet stand on it. */
export const PROSECUTOR_ART = { width: 360, height: 640, feet: [180, 610] } as const;

/**
 * The face kit on his head: how far toward screen left of the head's middle
 * it sits (his head turned three-quarters), its scale, how far below the
 * middle; and its marks where cold-34 draws them once his eyes are on the
 * dock: eyes 0.07 across and 0.11 high, 0.18 apart; heavy brows 0.12 above
 * them, the far one nearer the middle; the mouth 0.25 below them.
 */
export const PROSECUTOR_FACE = {
  x: -10.5,
  scale: 1.35,
  y: 10.5,
  shape: {
    eye: [8.45, 14.1],
    eyes: [-10.9, 10.9],
    brows: [-14, 10.3],
    browY: -22.3,
    browHalf: 7.2,
    brow: 3.8,
    mouth: [0, 26.5],
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

/**
 * His robe: long and narrow, widening fast below the chin and slower to the
 * hem; the hem's corners tight and its edge sagging a little in the middle,
 * as cold-34 cuts it.
 */
export const ROBE = roundedPolygon(
  [
    [-40, PROSECUTOR.neck],
    [40, PROSECUTOR.neck],
    [73, PROSECUTOR.neck + 162],
    [98, PROSECUTOR.hem],
    [0, PROSECUTOR.hem + 5],
    [-98, PROSECUTOR.hem],
    [-73, PROSECUTOR.neck + 162],
  ],
  [22, 22, 30, 6, 90, 6, 30],
);

/** His shoes, as cold-34 cuts them: 0.49 of his head's width across under their ink, set under the hem's corners, the toes out. */
const SHOE = { x: 60, w: 58, h: 28 } as const;

/**
 * The light down each shoe's left edge, as cold-34 lays it, each 6 px
 * across there and #9d7559 on the near shoe, 4 to 6 px and #6a4f44 on the
 * far one: the near shoe's up its toe's curve from just over the sole to
 * two fifths across (`SHOE`'s points 0 to 7), the far shoe's up its steep
 * side (its points 16 to 11). The depths (6 and 5 units) give those widths
 * across, the band lying at a slant there. The sole stays dark.
 */
const SHOE_LIGHT = { near: '#9d7559', far: '#6a4f44' } as const;
const shoeTones = (x: number) =>
  x < 0
    ? [{ pts: shifted(shoeLight(SHOE.w, SHOE.h, -1, 0, 7, 6), x, 0), color: SHOE_LIGHT.near }]
    : [{ pts: shifted(shoeLight(SHOE.w, SHOE.h, 1, 16, 11, 5), x, 0), color: SHOE_LIGHT.far }];

/** The light on his tuft, where the window catches it in cold-34 (#5e4a47 there): soft, fading into the black. */
const TUFT = [{ pts: ellipse(-46, -63, 12, 7, 14), color: '#5e4a47', soft: true }] as const;

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

export const prosecutorRig = (fig: Figure) => {
  const { head } = PROSECUTOR;
  const headNode = el('Node', { y: PROSECUTOR.neck, name: 'neck', id: fig.idOf('neck') }, [
    el('Node', { name: 'head', id: fig.idOf('head') }, [
      fig.bind('tilt', KEY.rotation),
      el('Node', { name: 'nodded', id: fig.idOf('nodded') }, [
        fig.bind('nod', KEY.y),
        el('Node', { x: SET.x, y: head.y - PROSECUTOR.neck, rotation: SET.cant, name: 'skull' }, [
          silhouette(fig, 'headCut', [
            {
              key: 'ear',
              pts: ellipse(EAR.x, EAR.y, EAR.rx, EAR.ry, 12),
              look: looked(PAPERS.ear),
              boil: 0.6,
            },
            { key: 'hair', pts: PROSECUTOR_HAIR, look: looked(PAPERS.darkHair, { tones: TUFT }) },
            el(
              'Node',
              {
                x: PROSECUTOR_FACE.x,
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
              { x: PROSECUTOR_FACE.x, y: PROSECUTOR_FACE.y, scale: PROSECUTOR_FACE.scale },
              PROSECUTOR_FACE.shape,
            ),
            {
              key: 'headPaper',
              pts: PROSECUTOR_HEAD,
              look: looked(PAPERS.prosecutorSkin, { tones: SKIN_TONES }),
            },
          ]),
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
    ...[-SHOE.x, SHOE.x].map((x) =>
      piece(
        fig,
        `shoe${x < 0 ? 'L' : 'R'}`,
        shifted(shoeOutline(SHOE.w, SHOE.h, x < 0 ? -1 : 1), x, 0),
        looked(x < 0 ? PAPERS.shoe : PAPERS.farShoe, { tones: shoeTones(x) }),
        {
          boil: 0.6,
        },
      ),
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
