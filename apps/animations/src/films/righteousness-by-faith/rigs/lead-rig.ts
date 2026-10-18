// The plain lead as a Rive rig (character-design 2.3), on the house
// generator's parts: a round head on a trapezoid tunic, stub legs, one
// lilac-grey paper, no hair, no neck; the face kit at his size. His hands are
// the hand rig's (`hand-rig.ts`), drawn by the host where they work (on the
// dock's rail, over the stain), so the rig is the body alone.
//
// Units are the Board's pixels (a panel is 1536 × 1024): in `cold.evidence`
// he stands 373 tall, his head 146 across. His feet are the artboard's
// origin.
//
// The host poses him by the view model `Lead`, every frame:
// - the face kit's numbers (`FACE`), and `faceY`, units, the marks slid down
//   the round as he bows (the face drawn on a flat head turns by its marks);
// - `lean`, radians about his feet; `tilt`, radians, his head about his
//   neck; `nod`, units, his head sinking toward his tunic (a bow);
// - `stain`, the scarlet blot on his tunic, 0..1; `robe`, the white tunic
//   laid over his own, 0..1.
// The rig keeps its `breath` and the paper's `boil`.

import { type Pt, looked } from '@bible/film/style';
import {
  FACE,
  type Figure,
  artboard,
  blotOutline,
  boilTimeline,
  el,
  ellipse,
  faceKit,
  gazeTarget,
  piece,
  roundedPolygon,
  timeline,
} from '@bible/film/style/rig';
import { PAPERS, STAIN } from './papers.ts';

/** His measures, units: height, head, neck (the tunic's top under the head), hem, legs. */
export const LEAD = {
  height: 373,
  head: { y: -300, r: 73 },
  neck: -236,
  hem: -42,
  /** Where the stain's middle sits on his tunic, and its half-width and half-height. */
  stain: { x: -6, y: -168, rx: 31, ry: 42 },
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

/** The seed every outline of the stain wanders by. */
const STAIN_SEED = 11;

/** The artboard, and where his feet stand on it: room for his head's tilt and his outline. */
export const LEAD_ART = { width: 360, height: 470, feet: [180, 440] } as const;

/**
 * The face kit's scale on his head, and its marks as his sheet draws them
 * (`1-the-lead-sheet`, by its head's width) at cold-34's size: tall oval
 * eyes 0.09 across and 0.17 high, 0.30 apart, at the head's middle; short
 * brows 0.13 long and 0.04 thick, 0.25 above it; the mouth a quarter of its
 * width below it. His face is drawn on a flat round, so it turns by its
 * marks alone: they slide up to 0.11 of the head across toward what he
 * watches (`turn`), as cold-34 carries them toward the bench.
 */
export const LEAD_FACE = {
  scale: 1.75,
  y: 12,
  shape: {
    eye: [7.9, 13.9],
    eyes: [-14.2, 15.2],
    brows: [-15.2, 16.2],
    browY: -29.9,
    browHalf: 5.3,
    brow: 3.15,
    turn: 9.2,
  },
} as const;

/** The view model's numbers at rest: the face kit's, his eyes on us, upright, stained, in his own tunic. */
export const LEAD_KNOBS = {
  ...FACE,
  gazeX: 0,
  gazeY: LEAD.head.y + LEAD_FACE.y,
  lean: 0,
  tilt: 0,
  nod: 0,
  faceY: 0,
  stain: 1,
  robe: 0,
} as const;

export const LEAD_TIMELINES = {
  breath: { seconds: 4, move: 4 },
  boil: { seconds: 4, move: 4 },
} as const;
export type LeadTimeline = keyof typeof LEAD_TIMELINES;

/** The face `check` reads (`RivePropSpec.face`): its node, and his head's height. */
export const LEAD_FACE_CHECK = { node: 'face', height: 2 * LEAD.head.r } as const;

/** The view model's property keys (`rive schema`). */
const KEY = { y: 14, rotation: 15, opacity: 18 } as const;

/**
 * How far the tunic's sides bow out at their middle, units: cold-34 widens
 * it fast below the shoulders and slower to the hem.
 */
const BOW = 4;

/** The tunic: narrow at the neck (0.62 of his head across), wide at the hem, its sides bowed out, its corners rounded. */
export const TUNIC = roundedPolygon(
  [
    [-41, LEAD.neck],
    [41, LEAD.neck],
    [75, LEAD.hem],
    [-75, LEAD.hem],
  ],
  22,
).map(([x, y]): Pt => {
  const t = (y - LEAD.neck) / (LEAD.hem - LEAD.neck);
  return t > 0 && t < 1 ? [x + Math.sign(x) * BOW * Math.sin(Math.PI * t), y] : [x, y];
});

/** His legs, as cold-34 stands them under the hem: each 28 units across, their inner edges all but touching, their feet round. */
const LEGS = { x: 23.5, r: 14 } as const;

/** One stub leg about `x`: straight down from under the hem, its foot a half circle. */
const leg = (x: number): Pt[] => {
  const top = LEAD.hem - 16;
  const side = (top - LEGS.r) / 2;
  const foot = Array.from({ length: 9 }, (_, i): Pt => {
    const a = (i / 8) * Math.PI;
    return [x + LEGS.r * Math.cos(a), -LEGS.r + LEGS.r * Math.sin(a)];
  });
  return [[x - LEGS.r, top], [x + LEGS.r, top], [x + LEGS.r, side], ...foot, [x - LEGS.r, side]];
};

export const leadRig = (fig: Figure) => {
  const lead = looked(PAPERS.lead);
  const { stain } = LEAD;
  const stainNode = el('Node', { x: stain.x, y: stain.y, name: 'stain', id: fig.idOf('stain') }, [
    fig.bind('stain', KEY.opacity),
    piece(fig, 'stainBlot', blotOutline(stain.rx, stain.ry, 0.07, STAIN_SEED), {
      color: STAIN,
      light: STAIN,
      ink: 'none',
      shadow: 0,
    }),
    // Rings round the blot, each wider and fainter, so its edge reads soaked into the cloth
    // rather than cut (the canvas engine draws no feather).
    ...SOAK.map(([grow, opacity], i) =>
      el('Node', { opacity, name: `stainSoak${i}` }, [
        piece(
          fig,
          `stainSoak${i}Paper`,
          blotOutline(stain.rx * grow, stain.ry * grow, 0.07, STAIN_SEED),
          {
            color: STAIN,
            light: STAIN,
            ink: 'none',
            shadow: 0,
          },
        ),
      ]),
    ),
  ]);
  const head = el('Node', { y: LEAD.neck, name: 'neck', id: fig.idOf('neck') }, [
    el('Node', { name: 'head', id: fig.idOf('head') }, [
      fig.bind('tilt', KEY.rotation),
      el('Node', { name: 'nodded', id: fig.idOf('nodded') }, [
        fig.bind('nod', KEY.y),
        el('Node', { y: LEAD.head.y - LEAD.neck, name: 'skull' }, [
          el('Node', { name: 'faceSlide', id: fig.idOf('faceSlide') }, [
            fig.bind('faceY', KEY.y),
            faceKit(fig, { x: 0, y: LEAD_FACE.y, scale: LEAD_FACE.scale }, LEAD_FACE.shape),
          ]),
          piece(
            fig,
            'headPaper',
            ellipse(0, 0, LEAD.head.r, LEAD.head.r - 1, 22),
            looked(PAPERS.leadHead),
          ),
        ]),
      ]),
    ]),
  ]);
  // Rive draws a node's children front first: the head over the tunic's shoulders, the tunic
  // over the legs, the white robe over the stain over his own tunic.
  const body = el('Node', { name: 'body', id: fig.idOf('body') }, [
    fig.bind('lean', KEY.rotation),
    head,
    el('Node', { y: LEAD.hem, name: 'trunk', id: fig.idOf('trunk') }, [
      el('Node', { y: -LEAD.hem, name: 'tunicSide' }, [
        el('Node', { name: 'robe', id: fig.idOf('robe') }, [
          fig.bind('robe', KEY.opacity),
          piece(fig, 'robePaper', TUNIC, looked(PAPERS.robe)),
        ]),
        stainNode,
        piece(fig, 'tunic', TUNIC, lead),
      ]),
    ]),
    piece(fig, 'legL', leg(-LEGS.x), lead, { boil: 0.6 }),
    piece(fig, 'legR', leg(LEGS.x), lead, { boil: 0.6 }),
  ]);
  const figure = el('Node', { x: LEAD_ART.feet[0], y: LEAD_ART.feet[1], name: 'figure' }, [
    gazeTarget(fig, LEAD_KNOBS),
    body,
  ]);
  const breath = timeline(
    fig,
    'breath',
    LEAD_TIMELINES.breath.seconds,
    {
      trunk: {
        scaleY: [
          [0, 1],
          [2, 1.012],
          [4, 1],
        ],
      },
      neck: {
        y: [
          [0, LEAD.neck],
          [2, LEAD.neck - 2],
          [4, LEAD.neck],
        ],
      },
    },
    { loop: true },
  );
  return artboard(fig, LEAD_ART, [figure], [breath, boilTimeline(fig)], LEAD_KNOBS);
};
