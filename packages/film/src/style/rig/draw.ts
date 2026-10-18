// How the house draws a composed figure (`figure`, `style/figure.ts`) as a
// Rive artboard, on the generator's parts: each part kind cut, inked, lit
// and rimmed one way, and a figure's nodes made in one order for its stance,
// so one composition prints one project, id for id (the ids are handed out
// in the order the nodes are made, `Figure.idOf`, and the boil draws its
// noise in the order the pieces are). And the circle hand's own artboard, in
// one paper, which the host draws wherever the hand works. Pure.

import type { ComposedFigure } from '../figure.ts';
import { type Paper, looked, paper } from '../paper.ts';
import type { Tunic } from '../parts/body.ts';
import type { StubLegs } from '../parts/feet.ts';
import type { RoundHead } from '../parts/head.ts';
import type { KitA } from '../parts/kit.ts';
import type { Standing } from '../parts/stance.ts';
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
  piece,
  timeline,
} from './parts.ts';
import { type Element, el } from './rml.ts';
import { blotOutline, roundedPolygon } from './shapes.ts';

/** The view model's property keys a figure's nodes bind (`rive schema`). */
const KEY = { y: 14, rotation: 15, opacity: 18 } as const;

/** The points round a round head: enough that its crease and its rim run smooth. */
const ROUND_POINTS = 22;

/** How far a stain's edge wanders from its ellipse, a share of its size. */
const STAIN_WANDER = 0.07;

/** How far a stub leg reaches up under the hem, units, so no gap opens as the trunk breathes. */
const LEG_TUCK = 16;

/** The points round a stub leg's foot, a half circle. */
const FOOT_POINTS = 9;

/** A stub leg's boil: a little less than a body piece's, as a hand's. */
const LEG_BOIL = 0.6;

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

/**
 * A standing figure's breath: its trunk lifts from the hem and its neck with
 * it, at the top of the breath half a period in, and back.
 */
const breathOf = (rig: Figure, stance: Standing, neck: number) => {
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
 * A composed figure's artboard and view model. Rive draws a node's
 * children front first: the head over the garment's shoulders, the garment
 * over the legs, and on the garment the given robe over the stain over the
 * garment's own paper. The stain's node is made before the head's.
 */
export const drawFigure = <K extends string>(rig: Figure, f: ComposedFigure<K>): Element[] => {
  const { body: garment, states } = f;
  const stain = states.stain === undefined ? [] : [stainOf(rig, states.stain)];
  const head = roundHeadOf(rig, f.head, f.face);
  const outline = tunicOutline(garment);
  const body = el('Node', { name: 'body', id: rig.idOf('body') }, [
    rig.bind('lean', KEY.rotation),
    head,
    el('Node', { y: garment.hem, name: 'trunk', id: rig.idOf('trunk') }, [
      el('Node', { y: -garment.hem, name: 'tunicSide' }, [
        ...(states.robe === undefined
          ? []
          : [
              el('Node', { name: 'robe', id: rig.idOf('robe') }, [
                rig.bind('robe', KEY.opacity),
                piece(rig, 'robePaper', outline, looked(states.robe.paper)),
              ]),
            ]),
        ...stain,
        piece(rig, 'tunic', outline, looked(garment.paper)),
      ]),
    ]),
    piece(rig, 'legL', legOutline(f.feet, garment.hem, -f.feet.x), looked(f.feet.paper), {
      boil: LEG_BOIL,
    }),
    piece(rig, 'legR', legOutline(f.feet, garment.hem, f.feet.x), looked(f.feet.paper), {
      boil: LEG_BOIL,
    }),
  ]);
  const figure = el('Node', { x: f.art.feet[0], y: f.art.feet[1], name: 'figure' }, [
    gazeTarget(rig, f.knobs),
    body,
  ]);
  return artboard(
    rig,
    f.art,
    [figure],
    [breathOf(rig, f.stance, f.head.neck), boilTimeline(rig)],
    f.knobs,
  );
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
