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
// The close-up (`closeHand`) is the same mitten, big, palm up, with the ink a
// hand is allowed at that size: three finger creases and a lifeline.

import { type Hand, type Pt, spline, stroke, sub } from './ink.ts';
import { piece } from './piece.ts';
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
 * cue's `f.at`), and its grip (`open` unless given).
 */
export interface Arm {
  readonly to: Pt;
  readonly grow: number;
  readonly grip?: Grip;
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
): ReadonlyArray<Pt> => {
  const c = Math.cos(angle) * size;
  const s = Math.sin(angle) * size;
  for (let i = 0; i < p.unit.length; i++) {
    const u = p.unit[i];
    const o = p.at[i];
    if (u === undefined || o === undefined) continue;
    const uy = u[1] * flip;
    o[0] = x + u[0] * c - uy * s;
    o[1] = y + u[0] * s + uy * c;
  }
  return p.at;
};

/**
 * The mitten in `grip`, its centre at (x, y), pointing along `angle`,
 * `size` long, its thumb on the `flip` side (an arm's `away`).
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
) => {
  const m: Mitten = MITTENS[grip];
  const look = {
    role: 'figure',
    line: style.line,
    color: style.skin,
    outline: style.outline,
  } as const;
  if (!m.thumbOver) piece(ctx, place(m.thumb, x, y, angle, size, flip), look, sub(hand, 1));
  if (m.finger !== undefined)
    piece(ctx, place(m.finger, x, y, angle, size, flip), look, sub(hand, 3));
  piece(ctx, place(m.palm, x, y, angle, size, flip), look, sub(hand, 2));
  if (m.thumbOver) piece(ctx, place(m.thumb, x, y, angle, size, flip), look, sub(hand, 1));
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
  mitten(ctx, a.grip ?? 'open', end, angle, style.mitten * grow, away, style, sub(hand, 3));
};

/** Where an arm's hand is: its mitten's centre, `a.grow` of the way along its strip. */
export const handAt = (from: Pt, away: -1 | 1, a: Arm, style: ArmStyle): Pt => {
  const centre = strip(from, a.to, clamp(a.grow), away, style.length);
  const end = centre[STRIP_POINTS - 1] ?? from;
  return [end[0], end[1]];
};

// ─── the close-up ────────────────────────────────────────────────────────────

/** How a close-up hand is cut, in its own units. */
export interface CloseStyle {
  readonly skin: string;
  /** The lifeline's ink, softer than the outline. */
  readonly crease: string;
  readonly outline: string;
}

/** The close-up's length, wrist to fingertips, and its outline, in its own units. */
const CLOSE_SIZE = 380;
const CLOSE_LINE = 4;
/** Where the fingers bend: past this (along the spread palm's unit x) a closing hand folds. */
const KNUCKLE = 0.1;
/** The forearm's width at the frame's edge and at the wrist. */
const FOREARM: readonly [number, number] = [210, 170];
const FOREARM_AT = buffer(2 * STRIP_POINTS);
const CLOSE_PALM = part(SPREAD);
const CLOSE_THUMB = part(SPREAD_THUMB);
/** The finger block folded forward over the palm, as a closing mitten folds whole. */
const FOLD = part(
  spline(
    [
      [KNUCKLE - 0.02, -0.36],
      [KNUCKLE + 0.16, -0.34],
      [KNUCKLE + 0.2, 0],
      [KNUCKLE + 0.16, 0.34],
      [KNUCKLE - 0.02, 0.36],
    ],
    5,
    true,
  ),
);
/** The finger creases, across the palm (unit y), and the lifeline round the thumb's root. */
const FINGER_CREASES = [-0.17, 0.02, 0.2] as const;
const CREASE = buffer(2);
const LIFELINE = part(
  spline([
    [0.02, -0.26],
    [-0.18, -0.17],
    [-0.36, -0.13],
  ]),
);
/** Fingers up, the thumb to the left. */
const UP = -Math.PI / 2;

/**
 * The mitten close up, palm up and fingers up, its centre on the origin,
 * about 300 units wide and 380 long: faith, the hand that takes (the `palm`
 * grip, big). `open` 1 holds the fingers straight; toward 0 they fold
 * forward over the palm, as a mitten closes whole. Close up it keeps the ink
 * a hand is allowed: three finger creases near the tips and a lifeline
 * round the thumb's root, clear of the palm's middle where a light is laid.
 * `forearm`, when given, is where the arm comes into frame, in the hand's
 * units: its strip runs from there up to the wrist.
 */
export const closeHand = (
  ctx: CanvasRenderingContext2D,
  open: number,
  style: CloseStyle,
  hand: Hand,
  forearm?: Pt,
) => {
  const o = clamp(open);
  const look = {
    role: 'figure',
    line: CLOSE_LINE,
    color: style.skin,
    outline: style.outline,
  } as const;
  if (forearm !== undefined) {
    const wrist: Pt = [0, CLOSE_SIZE * 0.42];
    const centre = strip(forearm, wrist, 1, forearm[0] < 0 ? -1 : 1, 0);
    piece(ctx, ribbon(FOREARM_AT, centre, FOREARM[0], FOREARM[1]), look, sub(hand, 1));
  }
  piece(ctx, place(CLOSE_THUMB, 0, 0, UP, CLOSE_SIZE, 1), look, sub(hand, 2));
  // Past the knuckle the fingers shorten as the hand closes.
  const bend = lerp(0.45, 1, o);
  for (let i = 0; i < CLOSE_PALM.unit.length; i++) {
    const u = CLOSE_PALM.unit[i];
    const p = CLOSE_PALM.at[i];
    if (u === undefined || p === undefined) continue;
    const ux = u[0] > KNUCKLE ? KNUCKLE + (u[0] - KNUCKLE) * bend : u[0];
    p[0] = u[1] * CLOSE_SIZE;
    p[1] = -ux * CLOSE_SIZE;
  }
  piece(ctx, CLOSE_PALM.at, look, sub(hand, 3));
  // The finger creases run from near the tips a short way down, shorter as it closes.
  const tip = KNUCKLE + 0.5 * bend - 0.06;
  for (let k = 0; k < FINGER_CREASES.length; k++) {
    const y = FINGER_CREASES[k] ?? 0;
    const a = CREASE[0];
    const b = CREASE[1];
    if (a === undefined || b === undefined) continue;
    a[0] = y * CLOSE_SIZE;
    a[1] = -tip * CLOSE_SIZE;
    b[0] = (y + 0.01) * CLOSE_SIZE;
    b[1] = -(tip - 0.03 - 0.13 * o) * CLOSE_SIZE;
    stroke(
      ctx,
      CREASE,
      { color: style.outline, width: CLOSE_LINE, jitter: 0.4, taper: 0.5, boil: 'crawl' },
      sub(hand, 10 + k),
    );
  }
  stroke(
    ctx,
    place(LIFELINE, 0, 0, UP, CLOSE_SIZE, 1),
    { color: style.crease, width: CLOSE_LINE, jitter: 0.4, boil: 'crawl' },
    sub(hand, 4),
  );
  const fold = 1 - o;
  if (fold > 0.05) {
    place(FOLD, 0, 0, UP, CLOSE_SIZE, 1);
    // The band deepens down the palm as the hand closes.
    for (let i = 0; i < FOLD.at.length; i++) {
      const p = FOLD.at[i];
      const u = FOLD.unit[i];
      if (p === undefined || u === undefined) continue;
      p[1] = -(KNUCKLE + (u[0] - KNUCKLE) * (0.4 + 1.6 * fold) * bend) * CLOSE_SIZE;
    }
    piece(ctx, FOLD.at, look, sub(hand, 5));
  }
};
