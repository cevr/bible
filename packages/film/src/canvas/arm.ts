// Arms that appear only when a hand acts (DIRECTION, "Hands"). At rest a
// figure has none: its hands are tucked in its garment. When a hand has work
// to do, one tapered strip of the figure's paper grows out of the shoulder
// toward the work, with no elbow, bowed down and away from the body, and the
// one mitten sits at its end; when the work is done it withdraws. The strip
// is a pure function of its shoulder, target, grow and side, written into
// buffers this module keeps (no allocation a frame), so a frame draws the
// same arm however it was reached, and nothing flips: at the one place the
// bow's side would tie, the strip is straight.
//
// The close-up (`closeHand`) is the same hand, big, palm up, with the ink a
// hand is allowed at that size: two finger-joint lines and a lifeline. A
// figure's own hand turns palm up into the close-up's shape (`Arm.turn`)
// before a push into it, so the small hand and the big one are one shape at
// two scales.

import { type Hand, type Pt, spline, stroke, sub } from './ink.ts';
import { cutout } from './cutout.ts';
import { PAPER_EDGES, piece } from './piece.ts';
import { clamp, lerp } from '../core/time.ts';

/**
 * What a hand does with its mitten: `open` flat and reaching (receiving,
 * giving, touching), `hold` closed round something, `point` its forefinger
 * out, `palm` spread wide, the palm shown (stop; only speak the word).
 */
export type Grip = 'open' | 'hold' | 'point' | 'palm';

export const GRIPS: ReadonlyArray<Grip> = ['open', 'hold', 'point', 'palm'];

/**
 * One hand at work: where it goes (`to`, the mitten's centre), how far its
 * arm has grown out of the shoulder toward it (0 none, 1 there: a named
 * cue's `f.at`), and its grip (`open` unless given). `turn` (0 unless
 * given, a named cue's `f.at`) turns the hand palm up to receive, into the
 * close-up's shape at the mitten's size, its palm's middle on `to` and its
 * fingers up: a push into the hand (`closeHand`) starts from it.
 */
export interface Arm {
  readonly to: Pt;
  readonly grow: number;
  readonly grip?: Grip;
  readonly turn?: number;
}

/** How a figure's arms are cut, in the figure's own units. */
export interface ArmStyle {
  /** The strip's paper (the garment's), the mitten's, and the ink round both. */
  readonly body: string;
  readonly skin: string;
  readonly outline: string;
  /** The strip's width at the shoulder and at the wrist. */
  readonly width: readonly [root: number, tip: number];
  /**
   * The strip's length at rest: a target nearer than this bows the strip
   * out like a bent arm (a hand to the chin) rather than folding it; a
   * farther one stretches it.
   */
  readonly length: number;
  /** The mitten's length, wrist to fingertips. */
  readonly mitten: number;
  /** The outline's width, in px. */
  readonly line: number;
}

/** Points along a strip's centre line, shoulder to hand. */
const STRIP_POINTS = 15;
/** A strip is at least this many times as long as its reach, so even a straight reach keeps a little bow. */
const SLACK = 1.06;
/** How much of the spare length turns into bow, and how much a far reach sags. */
const BOW_SPARE = 0.45;
const BOW_SAG = 0.08;
/** How far past the tie (in normal units) the bow's side is decided: nearer, the strip straightens. */
const DECIDED = 1 / 3;
/** How much "away from the body" counts beside "down" in choosing the bow's side. */
const AWAY = 0.6;

const buffer = (n: number): [number, number][] =>
  Array.from({ length: n }, (): [number, number] => [0, 0]);

/** The strip's centre line and outline, rewritten on every call. */
const CENTRE = buffer(STRIP_POINTS);
const OUTLINE = buffer(2 * STRIP_POINTS);

/** The quadratic the current strip runs along: its control point and its end. */
const curve = { cx: 0, cy: 0, ex: 0, ey: 0 };

/**
 * Sets `curve` for a strip from `from` toward `to` on the `away` side of its
 * body: bowed down and away, and straight where the two sides tie, so the
 * bow shrinks through zero rather than flipping. `rest` is its length at rest.
 */
const shape = (from: Pt, to: Pt, away: -1 | 1, rest: number) => {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const d = Math.hypot(dx, dy);
  curve.ex = to[0];
  curve.ey = to[1];
  if (d < 1e-9) {
    curve.cx = from[0];
    curve.cy = from[1];
    return;
  }
  // Of the two normals to the reach, the one pointing down and away.
  let nx = -dy / d;
  let ny = dx / d;
  let score = ny + away * AWAY * nx;
  if (score < 0) {
    nx = -nx;
    ny = -ny;
    score = -score;
  }
  const decided = Math.min(1, score / DECIDED);
  const len = Math.max(rest, SLACK * d);
  const bow = (BOW_SPARE * Math.sqrt(Math.max(0, len * len - d * d)) + BOW_SAG * d) * decided;
  curve.cx = (from[0] + to[0]) / 2 + nx * bow;
  curve.cy = (from[1] + to[1]) / 2 + ny * bow;
};

/**
 * The centre line of a strip from the shoulder `from` toward `to`, grown
 * `grow` of the way (0 only the shoulder, 1 the hand on `to`), for a
 * shoulder on the `away` side of its body (−1 left, 1 right): a quadratic
 * bowed down and away from the body, its length following the target. The
 * points are written into one buffer every call reuses: copy them to keep
 * them. `rest` is the strip's length at rest (`ArmStyle.length`).
 */
export const strip = (
  from: Pt,
  to: Pt,
  grow: number,
  away: -1 | 1,
  rest: number,
): ReadonlyArray<Pt> => {
  shape(from, to, away, rest);
  const upto = clamp(grow);
  for (let i = 0; i < STRIP_POINTS; i++) {
    const p = CENTRE[i];
    if (p === undefined) continue;
    const q = (i / (STRIP_POINTS - 1)) * upto;
    const a = (1 - q) * (1 - q);
    const b = 2 * q * (1 - q);
    const c = q * q;
    p[0] = a * from[0] + b * curve.cx + c * curve.ex;
    p[1] = a * from[1] + b * curve.cy + c * curve.ey;
  }
  return CENTRE;
};

/** The current strip's direction `q` along it, radians: the curve's tangent, or straight down when it has none. */
const tangent = (from: Pt, q: number) => {
  const tx = 2 * (1 - q) * (curve.cx - from[0]) + 2 * q * (curve.ex - curve.cx);
  const ty = 2 * (1 - q) * (curve.cy - from[1]) + 2 * q * (curve.ey - curve.cy);
  return Math.hypot(tx, ty) < 1e-9 ? Math.PI / 2 : Math.atan2(ty, tx);
};

/** The outline of a strip along `centre`, `root` wide at its first point to `tip` at its last, into `out`. */
const ribbon = (
  out: [number, number][],
  centre: ReadonlyArray<Pt>,
  root: number,
  tip: number,
): ReadonlyArray<Pt> => {
  const n = centre.length - 1;
  for (let i = 0; i <= n; i++) {
    const p = centre[i];
    const a = centre[Math.max(0, i - 1)];
    const b = centre[Math.min(n, i + 1)];
    const left = out[i];
    const right = out[2 * n + 1 - i];
    if (p === undefined || a === undefined || b === undefined) continue;
    if (left === undefined || right === undefined) continue;
    const len = Math.max(1e-9, Math.hypot(b[0] - a[0], b[1] - a[1]));
    const w = lerp(root, tip, n === 0 ? 0 : i / n) / 2;
    const nx = (-(b[1] - a[1]) / len) * w;
    const ny = ((b[0] - a[0]) / len) * w;
    left[0] = p[0] + nx;
    left[1] = p[1] + ny;
    right[0] = p[0] - nx;
    right[1] = p[1] - ny;
  }
  return out;
};

// ─── the mitten ──────────────────────────────────────────────────────────────
// One hand design at every scale: palm and fingers one piece, and a thumb.
// Each grip is a unit shape pointing +x from its centre, the thumb on the −y
// side, placed by a point, an angle and a size into its own buffer.

/** A capsule from `a` to `b`, `r` round: a thumb or a forefinger. */
const capsule = (a: Pt, b: Pt, r: number): Pt[] => {
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const out: Pt[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = ang + Math.PI / 2 + (Math.PI * i) / 8;
    out.push([a[0] + Math.cos(t) * r, a[1] + Math.sin(t) * r]);
  }
  for (let i = 0; i <= 8; i++) {
    const t = ang - Math.PI / 2 + (Math.PI * i) / 8;
    out.push([b[0] + Math.cos(t) * r, b[1] + Math.sin(t) * r]);
  }
  return out;
};

/** A unit shape and the buffer it is placed into. */
interface Part {
  readonly unit: ReadonlyArray<Pt>;
  readonly at: [number, number][];
}
const part = (unit: ReadonlyArray<Pt>): Part => ({ unit, at: buffer(unit.length) });

interface Mitten {
  /** Palm and fingers, one piece. */
  readonly palm: Part;
  readonly thumb: Part;
  /** A pointing forefinger, when the grip has one. */
  readonly finger?: Part;
  /** Closed, the thumb lies over the palm; open, it stands behind it. */
  readonly thumbOver: boolean;
}

const FIST: Pt[] = spline(
  [
    [-0.45, -0.28],
    [0, -0.36],
    [0.32, -0.27],
    [0.42, 0],
    [0.32, 0.28],
    [0, 0.36],
    [-0.45, 0.28],
  ],
  5,
  true,
);
/** The spread palm: the `palm` grip, and the close-up. */
const SPREAD: Pt[] = spline(
  [
    [-0.5, -0.3],
    [0, -0.4],
    [0.36, -0.38],
    [0.56, -0.2],
    [0.6, 0.05],
    [0.5, 0.3],
    [0.2, 0.4],
    [-0.2, 0.36],
    [-0.5, 0.3],
  ],
  5,
  true,
);
const SPREAD_THUMB = capsule([-0.12, -0.32], [-0.06, -0.72], 0.13);

const MITTENS = {
  open: {
    palm: part(
      spline(
        [
          [-0.5, -0.26],
          [-0.1, -0.3],
          [0.3, -0.3],
          [0.5, -0.18],
          [0.55, 0.02],
          [0.46, 0.24],
          [0.2, 0.32],
          [-0.2, 0.3],
          [-0.5, 0.24],
        ],
        5,
        true,
      ),
    ),
    thumb: part(capsule([-0.2, -0.2], [0.1, -0.55], 0.12)),
    thumbOver: false,
  },
  hold: {
    palm: part(FIST),
    thumb: part(capsule([-0.18, -0.26], [0.22, -0.28], 0.11)),
    thumbOver: true,
  },
  point: {
    palm: part(FIST),
    thumb: part(capsule([-0.18, -0.26], [0.18, -0.3], 0.11)),
    finger: part(capsule([0.12, -0.14], [0.8, -0.16], 0.11)),
    thumbOver: true,
  },
  palm: { palm: part(SPREAD), thumb: part(SPREAD_THUMB), thumbOver: false },
} satisfies Record<Grip, Mitten>;

/**
 * `p.unit` placed at (x, y), turned `angle`, `size` long, its −y side
 * mirrored to `flip` (so each arm keeps its thumb on one side and it never
 * jumps), written into `p.at`.
 */
const place = (
  p: Part,
  x: number,
  y: number,
  angle: number,
  size: number,
  flip: number,
  along = 1,
): ReadonlyArray<Pt> => {
  const c = Math.cos(angle) * size;
  const s = Math.sin(angle) * size;
  for (let i = 0; i < p.unit.length; i++) {
    const u = p.unit[i];
    const o = p.at[i];
    if (u === undefined || o === undefined) continue;
    const ux = u[0] * along;
    const uy = u[1] * flip;
    o[0] = x + ux * c - uy * s;
    o[1] = y + ux * s + uy * c;
  }
  return p.at;
};

/**
 * The mitten in `grip`, its centre at (x, y), pointing along `angle`,
 * `size` long (times `along` along the fingers, as it turns), its thumb on
 * the `flip` side (an arm's `away`).
 */
const mitten = (
  ctx: CanvasRenderingContext2D,
  grip: Grip,
  [x, y]: Pt,
  angle: number,
  size: number,
  flip: number,
  style: ArmStyle,
  hand: Hand,
  along = 1,
) => {
  const m: Mitten = MITTENS[grip];
  const look = {
    role: 'figure',
    line: style.line,
    color: style.skin,
    outline: style.outline,
  } as const;
  const squash = (p: Part) => place(p, x, y, angle, size, flip, along);
  if (!m.thumbOver) piece(ctx, squash(m.thumb), look, sub(hand, 1));
  if (m.finger !== undefined) piece(ctx, squash(m.finger), look, sub(hand, 3));
  piece(ctx, squash(m.palm), look, sub(hand, 2));
  if (m.thumbOver) piece(ctx, squash(m.thumb), look, sub(hand, 1));
};

/**
 * How far a turning hand has turned (`turn` 0 its grip, 1 palm up), as a
 * card turns: its length along the fingers narrows to `TURN_EDGE` at the
 * half, where the grip gives way to the palm-up shape, and widens again.
 * Written into one record every call reuses.
 */
export const turning = (turn: number): Turned => {
  const t = clamp(turn);
  TURNED.cup = t >= 0.5;
  TURNED.along = TURN_EDGE + (1 - TURN_EDGE) * Math.abs(Math.cos(Math.PI * t));
  return TURNED;
};
/** A turning hand: whether the palm-up shape shows (`cup`), and its length along the fingers as a share (`along`). */
export interface Turned {
  readonly cup: boolean;
  readonly along: number;
}
/** A turning hand's length along its fingers at the half, as a share of its length. */
const TURN_EDGE = 0.2;
/** The record `turning` writes (scratch, so a frame allocates none). */
interface TurnedAt {
  cup: boolean;
  along: number;
}
const TURNED: TurnedAt = { cup: false, along: 1 };

/** The angle from `a` to `b` the short way round, radians. */
const toward = (a: number, b: number) => {
  const d = (((b - a) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI);
  return d - Math.PI;
};

/**
 * The hand at an arm's end, grown to `size`: its grip, or, turning palm up
 * (`turn`), the close-up's shape at the mitten's size, its palm's middle on
 * the arm's end and its fingers up, the thumb on the side away from `flip`.
 */
const handEnd = (
  ctx: CanvasRenderingContext2D,
  a: Arm,
  end: Pt,
  angle: number,
  size: number,
  flip: -1 | 1,
  style: ArmStyle,
  hand: Hand,
) => {
  const turn = clamp(a.turn ?? 0);
  if (turn <= 0) {
    mitten(ctx, a.grip ?? 'open', end, angle, size, flip, style, hand);
    return;
  }
  const { cup, along } = turning(turn);
  const facing = angle + toward(angle, -Math.PI / 2) * turn;
  if (!cup) {
    mitten(ctx, a.grip ?? 'open', end, facing, size, flip, style, hand, along);
    return;
  }
  const [m0, m1, m2, m3, m4, m5] = palmUpFrame(end, facing, size, flip, along);
  ctx.save();
  ctx.transform(m0, m1, m2, m3, m4, m5);
  cupped(ctx, CUP_OPEN, style, (style.line * CLOSE_SPAN) / size, 0, hand);
  ctx.restore();
};
/** A figure's hand turned palm up is held flat open. */
const CUP_OPEN = 1;
/** The palm-up hand's frame (scratch): a canvas `transform`'s six numbers. */
const FRAME: [number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0];

/**
 * Where a hand turned palm up is drawn: the canvas transform (`a b c d e f`,
 * written into one buffer every call reuses) from the close-up's units (its
 * palm's middle on the origin, fingers up −y, thumb to −x) into the arm's,
 * the palm's middle on `end`, the fingers along `facing`, `size` long heel to
 * fingertips (times `along` along the fingers, as it turns), the thumb on
 * the side away from `flip` as a mitten's is.
 */
export const palmUpFrame = (
  end: Pt,
  facing: number,
  size: number,
  flip: -1 | 1,
  along = 1,
): Readonly<typeof FRAME> => {
  const k = size / CLOSE_SPAN;
  const sx = k * along;
  const sy = k * flip;
  const c = Math.cos(facing);
  const s = Math.sin(facing);
  // Turned a quarter so the fingers run along +x, scaled, then turned to `facing`.
  FRAME[0] = -s * sy;
  FRAME[1] = c * sy;
  FRAME[2] = -c * sx;
  FRAME[3] = -s * sx;
  FRAME[4] = end[0];
  FRAME[5] = end[1];
  return FRAME;
};

/** The round patch of garment that hides the strip's cut end, so the arm grows out of the body. */
const TUCK = part(
  Array.from({ length: 20 }, (_, i): Pt => {
    const a = (2 * Math.PI * i) / 20;
    return [Math.cos(a), Math.sin(a)];
  }),
);
/** The patch's radius, as a share of the strip's root width. */
const TUCK_R = 0.6;

/**
 * One arm from the shoulder `from`, on the `away` side of its body, doing
 * `a`: a tapered strip of `style.body` paper grown `a.grow` of the way to
 * `a.to`, and the mitten at its end, grown with it. Nothing at `grow` 0.
 */
export const arm = (
  ctx: CanvasRenderingContext2D,
  from: Pt,
  away: -1 | 1,
  a: Arm,
  style: ArmStyle,
  hand: Hand,
) => {
  const grow = clamp(a.grow);
  if (grow <= 0) return;
  const [root, tip] = style.width;
  const centre = strip(from, a.to, grow, away, style.length);
  const angle = tangent(from, grow);
  const body = {
    role: 'figure',
    line: style.line,
    color: style.body,
    outline: style.outline,
  } as const;
  piece(ctx, ribbon(OUTLINE, centre, root, lerp(root, tip, grow)), body, sub(hand, 1));
  piece(
    ctx,
    place(TUCK, from[0], from[1], 0, TUCK_R * root, 1),
    { ...body, line: 0, shadow: 0 },
    sub(hand, 9),
  );
  const end = centre[STRIP_POINTS - 1] ?? a.to;
  handEnd(ctx, a, end, angle, style.mitten * grow, away, style, sub(hand, 3));
};

/** Where an arm's hand is: its mitten's centre, `a.grow` of the way along its strip. */
export const handAt = (from: Pt, away: -1 | 1, a: Arm, style: ArmStyle): Pt => {
  const centre = strip(from, a.to, clamp(a.grow), away, style.length);
  const end = centre[STRIP_POINTS - 1] ?? from;
  return [end[0], end[1]];
};

// ─── the close-up ────────────────────────────────────────────────────────────
// The hand close up is an open hand held out palm up to receive, seen from
// above and a little behind the wrist, as one sees one's own hand held out:
// the viewer looks into the palm. The palm is the biggest shape, its middle
// on the origin, where a light or the gifts are laid; the fingers are one
// mitten block running on from the knuckles away and up the frame to one
// soft round tip; the thumb lies low along the side, off the palm's heel, at
// about 40° to the fingers. Palm, fingers and thumb are cut as one piece: one
// outline round the three, no seam where they join. It closes the way a hand
// does: the finger block bends up out of the palm about the knuckles, toward
// the eye, foreshortening, until its round tip comes back over the palm,
// which stays showing under it as a cup, while the thumb comes in. The block
// is the hull of a few balls, so every edge it shows, bent or not, is round.
// The arm comes into frame from below on the figure's side. Every shape is a
// pure function of `open`, written into buffers this module keeps.

/** How a close-up hand is cut. */
export interface CloseStyle {
  readonly skin: string;
  /** The lifeline's and the joints' ink, softer than the outline. */
  readonly crease: string;
  readonly outline: string;
}

/** The close-up's outline, in its units. */
export const CLOSE_LINE = 4;
/**
 * The view: how far the eye leans from straight down into the palm back
 * toward the wrist, radians. A finger bent this far up out of the palm is
 * seen at its full length; bent a right angle past it, end on.
 */
const VIEW = (25 * Math.PI) / 180;

/** The palm seen from above: the knuckles along the top, the thumb's mound low on the left, the heel at the bottom. */
const PALM: Pt[] = spline(
  [
    [-122, -126],
    [-40, -134],
    [50, -132],
    [120, -120],
    [148, -60],
    [150, 20],
    [132, 96],
    [80, 140],
    [0, 152],
    [-72, 146],
    [-128, 110],
    [-160, 40],
    [-162, -40],
    [-148, -104],
  ],
  6,
  true,
);

/** The knuckle line's height, about which the fingers bend. */
const KNUCKLES = -118;
/**
 * The finger block, one mitten piece: balls along its middle, each `[along
 * the fingers from the knuckles, across, radius]`. Their hull, seen, is the
 * block: two at the knuckles, and three round its tip, the middle one a
 * little farther, so the tip is one soft edge.
 */
const FINGER_BALLS: ReadonlyArray<readonly [number, number, number]> = [
  [0, -76, 40],
  [0, 76, 40],
  [90, -42, 72],
  [90, 42, 72],
  [102, 0, 76],
];
/** Where each ball shows at the current bend (scratch). */
const BALLS_AT = buffer(FINGER_BALLS.length);
/**
 * The block's outline, sampled at this many fixed directions, from straight
 * down (so its seam lies on the knuckles, under the palm) round to straight
 * down again: a closed outline ends on its start.
 */
const HULL_POINTS = 48;
const HULL_N: ReadonlyArray<Pt> = Array.from({ length: HULL_POINTS + 1 }, (_, k): Pt => {
  const a = Math.PI / 2 + (2 * Math.PI * k) / HULL_POINTS;
  return [Math.cos(a), Math.sin(a)];
});
const FINGERS_AT = buffer(HULL_POINTS + 1);
/**
 * How far the fingers have bent up out of the palm, open (a relaxed hand's
 * tips lift a little) and closed (turned back over the palm), radians.
 */
const BEND: readonly [number, number] = [(10 * Math.PI) / 180, (170 * Math.PI) / 180];
/** How the curl eases: a little curl already reads, a fist takes the whole range. */
const CURL_EASE = 0.8;
/** The bends over which the tip comes back over the palm and its edge is inked there. */
const OVER: readonly [number, number] = [(125 * Math.PI) / 180, (145 * Math.PI) / 180];
/** The bends over which the joints go out of sight as the palm side of the fingers turns from the eye. */
const CREASES_HIDE: readonly [number, number] = [(85 * Math.PI) / 180, (110 * Math.PI) / 180];
/** How far up the frame from the knuckles a point `along` the fingers shows, bent `bend`. */
const rise = (along: number, bend: number) => along * Math.cos(bend - VIEW);

/** Two soft joint lines across the fingers, `[along, across]`, the second shorter: where the block bends. */
const JOINTS: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [
    [38, -70],
    [44, -35],
    [46, 0],
    [44, 35],
    [38, 70],
  ],
  [
    [100, -50],
    [105, -25],
    [106, 0],
    [105, 25],
    [100, 50],
  ],
];
const JOINTS_AT = JOINTS.map((j) => buffer(j.length));

/** The thumb, off the palm's mound: its root, length and angle (on screen, radians) open and closed. */
const THUMB = {
  root: [
    [-128, 30],
    [-104, 14],
  ],
  length: [122, 112],
  angle: [(-128 * Math.PI) / 180, (-98 * Math.PI) / 180],
  radius: 42,
} as const;
const THUMB_POINTS = 18;
/** The thumb's outline, closed: its last point is its first again. */
const THUMB_AT = buffer(THUMB_POINTS + 1);

/** The lifeline, round the thumb's mound from between thumb and fingers toward the wrist, clear of the palm's middle. */
const LIFELINE: Pt[] = spline([
  [-140, -70],
  [-96, -24],
  [-74, 40],
  [-70, 118],
]);

/** Where the forearm meets the hand, under the heel, and its width at the frame's edge and there. */
const WRIST: Pt = [-12, 100];
const FOREARM: readonly [number, number] = [200, 168];
const FOREARM_AT = buffer(2 * STRIP_POINTS);

/**
 * The close-up's length open, heel to fingertips, in its units: a hand at a
 * figure's mitten size is drawn at the mitten's length over this.
 */
export const CLOSE_SPAN =
  Math.max(...PALM.map((p) => p[1])) -
  (KNUCKLES - Math.max(...FINGER_BALLS.map(([a, , r]) => rise(a, BEND[0]) + r)));

/** The close-up's shape at one `open`: every array is a buffer the next call rewrites. */
export interface CloseShape {
  readonly palm: ReadonlyArray<Pt>;
  /** The finger block's outline, round everywhere. */
  readonly fingers: ReadonlyArray<Pt>;
  /** The two joint lines across the fingers. */
  readonly creases: ReadonlyArray<ReadonlyArray<Pt>>;
  /** 1 while the palm side of the fingers faces the eye, going to 0 as they turn away: the joints' ink. */
  readonly creaseInk: number;
  readonly thumb: ReadonlyArray<Pt>;
  /** 0 open to 1 closed: how far the fingers have bent. */
  readonly curl: number;
  /** 0 until the tip comes back over the palm, then 1: its edge's ink there. */
  readonly over: number;
}

const SHAPE = {
  palm: PALM,
  fingers: FINGERS_AT,
  creases: JOINTS_AT,
  creaseInk: 1,
  thumb: THUMB_AT,
  curl: 0,
  over: 0,
} satisfies CloseShape;

/** A capsule from `a` to `b`, `r` round, into `out` (`THUMB_POINTS` long). */
const capsuleInto = (out: [number, number][], a: Pt, b: Pt, r: number) => {
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const half = THUMB_POINTS / 2;
  for (let i = 0; i < half; i++) {
    const t = ang + Math.PI / 2 + (Math.PI * i) / (half - 1);
    const p = out[i];
    const q = out[half + i];
    if (p === undefined || q === undefined) continue;
    p[0] = a[0] + Math.cos(t) * r;
    p[1] = a[1] + Math.sin(t) * r;
    q[0] = b[0] + Math.cos(t + Math.PI) * r;
    q[1] = b[1] + Math.sin(t + Math.PI) * r;
  }
  const first = out[0];
  const last = out[THUMB_POINTS];
  if (first !== undefined && last !== undefined) {
    last[0] = first[0];
    last[1] = first[1];
  }
};

/**
 * The hull of the finger balls at `bend`, into `FINGERS_AT`: for each fixed
 * direction, the farthest ball's edge that way. Where the farthest ball
 * changes, both lie on the one straight edge between them, so the outline
 * moves smoothly as the balls do and has no corner anywhere.
 */
const fingers = (bend: number) => {
  for (let i = 0; i < FINGER_BALLS.length; i++) {
    const b = FINGER_BALLS[i];
    const o = BALLS_AT[i];
    if (b === undefined || o === undefined) continue;
    o[0] = b[1];
    o[1] = KNUCKLES - rise(b[0], bend);
  }
  for (let k = 0; k < HULL_N.length; k++) {
    const n = HULL_N[k];
    const o = FINGERS_AT[k];
    if (n === undefined || o === undefined) continue;
    let best = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < FINGER_BALLS.length; i++) {
      const c = BALLS_AT[i];
      const r = FINGER_BALLS[i]?.[2];
      if (c === undefined || r === undefined) continue;
      const reach = c[0] * n[0] + c[1] * n[1] + r;
      if (reach <= best) continue;
      best = reach;
      o[0] = c[0] + r * n[0];
      o[1] = c[1] + r * n[1];
    }
  }
};

/**
 * The close-up's shape at `open` (1 held out flat, 0 a loose fist), in its
 * units: the finger block bent up out of the palm about the knuckles, seen
 * shorter as it stands toward the eye and lying back over the palm past it,
 * the thumb swung in. Continuous in `open`: nothing appears or jumps as the
 * hand closes.
 */
export const closeShape = (open: number): CloseShape => {
  const curl = clamp(1 - open) ** CURL_EASE;
  const bend = lerp(BEND[0], BEND[1], curl);
  fingers(bend);
  for (let j = 0; j < JOINTS.length; j++) {
    const u = JOINTS[j];
    const o = JOINTS_AT[j];
    if (u === undefined || o === undefined) continue;
    for (let i = 0; i < u.length; i++) {
      const p = u[i];
      const q = o[i];
      if (p === undefined || q === undefined) continue;
      q[0] = p[1];
      q[1] = KNUCKLES - rise(p[0], bend);
    }
  }
  const rx = lerp(THUMB.root[0][0], THUMB.root[1][0], curl);
  const ry = lerp(THUMB.root[0][1], THUMB.root[1][1], curl);
  const len = lerp(THUMB.length[0], THUMB.length[1], curl);
  const ang = lerp(THUMB.angle[0], THUMB.angle[1], curl);
  capsuleInto(
    THUMB_AT,
    [rx, ry],
    [rx + Math.cos(ang) * len, ry + Math.sin(ang) * len],
    THUMB.radius,
  );
  SHAPE.curl = curl;
  SHAPE.over = clamp((bend - OVER[0]) / (OVER[1] - OVER[0]));
  SHAPE.creaseInk = 1 - clamp((bend - CREASES_HIDE[0]) / (CREASES_HIDE[1] - CREASES_HIDE[0]));
  return SHAPE;
};

/** The paper and ink a hand turned palm up is cut from. */
interface CupStyle {
  readonly skin: string;
  readonly outline: string;
  readonly crease?: string;
}

/**
 * The palm-up hand at `open`, its palm's middle on the origin, in the
 * close-up's units: one piece of `style.skin` with a `line`-wide outline,
 * and, as `detail` goes to 1, the ink a hand has close up (the lifeline and
 * the joints). A figure's hand turned palm up and the close-up both draw
 * this, so they are one shape at two sizes.
 */
const cupped = (
  ctx: CanvasRenderingContext2D,
  open: number,
  style: CupStyle,
  line: number,
  detail: number,
  hand: Hand,
) => {
  const s = closeShape(open);
  const ink = {
    color: style.outline,
    width: 2 * line,
    jitter: 0.7,
    taper: 0,
    pressure: 0.15,
    closed: true,
    boil: 'crawl',
  } as const;
  const paper = {
    color: style.skin,
    torn: PAPER_EDGES.cut.torn,
    rim: 0,
    grain: 0.5,
    boil: 'crawl',
  } as const;
  // One piece: each part's outline twice as wide, then every part's paper
  // over them, so only the outer half of the ink round the whole shows.
  stroke(ctx, s.thumb, ink, sub(hand, 7));
  stroke(ctx, s.palm, ink, sub(hand, 8));
  stroke(ctx, s.fingers, ink, sub(hand, 9));
  cutout(ctx, s.thumb, { ...paper, shadow: 0.35 }, sub(hand, 2));
  cutout(ctx, s.palm, { ...paper, shadow: 0.35 }, sub(hand, 3));
  const crease = style.crease ?? style.outline;
  if (detail > 0)
    stroke(
      ctx,
      LIFELINE,
      { color: crease, width: line, jitter: 0.4, taper: 0.5, alpha: detail, boil: 'crawl' },
      sub(hand, 4),
    );
  // The fingers' paper over the palm's top; as they bend up it casts on the palm.
  cutout(ctx, s.fingers, { ...paper, shadow: 0.35 * s.over }, sub(hand, 5));
  // Back over the palm, the tip's edge is inked there too; the knuckles' side never is.
  if (s.over > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(-1e4, KNUCKLES + (FINGER_BALLS[0]?.[2] ?? 0), 2e4, 2e4);
    ctx.clip();
    stroke(ctx, s.fingers, { ...ink, width: line, alpha: s.over }, sub(hand, 6));
    ctx.restore();
  }
  const joints = detail * s.creaseInk;
  if (joints > 0)
    for (let k = 0; k < s.creases.length; k++) {
      const c = s.creases[k];
      if (c === undefined) continue;
      stroke(
        ctx,
        c,
        { color: crease, width: 0.8 * line, jitter: 0.4, taper: 0.5, alpha: joints, boil: 'crawl' },
        sub(hand, 10 + k),
      );
    }
};

/** How a close-up is drawn beyond its shape: where its arm comes in, its line, and how much of its ink shows. */
export interface CloseDraw {
  /**
   * Where the arm comes into frame, in the hand's units: its strip runs from
   * there up to the wrist. An arm from the right (x > 0) mirrors the hand,
   * so the thumb is always on the arm's side.
   */
  readonly forearm?: Pt;
  /** The outline's width in the hand's units (a push from a figure's hand starts at the figure's line). */
  readonly line?: number;
  /** 0..1, how much of the lifeline and the joints show (1 close up). */
  readonly detail?: number;
}

/**
 * The hand close up: an open hand held out palm up to receive, faith, the
 * hand that takes. Seen from above, the palm's middle on the origin where a
 * light or the gifts are laid, `CLOSE_SPAN` units heel to fingertips, the
 * fingers up the frame. `open` 1 holds it flat; toward 0 the fingers bend up
 * and come back over the palm, which stays showing as a cup: a loose fist,
 * never a lid. Close up it keeps the ink a hand is allowed: a lifeline round
 * the thumb's mound and two soft joint lines across the fingers, clear of
 * the palm's middle.
 */
export const closeHand = (
  ctx: CanvasRenderingContext2D,
  open: number,
  style: CloseStyle,
  hand: Hand,
  draw: CloseDraw = {},
) => {
  const { forearm } = draw;
  const line = draw.line ?? CLOSE_LINE;
  const mirror = forearm !== undefined && forearm[0] > 0;
  ctx.save();
  if (mirror) ctx.scale(-1, 1);
  if (forearm !== undefined) {
    const centre = strip([-Math.abs(forearm[0]), forearm[1]], WRIST, 1, -1, 0);
    piece(
      ctx,
      ribbon(FOREARM_AT, centre, FOREARM[0], FOREARM[1]),
      { role: 'figure', line, color: style.skin, outline: style.outline },
      sub(hand, 1),
    );
  }
  cupped(ctx, open, style, line, draw.detail ?? 1, hand);
  ctx.restore();
};
