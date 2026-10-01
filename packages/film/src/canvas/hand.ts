// Floating hands (DIRECTION, "Hands"). No arm is ever drawn: a figure's hand
// is the one mitten, floating free near its body. At rest it floats at its
// spot beside the body, bobbing a little with the figure's breath. When it
// has work to do it travels there on a named cue along a soft arc round its
// shoulder, as a hand on an unseen arm would, swings a little past its reach
// and settles; when the work is done it travels back the same way. It never
// goes farther from its shoulder than the figure's reach (`HandStyle.radius`:
// `film check` flags a target past it, `HandFar`). Its grip forms as it
// arrives. Where it is and how it is turned are pure functions of its
// shoulder, its rest, its gesture and the breath, written into buffers this
// module keeps (no allocation a frame), so a frame draws the same hand
// however it was reached, and nothing flips.
//
// The close-up (`closeHand`) is the same hand, big, palm up, with the ink a
// hand is allowed at that size: two finger-joint lines and a lifeline. A
// figure's own hand turns palm up into the close-up's shape
// (`Gesture.turn`) before a push into it, so the small hand and the big one
// are one shape at two scales.

import { BOIL_FPS, type Hand, type Pt, spline, stroke, sub } from './ink.ts';
import { cutout } from './cutout.ts';
import { PAPER_EDGES, piece } from './piece.ts';
import { probeHand, probesHands } from './probe.ts';
import { clamp, lerp } from '../core/time.ts';
import { hash } from '../core/random.ts';

/**
 * What a hand does with its mitten: `open` flat and reaching (receiving,
 * giving, touching), `hold` closed round something, `point` its forefinger
 * out, `palm` spread wide, the palm shown (stop; only speak the word).
 */
export type Grip = 'open' | 'hold' | 'point' | 'palm';

export const GRIPS: ReadonlyArray<Grip> = ['open', 'hold', 'point', 'palm'];

/**
 * One hand at work: where it goes (`to`, the mitten's centre), how far it
 * has travelled there from its rest (0 at rest, 1 there: a named cue's
 * `f.at`), and its grip (`open` unless given), which forms as it arrives.
 * `turn` (0 unless given, a named cue's `f.at`) turns the hand palm up to
 * receive, into the close-up's shape at the mitten's size, its palm's middle
 * on `to` and its fingers up: a push into the hand (`closeHand`) starts
 * from it.
 *
 * A hand at work that changes its grip mid-act (a finger writing, then the
 * hand opening to send) names the grip it held as `was` and how far it has
 * changed as `change` (a named cue's `f.at`): it arrives forming `was`, then
 * morphs from `was` into `grip`, point for point, as `change` goes 0 to 1. It
 * never swaps one grip for another in a frame.
 */
export interface Gesture {
  readonly to: Pt;
  readonly reach: number;
  readonly grip?: Grip;
  readonly turn?: number;
  readonly was?: Grip;
  readonly change?: number;
}

/** How a figure's hands are cut and how far they float, in the figure's own units. */
export interface HandStyle {
  /** The mitten's paper and the ink round it. */
  readonly skin: string;
  readonly outline: string;
  /** The mitten's length, wrist to fingertips. */
  readonly mitten: number;
  /** The outline's width, in px. */
  readonly line: number;
  /**
   * The figure's reach: the farthest its hand works from its shoulder. A
   * target past it is a staging error `film check` flags (`HandFar`); the
   * hand is never stretched out to it.
   */
  readonly radius: number;
}

/**
 * Where a hand belongs on its figure: the shoulder it moves round (and its
 * reach is measured from), where it floats at rest, the side of the body it
 * is on (`away`: −1 the far side, −x; 1 the near, +x; its thumb and its arc
 * keep to that side), and the figure's breath now, −1..1 (`breathOf`), which
 * it bobs with at rest.
 */
export interface HandRoot {
  readonly shoulder: Pt;
  readonly rest: Pt;
  readonly away: -1 | 1;
  readonly breath: number;
}

/** How long a figure's breath takes, in seconds. */
const BREATH_PERIOD = 3.6;
/** How far a hand at rest bobs with the breath, as a share of its mitten's length. */
const BOB = 0.08;
/** How far a hand swings past its reach before it settles, at most, as a share of its mitten's length. */
const SETTLE = 0.35;
/** The settle's shape, `sin(πs)·s³`, peaks at about this: dividing by it makes `SETTLE` its peak. */
const SETTLE_PEAK = 0.3;
/**
 * Where the arc round a shoulder is cut, radians from +x: up and in, toward
 * the head, on each side. A hand's arc never crosses it, so it goes round
 * the outside or under, never over its own head, and a target that moves
 * never flips the arc, short of one reached through the head.
 */
const CUT = { far: -Math.PI / 4, near: (-3 * Math.PI) / 4 } as const;

const buffer = (n: number): [number, number][] =>
  Array.from({ length: n }, (): [number, number] => [0, 0]);

/**
 * A figure's breath at this frame, −1..1: a slow swell on the boil clock,
 * its phase the figure's own (`hand`, the person's), so a crowd does not
 * breathe as one. Both of a figure's hands take the same breath.
 */
export const breathOf = (hand: Hand): number =>
  Math.sin((2 * Math.PI * hand.boil) / (BOIL_FPS * BREATH_PERIOD) + 2 * Math.PI * hash(hand.seed));

/** `a` turned into the turn [cut, cut + 2π). */
const wrap = (a: number, cut: number) => {
  const turn = 2 * Math.PI;
  return cut + ((((a - cut) % turn) + turn) % turn);
};

/** Where a hand is and how it is turned (scratch, rewritten by every `place`). */
interface Placed {
  x: number;
  y: number;
  /** Radians: the way the hand points, away from its shoulder. */
  angle: number;
  /** How far it has travelled, 0..1. */
  s: number;
}
const PLACED: Placed = { x: 0, y: 0, angle: 0, s: 0 };

/**
 * Where the hand of `root` is doing `g` (at rest with none): along an arc
 * round the shoulder from its rest to `g.to`, its angle and its distance
 * from the shoulder going over together as `g.reach` does, the way a hand on
 * an unseen arm swings; swung a little past its reach just before it arrives
 * and settled there; bobbing with the breath while it is at rest, still
 * once at work. Its angle is the way from the shoulder to it.
 */
const place = (root: HandRoot, g: Gesture | undefined, mitten: number): Placed => {
  const [sx, sy] = root.shoulder;
  const cut = root.away === 1 ? CUT.near : CUT.far;
  const rx = root.rest[0] - sx;
  const ry = root.rest[1] - sy;
  const r0 = Math.hypot(rx, ry);
  const a0 = wrap(Math.atan2(ry, rx), cut);
  const s = g === undefined ? 0 : clamp(g.reach);
  PLACED.s = s;
  if (g === undefined || s <= 0) {
    PLACED.x = root.rest[0];
    PLACED.y = root.rest[1] + BOB * mitten * root.breath;
    PLACED.angle = a0;
    return PLACED;
  }
  const tx = g.to[0] - sx;
  const ty = g.to[1] - sy;
  const a1 = wrap(Math.atan2(ty, tx), cut);
  PLACED.angle = lerp(a0, a1, s);
  if (s >= 1) {
    PLACED.x = g.to[0];
    PLACED.y = g.to[1];
    return PLACED;
  }
  const settle = (SETTLE * mitten * Math.sin(Math.PI * s) * s ** 3) / SETTLE_PEAK;
  const r = lerp(r0, Math.hypot(tx, ty), s) + settle;
  PLACED.x = sx + r * Math.cos(PLACED.angle);
  PLACED.y = sy + r * Math.sin(PLACED.angle) + BOB * mitten * root.breath * (1 - s);
  return PLACED;
};

/** Where the hand of `root` is, doing `g` (at rest with none): its mitten's centre. Something it holds rides here. */
export const handAt = (root: HandRoot, g: Gesture | undefined, style: HandStyle): Pt => {
  const p = place(root, g, style.mitten);
  return [p.x, p.y];
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

/** Points round every grip's palm: the same count, so one grip turns into another point for point. */
const PALM_POINTS = 40;

/**
 * `poly`, round the origin inside it, resampled at `n` even angles from +x:
 * where each ray from the origin leaves it.
 */
const radial = (poly: ReadonlyArray<Pt>, n: number): Pt[] =>
  Array.from({ length: n }, (_, k): Pt => {
    const t = (2 * Math.PI * k) / n;
    const dx = Math.cos(t);
    const dy = Math.sin(t);
    let far = 0;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      if (a === undefined || b === undefined) continue;
      const ex = b[0] - a[0];
      const ey = b[1] - a[1];
      const den = ex * dy - dx * ey;
      if (Math.abs(den) < 1e-12) continue;
      const u = (ex * a[1] - a[0] * ey) / den;
      const v = (dx * a[1] - dy * a[0]) / den;
      if (u > 0 && v >= 0 && v <= 1) far = Math.max(far, u);
    }
    return [far * dx, far * dy];
  });

/** One grip's unit shapes, each the same count of points as every other grip's. */
interface Form {
  /** Palm and fingers, one piece. */
  readonly palm: ReadonlyArray<Pt>;
  readonly thumb: ReadonlyArray<Pt>;
  /** The forefinger: a capsule for `point`, drawn in to a dot where it roots for the others. */
  readonly finger: ReadonlyArray<Pt>;
  /** Closed, the thumb lies over the palm; open, it stands behind it. */
  readonly thumbOver: boolean;
}

/** Where a pointing forefinger roots on the fist, and where it reaches. */
const FINGER_ROOT: Pt = [0.12, -0.14];
const FINGER_TIP: Pt = [0.8, -0.16];
const NO_FINGER = (): Pt[] => capsule(FINGER_ROOT, FINGER_ROOT, 0);

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

const FORMS = {
  open: {
    palm: radial(
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
      PALM_POINTS,
    ),
    thumb: capsule([-0.2, -0.2], [0.1, -0.55], 0.12),
    finger: NO_FINGER(),
    thumbOver: false,
  },
  hold: {
    palm: radial(FIST, PALM_POINTS),
    thumb: capsule([-0.18, -0.26], [0.22, -0.28], 0.11),
    finger: NO_FINGER(),
    thumbOver: true,
  },
  point: {
    palm: radial(FIST, PALM_POINTS),
    thumb: capsule([-0.18, -0.26], [0.18, -0.3], 0.11),
    finger: capsule(FINGER_ROOT, FINGER_TIP, 0.11),
    thumbOver: true,
  },
  palm: {
    palm: radial(SPREAD, PALM_POINTS),
    thumb: SPREAD_THUMB,
    finger: NO_FINGER(),
    thumbOver: false,
  },
} satisfies Record<Grip, Form>;

/** A hand at rest holds its mitten open, and forms its grip from it as it arrives. */
const REST_GRIP: Grip = 'open';
/** Over which share of its travel a hand forms its grip: none by the first, all by the second. */
const FORMING: readonly [number, number] = [0.4, 0.9];

/** The mitten between two grips (scratch): its parts' unit shapes, rewritten by `formed`, and where they are laid. */
const MORPH_UNIT = {
  palm: buffer(PALM_POINTS),
  thumb: buffer(FORMS.open.thumb.length),
  finger: buffer(FORMS.open.finger.length),
};
const MORPH = {
  palm: part(MORPH_UNIT.palm),
  thumb: part(MORPH_UNIT.thumb),
  finger: part(MORPH_UNIT.finger),
};

/** `a` to `b` at `t`, point for point, into the unit shape `out`. */
const blend = (out: [number, number][], a: ReadonlyArray<Pt>, b: ReadonlyArray<Pt>, t: number) => {
  for (let i = 0; i < out.length; i++) {
    const p = a[i];
    const q = b[i];
    const o = out[i];
    if (p === undefined || q === undefined || o === undefined) continue;
    o[0] = lerp(p[0], q[0], t);
    o[1] = lerp(p[1], q[1], t);
  }
};

/** The mitten `form` of the way from grip `from` to grip `to`, into `MORPH`. */
const formed = (from: Grip, to: Grip, form: number) => {
  const a: Form = FORMS[from];
  const b: Form = FORMS[to];
  blend(MORPH_UNIT.palm, a.palm, b.palm, form);
  blend(MORPH_UNIT.thumb, a.thumb, b.thumb, form);
  blend(MORPH_UNIT.finger, a.finger, b.finger, form);
  return form < 0.5 ? a.thumbOver : b.thumbOver;
};

/** How far a hand doing `g` has changed from `was` into `grip`: all the way when it names no `was`. */
const changeOf = (g: Gesture | undefined) => (g?.was === undefined ? 1 : clamp(g.change ?? 0));

/** How far a hand `s` of the way to its target has formed its grip from the open rest (over `FORMING`). */
const arrivedAt = (s: number) => clamp((s - FORMING[0]) / (FORMING[1] - FORMING[0]));

/**
 * The grip a hand doing `g` works with, as shares of each grip: `grip`, or
 * `was` changing into it. For a check probing hands (`HandJump`), so it is
 * made only then.
 */
const gripShares = (g: Gesture | undefined): Record<Grip, number> => {
  const grip = g?.grip ?? REST_GRIP;
  const change = changeOf(g);
  const shares = { open: 0, hold: 0, point: 0, palm: 0 };
  shares[g?.was ?? grip] += 1 - change;
  shares[grip] += change;
  return shares;
};

/** How a hand's mitten is formed this frame (scratch, rewritten by `shaped`). */
interface Shaped {
  thumbOver: boolean;
  /** How much of a forefinger shows, 0..1. */
  pointing: number;
}
const SHAPED: Shaped = { thumbOver: false, pointing: 0 };

/**
 * The mitten of a hand doing `g`, `s` of the way to its target, into
 * `MORPH_UNIT`: the grip it works with (`grip`, or, while it changes, `was`
 * morphing into `grip` as `change` goes 0 to 1), formed from the open rest
 * as it arrives (over `FORMING`). Every input moves every point smoothly, so
 * no grip ever swaps in a frame, whichever way the hand is going.
 */
const shaped = (g: Gesture | undefined, s: number): Shaped => {
  const grip = g?.grip ?? REST_GRIP;
  const was = g?.was ?? grip;
  const change = changeOf(g);
  const arrived = arrivedAt(s);
  const working = formed(was, grip, change);
  const rest: Form = FORMS[REST_GRIP];
  blend(MORPH_UNIT.palm, rest.palm, MORPH_UNIT.palm, arrived);
  blend(MORPH_UNIT.thumb, rest.thumb, MORPH_UNIT.thumb, arrived);
  blend(MORPH_UNIT.finger, rest.finger, MORPH_UNIT.finger, arrived);
  SHAPED.thumbOver = arrived < 0.5 ? rest.thumbOver : working;
  SHAPED.pointing =
    arrived * ((was === 'point' ? 1 - change : 0) + (grip === 'point' ? change : 0));
  return SHAPED;
};

/**
 * The outline of the palm and fingers of a hand doing `g`, `s` of the way to
 * its target, in its unit shape (pointing +x from its centre, `PALM_POINTS`
 * points): the tests read it to know a grip changes smoothly. The buffer is
 * rewritten by the next call.
 */
export const handShape = (g: Gesture | undefined, s: number): ReadonlyArray<Pt> => {
  shaped(g, s);
  return MORPH_UNIT.palm;
};

/**
 * `p.unit` laid at (x, y), turned `angle`, `size` long, its −y side
 * mirrored to `flip` (so each hand keeps its thumb on one side and it never
 * jumps), written into `p.at`.
 */
const lay = (
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
 * The mitten of a hand doing `g`, `s` of the way there (see `shaped`), its
 * centre at (x, y), pointing along `angle`, `size` long (times `along` along
 * the fingers, as it turns), its thumb on the `flip` side (its root's `away`).
 */
const mitten = (
  ctx: CanvasRenderingContext2D,
  g: Gesture | undefined,
  s: number,
  [x, y]: Pt,
  angle: number,
  size: number,
  flip: number,
  style: HandStyle,
  hand: Hand,
  along = 1,
) => {
  const { thumbOver, pointing } = shaped(g, s);
  const look = {
    role: 'figure',
    line: style.line,
    color: style.skin,
    outline: style.outline,
  } as const;
  if (!thumbOver) piece(ctx, lay(MORPH.thumb, x, y, angle, size, flip, along), look, sub(hand, 1));
  if (pointing > 0)
    piece(ctx, lay(MORPH.finger, x, y, angle, size, flip, along), look, sub(hand, 3));
  piece(ctx, lay(MORPH.palm, x, y, angle, size, flip, along), look, sub(hand, 2));
  if (thumbOver) piece(ctx, lay(MORPH.thumb, x, y, angle, size, flip, along), look, sub(hand, 1));
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
interface Turned {
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
  g: Gesture | undefined,
  s: number,
  end: Pt,
  angle: number,
  size: number,
  flip: -1 | 1,
  style: HandStyle,
  hand: Hand,
) => {
  const turn = clamp(g?.turn ?? 0);
  if (turn <= 0) {
    mitten(ctx, g, s, end, angle, size, flip, style, hand);
    return;
  }
  const { cup, along } = turning(turn);
  const facing = angle + toward(angle, -Math.PI / 2) * turn;
  if (!cup) {
    mitten(ctx, g, s, end, facing, size, flip, style, hand, along);
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

/** Where a hand is drawn (scratch). */
const AT: [number, number] = [0, 0];

/**
 * What a check probing hands needs of a floating hand beyond what the hand
 * knows itself: whether it is drawn over its own figure's body (after it),
 * and that body's silhouette, one shape or several, in the hand's space.
 */
export interface HandBody {
  readonly over: boolean;
  readonly body: () => ReadonlyArray<ReadonlyArray<Pt>>;
}

/**
 * The hand of `root`, floating free: at rest with no gesture, doing `g`
 * with one (see `place`), the one mitten in `style` with no arm. Its grip
 * forms from the open rest as it arrives; `g.turn` turns it palm up.
 *
 * Given its figure's `body`, it declares itself to a check probing hands
 * (`probeHand`: its side from `root.away`, its shoulder, where it is, where
 * it works, its size and reach, the grip it works with and how far that is
 * formed), so `film check` follows it frame to frame
 * (`HandJump`), flags one sent past the reach (`HandFar`) and sees one lost
 * behind its body (`HandHidden`), whichever film draws it. It declares
 * itself even when the context's alpha hides it, and then draws nothing.
 */
export const floatingHand = (
  ctx: CanvasRenderingContext2D,
  root: HandRoot,
  g: Gesture | undefined,
  style: HandStyle,
  hand: Hand,
  seen?: HandBody,
) => {
  const p = place(root, g, style.mitten);
  AT[0] = p.x;
  AT[1] = p.y;
  if (seen !== undefined && probesHands(ctx)) {
    const reach = g?.reach ?? 0;
    probeHand(ctx, {
      side: root.away === 1 ? 'near' : 'far',
      shoulder: root.shoulder,
      at: AT,
      to: g === undefined || reach <= 0 ? root.rest : g.to,
      size: style.mitten,
      radius: style.radius,
      reach,
      grip: gripShares(g),
      formed: arrivedAt(p.s),
      over: seen.over,
      body: seen.body,
    });
  }
  if (ctx.globalAlpha <= 0) return;
  handEnd(ctx, g, p.s, AT, p.angle, style.mitten, root.away, style, sub(hand, 3));
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
// It floats in frame with no arm, as every hand does. Every shape is a pure
// function of `open`, written into buffers this module keeps.

/** How a close-up hand is cut. */
interface CloseStyle {
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

/** How a close-up is drawn beyond its shape: whose hand it is, its line, and how much of its ink shows. */
interface CloseDraw {
  /**
   * Which of its figure's hands it is, as a `HandRoot`'s `away` (the near,
   * 1, unless given): the far hand's close-up is mirrored, so its thumb lies
   * where that hand's own thumb lies turned palm up (`palmUpFrame`).
   */
  readonly away?: -1 | 1;
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
  const line = draw.line ?? CLOSE_LINE;
  ctx.save();
  if (draw.away === -1) ctx.scale(-1, 1);
  cupped(ctx, open, style, line, draw.detail ?? 1, hand);
  ctx.restore();
};
