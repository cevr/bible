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
// The mitten close up is an open hand held out palm up to receive, seen from
// in front and a little above (about ¾): the palm a wide dish, the fingers
// one block running on from the knuckles to one soft tip edge, the thumb
// rising off the palm's far rim at about 40° to the fingers. Palm, fingers
// and thumb are cut as one piece: one outline round the three, no seam where
// they join. It closes the way a hand does, not a lid: the finger block
// turns up about the knuckles toward the viewer, foreshortening, until its
// tip edge comes round over the palm, which stays showing under it as a cup,
// while the thumb comes in to meet it. The arm comes into frame from below
// on the figure's side and the fingers point away from it. The shape is a
// pure function of `open`, written into buffers this module keeps.

/** How a close-up hand is cut. */
export interface CloseStyle {
  readonly skin: string;
  /** The lifeline's ink, softer than the outline. */
  readonly crease: string;
  readonly outline: string;
}

/** The close-up's outline, px. */
const CLOSE_LINE = 4;
/** The close-up's size against its units, about the palm's middle (0, 60). */
const CLOSE_SCALE = 1.2;
const PALM_MIDDLE: Pt = [0, 60];
/** The forearm's width at the frame's edge and at the wrist. */
const FOREARM: readonly [number, number] = [190, 140];
const FOREARM_AT = buffer(2 * STRIP_POINTS);
/** Where the forearm meets the hand: under the heel of the palm. */
const WRIST: Pt = [-150, 100];

/** The knuckles, where the fingers turn: the pivot on the knuckle line's middle. */
const KNUCKLE: Pt = [100, 62];
/**
 * How far the fingers have bent up out of the palm's plane, open (a relaxed
 * hand's tips lift a little) and closed (turned back to lie across the
 * palm), radians.
 */
const BEND: readonly [number, number] = [(8 * Math.PI) / 180, (170 * Math.PI) / 180];
/** How the curl eases: a little curl already reads, a fist takes the whole range. */
const CURL_EASE = 0.8;
/**
 * How much of a length standing straight up out of the palm the viewer sees
 * from a little above: the ¾ view's foreshortening.
 */
const RISE = 0.55;
/** The bend past which the tip edge lies over the palm, and over how much more it is fully inked there. */
const OVER_PALM = (95 * Math.PI) / 180;
const OVER_INKED = (25 * Math.PI) / 180;

/** The palm seen from in front and above: heel on the left, the knuckles' end on the right. */
const PALM: Pt[] = spline(
  [
    [-212, 44],
    [-170, -8],
    [-60, -18],
    [60, -12],
    [118, 4],
    [138, 62],
    [122, 138],
    [0, 146],
    [-150, 140],
    [-218, 100],
  ],
  6,
  true,
);

/** The finger block: half its width, its length past the knuckles, how round its tip is, and how thick. */
const FINGER = { half: 58, length: 196, cap: 54, thick: 44 } as const;
/**
 * The close-up's length open, heel to fingertips, in the units it is drawn
 * in: a scene matching it to a figure's mitten scales by the mitten's length
 * over this.
 */
export const CLOSE_SPAN =
  (KNUCKLE[0] + FINGER.length - Math.min(...PALM.map((p) => p[0]))) * CLOSE_SCALE;
/**
 * The finger block's palm side in its own frame (x from the knuckle line
 * along the fingers, y across, the far side −), a convex outline: from the
 * knuckle line's far end, round the one soft tip edge, to its near end. The
 * knuckle line closes it, under the palm.
 */
const FINGER_UNIT: Pt[] = (() => {
  const { half, length, cap } = FINGER;
  const out: Pt[] = [
    [0, -half],
    [length - cap, -half + 4],
  ];
  for (let i = 1; i < 12; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / 12;
    out.push([length - cap + Math.cos(a) * cap, Math.sin(a) * (half - 4)]);
  }
  out.push([length - cap, half - 4], [0, half]);
  return out;
})();
const FACE_AT = buffer(FINGER_UNIT.length);
/** The block's outline with its thickness: the palm side swept by the thickness (two corners more). */
const SLAB_AT = buffer(FINGER_UNIT.length + 2);
/** Three short creases where the fingers bend, just past the knuckles, in the finger block's frame. */
const CREASE_UNIT: ReadonlyArray<ReadonlyArray<Pt>> = [-30, 0, 30].map((y) => [
  [43, y - 11],
  [46, y],
  [43, y + 11],
]);
const CREASE_AT = CREASE_UNIT.map((c) => buffer(c.length));
/** The bend over which the creases go out of sight as the palm side of the fingers turns away. */
const CREASES_HIDE: readonly [number, number] = [(70 * Math.PI) / 180, (95 * Math.PI) / 180];

/** The thumb, off the palm's far rim: its root, length and angle open and closed. */
const THUMB = {
  root: [
    [-84, 10],
    [-40, 4],
  ],
  length: [96, 88],
  /** Radians, on screen: open about 40° up off the fingers, closed leaning in toward them. */
  angle: [(-40 * Math.PI) / 180, (-18 * Math.PI) / 180],
  radius: 48,
} as const;
const THUMB_POINTS = 18;
const THUMB_AT = buffer(THUMB_POINTS);

/** The lifeline, round the thumb's mound toward the heel, clear of the palm's middle. */
const LIFELINE: Pt[] = spline([
  [-50, 22],
  [-92, 52],
  [-134, 82],
  [-176, 100],
]);

/** The close-up's shape at one `open`: every array is a buffer the next call rewrites. */
export interface CloseShape {
  readonly palm: ReadonlyArray<Pt>;
  /**
   * The finger block with its thickness, as an outline that starts at the
   * knuckle line's far end and ends at its near end: closed it is the block;
   * open, it is every edge but the knuckle line, the ink it takes over the palm.
   */
  readonly fingers: ReadonlyArray<Pt>;
  readonly creases: ReadonlyArray<ReadonlyArray<Pt>>;
  /** 1 while the palm side of the fingers faces the viewer, going to 0 as they turn away: the creases' ink. */
  readonly creaseInk: number;
  readonly thumb: ReadonlyArray<Pt>;
  /** 0 open to 1 closed: how far the fingers have bent. */
  readonly curl: number;
  /** 0 until the fingers come back over the palm, then 1: their edge's ink there. */
  readonly over: number;
}

const SHAPE = {
  palm: PALM,
  fingers: SLAB_AT,
  creases: CREASE_AT,
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
};

/**
 * `unit` bent `bend` up out of the palm about the knuckle line, as the ¾
 * view sees it, into `out`: along the fingers stays along the hand (by the
 * bend's cosine) and up out of the palm shows as up the screen (by its sine,
 * foreshortened); across the fingers stays across. A linear map, so a convex
 * outline stays convex.
 */
const bent = (out: [number, number][], unit: ReadonlyArray<Pt>, bend: number) => {
  const c = Math.cos(bend);
  const s = Math.sin(bend) * RISE;
  for (let i = 0; i < unit.length; i++) {
    const u = unit[i];
    const o = out[i];
    if (u === undefined || o === undefined) continue;
    o[0] = KNUCKLE[0] + u[0] * c;
    o[1] = KNUCKLE[1] + u[1] - u[0] * s;
  }
};

/**
 * The convex outline `face` swept along `t` (the block's thickness), into
 * `SLAB_AT`, in `face`'s order: each point whose edges both face along `t`
 * moves by it, and where they turn, the point is kept and moved both, so
 * the outline stays whole and the count is two more. Unused slots repeat the
 * last point.
 */
const swept = (face: ReadonlyArray<Pt>, tx: number, ty: number) => {
  const n = face.length;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const a = face[i];
    const b = face[(i + 1) % n];
    if (a !== undefined && b !== undefined) area += a[0] * b[1] - b[0] * a[1];
  }
  const turn = area >= 0 ? 1 : -1;
  // Whether edge `i` (from point i to i + 1) faces along t.
  const along = (i: number) => {
    const a = face[i];
    const b = face[(i + 1) % n];
    if (a === undefined || b === undefined) return false;
    return ((b[1] - a[1]) * tx - (b[0] - a[0]) * ty) * turn > 0;
  };
  let k = 0;
  const put = (p: Pt, dx: number, dy: number) => {
    const o = SLAB_AT[k];
    if (o === undefined) return;
    o[0] = p[0] + dx;
    o[1] = p[1] + dy;
    k++;
  };
  for (let i = 0; i < n; i++) {
    const p = face[i];
    if (p === undefined) continue;
    const before = along((i + n - 1) % n);
    const after = along(i);
    if (before && after) put(p, tx, ty);
    else if (!before && !after) put(p, 0, 0);
    else if (after) {
      put(p, 0, 0);
      put(p, tx, ty);
    } else {
      put(p, tx, ty);
      put(p, 0, 0);
    }
  }
  const last = SLAB_AT[Math.max(0, k - 1)];
  for (let j = k; j < SLAB_AT.length; j++) {
    const o = SLAB_AT[j];
    if (o === undefined || last === undefined) continue;
    o[0] = last[0];
    o[1] = last[1];
  }
};

/**
 * The close-up's shape at `open` (1 held out flat, 0 a loose fist), the
 * fingers pointing +x, in the hand's units before `CLOSE_SCALE`: the finger
 * block bent up out of the palm about the knuckles, standing (seen short,
 * and by its thickness) at a right angle and lying back across the palm past
 * it, the thumb swung in to meet it. Continuous in `open`: nothing appears
 * or jumps as the hand closes.
 */
export const closeShape = (open: number): CloseShape => {
  const curl = clamp(1 - open) ** CURL_EASE;
  const bend = lerp(BEND[0], BEND[1], curl);
  bent(FACE_AT, FINGER_UNIT, bend);
  // The back of the fingers lies the thickness behind the palm side: down and out of the palm.
  swept(FACE_AT, FINGER.thick * Math.sin(bend), RISE * FINGER.thick * Math.cos(bend));
  for (let k = 0; k < CREASE_UNIT.length; k++) {
    const u = CREASE_UNIT[k];
    const o = CREASE_AT[k];
    if (u !== undefined && o !== undefined) bent(o, u, bend);
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
  SHAPE.over = clamp((bend - OVER_PALM) / OVER_INKED);
  SHAPE.creaseInk = 1 - clamp((bend - CREASES_HIDE[0]) / (CREASES_HIDE[1] - CREASES_HIDE[0]));
  return SHAPE;
};

/**
 * The mitten close up: an open hand held out palm up to receive, faith, the
 * hand that takes. Seen from in front and a little above, the palm's middle
 * on (0, 60) where a light or the gifts are laid; about 700 units wide.
 * `open` 1 holds it flat; toward 0 the fingers turn up over the palm, which
 * stays showing as a cup, and the thumb comes in to meet them: a loose fist,
 * never a lid. Close up it keeps the ink a hand is allowed: three short
 * creases where the fingers bend and a lifeline round the thumb's mound,
 * clear of the palm's middle. `forearm`, when given, is where the arm comes
 * into frame, in the hand's units: its strip runs from there up to the
 * wrist, and the fingers point away from it (an arm from the right mirrors
 * the hand).
 */
export const closeHand = (
  ctx: CanvasRenderingContext2D,
  open: number,
  style: CloseStyle,
  hand: Hand,
  forearm?: Pt,
) => {
  const mirror = forearm !== undefined && forearm[0] > 0;
  ctx.save();
  ctx.translate(PALM_MIDDLE[0], PALM_MIDDLE[1]);
  ctx.scale(mirror ? -CLOSE_SCALE : CLOSE_SCALE, CLOSE_SCALE);
  ctx.translate(-PALM_MIDDLE[0], -PALM_MIDDLE[1]);
  const s = closeShape(open);
  const ink = {
    color: style.outline,
    width: 2 * CLOSE_LINE,
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
  if (forearm !== undefined) {
    const from: Pt = [
      PALM_MIDDLE[0] + (Math.abs(forearm[0]) - PALM_MIDDLE[0]) / CLOSE_SCALE,
      PALM_MIDDLE[1] + (forearm[1] - PALM_MIDDLE[1]) / CLOSE_SCALE,
    ];
    const centre = strip([-from[0], from[1]], WRIST, 1, -1, 0);
    piece(
      ctx,
      ribbon(FOREARM_AT, centre, FOREARM[0], FOREARM[1]),
      { role: 'figure', line: CLOSE_LINE, color: style.skin, outline: style.outline },
      sub(hand, 1),
    );
  }
  // One piece: each part's outline twice as wide, then every part's paper
  // over them, so only the outer half of the ink round the whole shows.
  stroke(ctx, s.thumb, ink, sub(hand, 7));
  stroke(ctx, s.palm, ink, sub(hand, 8));
  stroke(ctx, s.fingers, ink, sub(hand, 9));
  cutout(ctx, s.thumb, { ...paper, shadow: 0.35 }, sub(hand, 2));
  cutout(ctx, s.palm, { ...paper, shadow: 0.35 }, sub(hand, 3));
  stroke(
    ctx,
    LIFELINE,
    { color: style.crease, width: CLOSE_LINE, jitter: 0.4, taper: 0.3, boil: 'crawl' },
    sub(hand, 4),
  );
  // The fingers' paper over the palm's end; as they bend up it casts on the palm.
  cutout(ctx, s.fingers, { ...paper, shadow: 0.35 * clamp(3 * s.curl) }, sub(hand, 5));
  // Back over the palm, their edges are inked there too (all but the knuckle line).
  if (s.over > 0)
    stroke(
      ctx,
      s.fingers,
      { ...ink, width: CLOSE_LINE, closed: false, alpha: s.over, taper: 0.1 },
      sub(hand, 6),
    );
  if (s.creaseInk > 0)
    for (let k = 0; k < s.creases.length; k++) {
      const c = s.creases[k];
      if (c === undefined) continue;
      stroke(
        ctx,
        c,
        {
          color: style.outline,
          width: CLOSE_LINE,
          jitter: 0.4,
          taper: 0.5,
          alpha: s.creaseInk,
          boil: 'crawl',
        },
        sub(hand, 10 + k),
      );
    }
  ctx.restore();
};
