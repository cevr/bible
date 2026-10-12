// The accused with bones for paper (`skeleton`, @bible/film/canvas): the
// cutpaper control's paper person (`kit.ts`'s `person`, read-only, its pieces
// copied here) with its torso and head skinned, so the bow deforms the paper
// itself. The same four bones as the Rive rig (`looks/rive/rig.ts`): hips →
// chest → head, the jaw back down the lower head; and two more the Rive rig
// lacks, a shoulder each from the neck out to the tunic's top corners. The
// tunic bends along hips → chest, its top corners on the shoulders; its
// stains along hips → chest; the head's upper half rides the head bone and
// its lower half the jaw. The face rides the head whole.
//
// The jaw squashes toward its start, the head's centre, so it would lift the
// chin off the neck: the head sinks by just what the jaw takes off (its
// `shift`), keeping the chin on the neck and the crown coming down. A
// front-facing figure that turns tilts sideways, so the bow is not a turn:
// the chest shortens and widens, the shoulders round down and in, the head
// sinks, the jaw squashes and the face slides down, with the rig's own small
// turns.
//
// Posed on the court's cues as the rig is: `bow` rounds the shoulders, sags
// the tunic's top, sinks the head and squashes the jaw; `stamp` jolts the
// body; `lift` comes up past upright and settles. The rig's keyframes are
// copied with their Rive eases (`io` → inOutSine, `out` → outCubic) moved to
// the key they arrive at, as `keys` reads them. Nothing is carried between
// frames: the pose is made from the frame's own numbers.
//
// `PARITY` poses it with the rig's own values (its shoulders still, as the
// Rive rig has none); `AMPLIFIED` takes each channel further from rest by its
// gain, so the bow reads at film scale. The keys' times and eases are the
// rig's in both, so the amplified bow is the same move, only larger.

import {
  type Hand,
  type Pose,
  type PoseValues,
  type Pt,
  breathOf,
  cutout,
  ellipseShape,
  floatingHand,
  ground,
  probeFace,
  probesFaces,
  probesHands,
  rounded,
  skeleton,
  stroke,
  sub,
} from '@bible/film/canvas';
import { type Key, clamp, keys } from '@bible/film/core';
import { FIGURE_STAINS } from '../../../righteousness-by-faith/court.ts';
import { C, piece } from '../../../righteousness-by-faith/kit.ts';
import type { CourtFrame } from '../../scenes/court.ts';

// ─── the person's pieces, as the kit draws a standing tunic ──────────────────

const HEAD: Pt = [0, -165];
const HEAD_RX = 35;
const HEAD_RY = 38;
const TUNIC_SHAPE = rounded(0, -72, 66, 112, 22);
const LEG_X = [-13, 13] as const;
const EYE_DX = [-12, 13] as const;
const SIDES = [-1, 1] as const;
/** The kit's `PERSON_HAND` and hand style. */
const HAND_STYLE = { skin: C.figure, outline: C.outline, mitten: 22, line: 2.5, radius: 120 };
/** Each hand's shoulder and rest (the near one's; the far one is its mirror). */
const SHOULDER: Pt = [17, -111];
const REST: Pt = [42, -50];

// ─── the bones and the skins ─────────────────────────────────────────────────

const UP = -Math.PI / 2;

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

const [STAIN_A = [], STAIN_B = []] = FIGURE_STAINS;

/** The tunic's half width: each shoulder's length, from the neck to a top corner. */
const SHOULDER_SPAN = 33;
/** The jaw bone's length: from the head's centre to the chin. */
const JAW = 38;

/**
 * The tunic's weights: hips → chest by height as the chain weighs them (the
 * joint at the waist, −70, blended ±25), and the top corners on their
 * shoulders: from 100 up to the top (128) and from 6 out to the corner (26),
 * each by a smoothstep, so the top edge slopes from the neck to the corner
 * and the side curves in below it.
 */
const tunicWeights = ([x, y]: Pt) => {
  const chest = smoothstep(-25, 25, -70 - y);
  const shoulder = smoothstep(80, 128, -y) * smoothstep(0, 33, Math.abs(x));
  return {
    hips: (1 - shoulder) * (1 - chest),
    chest: (1 - shoulder) * chest,
    shoulderL: x < 0 ? shoulder : 0,
    shoulderR: x < 0 ? 0 : shoulder,
  };
};

/**
 * The rig's chain: hips at the waist's foot, chest to the neck (−128), head to
 * its centre, jaw back down to the chin; a shoulder each way from the neck
 * along the tunic's top. Its skins: the tunic, with points added so its long
 * straight sides have points to bend; its two stains, along hips → chest; the
 * head, its upper half on the head bone, from the eyes down onto the jaw (the
 * rig's weights).
 */
const BODY = skeleton('hips', { at: [0, -20], angle: UP, length: 50 })
  .bone('chest', 'hips', { length: 58 })
  .bone('head', 'chest', { length: 37 })
  .bone('jaw', 'head', { angle: Math.PI, length: JAW })
  .bone('shoulderL', 'chest', { angle: -Math.PI / 2, length: SHOULDER_SPAN })
  .bone('shoulderR', 'chest', { angle: Math.PI / 2, length: SHOULDER_SPAN })
  .skin('torso', TUNIC_SHAPE, { weigh: tunicWeights }, { spacing: 4 })
  .skin('stainA', STAIN_A, { chain: ['hips', 'chest'] })
  .skin('stainB', STAIN_B, { chain: ['hips', 'chest'] })
  .skin('head', ellipseShape(HEAD[0], HEAD[1], HEAD_RX, HEAD_RY, 64), {
    weigh: ([, y]) => {
      const jaw = smoothstep(-168, -140, y);
      return { head: 1 - jaw, jaw };
    },
  });
type Bone = (typeof BODY.names)[number];
type Posed = Pose<Bone, 'torso' | 'stainA' | 'stainB' | 'head'>;
const STAINS = ['stainA', 'stainB'] as const;

// ─── the motion, on the cues ─────────────────────────────────────────────────

/** Each cue's timeline: its authored length, and the share of it its cue spans (the rig's `TIMELINES`). */
const TIMELINES = {
  bow: { seconds: 1.4, move: 0.35 },
  stamp: { seconds: 0.6, move: 0.2 },
  lift: { seconds: 1.2, move: 0.37 },
} as const;
type Cue = keyof typeof TIMELINES;

/** What the bow and the lift move. */
type Channel =
  | 'chestTurn'
  | 'chestAlong'
  | 'chestAcross'
  | 'headTurn'
  | 'jawAlong'
  | 'shoulderTurn'
  | 'shoulderAlong'
  | 'faceY'
  | 'faceSy'
  | 'nearX'
  | 'nearY'
  | 'farX'
  | 'farY'
  | 'bodyY';
type Track = Readonly<Record<Channel, ReadonlyArray<Key>>>;

const IO = 'inOutSine';
const OUT = 'outCubic';

/**
 * Head down on "you did it": the rig's `bow`, the chest widening a little as
 * it folds, and the shoulders (ours: the rig has none) rounding down and in
 * with the chest, their turn each way down from the neck.
 */
const BOW: Track = {
  shoulderTurn: [
    [0, 0],
    [0.3, 0.22, OUT],
    [0.52, 0.2, IO],
  ],
  shoulderAlong: [
    [0, 1],
    [0.3, 0.94, OUT],
    [0.52, 0.95, IO],
  ],
  chestTurn: [
    [0, 0],
    [0.33, 0.055, IO],
    [0.5, 0.045, IO],
  ],
  chestAlong: [
    [0, 1],
    [0.3, 0.92, OUT],
    [0.52, 0.93, IO],
  ],
  chestAcross: [
    [0, 1],
    [0.3, 1.035, OUT],
    [0.52, 1.03, IO],
  ],
  headTurn: [
    [0, 0],
    [0.06, 0, IO],
    [0.4, 0.18, OUT],
    [0.62, 0.15, IO],
  ],
  jawAlong: [
    [0, 1],
    [0.06, 1, IO],
    [0.38, 0.88, OUT],
  ],
  faceY: [
    [0, 0],
    [0.04, 0, IO],
    [0.36, 7, OUT],
    [0.56, 6, IO],
  ],
  faceSy: [
    [0, 1],
    [0.04, 1, IO],
    [0.36, 0.9, OUT],
  ],
  nearX: [
    [0, 0],
    [0.4, -3, IO],
  ],
  nearY: [
    [0, 0],
    [0.08, 0, IO],
    [0.42, 4, OUT],
    [0.66, 3, IO],
  ],
  farX: [
    [0, 0],
    [0.46, 3, IO],
  ],
  farY: [
    [0, 0],
    [0.14, 0, IO],
    [0.48, 4, OUT],
    [0.72, 3, IO],
  ],
  bodyY: [
    [0, 0],
    [0.1, 1.6, IO],
    [0.36, 0, IO],
  ],
};

/** Up at the verdict, past upright and back: the rig's `lift`, the shoulders squaring a little past rest. */
const LIFT: Track = {
  shoulderTurn: [
    [0, 0.2],
    [0.26, -0.04, OUT],
    [0.5, 0, IO],
  ],
  shoulderAlong: [
    [0, 0.95],
    [0.26, 1.01, OUT],
    [0.5, 1, IO],
  ],
  chestTurn: [
    [0, 0.045],
    [0.3, -0.012, IO],
    [0.6, 0, IO],
  ],
  chestAlong: [
    [0, 0.93],
    [0.26, 1.035, OUT],
    [0.46, 0.995, IO],
    [0.66, 1, IO],
  ],
  chestAcross: [
    [0, 1.03],
    [0.26, 0.985, OUT],
    [0.5, 1, IO],
  ],
  headTurn: [
    [0, 0.15],
    [0.3, -0.06, OUT],
    [0.52, 0.012, IO],
    [0.74, 0, IO],
  ],
  jawAlong: [
    [0, 0.88],
    [0.26, 1.05, OUT],
    [0.56, 1, IO],
  ],
  faceY: [
    [0, 6],
    [0.26, -3, OUT],
    [0.54, 0, IO],
  ],
  faceSy: [
    [0, 0.9],
    [0.26, 1.04, OUT],
    [0.54, 1, IO],
  ],
  nearX: [
    [0, -3],
    [0.5, 0, IO],
  ],
  nearY: [
    [0, 3],
    [0.06, 3, IO],
    [0.36, -5, OUT],
    [0.66, 0, IO],
  ],
  farX: [
    [0, 3],
    [0.56, 0, IO],
  ],
  farY: [
    [0, 3],
    [0.12, 3, IO],
    [0.42, -5, OUT],
    [0.72, 0, IO],
  ],
  bodyY: [
    [0, 0],
    [0.22, -2.2, OUT],
    [0.5, 0, IO],
  ],
};

/** The verdict's jolt: the whole figure squashed about its feet and back (the rig's `stamp`). */
const STAMP_SY: ReadonlyArray<Key> = [
  [0, 1],
  [0.05, 0.972, OUT],
  [0.24, 1.008, IO],
  [0.4, 1, IO],
];
const STAMP_SX: ReadonlyArray<Key> = [
  [0, 1],
  [0.05, 1.012, OUT],
  [0.24, 0.997, IO],
  [0.4, 1, IO],
];

/** How far the chest widens on a breath in, as a share. */
const BREATH = 0.0125;

/** Each channel's value at rest, which a gain scales the move away from. */
const AT_REST: Readonly<Record<Channel, number>> = {
  chestTurn: 0,
  chestAlong: 1,
  chestAcross: 1,
  headTurn: 0,
  jawAlong: 1,
  shoulderTurn: 0,
  shoulderAlong: 1,
  faceY: 0,
  faceSy: 1,
  nearX: 0,
  nearY: 0,
  farX: 0,
  farY: 0,
  bodyY: 0,
};

/** How far each channel moves from rest, as a share of the rig's move: a channel left out moves as the rig's. */
type Gains = Readonly<Partial<Record<Channel, number>>>;

/** The rig's own values: parity with the Rive look, whose rig has no shoulders to round. */
export const PARITY: Gains = { shoulderTurn: 0, shoulderAlong: 0 };

/**
 * Larger, to read at film scale, and still sincere: a bow, not a lean. The
 * chest and head keep the rig's small turns (0.055 and 0.18 rad); the chest
 * shortens to 0.84 and widens to 1.09, the shoulders round 0.22 rad down
 * from the neck and draw in to 0.94, the jaw squashes to 0.75 and the head
 * sinks with it (the chin stays on the neck), and the face slides down. The
 * lift overshoots to 1.07 along the chest and 1.1 on the jaw before it
 * settles.
 */
export const AMPLIFIED: Gains = {
  chestAlong: 2,
  chestAcross: 2.5,
  jawAlong: 2.1,
  faceY: 1.6,
  faceSy: 1.5,
  nearY: 1.5,
  farY: 1.5,
  bodyY: 1.5,
};

/**
 * Where cue `cue`'s timeline stands at `f.t` (the Rive look's `cueTime`): 0
 * before the cue; across it the move stretched to the cue's own length, so a
 * lab edit to the cue reshapes it; after, the settle in real seconds.
 */
const cueTime = (f: CourtFrame, cue: Cue): number => {
  const { start, dur } = f.cue(cue);
  const since = f.t - start;
  if (since <= 0) return 0;
  const { seconds, move } = TIMELINES[cue];
  if (since < dur) return (since / dur) * move;
  return Math.min(seconds, move + since - dur);
};

/**
 * The frame's motion: the lift's once it has begun (it starts from where the
 * bow ends), else the bow's, each channel's move from rest scaled by its gain.
 */
const motionOf = (f: CourtFrame, gains: Gains) => {
  const lifting = f.t > f.cue('lift').start;
  const track = lifting ? LIFT : BOW;
  const at = lifting ? cueTime(f, 'lift') : cueTime(f, 'bow');
  return (channel: Channel) => {
    const rest = AT_REST[channel];
    return rest + (gains[channel] ?? 1) * (keys(at, track[channel]) - rest);
  };
};

/**
 * The bones' values for a frame's motion `m`, the chest widened by `breath`.
 * The jaw squashes toward the head's centre, lifting the chin by what it
 * loses; the head's start moves back down the chest (its frame's x) by just
 * that, so the chin stays on the neck and the crown comes down instead.
 */
const valuesOf = (m: (channel: Channel) => number, breath: number): PoseValues<Bone> => {
  const jaw = m('jawAlong');
  const shoulder = m('shoulderTurn');
  const along = m('shoulderAlong');
  return {
    hips: { shift: [0, m('bodyY')] },
    chest: { turn: m('chestTurn'), along: m('chestAlong'), across: m('chestAcross') * breath },
    head: { turn: m('headTurn'), shift: [-(1 - jaw) * JAW, 0] },
    jaw: { along: jaw },
    shoulderL: { turn: -shoulder, along },
    shoulderR: { turn: shoulder, along },
  };
};

// ─── the drawing ─────────────────────────────────────────────────────────────

/** The two legs, standing: the kit's. */
const legs = (ctx: CanvasRenderingContext2D, hand: Hand) => {
  for (const x of LEG_X)
    piece(ctx, rounded(x, -10, 16, 22, 5), C.figureShade, sub(hand, 1 + x), {
      role: 'figure',
      line: 2.5,
    });
};

/** The eyes, open, looking `look` from the face's centre: the kit's `eyePair` at `eyes` 1. */
const eyes = (ctx: CanvasRenderingContext2D, [lx, ly]: Pt) => {
  ctx.fillStyle = C.outline;
  for (const dx of EYE_DX) {
    ctx.beginPath();
    ctx.ellipse(HEAD[0] + dx + lx, HEAD[1] - 7 + ly, 3.2, 4.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
};

/** The two brows at rest: the kit's `browOf`. */
const brows = (ctx: CanvasRenderingContext2D, hand: Hand) => {
  for (const side of SIDES) {
    const bx = HEAD[0] + side * 13;
    const by = HEAD[1] - 21;
    stroke(
      ctx,
      [
        [bx - 8, by],
        [bx + 8, by],
      ],
      { color: C.outline, width: 3.4, jitter: 0.3, taper: 0.2, boil: 'crawl' },
      sub(hand, side === -1 ? 8 : 9),
    );
  }
};

/** One floating hand at rest, moved (dx, dy) with the body: the kit's `personHand` with no gesture. */
const restingHand = (
  ctx: CanvasRenderingContext2D,
  away: -1 | 1,
  [dx, dy]: Pt,
  hand: Hand,
  body: ReadonlyArray<ReadonlyArray<Pt>> | undefined,
) =>
  floatingHand(
    ctx,
    {
      shoulder: [away * SHOULDER[0], SHOULDER[1]],
      rest: [away * REST[0] + dx, REST[1] + dy],
      away,
      breath: breathOf(hand),
    },
    undefined,
    HAND_STYLE,
    sub(hand, away === 1 ? 50 : 40),
    body === undefined ? undefined : { over: away === 1, body: () => body },
  );

/** The torso and its stains, bent. */
const torso = (
  ctx: CanvasRenderingContext2D,
  tunic: ReadonlyArray<Pt>,
  hand: Hand,
  pose: Posed,
) => {
  piece(ctx, tunic, C.figure, sub(hand, 3), { role: 'figure' });
  STAINS.forEach((stain, i) =>
    cutout(
      ctx,
      pose.at(stain),
      { color: C.scarlet, torn: 2.5, rim: 0, shadow: 0.1, boil: 'crawl' },
      sub(hand, 60 + i),
    ),
  );
};

/** The face on the head bone, slid down and squashed as the rig's `face` node is, then `draw` in rest units. */
const onFace = (
  ctx: CanvasRenderingContext2D,
  pose: Posed,
  faceY: number,
  faceSy: number,
  draw: () => void,
) => {
  const [a, b, c, d, e, g] = pose.rigid('head');
  ctx.save();
  ctx.transform(a, b, c, d, e, g);
  ctx.translate(0, HEAD[1] + faceY);
  ctx.scale(1, faceSy);
  ctx.translate(0, -HEAD[1]);
  draw();
  ctx.restore();
};

/**
 * The accused, feet at the origin, its moves scaled by `gains`: the control's
 * acting (eyes down and left on the bow), the body bent by its bones.
 */
export const skinnedAccused = (gains: Gains) => (f: CourtFrame) => {
  const { ctx } = f;
  const hand = f.hand('accused');
  const bow = f.at('bow') * (1 - f.at('lift'));
  const look: Pt = [-2 * bow, 3 * bow];
  const m = motionOf(f, gains);
  const bodyY = m('bodyY');
  const pose = BODY.pose(valuesOf(m, 1 + BREATH * (1 + breathOf(hand))));
  const tunic = pose.at('torso');
  const head = pose.at('head');
  const body = probesHands(ctx) ? [tunic, head] : undefined;
  const faceY = m('faceY');
  const faceSy = m('faceSy');

  const stamp = cueTime(f, 'stamp');
  ctx.save();
  ctx.scale(keys(stamp, STAMP_SX), keys(stamp, STAMP_SY));
  ground(ctx, 0, 2, 100);
  restingHand(ctx, -1, [m('farX'), m('farY') + bodyY], hand, body);
  legs(ctx, hand);
  torso(ctx, tunic, hand, pose);
  piece(ctx, head, C.figure, sub(hand, 4), { role: 'figure' });
  onFace(ctx, pose, faceY, faceSy, () => {
    eyes(ctx, look);
    brows(ctx, hand);
  });
  restingHand(ctx, 1, [m('nearX'), m('nearY') + bodyY], hand, body);
  if (probesFaces(ctx))
    onFace(ctx, pose, faceY, faceSy, () => probeFace(ctx, HEAD[0], HEAD[1], 2 * HEAD_RY));
  ctx.restore();
};
