// The accused as a Rive rig, from the court's figure parts (`parts.ts`): a
// grey paper person in the paper-cut figure language, its acting split
// between the rig and the host.
//
// - bones: hips → chest → head (→ jaw), each piece skinned to them, so the
//   bow hunches the body and tucks the chin instead of turning rigid pieces;
// - cloth: the scarlet sash's two tails hang on three-bone chains whose swing
//   lags the body (overlap and settle, keyed);
// - hands: two plain circles that float beside the body at rest, come
//   together in front of it on the bow, and spring open at the verdict;
// - the face kit, moved by the view model `Accused` (`FACE`): the host sets
//   the numbers from the court's cues;
// - timelines named for the court's cues (`bow`, `stamp`, `lift`) plus a
//   `breath` loop and the paper's `boil`.
//
// Rive never owns the clock: the host sets each timeline's time and each
// view-model number from the frame (`accused.ts`).

import { hash2 } from '@bible/film/core';
import { ramps as R } from '../../palette.ts';
import { DIRECTION, type Direction, HEADS, dressOf } from './direction.ts';
import {
  type BoneSpec,
  DOWN,
  FACE,
  FIGURE,
  type Figure,
  type Influence,
  type K,
  type Pt,
  type Skeleton,
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
  smooth,
  timeline,
} from './parts.ts';
import { el } from './rml.ts';

/** The artboard, and where the figure's feet stand on it (its origin). */
export const ACCUSED_ART = { width: 320, height: 300, feet: [160, 280] } as const;

/** The neck's height over the feet, and the head's height over the neck, as drawn: the head is 76 of the figure's 203 units, about ⅓. */
const NECK = -127;
const HEAD_H = 76;

/**
 * The head under the head axis (`direction.ts`, D): its scale about the
 * neck, the factor that makes it the axis's share of the figure's height (1
 * as drawn), which the judge's head takes too; its centre over the feet; and
 * the face's centre in the head's upright frame (the neck at 0, 0).
 */
export const accusedHead = (d: Direction) => {
  const share = HEADS[d.head];
  const scale = share === null ? 1 : (share * -NECK) / (HEAD_H * (1 - share));
  return { scale, y: NECK - (HEAD_H / 2) * scale, face: -37 * scale };
};

/** The face `check` reads under `d` (`RivePropSpec.face`): its node, and the head's height at the axis's scale. */
export const accusedFace = (d: Direction) => ({
  node: 'face',
  height: HEAD_H * accusedHead(d).scale,
});

/** The view model's numbers at rest under `d`: the face kit's, the eyes on us. */
const accusedKnobs = (d: Direction) => ({ ...FACE, gazeX: 0, gazeY: accusedHead(d).y }) as const;

/** The view model's numbers at rest, as `figures.riv` is built (`DIRECTION`). */
export const ACCUSED_KNOBS = accusedKnobs(DIRECTION);

/** The timelines a host poses, their authored length in seconds, and the share of it its cue spans. */
export const ACCUSED_TIMELINES = {
  breath: { seconds: 4, move: 4 },
  bow: { seconds: 1.4, move: 0.35 },
  stamp: { seconds: 0.6, move: 0.2 },
  lift: { seconds: 1.2, move: 0.37 },
  boil: { seconds: 4, move: 4 },
} as const;
export type AccusedTimeline = keyof typeof ACCUSED_TIMELINES;

/** The body's chain, its head scaled `hs`: hips at the waist's foot, chest to the neck, head to its centre, jaw back down to the chin; the sash's tails from its knot. */
const bones = (hs: number): ReadonlyArray<BoneSpec> => [
  { name: 'hips', x: 0, y: -20, rotation: UP, length: 50 },
  { name: 'chest', parent: 'hips', rotation: 0, length: 58 },
  { name: 'head', parent: 'chest', rotation: 0, length: 37 * hs },
  { name: 'jaw', parent: 'head', rotation: Math.PI, length: 38 * hs },
  { name: 'tailA0', x: 15, y: -40, rotation: DOWN - 0.18, length: 9 },
  { name: 'tailA1', parent: 'tailA0', rotation: 0.06, length: 9 },
  { name: 'tailA2', parent: 'tailA1', rotation: 0.04, length: 9 },
  { name: 'tailB0', x: 17, y: -40, rotation: DOWN + 0.32, length: 8 },
  { name: 'tailB1', parent: 'tailB0', rotation: -0.05, length: 8 },
  { name: 'tailB2', parent: 'tailB1', rotation: -0.03, length: 8 },
];

/**
 * The hands: radius, their rest beside the hips (the near one screen right),
 * and where they go, from that rest (the far hand's mirrored).
 */
export const HAND = {
  r: 10,
  x: 49,
  y: -50,
  /** On the bow: together in front of the body, low, the near one over the far. */
  clasp: [-38, 4],
  /**
   * On the verdict: up and open, then settled a little lower. The far hand
   * springs out; the near one rises before the chest, since out on its side
   * stands the evidence stack (`SHEETS` in `looks/cutpaper/court.ts`, its
   * left edge about 44 units right of the feet), which it must clear.
   */
  spring: { near: [-24, -50], far: [22, -30] },
  open: { near: [-22, -36], far: [14, -18] },
} as const;

/** The pose the bow ends in, which the lift starts from. */
const BOWED = {
  chestRot: 0.045,
  chestLen: 0.93,
  headRot: 0.15,
  jaw: 0.88,
  faceY: 6,
  faceSy: 0.9,
  bodyY: 0,
} as const;

/** A stain: eleven control points round a blob (the canvas look's `blob`). */
const blob = (x: number, y: number, w: number, h: number, seed: number): Pt[] =>
  Array.from({ length: 11 }, (_, i) => {
    const a = (2 * Math.PI * i) / 11;
    const k = 0.78 + 0.3 * hash2(i, seed);
    return [x + ((Math.cos(a) * w) / 2) * k, y + ((Math.sin(a) * h) / 2) * k] as const;
  });

/** The accused's two stains (`court.ts`'s `FIGURE_STAIN_SPOTS`). */
const STAINS: ReadonlyArray<Pt[]> = [blob(10, -76, 30, 38, 7), blob(-14, -52, 14, 16, 11)];

/** The torso's two bones blended up the body: hips at the hem, chest from the ribs. */
const torsoWeigh = (p: Pt): Influence => {
  const up = smooth(-38, -100, p[1]);
  return [
    [0, 1 - up],
    [1, up],
  ];
};

/** The head's two bones: the upper head (centre `y`, scaled `hs`) rigid, its lower half riding the jaw. */
const headWeigh =
  ({ y, scale: hs }: { readonly y: number; readonly scale: number }) =>
  (p: Pt): Influence => {
    const down = smooth(y - 3 * hs, y + 25 * hs, p[1]);
    return [
      [0, 1 - down],
      [1, down],
    ];
  };

/** A tail's three links: each vertex shared between the two links it lies between. */
const tailWeigh =
  (sk: Skeleton, tail: 'A' | 'B') =>
  (p: Pt): Influence => {
    const [rx, ry] = sk.root(`tail${tail}0`);
    const s = Math.hypot(p[0] - rx, p[1] - ry) / sk.length(`tail${tail}0`);
    const i = Math.min(2, Math.floor(s));
    const f = s - i;
    if (i >= 2 || f < 0.5) return [[i, 1]];
    return [
      [i, 1.5 - f],
      [i + 1, f - 0.5],
    ];
  };

/** A strip of cloth hanging along a tail's bones, `w0` wide at the knot to `w1` at its end, clockwise. */
const tailStrip = (sk: Skeleton, tail: 'A' | 'B', w0: number, w1: number): Pt[] => {
  const spine: Pt[] = [
    sk.root(`tail${tail}0`),
    sk.tip(`tail${tail}0`),
    sk.tip(`tail${tail}1`),
    sk.tip(`tail${tail}2`),
  ];
  const side = (sgn: number): Pt[] =>
    spine.map((p, i) => {
      const q = spine[Math.min(spine.length - 1, i + 1)] ?? p;
      const o = spine[Math.max(0, i - 1)] ?? p;
      const dx = q[0] - o[0];
      const dy = q[1] - o[1];
      const l = Math.hypot(dx, dy) || 1;
      const w = (w0 + ((w1 - w0) * i) / (spine.length - 1)) / 2;
      return [p[0] - (sgn * dy * w) / l, p[1] + (sgn * dx * w) / l];
    });
  return [...side(1), ...side(-1).reverse()];
};

/**
 * A lagging swing: a link of cloth starting from `from`, kicked toward `kick`
 * `lag` s after the body moves, overshooting back and settling at `to`.
 */
const swing = (from: number, to: number, kick: number, lag: number): K[] => [
  [0, from],
  [lag, from, 'io'],
  [lag + 0.16, to + kick, 'io'],
  [lag + 0.38, to - kick * 0.45, 'io'],
  [lag + 0.62, to + kick * 0.15, 'io'],
  [lag + 0.9, to],
];

/** The tails' swing on a move, each link later and wider. */
const tails = (sk: Skeleton, kick: number) =>
  Object.fromEntries(
    (['A', 'B'] as const).flatMap((tail) =>
      [0, 1, 2].map((i) => {
        const name = `tail${tail}${i}`;
        const r = sk.rest(name);
        const amp = kick * (1 + 0.5 * i) * (tail === 'A' ? 1 : 0.8);
        return [`bone:${name}`, { rotation: swing(r, r, amp, 0.05 + 0.06 * i) }] as const;
      }),
    ),
  );

/**
 * A hand's keys across a move, as offsets from its rest: from `from` to `to`
 * through `over` at the move's middle when given, x leaving after y so it
 * travels on a curve, never a line.
 */
const handTrack = (
  from: readonly [number, number],
  to: readonly [number, number],
  start: number,
  end: number,
  over?: readonly [number, number],
) => {
  const mid = (start + end) / 2;
  const through = (i: 0 | 1, lag: number): K[] =>
    over === undefined ? [] : [[mid + lag, over[i], 'io']];
  return {
    x: [[0, from[0]], [start + 0.04, from[0], 'out'], ...through(0, 0.04), [end, to[0]]],
    y: [[0, from[1]], [start, from[1], 'io'], ...through(1, 0), [end, to[1]]],
  } satisfies Record<string, K[]>;
};

/** A hand's offsets for the far side: the near hand's, mirrored. */
const mirror = (p: readonly [number, number]) => [-p[0], p[1]] as const;

/** The accused's artboard and view model. */
export const accusedRig = (fig: Figure) => {
  const head = accusedHead(fig.direction);
  const { scale: hs, face: faceY } = head;
  const knobs = accusedKnobs(fig.direction);
  const dress = dressOf(fig.direction);
  const sk = skeleton(fig, bones(hs));
  const torso = { skeleton: sk, bones: ['hips', 'chest'], weigh: torsoWeigh };
  const scarlet = { color: R.scarlet.base, shade: R.scarlet.shade, light: R.scarlet.light };

  // The surfaces a cast shadow can fall on, front to back as they are drawn,
  // each in its paper's shade; the ground casts go behind the backmost leg.
  const on = (...keys: ReadonlyArray<string>) => ({
    surfaces: keys.map((key) => ({
      key,
      shade:
        key === 'tunic'
          ? dress.tunic.shade
          : key.startsWith('leg')
            ? dress.legs.shade
            : R.scarlet.shade,
    })),
    behind: 'leg13',
  });
  const stains = STAINS.map((_, i) => `stain${i}`);
  const legs = ['leg-13', 'leg13'];

  const headSpace = el('Node', { rotation: Math.PI / 2, name: 'headSpace' }, [
    faceKit(fig, { x: 0, y: faceY, scale: hs }),
  ]);
  const body = sk.element('hips', [
    sk.element('chest', [sk.element('head', [headSpace, lookAt(fig), sk.element('jaw', [])])]),
  ]);
  // A hand travels over the whole front of him: its shadow falls on whatever it passes.
  const handNode = (side: 'near' | 'far', x: number) =>
    el('Node', { x, y: HAND.y, name: `${side}Breath`, id: fig.idOf(`${side}Breath`) }, [
      el('Node', { name: `${side}Hand`, id: fig.idOf(`${side}Hand`) }, [
        hand(fig, `${side}Palm`, HAND.r, {
          ...FIGURE,
          over: on('tailA', 'tailB', 'knot', 'sash', ...stains, 'tunic'),
        }),
      ]),
    ]);

  const figure = el('Node', { x: ACCUSED_ART.feet[0], y: ACCUSED_ART.feet[1], name: 'figure' }, [
    gazeTarget(fig, knobs),
    el('Node', { name: 'body', id: fig.idOf('body') }, [
      // Front to back: the first child draws on top. Both hands float in front.
      handNode('near', HAND.x),
      handNode('far', -HAND.x),
      body,
      piece(
        fig,
        'head',
        ellipse(0, head.y, 35 * hs, 38 * hs, 18),
        { ...FIGURE, over: on('tunic') },
        { skin: { skeleton: sk, bones: ['head', 'jaw'], weigh: headWeigh(head) } },
      ),
      ...(['A', 'B'] as const).map((t) =>
        piece(
          fig,
          `tail${t}`,
          tailStrip(sk, t, t === 'A' ? 8 : 7, t === 'A' ? 10 : 8),
          { ...scarlet, shade: undefined, ink: 'trim', shadow: 0.2, over: on('tunic', ...legs) },
          {
            skin: {
              skeleton: sk,
              bones: [`tail${t}0`, `tail${t}1`, `tail${t}2`],
              weigh: tailWeigh(sk, t),
            },
            boil: 0,
          },
        ),
      ),
      piece(
        fig,
        'knot',
        ellipse(16, -40, 6, 5, 8),
        { ...scarlet, shade: undefined, ink: 'trim', shadow: 0.2, over: on('sash', 'tunic') },
        { skin: torso, boil: 0 },
      ),
      piece(
        fig,
        'sash',
        roundRect(0, -40, 70, 8, 3, 1),
        { ...scarlet, ink: 'trim', shadow: 0.15, over: on('tunic') },
        { skin: torso, boil: 0 },
      ),
      // A stain lies inside the tunic: its whole shadow falls on it.
      ...STAINS.map((pts, i) =>
        piece(
          fig,
          `stain${i}`,
          pts,
          { ...scarlet, shade: undefined, ink: 'none', shadow: 0.1, cast: dress.tunic.shade },
          { skin: torso, boil: 1 },
        ),
      ),
      piece(
        fig,
        'tunic',
        roundRect(0, -72, 66, 112, 22, 3),
        { ...dress.tunic, over: on(...legs) },
        { skin: torso },
      ),
      ...[-13, 13].map((x) =>
        piece(
          fig,
          `leg${x}`,
          roundRect(x, -10, 16, 22, 5, 2),
          { ...dress.legs, shade: undefined, ink: 'small' },
          { boil: 0.7 },
        ),
      ),
      ...(['A', 'B'] as const).map((t) =>
        sk.element(`tail${t}0`, [sk.element(`tail${t}1`, [sk.element(`tail${t}2`, [])])]),
      ),
    ]),
  ]);

  const rest = [0, 0] as const;
  const bow = timeline(fig, 'bow', ACCUSED_TIMELINES.bow.seconds, {
    'bone:chest': {
      rotation: [
        [0, 0],
        [0.33, BOWED.chestRot + 0.01, 'io'],
        [0.5, BOWED.chestRot],
      ],
      scaleX: [
        [0, 1, 'out'],
        [0.3, BOWED.chestLen - 0.01, 'io'],
        [0.52, BOWED.chestLen],
      ],
    },
    'bone:head': {
      rotation: [
        [0, 0],
        [0.06, 0, 'out'],
        [0.4, BOWED.headRot + 0.03, 'io'],
        [0.62, BOWED.headRot],
      ],
    },
    'bone:jaw': {
      scaleX: [
        [0, 1],
        [0.06, 1, 'out'],
        [0.38, BOWED.jaw],
      ],
    },
    face: {
      y: [
        [0, faceY],
        [0.04, faceY, 'out'],
        [0.36, faceY + (BOWED.faceY + 1) * hs, 'io'],
        [0.56, faceY + BOWED.faceY * hs],
      ],
      scaleY: [
        [0, hs],
        [0.04, hs, 'out'],
        [0.36, BOWED.faceSy * hs],
      ],
    },
    nearHand: handTrack(rest, HAND.clasp, 0.04, 0.62),
    farHand: handTrack(rest, mirror(HAND.clasp), 0.1, 0.7),
    body: {
      y: [
        [0, 0],
        [0.1, 1.6, 'io'],
        [0.36, BOWED.bodyY],
      ],
    },
    ...tails(sk, 0.16),
  });

  const lift = timeline(fig, 'lift', ACCUSED_TIMELINES.lift.seconds, {
    'bone:chest': {
      rotation: [
        [0, BOWED.chestRot],
        [0.3, -0.03, 'io'],
        [0.6, -0.008],
      ],
      scaleX: [
        [0, BOWED.chestLen, 'out'],
        [0.26, 1.06, 'io'],
        [0.46, 0.99, 'io'],
        [0.66, 1.01],
      ],
    },
    'bone:head': {
      rotation: [
        [0, BOWED.headRot, 'out'],
        [0.3, -0.1, 'io'],
        [0.52, -0.02, 'io'],
        [0.74, -0.035],
      ],
    },
    'bone:jaw': {
      scaleX: [
        [0, BOWED.jaw, 'out'],
        [0.26, 1.07, 'io'],
        [0.56, 1],
      ],
    },
    face: {
      y: [
        [0, faceY + BOWED.faceY * hs, 'out'],
        [0.26, faceY - 1.5 * hs, 'io'],
        [0.54, faceY - 0.5 * hs],
      ],
      scaleY: [
        [0, BOWED.faceSy * hs, 'out'],
        [0.26, 1.05 * hs, 'io'],
        [0.54, hs],
      ],
    },
    nearHand: handTrack(HAND.clasp, HAND.open.near, 0.02, 0.62, HAND.spring.near),
    farHand: handTrack(
      mirror(HAND.clasp),
      mirror(HAND.open.far),
      0.06,
      0.68,
      mirror(HAND.spring.far),
    ),
    body: {
      y: [
        [0, BOWED.bodyY, 'out'],
        [0.22, -3.2, 'io'],
        [0.5, -0.6],
      ],
    },
    ...tails(sk, -0.24),
  });

  const stamp = timeline(fig, 'stamp', ACCUSED_TIMELINES.stamp.seconds, {
    body: {
      scaleY: [
        [0, 1, 'out'],
        [0.05, 0.972, 'io'],
        [0.24, 1.008, 'io'],
        [0.4, 1],
      ],
      scaleX: [
        [0, 1, 'out'],
        [0.05, 1.012, 'io'],
        [0.24, 0.997, 'io'],
        [0.4, 1],
      ],
    },
  });

  const breath = timeline(
    fig,
    'breath',
    ACCUSED_TIMELINES.breath.seconds,
    {
      'bone:chest': {
        scaleY: [
          [0, 1],
          [2, 1.025],
          [4, 1],
        ],
      },
      nearBreath: {
        y: [
          [0, HAND.y],
          [2, HAND.y - 1.6],
          [4, HAND.y],
        ],
      },
      farBreath: {
        y: [
          [0, HAND.y],
          [0.3, HAND.y],
          [2.3, HAND.y - 1.6],
          [4, HAND.y],
        ],
      },
    },
    { loop: true },
  );

  return artboard(fig, ACCUSED_ART, [figure], [breath, bow, stamp, lift, boilTimeline(fig)], knobs);
};
