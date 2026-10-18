// How the house draws a composed figure (`figure`, `style/figure.ts`) as a
// Rive artboard, on the generator's parts: each part kind cut, inked, lit
// and rimmed one way, and a figure's nodes made in one order for its stance,
// so one composition prints one project, id for id (the ids are handed out
// in the order the nodes are made, `Figure.idOf`, and the boil draws its
// noise in the order the pieces are). And the circle hand's own artboard, in
// one paper, which the host draws wherever the hand works. Pure.

import {
  type ComposedFigure,
  type Parts,
  type SeatedParts,
  type StandingParts,
  isSeated,
} from '../figure.ts';
import { type Paper, looked, paper } from '../paper.ts';
import type { Garment, Tunic } from '../parts/body.ts';
import type { Ear } from '../parts/ear.ts';
import type { Feet, Shoes, StubLegs } from '../parts/feet.ts';
import type { Hair } from '../parts/hair.ts';
import type { RoundHead, TracedHead } from '../parts/head.ts';
import type { KitA } from '../parts/kit.ts';
import type { OpenMouth } from '../parts/mouth.ts';
import type { Bands } from '../parts/over.ts';
import type { Seated, Standing } from '../parts/stance.ts';
import type { Stain } from '../parts/states.ts';
import {
  type Figure,
  type PieceLook,
  type Pt,
  artboard,
  boilTimeline,
  ellipse,
  faceKit,
  gazeTarget,
  hand,
  kitMarks,
  piece,
  silhouette,
  timeline,
} from './parts.ts';
import { type Element, el } from './rml.ts';
import { blotOutline, roundedPolygon, shifted, shoeLight, shoeOutline } from './shapes.ts';

/** The view model's property keys a figure's nodes bind (`rive schema`). */
const KEY = { y: 14, rotation: 15, scaleY: 17, opacity: 18 } as const;

/** The points round a round head: enough that its crease and its rim run smooth. */
const ROUND_POINTS = 22;

/** The points round an ear. */
const EAR_POINTS = 12;

/** The points round an open mouth. */
const MOUTH_POINTS = 16;

/** How far a stain's edge wanders from its ellipse, a share of its size. */
const STAIN_WANDER = 0.07;

/** How far a stub leg reaches up under the hem, units, so no gap opens as the trunk breathes. */
const LEG_TUCK = 16;

/** The points round a stub leg's foot, a half circle. */
const FOOT_POINTS = 9;

/** A small piece's boil (a leg, a shoe, an ear): less than a body piece's (0.9). */
const SMALL_BOIL = 0.6;

/** The bands' boil: the least of any piece's, the thinnest. */
const BAND_BOIL = 0.5;

/** The radius each band's corners are rounded by, units. */
const BAND_CORNER = 2;

/** Kit A at its place on the head, its marks as the figure's sheet draws them. */
const kitOf = (rig: Figure, face: KitA) =>
  faceKit(rig, { x: face.x, y: face.y, scale: face.scale }, face.shape);

/**
 * A stain: a flat blot of its colour with no ink, and its soaked edge, rings
 * each wider and fainter, wandering by the one seed so they nest into one
 * edge soaked into the cloth rather than cut. Its opacity is the `stain`
 * number.
 */
const stainOf = (rig: Figure, s: Stain) => {
  const flat: PieceLook = { color: s.paper, light: s.paper, ink: 'none', shadow: 0 };
  const [rx, ry] = s.r;
  return el('Node', { x: s.at[0], y: s.at[1], name: 'stain', id: rig.idOf('stain') }, [
    rig.bind('stain', KEY.opacity),
    piece(rig, 'stainBlot', blotOutline(rx, ry, STAIN_WANDER, s.seed), flat),
    ...s.soak.map(([grow, opacity], i) =>
      el('Node', { opacity, name: `stainSoak${i}` }, [
        piece(
          rig,
          `stainSoak${i}Paper`,
          blotOutline(rx * grow, ry * grow, STAIN_WANDER, s.seed),
          flat,
        ),
      ]),
    ),
  ]);
};

/**
 * A round head on its neck: it turns about the neck (`tilt`) and sinks
 * toward the body (`nod`); the face kit lies on its flat paper and slides
 * down the round (`faceY`).
 */
const roundHeadOf = (rig: Figure, head: RoundHead, face: KitA) =>
  el('Node', { y: head.neck, name: 'neck', id: rig.idOf('neck') }, [
    el('Node', { name: 'head', id: rig.idOf('head') }, [
      rig.bind('tilt', KEY.rotation),
      el('Node', { name: 'nodded', id: rig.idOf('nodded') }, [
        rig.bind('nod', KEY.y),
        el('Node', { y: head.y - head.neck, name: 'skull' }, [
          el('Node', { name: 'faceSlide', id: rig.idOf('faceSlide') }, [
            rig.bind('faceY', KEY.y),
            kitOf(rig, face),
          ]),
          piece(
            rig,
            'headPaper',
            ellipse(0, 0, head.r[0], head.r[1], ROUND_POINTS),
            looked(head.paper),
          ),
        ]),
      ]),
    ]),
  ]);

/** The ear, flat skin inside the head's outline, crawling as a small piece. */
const earOf = (ear: Ear) => ({
  key: 'ear',
  pts: ellipse(ear.at[0], ear.at[1], ear.r[0], ear.r[1], EAR_POINTS),
  look: looked(ear.paper),
  boil: SMALL_BOIL,
});

/** The hair, inside the head's outline, its light laid on it as tones. */
const hairOf = (hair: Hair) => ({
  key: 'hair',
  pts: hair.outline,
  look: looked(hair.paper, { tones: hair.tones ?? [] }),
});

/**
 * The mouth thrown open where the kit's mouth sits, at the kit's scale: one
 * flat colour with no ink and no lift, its opacity and its height the
 * `shout` number.
 */
const shoutOf = (rig: Figure, mouth: OpenMouth, face: KitA) => {
  const [x, y] = kitMarks(face.shape).mouth;
  const flat: PieceLook = { color: mouth.paper, light: mouth.paper, ink: 'none', shadow: 0 };
  return el('Node', { x: face.x + x * face.scale, y: face.y + y * face.scale, name: 'shout' }, [
    rig.bind('shout', KEY.opacity),
    el('Node', { name: 'shoutOpen', id: rig.idOf('shoutOpen') }, [
      rig.bind('shout', KEY.scaleY),
      piece(rig, 'shoutPaper', ellipse(0, 0, mouth.w / 2, mouth.h / 2, MOUTH_POINTS), flat),
    ]),
  ]);
};

/**
 * A traced head on its neck, set on the body as its concept sets it
 * (carried off the body's middle and canted): it turns about the neck
 * (`tilt`) and sinks toward the body (`nod`); its ear, hair and open mouth
 * are cut inside its outline, the face kit lies over its paper, and one ink
 * line runs round them all (`silhouette`).
 */
const tracedHeadOf = (rig: Figure, f: Parts, head: TracedHead) =>
  el('Node', { y: head.neck, name: 'neck', id: rig.idOf('neck') }, [
    el('Node', { name: 'head', id: rig.idOf('head') }, [
      rig.bind('tilt', KEY.rotation),
      el('Node', { name: 'nodded', id: rig.idOf('nodded') }, [
        rig.bind('nod', KEY.y),
        el(
          'Node',
          { x: head.set.x, y: head.y - head.neck, rotation: head.set.cant, name: 'skull' },
          [
            silhouette(rig, 'headCut', [
              ...(f.ear === undefined ? [] : [earOf(f.ear)]),
              ...(f.hair === undefined ? [] : [hairOf(f.hair)]),
              ...(f.mouth === undefined ? [] : [shoutOf(rig, f.mouth, f.face)]),
              kitOf(rig, f.face),
              {
                key: 'headPaper',
                pts: head.outline,
                look: looked(head.paper, { tones: head.tones ?? [] }),
              },
            ]),
          ],
        ),
      ]),
    ]),
  ]);

/** A figure's head, as its kind is cut. */
const headOf = (rig: Figure, f: Parts) =>
  f.head._tag === 'TracedHead' ? tracedHeadOf(rig, f, f.head) : roundHeadOf(rig, f.head, f.face);

/** A tunic's outline, in its figure's units: its corners rounded, its sides bowed out between neck and hem. */
export const tunicOutline = (t: Tunic): Pt[] =>
  roundedPolygon(
    [
      [-t.half.neck, t.neck],
      [t.half.neck, t.neck],
      [t.half.hem, t.hem],
      [-t.half.hem, t.hem],
    ],
    t.radius,
  ).map(([x, y]): Pt => {
    const k = (y - t.neck) / (t.hem - t.neck);
    return k > 0 && k < 1 ? [x + Math.sign(x) * t.bow * Math.sin(Math.PI * k), y] : [x, y];
  });

/** A garment's outline: a tunic cut from its neck and hem, a cut robe from its corners. */
const garmentOutline = (g: Garment): Pt[] =>
  g._tag === 'CutRobe' ? roundedPolygon(g.corners, g.radii) : tunicOutline(g);

/** What a garment's piece is named, and its side's node after it. */
const garmentKey = (g: Garment) => (g._tag === 'CutRobe' ? 'robe' : 'tunic');

/** The band on `side` of the bands' middle (-1 screen left), clockwise. */
const bandOutline = (b: Bands, side: -1 | 1): Pt[] => {
  const x = (d: number) => b.x + side * d;
  const top: Pt[] = [
    [x(b.gap), b.from],
    [x(b.gap + b.top), b.from],
  ];
  const bottom: Pt[] = [
    [x(b.gap + b.splay + b.bottom), b.to],
    [x(b.gap + b.splay), b.to],
  ];
  const corners = [...top, ...bottom];
  return roundedPolygon(side < 0 ? [...corners].reverse() : corners, BAND_CORNER);
};

/** The bands, each a piece of their paper with no ink, the near (screen-left) one first. */
const bandsOf = (rig: Figure, b: Bands) =>
  ([-1, 1] as const).map((side) =>
    piece(
      rig,
      `band${side < 0 ? 'L' : 'R'}`,
      bandOutline(b, side),
      looked(b.paper, { ink: 'none', tones: b.tones ?? [] }),
      { boil: BAND_BOIL },
    ),
  );

/**
 * What lies on a garment's side, front first: what lies on it with no line
 * of its own (`over`, made before the body), the given robe, the stain
 * (made before the head), and the garment's own paper. The given robe and
 * the garment's paper are made here, inside the side's node.
 */
const clothOf = (
  rig: Figure,
  f: Parts,
  over: ReadonlyArray<Element>,
  stain: ReadonlyArray<Element>,
): Element[] => {
  const outline = garmentOutline(f.body);
  return [
    ...over,
    ...(f.states.robe === undefined
      ? []
      : [
          el('Node', { name: 'robe', id: rig.idOf('robe') }, [
            rig.bind('robe', KEY.opacity),
            piece(rig, 'robePaper', outline, looked(f.states.robe.paper)),
          ]),
        ]),
    ...stain,
    piece(rig, garmentKey(f.body), outline, looked(f.body.paper)),
  ];
};

/** One stub leg about `x`: straight down from under the hem at `hem`, its foot a half circle. */
const legOutline = (legs: StubLegs, hem: number, x: number): Pt[] => {
  const { r } = legs;
  const top = hem - LEG_TUCK;
  const side = (top - r) / 2;
  const foot = Array.from({ length: FOOT_POINTS }, (_, i): Pt => {
    const a = (i / (FOOT_POINTS - 1)) * Math.PI;
    return [x + r * Math.cos(a), -r + r * Math.sin(a)];
  });
  return [[x - r, top], [x + r, top], [x + r, side], ...foot, [x - r, side]];
};

/** Stub legs either side of the middle under the hem at `hem`, the near (screen-left) one first. */
const legsOf = (rig: Figure, legs: StubLegs, hem: number) =>
  ([-1, 1] as const).map((side) =>
    piece(
      rig,
      `leg${side < 0 ? 'L' : 'R'}`,
      legOutline(legs, hem, side * legs.x),
      looked(legs.paper),
      { boil: SMALL_BOIL },
    ),
  );

/** Shoes either side of the middle, their toes out, each lit down its edge, the near (screen-left) one first. */
const shoesOf = (rig: Figure, s: Shoes) =>
  (
    [
      [-1, s.near],
      [1, s.far],
    ] as const
  ).map(([toe, shoe]) => {
    const x = toe * s.x;
    const { color, from, to, depth } = shoe.light;
    return piece(
      rig,
      `shoe${toe < 0 ? 'L' : 'R'}`,
      shifted(shoeOutline(s.w, s.h, toe), x, 0),
      looked(shoe.paper, {
        tones: [{ pts: shifted(shoeLight(s.w, s.h, toe, from, to, depth), x, 0), color }],
      }),
      { boil: SMALL_BOIL },
    );
  });

/** A figure's feet under the hem at `hem`. */
const feetOf = (rig: Figure, feet: Feet, hem: number) =>
  feet._tag === 'Shoes' ? shoesOf(rig, feet) : legsOf(rig, feet, hem);

/**
 * A standing figure's body, about its feet: it leans there (`lean`); the
 * head over the garment's shoulders, the garment's trunk breathing from its
 * hem, the feet under it.
 */
const standingOf = (
  rig: Figure,
  f: StandingParts,
  head: Element,
  over: ReadonlyArray<Element>,
  stain: ReadonlyArray<Element>,
) =>
  el('Node', { name: 'body', id: rig.idOf('body') }, [
    rig.bind('lean', KEY.rotation),
    head,
    el('Node', { y: f.body.hem, name: 'trunk', id: rig.idOf('trunk') }, [
      el(
        'Node',
        { y: -f.body.hem, name: `${garmentKey(f.body)}Side` },
        clothOf(rig, f, over, stain),
      ),
    ]),
    ...feetOf(rig, f.feet, f.body.hem),
  ]);

/**
 * A seated figure's body, about its head's centre: it leans about the
 * garment's hem, its foot behind what hides its feet (`lean`); the head over
 * the garment, whose side breathes.
 */
const seatedOf = (
  rig: Figure,
  f: SeatedParts,
  head: Element,
  over: ReadonlyArray<Element>,
  stain: ReadonlyArray<Element>,
) => {
  const side = `${garmentKey(f.body)}Side`;
  return el('Node', { y: f.body.hem, name: 'leanPivot', id: rig.idOf('leanPivot') }, [
    rig.bind('lean', KEY.rotation),
    el('Node', { y: -f.body.hem, name: 'upright' }, [
      head,
      el('Node', { name: side, id: rig.idOf(side) }, clothOf(rig, f, over, stain)),
    ]),
  ]);
};

/**
 * A standing figure's breath: its trunk lifts from the hem and its neck with
 * it, at the top of the breath half a period in, and back.
 */
const standingBreath = (rig: Figure, stance: Standing, neck: number) => {
  const { period, trunk, neck: rise } = stance.breath;
  return timeline(
    rig,
    'breath',
    period,
    {
      trunk: {
        scaleY: [
          [0, 1],
          [period / 2, trunk],
          [period, 1],
        ],
      },
      neck: {
        y: [
          [0, neck],
          [period / 2, neck + rise],
          [period, neck],
        ],
      },
    },
    { loop: true },
  );
};

/**
 * A seated figure's breath: its garment's side (`side`) swells across and
 * its neck moves with it, at the top of the breath half a period in, and
 * back.
 */
const seatedBreath = (rig: Figure, stance: Seated, side: string, neck: number) => {
  const { period, width, neck: rise } = stance.breath;
  return timeline(
    rig,
    'breath',
    period,
    {
      [side]: {
        scaleX: [
          [0, 1],
          [period / 2, width],
          [period, 1],
        ],
      },
      neck: {
        y: [
          [0, neck],
          [period / 2, neck + rise],
          [period, neck],
        ],
      },
    },
    { loop: true },
  );
};

/**
 * A composed figure's artboard and view model. Rive draws a node's
 * children front first: the head over the garment, the garment over the
 * feet, and on the garment what lies on it with no line of its own, then the
 * given robe, the stain and the garment's own paper. The stain's node is
 * made before the head's, what lies on the garment after it, and the gaze's
 * binds after the body.
 */
export const drawFigure = <K extends string>(rig: Figure, f: ComposedFigure<K>): Element[] => {
  const stain = f.states.stain === undefined ? [] : [stainOf(rig, f.states.stain)];
  const head = headOf(rig, f);
  const over = f.over === undefined ? [] : bandsOf(rig, f.over);
  if (isSeated(f)) {
    const body = seatedOf(rig, f, head, over, stain);
    const figure = el('Node', { x: f.art.head[0], y: f.art.head[1], name: 'figure' }, [
      gazeTarget(rig, f.knobs),
      body,
    ]);
    const breath = seatedBreath(rig, f.stance, `${garmentKey(f.body)}Side`, f.head.neck);
    return artboard(rig, f.art, [figure], [breath, boilTimeline(rig)], f.knobs);
  }
  const body = standingOf(rig, f, head, over, stain);
  const figure = el('Node', { x: f.art.feet[0], y: f.art.feet[1], name: 'figure' }, [
    gazeTarget(rig, f.knobs),
    body,
  ]);
  const breath = standingBreath(rig, f.stance, f.head.neck);
  return artboard(rig, f.art, [figure], [breath, boilTimeline(rig)], f.knobs);
};

/** A hand's artboard: its circle's centre at the artboard's centre, room round it for its outline. */
export const HAND_ART = { width: 64, height: 64, r: 19 } as const;

/**
 * The circle hand's artboard in `p` (checked again here, as a part checks
 * its paper): one plain circle of paper, no thumb, no fingers, its cast left
 * to the host, which draws it where it works, over scenery its figure stands
 * behind (the dock's rail, the table, the bench) or over the figure itself.
 * `size` times the house hand, artboard and circle, in the house line, so a
 * hand held out big keeps its figure's ink.
 */
export const drawHand = (rig: Figure, p: Paper, size = 1): Element[] =>
  artboard(
    rig,
    { width: HAND_ART.width * size, height: HAND_ART.height * size },
    [
      el(
        'Node',
        { x: (HAND_ART.width * size) / 2, y: (HAND_ART.height * size) / 2, name: 'hand' },
        [hand(rig, 'palm', HAND_ART.r * size, looked(paper(p, 'hand'), { ground: 'host' }))],
      ),
    ],
    [boilTimeline(rig)],
  );
