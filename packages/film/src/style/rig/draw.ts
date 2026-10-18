// How the house draws a composed figure (`figure`, `style/figure.ts`) as a
// Rive artboard, on the generator's parts: each part kind cut, inked, lit
// and rimmed one way, a head's papers stacked by one rule (`tracedHeadOf`),
// and a figure's nodes made in one order for its stance, so one composition
// prints one project, id for id (the ids are handed out in the order the
// nodes are made, `Figure.idOf`, and the boil draws its noise in the order
// the pieces are). And the circle hand's own artboard, in one paper, which
// the host draws wherever the hand works. Pure.

import {
  type ComposedFigure,
  type Parts,
  type SeatedParts,
  type StandingParts,
  isSeated,
} from '../figure.ts';
import { type Paper, looked, paper } from '../paper.ts';
import { ARM_SIDES, type Arm, type ArmSide } from '../parts/arm.ts';
import type { Beard } from '../parts/beard.ts';
import type { Garment, Tunic } from '../parts/body.ts';
import type { Ear } from '../parts/ear.ts';
import type { Feet, Sandals, Shoes, StubLegs } from '../parts/feet.ts';
import type { Hair } from '../parts/hair.ts';
import type { Headcloth } from '../parts/headcloth.ts';
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
import {
  blotOutline,
  roundedPolygon,
  shifted,
  shoeLight,
  shoeOutline,
  tucked,
  tuckedRimmed,
} from './shapes.ts';

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

/** How far a bearded head's paper lies under the seams of the papers over it past its rim's width, units. */
const TUCK_UNDER_RIM = 2;

/**
 * A sandal's sole: its leather under a foot's last `depth` units, from
 * `past` units beyond its heel to as far beyond its toe and `under` units
 * down past the ground, clipped to the foot.
 */
const SOLE = { depth: 6.5, past: 4, under: 4 } as const;

/** The face kit's eyes, by their shapes' names. */
const EYES: ReadonlySet<unknown> = new Set(['eyeL', 'eyeR']);

/** `node` with each eye shape in it leaned `lean` radians about its centre. */
const leanEyes = (node: Element, lean: number): Element => {
  const named = node.attrs.find(([k]) => k === 'name')?.[1];
  const attrs = Object.fromEntries(node.attrs);
  const own = node.name === 'Shape' && EYES.has(named);
  return el(
    node.name,
    own ? { ...attrs, rotation: lean } : attrs,
    node.children.map((c) => leanEyes(c, lean)),
  );
};

/**
 * Kit A at its place on the head, its marks as the figure's sheet draws
 * them, its eyes leaned where the concept leans them, turned about its
 * place where the concept draws the face tipped.
 */
const kitOf = (rig: Figure, face: KitA) => {
  const drawn = faceKit(rig, { x: face.x, y: face.y, scale: face.scale }, face.shape);
  const kit = face.eyeLean === undefined ? drawn : leanEyes(drawn, face.eyeLean);
  if (face.rotation === undefined) return kit;
  return el('Node', { x: face.x, y: face.y, rotation: face.rotation, name: 'faceTurn' }, [
    el('Node', { x: -face.x, y: -face.y, name: 'faceAt' }, [kit]),
  ]);
};

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

/** A paper cut inside a traced head's outline: its key, its outline, its paint and its crawl (a part of its `silhouette`). */
interface Cut {
  readonly key: string;
  readonly pts: ReadonlyArray<Pt>;
  readonly look: PieceLook;
  readonly boil?: number;
}

/** The ear or the ears, flat skin inside the head's outline, each crawling as a small piece: both ears the near one first. */
const earsOf = (ear: Ear): Cut[] => {
  const flat = (key: string, pts: ReadonlyArray<Pt>): Cut => ({
    key,
    pts,
    look: looked(ear.paper),
    boil: SMALL_BOIL,
  });
  switch (ear._tag) {
    case 'RoundEar':
      return [flat('ear', ellipse(ear.at[0], ear.at[1], ear.r[0], ear.r[1], EAR_POINTS))];
    case 'TracedEar':
      return [flat('ear', ear.outline)];
    case 'BothEars':
      return [flat('earNear', ear.near), flat('earFar', ear.far)];
  }
};

/** The hair, inside the head's outline, its light laid on it as tones. */
const hairOf = (hair: Hair): Cut => ({
  key: 'hair',
  pts: hair.outline,
  look: looked(hair.paper, { tones: hair.tones ?? [] }),
});

/** A beard and the lip cut in it, the lip in front, the beard's light laid on it as tones. */
const beardOf = (beard: Beard): Cut[] => [
  ...(beard.lip === undefined
    ? []
    : [{ key: 'lip', pts: beard.lip.outline, look: looked(beard.lip.paper) }]),
  { key: 'beard', pts: beard.outline, look: looked(beard.paper, { tones: beard.tones ?? [] }) },
];

/** A headcloth, front first: the band bound round it, its edge down the cheek, the cloth; the colour on the band and the edge laid on each as tones. */
const headclothOf = (cloth: Headcloth): Cut[] => [
  ...(cloth.band === undefined
    ? []
    : [
        {
          key: 'band',
          pts: cloth.band.outline,
          look: looked(cloth.band.paper, { tones: cloth.band.tones ?? [] }),
        },
      ]),
  ...(cloth.edge === undefined
    ? []
    : [
        {
          key: 'clothEdge',
          pts: cloth.edge.outline,
          look: looked(cloth.edge.paper, { tones: cloth.edge.tones ?? [] }),
        },
      ]),
  { key: 'cloth', pts: cloth.outline, look: looked(cloth.paper) },
];

/**
 * What is cut inside a traced head's outline, front first: a beard and its
 * lip, the ear or ears, a headcloth, the hair. An ear given with a headcloth
 * shows over it, and hair under it.
 */
const cutOf = (f: Parts): Cut[] => [
  ...(f.beard === undefined ? [] : beardOf(f.beard)),
  ...(f.ear === undefined ? [] : earsOf(f.ear)),
  ...(f.headcloth === undefined ? [] : headclothOf(f.headcloth)),
  ...(f.hair === undefined ? [] : [hairOf(f.hair)]),
];

/** A traced head's own paper, the colour on its skin laid on it as tones. */
const headPaperOf = (head: TracedHead): Cut => ({
  key: 'headPaper',
  pts: head.outline,
  look: looked(head.paper, { tones: head.tones ?? [] }),
});

/**
 * `papers`, front first, each tucked under those laid over it (`tucked`);
 * the backmost, when it draws a rim (it alone does, `silhouette`), its
 * rim's width and more under their seams (`tuckedRimmed`). So no sliver of
 * a paper behind shows at a seam, or round the silhouette, as their
 * outlines crawl.
 */
const tuckedUnder = (papers: ReadonlyArray<Cut>): Cut[] => {
  const base = papers.length - 1;
  return papers.map((p, i) => {
    const fronts = papers.slice(0, i).map((q) => q.pts);
    const rim = p.look.rim ?? 0;
    const pts =
      i === base && rim > 0
        ? tuckedRimmed(p.pts, fronts, TUCK_UNDER_RIM + rim)
        : tucked(p.pts, fronts);
    return { ...p, pts };
  });
};

/**
 * The mouth thrown open where the kit's mouth sits, at the kit's scale and
 * turned with it: one flat colour with no ink and no lift, its opacity and
 * its height the `shout` number.
 */
const shoutOf = (rig: Figure, mouth: OpenMouth, face: KitA) => {
  const [mx, my] = kitMarks(face.shape).mouth;
  const [dx, dy] = [mx * face.scale, my * face.scale];
  const turn = face.rotation ?? 0;
  const [cos, sin] = [Math.cos(turn), Math.sin(turn)];
  const at = { x: face.x + (dx * cos - dy * sin), y: face.y + (dx * sin + dy * cos) };
  const flat: PieceLook = { color: mouth.paper, light: mouth.paper, ink: 'none', shadow: 0 };
  return el('Node', { ...at, rotation: face.rotation, name: 'shout' }, [
    rig.bind('shout', KEY.opacity),
    el('Node', { name: 'shoutOpen', id: rig.idOf('shoutOpen') }, [
      rig.bind('shout', KEY.scaleY),
      piece(rig, 'shoutPaper', ellipse(0, 0, mouth.w / 2, mouth.h / 2, MOUTH_POINTS), flat),
    ]),
  ]);
};

/** The open mouth, when the figure has one. */
const shoutsOf = (rig: Figure, f: Parts) =>
  f.mouth === undefined ? [] : [shoutOf(rig, f.mouth, f.face)];

/**
 * A traced head on its neck, set on the body as its concept sets it
 * (carried off the body's middle, and canted where the concept cants it):
 * it turns about the neck (`tilt`) and sinks toward the body (`nod`); what
 * is cut inside its outline (`cutOf`), its open mouth and its face kit lie
 * over its paper, and one ink line runs round them all (`silhouette`). Its
 * papers stack by one rule, keyed on a beard. A bearded head's mouth is
 * drawn in its beard, so its open mouth and its face kit lie over every
 * part cut from it, the kit made first (its ids start with the face's), and
 * each paper tucks under those laid over it (`tuckedUnder`): Christ's, the
 * farmer's. A head with no beard lays its open mouth and its face kit under
 * what is cut from it, over its paper, untucked: the locked three's.
 */
const tracedHeadOf = (rig: Figure, f: Parts, head: TracedHead) => {
  const face = f.beard === undefined ? undefined : kitOf(rig, f.face);
  return el('Node', { y: head.neck, name: 'neck', id: rig.idOf('neck') }, [
    el('Node', { name: 'head', id: rig.idOf('head') }, [
      rig.bind('tilt', KEY.rotation),
      el('Node', { name: 'nodded', id: rig.idOf('nodded') }, [
        rig.bind('nod', KEY.y),
        el(
          'Node',
          { x: head.set.x, y: head.y - head.neck, rotation: head.set.cant, name: 'skull' },
          [
            silhouette(
              rig,
              'headCut',
              face === undefined
                ? [...cutOf(f), ...shoutsOf(rig, f), kitOf(rig, f.face), headPaperOf(head)]
                : [...shoutsOf(rig, f), face, ...tuckedUnder([...cutOf(f), headPaperOf(head)])],
            ),
          ],
        ),
      ]),
    ]),
  ]);
};

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

/** A garment's outline: a tunic cut from its neck and hem, a cut robe from its corners, a traced robe as traced. */
const garmentOutline = (g: Garment): ReadonlyArray<Pt> => {
  switch (g._tag) {
    case 'Tunic':
      return tunicOutline(g);
    case 'CutRobe':
      return roundedPolygon(g.corners, g.radii);
    case 'TracedRobe':
      return g.outline;
  }
};

/** What a garment's piece is named, and its side's node after it. */
const garmentKey = (g: Garment) => (g._tag === 'Tunic' ? 'tunic' : 'robe');

/** The colour laid on a garment, clipped to it: a robe's (a sash, a vest, a neckline's skin); a tunic lays none. */
const tonesOn = (g: Garment) => (g._tag === 'Tunic' ? [] : (g.tones ?? []));

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
 * An arm in its sleeve on its pivot, turned there by its side's number
 * (`nearArm`, `farArm`): the sleeve's paper in the pose it is traced in,
 * the colour on it laid on it as tones.
 */
const armOf = (rig: Figure, side: ArmSide, arm: Arm): Element => {
  const key = `${side}Sleeve`;
  return el(
    'Node',
    { x: arm.pivot[0], y: arm.pivot[1], name: `${key}Arm`, id: rig.idOf(`${key}Arm`) },
    [
      rig.bind(`${side}Arm`, KEY.rotation),
      el('Node', { x: -arm.pivot[0], y: -arm.pivot[1], name: `${key}At` }, [
        piece(rig, key, arm.outline, looked(arm.paper, { tones: arm.tones ?? [] })),
      ]),
    ],
  );
};

/**
 * A garment's own paper: with arms, the arms behind it, the near one first,
 * cut in one outline with it (`silhouette`), so a sleeve grows out of the
 * garment with no line where it leaves it. The arms are made before it.
 */
const garmentOf = (rig: Figure, f: Parts, outline: ReadonlyArray<Pt>): Element => {
  const key = garmentKey(f.body);
  const look = looked(f.body.paper, { tones: tonesOn(f.body) });
  const arms = ARM_SIDES.flatMap((side) => {
    const arm = f.arms[side];
    return arm === undefined ? [] : [armOf(rig, side, arm)];
  });
  return arms.length === 0
    ? piece(rig, key, outline, look)
    : silhouette(rig, `${key}Cut`, [{ key, pts: outline, look }, ...arms]);
};

/**
 * What lies on a garment's side, front first: what lies on it with no line
 * of its own (`over`, made before the body), the given robe, the stain
 * (made before the head), and the garment's own paper with its arms. The
 * given robe and the garment's paper are made here, inside the side's node.
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
    garmentOf(rig, f, outline),
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

/** A sandal's sole under the foot cut from `corners`, as `SOLE` lays it. */
const soleOf = (corners: ReadonlyArray<Pt>): Pt[] => {
  const xs = corners.map(([x]) => x);
  const [heel, toe] = [Math.min(...xs) - SOLE.past, Math.max(...xs) + SOLE.past];
  return [
    [heel, -SOLE.depth],
    [toe, -SOLE.depth],
    [toe, SOLE.under],
    [heel, SOLE.under],
  ];
};

/** Sandals: each bare foot cut from its corners, what lies on it and then its sole laid on it as tones, crawling as a small piece; the near one first. */
const sandalsOf = (rig: Figure, s: Sandals) =>
  (
    [
      ['footNear', s.near],
      ['footFar', s.far],
    ] as const
  ).map(([key, foot]) =>
    piece(
      rig,
      key,
      roundedPolygon(foot.corners, foot.radii),
      looked(s.paper, {
        tones: [...(foot.tones ?? []), { pts: soleOf(foot.corners), color: s.sole }],
      }),
      { boil: SMALL_BOIL },
    ),
  );

/** A figure's feet under the hem at `hem`. */
const feetOf = (rig: Figure, feet: Feet, hem: number) => {
  switch (feet._tag) {
    case 'Shoes':
      return shoesOf(rig, feet);
    case 'StubLegs':
      return legsOf(rig, feet, hem);
    case 'Sandals':
      return sandalsOf(rig, feet);
  }
};

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
 * given robe, the stain, the garment's own paper and its arms behind it. The stain's node is
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
