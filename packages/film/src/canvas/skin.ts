// Bones for paper: a piece's outline bent by a few named bones before
// `piece()` cuts, edges and inks it, so the paper's tear, grain and boil and
// the check's probes all work on the bent outline unchanged. A torso rounds
// and sags in a bow, a head sinks onto it, a jaw squashes the lower head:
// deformation, where `at` and `ctx.rotate` only turn rigid pieces.
//
// - A `skeleton` is a few bones, each a start, a direction and a length; a
//   child starts at its parent's tip. Built once, at module scope.
// - `.skin(name, path, weights)` binds a named outline to the bones once:
//   each point's weights, by a smooth (cubic) falloff along a chain of bones
//   or by the drawing's own function, normalised so every point is shared
//   out whole.
// - A `pose` is a frame's values by bone name (turn, scale along and across,
//   shift), made fresh from the frame's own numbers: nothing is carried from
//   one frame to the next. `pose.at(name)` is that skin bent, a new path,
//   handed to `piece()`. A pose bends only its own skeleton's skins, by
//   name: no other skin can be handed to it.
//
// The blend is dual-quaternion skinning in the plane: each bone's move of a
// point (its scale about its start, then its rigid move) is blended as a turn
// and a shift together, so a joint turned far keeps its girth instead of
// collapsing toward the joint (linear blending's "candy wrapper"), and a
// joint shared by two bones lands where both put it.

import type { Path, Pt } from './ink.ts';
import { spline } from './ink.ts';

/** A root bone at rest: where it starts and which way it points (radians, as `ctx.rotate`), in the figure's units. */
interface RootRest {
  readonly at: Pt;
  readonly angle: number;
  readonly length: number;
}

/** A child bone at rest: its turn from its parent's direction (0 carries straight on), and its length. It starts at the parent's tip. */
interface BoneRest {
  readonly angle?: number;
  readonly length: number;
}

/** One bone's pose on a frame: every field is a move from rest, and a field left out is at rest. Finite numbers only (see `PoseNotFinite`). */
interface BonePose {
  /** Turn about the bone's start, radians (+ as `ctx.rotate`, clockwise on screen). */
  readonly turn?: number | undefined;
  /** Scale along the bone, about its start: below 1 squashes what it weighs toward the start and brings its children's start in. */
  readonly along?: number | undefined;
  /** Scale across the bone, about its line. */
  readonly across?: number | undefined;
  /** Move the bone's start, in its parent's frame (a root's: the figure's units). */
  readonly shift?: Pt | undefined;
}

/** A frame's values, by bone name: a bone left out is at rest. */
export type PoseValues<B extends string> = { readonly [K in B]?: BonePose };

/** A number for some of a skeleton's bones, by name. */
type ByBone<B extends string> = { readonly [K in B]?: number };

/** A transform as `ctx.transform(a, b, c, d, e, f)` takes it. */
type Transform = readonly [number, number, number, number, number, number];

/**
 * A pose value that was not a finite number (NaN, ±Infinity: a 0/0, a typo),
 * named: the field is held at rest, so the outline never carries a NaN point
 * that a canvas would silently drop.
 */
interface PoseNotFinite<B extends string> {
  readonly _tag: 'PoseNotFinite';
  readonly bone: B;
  readonly field: keyof BonePose;
  readonly value: number;
}

/**
 * A skeleton posed for one frame. Made by `Skeleton.pose`; it keeps nothing
 * a later frame writes, and it bends only its own skeleton's skins.
 */
export interface Pose<B extends string, S extends string> {
  /** Skin `skin` bent by this pose: a new path each call (for a `smooth` skin, the curve through the bent controls). */
  readonly at: (skin: S) => Pt[];
  /**
   * Bone `bone`'s rigid move as a canvas transform (`ctx.transform(...)`):
   * what rides the bone whole (an eye on the head) is drawn in rest units
   * after it.
   */
  readonly rigid: (bone: B) => Transform;
  /** No bone moves: every skin hands back its rest outline. */
  readonly still: boolean;
  /** The values that were not finite, each held at rest: none for a sound pose. */
  readonly rejected: ReadonlyArray<PoseNotFinite<B>>;
}

/** How a skin's points are weighted to the bones. */
type Weights<B extends string> =
  /**
   * Along a chain of bones, each a child of the one before: each point by
   * how far it lies past each joint along the rest chain, measured across
   * the joint's bisector (a point on a bone, at its distance along the chain
   * from the joint; a bent rest chain, an arm, is measured bone by bone).
   * Each joint is blended over `blend` units either side (default: half the
   * shorter of its two bones) by a smoothstep. A point is measured from the
   * bone nearest it: past every joint before that bone and short of every
   * joint after it, so a chain that curls back over several joints (a U, a
   * hand on a bent wrist) gives a point on its last bone nothing of its
   * first. One joint folded back past about 175° cannot be measured across
   * its bisector: weigh it with `weigh`. With the default blend a point
   * before the chain's start is all the first bone's and one past its end
   * all the last's; a `blend` wider than an end bone reaches past that end.
   */
  | { readonly chain: ReadonlyArray<B>; readonly blend?: number }
  /** By the drawing's own function of a rest point: any non-negative numbers, normalised. */
  | { readonly weigh: (p: Pt) => ByBone<B> };

interface SkinOptions {
  /** The path is a closed outline (the default) or an open line. */
  readonly closed?: boolean;
  /** Add points along each edge, at most `spacing` apart, so a long straight edge has points to bend; every vertex given is kept. */
  readonly spacing?: number;
  /** The points are a curve's controls: bent, then the curve drawn through them (`spline`, `smooth` points a segment). */
  readonly smooth?: number;
}

/** `U`'s members met: `never` for a union of two or more literals, `U` itself for one. */
type Meet<U> = (U extends unknown ? (u: U) => void : never) extends (u: infer I) => void
  ? I
  : never;

/**
 * A name refused by the compiler, naming why: one that is not a single
 * literal (a `string`, a template such as `` `arm-${number}` ``, or a union:
 * a name the compiler cannot check, or two names at once), or one taken.
 * Checked whole, never member by member.
 */
type Fresh<N extends string, Taken extends string, What extends string> =
  Record<never, never> extends Record<N, 1>
    ? { readonly [K in `a ${What} name must be a literal`]: never }
    : [N] extends [Meet<N>]
      ? [Extract<N, Taken>] extends [never]
        ? unknown
        : { readonly [K in `a ${What} of this name already exists`]: never }
      : { readonly [K in `a ${What} name must be one name, not a union`]: never };

/**
 * A few named bones and the outlines bound to them, built once at module
 * scope and posed every frame. `B` names the bones, `S` the skins.
 */
interface Skeleton<B extends string, S extends string> {
  readonly names: ReadonlyArray<B>;
  /** A child bone `name` starting at `parent`'s tip: a new skeleton with it added (its skins bound again). */
  readonly bone: <const N extends string>(
    name: N,
    parent: B,
    rest: BoneRest & Fresh<N, B, 'bone'>,
  ) => Skeleton<B | N, S>;
  /** Bind `path` to the bones by `weights` as the skin `name`: a new skeleton with it added. */
  readonly skin: <const K extends string>(
    name: K,
    path: Path,
    weights: Weights<B> & Fresh<K, S, 'skin'>,
    options?: SkinOptions,
  ) => Skeleton<B, S | K>;
  /** The skeleton posed by a frame's `values`. */
  readonly pose: (values: PoseValues<B>) => Pose<B, S>;
  /** Skin `skin`'s outline at rest: the path given, with its added points. */
  readonly rest: (skin: S) => ReadonlyArray<Pt>;
  /** Skin `skin`'s rest point `i`'s weight on each bone, summing to 1. */
  readonly weights: (skin: S, i: number) => ByBone<B>;
  /** What binding the skins refused, each named and set aside: none for a sound rig. */
  readonly rejected: ReadonlyArray<SkinRejected<B, S>>;
}

/**
 * Something a skin's binding refused, named, and what was done instead:
 * - `WeightNotFinite`: a `weigh` gave bone `bone` a weight that is not a
 *   finite number (a 0/0 in a falloff) at `points` points, the first `value`;
 *   those weights are 0.
 * - `BlendNotFinite`: a chain's `blend` was not finite; each joint takes its
 *   default blend.
 * - `ChainNotLinked`: bone `to` follows `from` in a chain but is not its
 *   child; the chain is weighed as given, with a joint at `from`'s tip.
 */
type SkinRejected<B extends string, S extends string> =
  | {
      readonly _tag: 'WeightNotFinite';
      readonly skin: S;
      readonly bone: B;
      readonly value: number;
      readonly points: number;
    }
  | { readonly _tag: 'BlendNotFinite'; readonly skin: S; readonly value: number }
  | { readonly _tag: 'ChainNotLinked'; readonly skin: S; readonly from: B; readonly to: B };

/** One bone as a skeleton keeps it: its parent's index (−1 for a root), start, direction and length. */
interface Spec<B extends string> {
  readonly name: B;
  readonly parent: number;
  readonly at: Pt;
  readonly angle: number;
  readonly length: number;
}

/**
 * One skin as a skeleton keeps it, to bind again when a bone is added (its
 * weights by bone name: the bones they name were checked when it was added).
 */
interface SkinSpec<S extends string> {
  readonly name: S;
  readonly path: Path;
  readonly weights: Weights<string>;
  readonly options: SkinOptions;
}

/** A frame's values made sound, and what was held at rest to make them so. */
interface Sound<B extends string> {
  readonly values: PoseValues<B>;
  readonly rejected: ReadonlyArray<PoseNotFinite<B>>;
}

const ORIGIN: Pt = [0, 0];
const AT_REST: BonePose = {};
/** Below this cosine of half a joint's bend (a fold past about 175°) a chain joint is measured along its first bone. */
const FOLDED = 0.04;

/**
 * Each bone's frame for `values`: its start (x, y) and its direction, three
 * numbers a bone. Rest is this with no values, through the same arithmetic,
 * so a pose at rest lands on rest bit for bit.
 */
const framesOf = <B extends string>(
  specs: ReadonlyArray<Spec<B>>,
  values: PoseValues<B>,
): Float64Array => {
  const out = new Float64Array(specs.length * 3);
  specs.forEach((b, i) => {
    const v = values[b.name] ?? AT_REST;
    const [sx, sy] = v.shift ?? ORIGIN;
    const turn = v.turn ?? 0;
    const parent = specs[b.parent];
    if (parent === undefined) {
      out[i * 3] = b.at[0] + sx;
      out[i * 3 + 1] = b.at[1] + sy;
      out[i * 3 + 2] = b.angle + turn;
      return;
    }
    const k = b.parent * 3;
    const [px, py, pa] = [out[k] ?? 0, out[k + 1] ?? 0, out[k + 2] ?? 0];
    const reach = parent.length * (values[parent.name]?.along ?? 1) + sx;
    const [c, s] = [Math.cos(pa), Math.sin(pa)];
    out[i * 3] = px + c * reach - s * sy;
    out[i * 3 + 1] = py + s * reach + c * sy;
    out[i * 3 + 2] = pa + b.angle + turn;
  });
  return out;
};

/** Pose value `x` of `bone`'s `field`, or undefined (rest) with its rejection named when it is not finite. */
const finite = <B extends string>(
  bone: B,
  field: keyof BonePose,
  x: number | undefined,
  rejected: Array<PoseNotFinite<B>>,
): number | undefined => {
  if (x === undefined || Number.isFinite(x)) return x;
  rejected.push({ _tag: 'PoseNotFinite', bone, field, value: x });
  return undefined;
};

/** One bone's values with each non-finite field held at rest. */
const finiteBone = <B extends string>(
  bone: B,
  v: BonePose,
  rejected: Array<PoseNotFinite<B>>,
): BonePose => {
  const shift = v.shift;
  // Both components checked, so each that is not finite is named.
  const sx = finite(bone, 'shift', shift?.[0], rejected);
  const sy = finite(bone, 'shift', shift?.[1], rejected);
  const shiftOk = shift === undefined || (sx !== undefined && sy !== undefined);
  return {
    turn: finite(bone, 'turn', v.turn, rejected),
    along: finite(bone, 'along', v.along, rejected),
    across: finite(bone, 'across', v.across, rejected),
    shift: shiftOk ? shift : undefined,
  };
};

/** Whether every number in `v` is finite (or left out). */
const allFinite = (v: BonePose) =>
  [v.turn, v.along, v.across, v.shift?.[0], v.shift?.[1]].every(
    (x) => x === undefined || Number.isFinite(x),
  );

/** A frame's values with every non-finite field held at rest and named; the values as given when all are sound. */
const soundValues = <B extends string>(
  names: ReadonlyArray<B>,
  values: PoseValues<B>,
): Sound<B> => {
  const rejected: Array<PoseNotFinite<B>> = [];
  if (names.every((name) => allFinite(values[name] ?? AT_REST))) return { values, rejected };
  const out: { [K in B]?: BonePose } = {};
  for (const name of names) {
    const v = values[name];
    if (v !== undefined) out[name] = finiteBone(name, v, rejected);
  }
  return { values: out, rejected };
};

/**
 * Bone `i`'s move from its `rest` frame to its `posed` one: the turn α and
 * the shift t with p ↦ R(α)p + t, as the planar dual quaternion
 * (cos α/2, sin α/2, ½ t ⊗ r), then its scale.
 */
const moveOf = (rest: Float64Array, posed: Float64Array, i: number, v: BonePose) => {
  const [rx, ry, ra] = [rest[i * 3] ?? 0, rest[i * 3 + 1] ?? 0, rest[i * 3 + 2] ?? 0];
  const [ox, oy, oa] = [posed[i * 3] ?? 0, posed[i * 3 + 1] ?? 0, posed[i * 3 + 2] ?? 0];
  const a = oa - ra;
  const [ca, sa] = [Math.cos(a), Math.sin(a)];
  const tx = ox - (ca * rx - sa * ry);
  const ty = oy - (sa * rx + ca * ry);
  const [c, s] = [Math.cos(a / 2), Math.sin(a / 2)];
  return Float64Array.of(
    c,
    s,
    0.5 * (tx * c + ty * s),
    0.5 * (ty * c - tx * s),
    v.along ?? 1,
    v.across ?? 1,
  );
};

/** A move that is no move: no turn, no shift, no scale. */
const isStill = (m: Readonly<Float64Array>) =>
  m[1] === 0 && m[2] === 0 && m[3] === 0 && m[4] === 1 && m[5] === 1;

/** A dual quaternion's rigid move as a canvas transform. */
const transformOf = (m: Readonly<Float64Array> | undefined): Transform => {
  const [c, s, dx, dy] = [m?.[0] ?? 1, m?.[1] ?? 0, m?.[2] ?? 0, m?.[3] ?? 0];
  const [cos, sin] = [c * c - s * s, 2 * c * s];
  return [cos, sin, -sin, cos, 2 * (dx * c - dy * s), 2 * (dx * s + dy * c)];
};

/** Smoothstep: 0 at or below `a`, 1 at or above `b` (a step at `a` when they meet). */
const smoothstep = (a: number, b: number, x: number) => {
  if (x <= a) return 0;
  if (x >= b) return 1;
  const t = (x - a) / (b - a);
  return t * t * (3 - 2 * t);
};

/** Bone `i`'s tip at rest. */
const tipOf = <B extends string>(
  specs: ReadonlyArray<Spec<B>>,
  rest: Float64Array,
  i: number,
): Pt => {
  const len = specs[i]?.length ?? 0;
  const a = rest[i * 3 + 2] ?? 0;
  return [(rest[i * 3] ?? 0) + Math.cos(a) * len, (rest[i * 3 + 1] ?? 0) + Math.sin(a) * len];
};

/**
 * A chain joint: where bone `from` hands over to bone `to` (its tip), and the
 * gauge that measures a point's distance past it, `(p − at)·n`: across the
 * bisector of the two bones' directions, scaled by 1 / cos(bend / 2) so that
 * a point on either bone measures its distance along the chain from the
 * joint. Linear in the point, so the weights are smooth everywhere.
 */
const jointOf = <B extends string>(
  specs: ReadonlyArray<Spec<B>>,
  rest: Float64Array,
  axes: ReadonlyArray<Pt>,
  from: number,
  to: number,
  blend: number | undefined,
) => {
  const [ax, ay] = axes[from] ?? ORIGIN;
  const [bx, by] = axes[to] ?? ORIGIN;
  const [sx, sy] = [ax + bx, ay + by];
  // |a + b| / 2 is the cosine of half the bend; the gauge is (a + b) / |a + b| / that.
  const half = (sx * sx + sy * sy) / 2;
  const folded = Math.sqrt(half / 2) < FOLDED;
  return {
    at: tipOf(specs, rest, from),
    n: folded ? ([ax, ay] as const) : ([sx / half, sy / half] as const),
    half: blend ?? 0.5 * Math.min(specs[from]?.length ?? 0, specs[to]?.length ?? 0),
  };
};

/** How far point (x, y) lies from bone `b`'s rest segment. */
const distanceTo = <B extends string>(
  specs: ReadonlyArray<Spec<B>>,
  rest: Float64Array,
  axes: ReadonlyArray<Pt>,
  b: number,
  x: number,
  y: number,
) => {
  const [ax, ay] = axes[b] ?? ORIGIN;
  const [dx, dy] = [x - (rest[b * 3] ?? 0), y - (rest[b * 3 + 1] ?? 0)];
  const t = Math.min(Math.max(dx * ax + dy * ay, 0), specs[b]?.length ?? 0);
  return Math.hypot(dx - t * ax, dy - t * ay);
};

/** Which of `chain`'s bones (its place in the chain) lies nearest point (x, y) at rest; the first on a tie. */
const nearestOf = <B extends string>(
  specs: ReadonlyArray<Spec<B>>,
  rest: Float64Array,
  axes: ReadonlyArray<Pt>,
  chain: ReadonlyArray<number>,
  x: number,
  y: number,
) => {
  let best = 0;
  let near = Infinity;
  chain.forEach((b, k) => {
    const d = distanceTo(specs, rest, axes, b, x, y);
    if (d < near) [best, near] = [k, d];
  });
  return best;
};

/**
 * Each joint's step for a point nearest chain bone `j`, in place: the two
 * joints at its ends as their gauges measure them; every joint before those
 * at least as far past as the one after it, every joint after them at most.
 * So the steps never rise along the chain from the point's own bone outward,
 * and a joint whose bisector the chain has curled back across cannot take
 * the point for a bone it is not on.
 */
const anchored = (steps: Array<number>, j: number) => {
  for (let k = j - 2; k >= 0; k--) steps[k] = Math.max(steps[k] ?? 0, steps[k + 1] ?? 0);
  for (let k = j + 1; k < steps.length; k++) steps[k] = Math.min(steps[k] ?? 0, steps[k - 1] ?? 0);
  return steps;
};

/** Each point's weights along `chain` (bones by index), a row of every bone's per point, before normalising. */
const chainWeights = <B extends string>(
  specs: ReadonlyArray<Spec<B>>,
  rest: Float64Array,
  axes: ReadonlyArray<Pt>,
  chain: ReadonlyArray<number>,
  blend: number | undefined,
  pts: ReadonlyArray<Pt>,
): Float64Array => {
  const n = specs.length;
  const out = new Float64Array(pts.length * n);
  const joints = chain
    .slice(0, -1)
    .map((j, k) => jointOf(specs, rest, axes, j, chain[k + 1] ?? j, blend));
  pts.forEach(([x, y], i) => {
    // Bone k holds from joint k − 1's step to joint k's: the steps telescope to 1.
    const gauged = joints.map(({ at, n: [nx, ny], half }) =>
      smoothstep(-half, half, (x - at[0]) * nx + (y - at[1]) * ny),
    );
    const steps = anchored(gauged, nearestOf(specs, rest, axes, chain, x, y));
    chain.forEach((bone, k) => {
      const w = (k === 0 ? 1 : (steps[k - 1] ?? 0)) - (steps[k] ?? 0);
      out[i * n + bone] = (out[i * n + bone] ?? 0) + Math.max(0, w);
    });
  });
  return out;
};

/**
 * Each point's weights by the drawing's own `weigh`, a row of every bone's
 * per point, before normalising. A weight that is not a finite number is 0,
 * and handed to `refuse` with its bone.
 */
const ownWeights = (
  names: ReadonlyArray<string>,
  weigh: (p: Pt) => ByBone<string>,
  pts: ReadonlyArray<Pt>,
  refuse: (bone: number, value: number) => void,
): Float64Array => {
  const n = names.length;
  const out = new Float64Array(pts.length * n);
  pts.forEach((p, i) => {
    const w = weigh(p);
    names.forEach((name, b) => {
      const x = w[name] ?? 0;
      if (!Number.isFinite(x)) refuse(b, x);
      out[i * n + b] = Number.isFinite(x) ? Math.max(0, x) : 0;
    });
  });
  return out;
};

/** `w` normalised point by point, in place; a point no bone claims rides the root. */
const normalise = (w: Float64Array, n: number) => {
  for (let i = 0; i < w.length; i += n) {
    let sum = 0;
    for (let b = 0; b < n; b++) sum += w[i + b] ?? 0;
    if (sum > 0) for (let b = 0; b < n; b++) w[i + b] = (w[i + b] ?? 0) / sum;
    else w[i] = 1;
  }
  return w;
};

/** Each point's place in each bone's rest frame (along, across): two numbers per point per bone. */
const localsOf = (rest: Float64Array, n: number, pts: ReadonlyArray<Pt>): Float64Array => {
  const out = new Float64Array(pts.length * n * 2);
  pts.forEach(([x, y], i) => {
    for (let b = 0; b < n; b++) {
      const a = rest[b * 3 + 2] ?? 0;
      const [dx, dy] = [x - (rest[b * 3] ?? 0), y - (rest[b * 3 + 1] ?? 0)];
      out[(i * n + b) * 2] = dx * Math.cos(a) + dy * Math.sin(a);
      out[(i * n + b) * 2 + 1] = -dx * Math.sin(a) + dy * Math.cos(a);
    }
  });
  return out;
};

/**
 * The rest path a skin binds: the one given, every vertex kept, with points
 * added along each edge (the closing one too, for an outline) so none is
 * longer than `spacing`.
 */
const restPath = (path: Path, closed: boolean, spacing: number | undefined): Pt[] => {
  if (spacing === undefined || spacing <= 0) return [...path];
  const out: Pt[] = [];
  const edges = closed ? path.length : path.length - 1;
  path.forEach((p, i) => {
    out.push(p);
    const q = path[(i + 1) % path.length];
    if (i >= edges || q === undefined) return;
    const k = Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / spacing);
    for (let j = 1; j < k; j++)
      out.push([p[0] + ((q[0] - p[0]) * j) / k, p[1] + ((q[1] - p[1]) * j) / k]);
  });
  return out;
};

/** A skeleton's moves on one frame, in its bones' order. */
type Moves = ReadonlyArray<Readonly<Float64Array>>;

/** One skin bound: its rest points, weights and rest-frame places. */
interface Bound {
  readonly pts: ReadonlyArray<Pt>;
  readonly w: Float64Array;
  readonly local: Float64Array;
  readonly closed: boolean;
  readonly smooth: number | undefined;
}

/**
 * Bone `b`'s scale of point `i` as its dual quaternion's share, written to
 * `q[6..7]`: the displacement d, (along − 1) of the point's place along the
 * bone and (across − 1) of its place across, about the bone's start on its
 * rest axes, then moved with the bone (R d) into the dual part, ½ R(α/2) d.
 * Nothing (0, 0) when the bone does not scale.
 */
const scaleOf = (
  q: Float64Array,
  i: number,
  b: number,
  n: number,
  m: Readonly<Float64Array>,
  local: Float64Array,
  axes: ReadonlyArray<Pt>,
) => {
  const along = m[4] ?? 1;
  const across = m[5] ?? 1;
  if (along === 1 && across === 1) {
    q[6] = 0;
    q[7] = 0;
    return;
  }
  const j = (i * n + b) * 2;
  const du = (along - 1) * (local[j] ?? 0);
  const dv = (across - 1) * (local[j + 1] ?? 0);
  const axis = axes[b] ?? ORIGIN;
  const ex = du * axis[0] - dv * axis[1];
  const ey = du * axis[1] + dv * axis[0];
  const c = m[0] ?? 1;
  const s = m[1] ?? 0;
  q[6] = 0.5 * (c * ex - s * ey);
  q[7] = 0.5 * (s * ex + c * ey);
};

/**
 * Point `i`'s move, written to `q[0..3]` as the dual quaternion (c, s, dx, dy):
 * each bone's own move of the point (its scale, folded into the shift as
 * R·d, then its rigid move) blended by weight, each taken on the first's
 * side (the shorter way round), normalised. A point two bones agree on
 * lands where they agree.
 */
const blendInto = (
  q: Float64Array,
  i: number,
  w: Float64Array,
  local: Float64Array,
  axes: ReadonlyArray<Pt>,
  moves: Moves,
) => {
  const n = moves.length;
  // Scalars, not destructured arrays: this runs per point per bone, every frame.
  let c = 0;
  let s = 0;
  let dx = 0;
  let dy = 0;
  let rc = 0;
  let rs = 0;
  for (let b = 0; b < n; b++) {
    const wb = w[i * n + b] ?? 0;
    const m = moves[b];
    if (wb === 0 || m === undefined) continue;
    const mc = m[0] ?? 1;
    const ms = m[1] ?? 0;
    if (rc === 0 && rs === 0) {
      rc = mc;
      rs = ms;
    }
    const k = mc * rc + ms * rs < 0 ? -wb : wb;
    scaleOf(q, i, b, n, m, local, axes);
    c += k * mc;
    s += k * ms;
    dx += k * ((m[2] ?? 0) + (q[6] ?? 0));
    dy += k * ((m[3] ?? 0) + (q[7] ?? 0));
  }
  const len = Math.sqrt(c * c + s * s);
  q[0] = c / len;
  q[1] = s / len;
  q[2] = dx / len;
  q[3] = dy / len;
};

/**
 * Point `i` (rest x, y) moved by a frame's `moves`. `q` is the call's own
 * scratch (eight numbers), so a point costs only the point it returns.
 */
const bendPoint = (
  q: Float64Array,
  x: number,
  y: number,
  i: number,
  bound: Bound,
  axes: ReadonlyArray<Pt>,
  moves: Moves,
): Pt => {
  blendInto(q, i, bound.w, bound.local, axes, moves);
  const c = q[0] ?? 1;
  const s = q[1] ?? 0;
  const dx = q[2] ?? 0;
  const dy = q[3] ?? 0;
  // No move at all: the point as it is, bit for bit.
  if (s === 0 && dx === 0 && dy === 0) return [x, y];
  const cos = c * c - s * s;
  const sin = 2 * c * s;
  return [cos * x - sin * y + 2 * (dx * c - dy * s), sin * x + cos * y + 2 * (dx * s + dy * c)];
};

/** A chain's links that are not parent → child, named for skin `skin`. */
const unlinked = <B extends string, S extends string>(
  specs: ReadonlyArray<Spec<B>>,
  chain: ReadonlyArray<number>,
  skin: S,
): Array<SkinRejected<B, S>> =>
  chain.slice(1).flatMap((to, k) => {
    const from = chain[k] ?? 0;
    const [a, b] = [specs[from], specs[to]];
    if (a === undefined || b === undefined || b.parent === from) return [];
    return [{ _tag: 'ChainNotLinked', skin, from: a.name, to: b.name } as const];
  });

/** Skin `spec`'s raw weights on bones at `rest` for its points `pts`, and what it refused. */
const weightsOf = <B extends string, S extends string>(
  specs: ReadonlyArray<Spec<B>>,
  rest: Float64Array,
  axes: ReadonlyArray<Pt>,
  spec: SkinSpec<S>,
  pts: ReadonlyArray<Pt>,
) => {
  const names: ReadonlyArray<string> = specs.map((b) => b.name);
  const weights = spec.weights;
  const rejected: Array<SkinRejected<B, S>> = [];
  if ('chain' in weights) {
    const chain = weights.chain.map((b) => names.indexOf(b)).filter((i) => i >= 0);
    const blend = weights.blend;
    const sound = blend === undefined || Number.isFinite(blend);
    if (!sound) rejected.push({ _tag: 'BlendNotFinite', skin: spec.name, value: blend });
    rejected.push(...unlinked(specs, chain, spec.name));
    const raw = chainWeights(specs, rest, axes, chain, sound ? blend : undefined, pts);
    return { raw, rejected };
  }
  // Each bone's refusals counted, so a falloff's 0/0 is named once, not once a point.
  const refused = new Map<number, { value: number; points: number }>();
  const raw = ownWeights(names, weights.weigh, pts, (b, value) => {
    const seen = refused.get(b);
    refused.set(b, { value: seen?.value ?? value, points: (seen?.points ?? 0) + 1 });
  });
  for (const [b, { value, points }] of refused) {
    const bone = specs[b]?.name;
    if (bone !== undefined)
      rejected.push({ _tag: 'WeightNotFinite', skin: spec.name, bone, value, points });
  }
  return { raw, rejected };
};

/** Skin `spec` bound to bones at `rest`, and what binding it refused. */
const bind = <B extends string, S extends string>(
  specs: ReadonlyArray<Spec<B>>,
  rest: Float64Array,
  axes: ReadonlyArray<Pt>,
  spec: SkinSpec<S>,
) => {
  const n = specs.length;
  const closed = spec.options.closed ?? true;
  const pts = restPath(spec.path, closed, spec.options.spacing);
  const { raw, rejected } = weightsOf(specs, rest, axes, spec, pts);
  const bound: Bound = {
    pts,
    w: normalise(raw, n),
    local: localsOf(rest, n, pts),
    closed,
    smooth: spec.options.smooth,
  };
  return { bound, rejected };
};

/** `bound` bent by `moves` (its rest outline when `still`). */
const bend = (bound: Bound, axes: ReadonlyArray<Pt>, moves: Moves, still: boolean): Pt[] => {
  const q = new Float64Array(8);
  const bent = still
    ? [...bound.pts]
    : bound.pts.map((p, i) => bendPoint(q, p[0], p[1], i, bound, axes, moves));
  return bound.smooth === undefined ? bent : spline(bent, bound.smooth, bound.closed);
};

const build = <B extends string, S extends string>(
  specs: ReadonlyArray<Spec<B>>,
  skins: ReadonlyArray<SkinSpec<S>>,
): Skeleton<B, S> => {
  const names = specs.map((s) => s.name);
  const index = new Map(names.map((name, i) => [name, i]));
  const rest = framesOf(specs, {});
  const axes = specs.map((_, b): Pt => {
    const a = rest[b * 3 + 2] ?? 0;
    return [Math.cos(a), Math.sin(a)];
  });
  const binds = skins.map((spec) => [spec.name, bind(specs, rest, axes, spec)] as const);
  const bound = new Map(binds.map(([name, b]) => [name, b.bound]));
  const rejected = binds.flatMap(([, b]) => b.rejected);
  const none: Bound = {
    pts: [],
    w: new Float64Array(),
    local: new Float64Array(),
    closed: true,
    smooth: undefined,
  };
  const boundOf = (name: S) => bound.get(name) ?? none;

  const pose = (given: PoseValues<B>): Pose<B, S> => {
    const { values, rejected } = soundValues(names, given);
    const posed = framesOf(specs, values);
    const moves = specs.map((s, i) => moveOf(rest, posed, i, values[s.name] ?? AT_REST));
    const still = moves.every(isStill);
    return {
      at: (name) => bend(boundOf(name), axes, moves, still),
      rigid: (bone) => transformOf(moves[index.get(bone) ?? 0]),
      still,
      rejected,
    };
  };

  const bone = <const N extends string>(
    name: N,
    parent: B,
    boneRest: BoneRest & Fresh<N, B, 'bone'>,
  ): Skeleton<B | N, S> => {
    const added: Spec<N> = {
      name,
      parent: index.get(parent) ?? 0,
      at: ORIGIN,
      angle: boneRest.angle ?? 0,
      length: boneRest.length,
    };
    return build<B | N, S>([...specs, added], skins);
  };

  const skin = <const K extends string>(
    name: K,
    path: Path,
    weights: Weights<B> & Fresh<K, S, 'skin'>,
    options: SkinOptions = {},
  ): Skeleton<B, S | K> => {
    const added: SkinSpec<K> = { name, path, weights, options };
    return build<B, S | K>(specs, [...skins, added]);
  };

  return {
    names,
    bone,
    skin,
    pose,
    rest: (name) => boundOf(name).pts,
    weights: (name, i) => {
      const { w } = boundOf(name);
      const out: { [K in B]?: number } = {};
      names.forEach((b, k) => {
        out[b] = w[i * names.length + k] ?? 0;
      });
      return out;
    },
    rejected,
  };
};

/**
 * A skeleton of one root bone `name`; add children with `.bone(name, parent,
 * rest)` and named outlines with `.skin(name, path, weights)`. The names are
 * the skeleton's type, so a pose, a chain, a weight or a skin naming one it
 * lacks does not compile, and a pose bends only this skeleton's skins.
 *
 * ```ts
 * const BODY = skeleton('hips', { at: [0, -20], angle: -Math.PI / 2, length: 50 })
 *   .bone('chest', 'hips', { length: 58 })
 *   .bone('head', 'chest', { length: 37 })
 *   .skin('torso', TUNIC, { chain: ['hips', 'chest'] }, { spacing: 6 });
 * piece(ctx, BODY.pose({ chest: { turn: 0.05, along: 0.93 } }).at('torso'), …);
 * ```
 */
export const skeleton = <const N extends string>(
  name: N,
  rest: RootRest & Fresh<N, never, 'bone'>,
): Skeleton<N, never> =>
  build<N, never>([{ name, parent: -1, at: rest.at, angle: rest.angle, length: rest.length }], []);
