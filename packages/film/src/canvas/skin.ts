// Bones for paper: a piece's outline bent by a few named bones before
// `piece()` cuts, edges and inks it, so the paper's tear, grain and boil and
// the check's probes all work on the bent outline unchanged. A torso rounds
// and sags in a bow, a head sinks onto it, a jaw squashes the lower head:
// deformation, where `at` and `ctx.rotate` only turn rigid pieces.
//
// - A `skeleton` is a few bones, each a start, a direction and a length; a
//   child starts at its parent's tip. Built once, at module scope.
// - A `skin` binds an outline to the bones once: each point's weights, by a
//   smooth (cubic) falloff along a chain of bones or by the drawing's own
//   function, normalised so every point is shared out whole.
// - A `pose` is a frame's values by bone name (turn, scale along and across,
//   shift), made fresh from the frame's own numbers: nothing is carried from
//   one frame to the next.
// - `skin.at(pose)` is the bent outline, a new path, handed to `piece()`.
//
// The blend is dual-quaternion skinning in the plane: each bone's rigid move
// is blended as a turn and a shift together, so a joint turned far keeps its
// girth instead of collapsing toward the joint (linear blending's "candy
// wrapper"). A bone's scale is blended first, in its rest frame.

import { type Path, type Pt, resample, spline } from './ink.ts';

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

/** One bone's pose on a frame: every field is a move from rest, and a field left out is at rest. */
interface BonePose {
  /** Turn about the bone's start, radians (+ as `ctx.rotate`, clockwise on screen). */
  readonly turn?: number;
  /** Scale along the bone, about its start: below 1 squashes what it weighs toward the start and brings its children's start in. */
  readonly along?: number;
  /** Scale across the bone, about its line. */
  readonly across?: number;
  /** Move the bone's start, in its parent's frame (a root's: the figure's units). */
  readonly shift?: Pt;
}

/** A frame's values, by bone name: a bone left out is at rest. */
type SkinPose<B extends string> = { readonly [K in B]?: BonePose };

/** A number for some of a skeleton's bones, by name. */
type ByBone<B extends string> = { readonly [K in B]?: number };

/** A transform as `ctx.transform(a, b, c, d, e, f)` takes it. */
type Transform = readonly [number, number, number, number, number, number];

/**
 * A skeleton posed for one frame: each bone's move from rest. Made by
 * `Skeleton.pose`, read by `Skin.at` and `rigid`; it keeps nothing a later
 * frame writes.
 */
interface Pose<B extends string> {
  /** Each bone's move, by name: its rigid move as a planar dual quaternion (c, s, dx, dy), then its scale (along, across). */
  readonly moves: ReadonlyMap<B, Readonly<Float64Array>>;
  /** No bone moves: a skin hands back its rest outline. */
  readonly still: boolean;
  /**
   * Bone `bone`'s rigid move as a canvas transform (`ctx.transform(...)`):
   * what rides the bone whole (an eye on the head) is drawn in rest units
   * after it.
   */
  readonly rigid: (bone: B) => Transform;
}

/** How a skin's points are weighted to the bones. */
type Weights<B extends string> =
  /**
   * Along a chain of bones, in order: each point by where it falls along the
   * line from the chain's start to its end, each joint blended over `blend`
   * units either side (default: half the shorter of its two bones) by a
   * smoothstep. Before the start a point is all the first bone's, past the
   * end all the last's.
   */
  | { readonly chain: ReadonlyArray<B>; readonly blend?: number }
  /** By the drawing's own function of a rest point: any non-negative numbers, normalised. */
  | { readonly weigh: (p: Pt) => ByBone<B> };

interface SkinOptions {
  /** The path is a closed outline (the default) or an open line. */
  readonly closed?: boolean;
  /** Resample the path every `spacing` units first, so a long straight edge has points to bend. */
  readonly spacing?: number;
  /** The points are a curve's controls: bent, then the curve drawn through them (`spline`, `smooth` points a segment). */
  readonly smooth?: number;
}

/** An outline bound to a skeleton's bones. */
interface Skin<B extends string> {
  /** The outline at rest: the path given, resampled when asked. */
  readonly rest: ReadonlyArray<Pt>;
  /** Rest point `i`'s weight on each bone, summing to 1. */
  readonly weights: (i: number) => ByBone<B>;
  /** The outline bent by `pose`: a new path each call (for a `smooth` skin, the curve through the bent controls). */
  readonly at: (pose: Pose<B>) => Pt[];
}

/** A bone's rest, refused by the compiler (naming why) when its name is taken. */
type NewBone<N extends string, B extends string> = BoneRest &
  (N extends B ? { readonly 'a bone of this name already exists': never } : unknown);

/** A few named bones, built once at module scope and posed every frame. */
interface Skeleton<B extends string> {
  readonly names: ReadonlyArray<B>;
  /** A child bone `name` starting at `parent`'s tip: a new skeleton with it added. */
  readonly bone: <const N extends string>(
    name: N,
    parent: B,
    rest: NewBone<N, B>,
  ) => Skeleton<B | N>;
  /** The skeleton posed by a frame's `values`. */
  readonly pose: (values: SkinPose<B>) => Pose<B>;
  /** Bind `path` to the bones by `weights`. */
  readonly skin: (path: Path, weights: Weights<B>, options?: SkinOptions) => Skin<B>;
}

/** One bone as a skeleton keeps it: its parent's index (−1 for a root), start, direction and length. */
interface Spec<B extends string> {
  readonly name: B;
  readonly parent: number;
  readonly at: Pt;
  readonly angle: number;
  readonly length: number;
}

const ORIGIN: Pt = [0, 0];
const AT_REST: BonePose = {};

/**
 * Each bone's frame for `values`: its start (x, y) and its direction, three
 * numbers a bone. Rest is this with no values, through the same arithmetic,
 * so a pose at rest lands on rest bit for bit.
 */
const framesOf = <B extends string>(
  specs: ReadonlyArray<Spec<B>>,
  values: SkinPose<B>,
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

/** Each point's weights along `chain` (bones by index), a row of every bone's per point, before normalising. */
const chainWeights = <B extends string>(
  specs: ReadonlyArray<Spec<B>>,
  rest: Float64Array,
  chain: ReadonlyArray<number>,
  blend: number | undefined,
  pts: ReadonlyArray<Pt>,
): Float64Array => {
  const n = specs.length;
  const out = new Float64Array(pts.length * n);
  const first = chain[0] ?? 0;
  // The chain's line, from its first bone's start to its last bone's tip.
  const [sx, sy] = [rest[first * 3] ?? 0, rest[first * 3 + 1] ?? 0];
  const [ex, ey] = tipOf(specs, rest, chain[chain.length - 1] ?? first);
  const span = Math.hypot(ex - sx, ey - sy) || 1;
  const [ux, uy] = [(ex - sx) / span, (ey - sy) / span];
  const along = ([x, y]: Pt) => (x - sx) * ux + (y - sy) * uy;
  // Each joint (bone k's tip, where bone k + 1 takes over) on that line, and its blend.
  const joints = chain.slice(0, -1).map((j, k) => {
    const next = chain[k + 1] ?? j;
    const half = blend ?? 0.5 * Math.min(specs[j]?.length ?? 0, specs[next]?.length ?? 0);
    return { at: along(tipOf(specs, rest, j)), half };
  });
  pts.forEach((p, i) => {
    const s = along(p);
    // Bone k holds from joint k − 1's step to joint k's: the steps telescope to 1.
    const steps = joints.map((j) => smoothstep(j.at - j.half, j.at + j.half, s));
    chain.forEach((bone, k) => {
      const w = (k === 0 ? 1 : (steps[k - 1] ?? 0)) - (steps[k] ?? 0);
      out[i * n + bone] = (out[i * n + bone] ?? 0) + Math.max(0, w);
    });
  });
  return out;
};

/** Each point's weights by the drawing's own `weigh`, a row of every bone's per point, before normalising. */
const ownWeights = <B extends string>(
  names: ReadonlyArray<B>,
  weigh: (p: Pt) => ByBone<B>,
  pts: ReadonlyArray<Pt>,
): Float64Array => {
  const n = names.length;
  const out = new Float64Array(pts.length * n);
  pts.forEach((p, i) => {
    const w = weigh(p);
    names.forEach((name, b) => {
      out[i * n + b] = Math.max(0, w[name] ?? 0);
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

/** The rest path a skin binds: the one given, resampled round its closing edge too when asked. */
const restPath = (path: Path, closed: boolean, spacing: number | undefined): Pt[] => {
  const first = path[0];
  if (spacing === undefined || spacing <= 0 || first === undefined) return [...path];
  if (!closed) return resample(path, spacing);
  const ring = resample([...path, first], spacing);
  // The closing point is the first again: an outline lists it once.
  ring.pop();
  return ring;
};

/** A skeleton's moves on one frame, in its bones' order. */
type Moves = ReadonlyArray<Readonly<Float64Array> | undefined>;

/**
 * Point `i` (rest x, y) scaled, written to `out[0..1]`: each bone's scale
 * about its start, in its rest frame, blended by weight.
 */
const scaleInto = (
  out: Float64Array,
  x: number,
  y: number,
  i: number,
  w: Float64Array,
  local: Float64Array,
  axes: ReadonlyArray<Pt>,
  moves: Moves,
) => {
  const n = moves.length;
  let px = x;
  let py = y;
  for (let b = 0; b < n; b++) {
    const wb = w[i * n + b] ?? 0;
    const along = moves[b]?.[4] ?? 1;
    const across = moves[b]?.[5] ?? 1;
    if (wb === 0 || (along === 1 && across === 1)) continue;
    const j = (i * n + b) * 2;
    const du = (along - 1) * (local[j] ?? 0);
    const dv = (across - 1) * (local[j + 1] ?? 0);
    const axis = axes[b] ?? ORIGIN;
    px += wb * (du * axis[0] - dv * axis[1]);
    py += wb * (du * axis[1] + dv * axis[0]);
  }
  out[0] = px;
  out[1] = py;
};

/**
 * Point `i`'s rigid move, written to `out[2..5]` as (c, s, dx, dy): each
 * bone's dual quaternion blended by weight, each taken on the first's side
 * (the shorter way round), normalised.
 */
const moveInto = (out: Float64Array, i: number, w: Float64Array, moves: Moves) => {
  const n = moves.length;
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
    c += k * mc;
    s += k * ms;
    dx += k * (m[2] ?? 0);
    dy += k * (m[3] ?? 0);
  }
  const len = Math.sqrt(c * c + s * s);
  out[2] = c / len;
  out[3] = s / len;
  out[4] = dx / len;
  out[5] = dy / len;
};

/**
 * Point `i` (rest x, y) bent by a frame's `moves`: scaled, then moved
 * rigidly. `q` is the call's own scratch (six numbers), so a point costs
 * only the point it returns.
 */
const bendPoint = (
  q: Float64Array,
  x: number,
  y: number,
  i: number,
  w: Float64Array,
  local: Float64Array,
  axes: ReadonlyArray<Pt>,
  moves: Moves,
): Pt => {
  scaleInto(q, x, y, i, w, local, axes, moves);
  moveInto(q, i, w, moves);
  const px = q[0] ?? x;
  const py = q[1] ?? y;
  const c = q[2] ?? 1;
  const s = q[3] ?? 0;
  const dx = q[4] ?? 0;
  const dy = q[5] ?? 0;
  // No turn and no shift: the scaled point as it is, bit for bit.
  if (s === 0 && dx === 0 && dy === 0) return [px, py];
  const [cos, sin] = [c * c - s * s, 2 * c * s];
  return [cos * px - sin * py + 2 * (dx * c - dy * s), sin * px + cos * py + 2 * (dx * s + dy * c)];
};

const build = <B extends string>(specs: ReadonlyArray<Spec<B>>): Skeleton<B> => {
  const n = specs.length;
  const names = specs.map((s) => s.name);
  const index = new Map(names.map((name, i) => [name, i]));
  const rest = framesOf(specs, {});
  const axes = specs.map((_, b): Pt => {
    const a = rest[b * 3 + 2] ?? 0;
    return [Math.cos(a), Math.sin(a)];
  });

  const pose = (values: SkinPose<B>): Pose<B> => {
    const posed = framesOf(specs, values);
    const moves = new Map(
      specs.map((s, i) => [s.name, moveOf(rest, posed, i, values[s.name] ?? AT_REST)]),
    );
    const still = [...moves.values()].every(isStill);
    return { moves, still, rigid: (bone) => transformOf(moves.get(bone)) };
  };

  const skin = (path: Path, weights: Weights<B>, options: SkinOptions = {}): Skin<B> => {
    const closed = options.closed ?? true;
    const pts = restPath(path, closed, options.spacing);
    const raw =
      'chain' in weights
        ? chainWeights(
            specs,
            rest,
            weights.chain.map((b) => index.get(b) ?? 0),
            weights.blend,
            pts,
          )
        : ownWeights(names, weights.weigh, pts);
    const w = normalise(raw, n);
    const local = localsOf(rest, n, pts);
    const bent = (pose: Pose<B>): Pt[] => {
      if (pose.still) return [...pts];
      // The pose's moves in this skeleton's order, found by name.
      const moves = names.map((name) => pose.moves.get(name));
      const q = new Float64Array(6);
      return pts.map((p, i) => bendPoint(q, p[0], p[1], i, w, local, axes, moves));
    };
    const smooth = options.smooth;
    return {
      rest: pts,
      weights: (i) => {
        const out: { [K in B]?: number } = {};
        names.forEach((name, b) => {
          out[name] = w[i * n + b] ?? 0;
        });
        return out;
      },
      at: (pose) => (smooth === undefined ? bent(pose) : spline(bent(pose), smooth, closed)),
    };
  };

  const bone = <const N extends string>(
    name: N,
    parent: B,
    boneRest: NewBone<N, B>,
  ): Skeleton<B | N> => {
    const added: Spec<N> = {
      name,
      parent: index.get(parent) ?? 0,
      at: ORIGIN,
      angle: boneRest.angle ?? 0,
      length: boneRest.length,
    };
    return build<B | N>([...specs, added]);
  };

  return { names, bone, pose, skin };
};

/**
 * A skeleton of one root bone `name`; add children with `.bone(name, parent,
 * rest)`. The names are the skeleton's type, so a pose, a chain or a weight
 * naming a bone it lacks does not compile.
 *
 * ```ts
 * const BODY = skeleton('hips', { at: [0, -20], angle: -Math.PI / 2, length: 50 })
 *   .bone('chest', 'hips', { length: 58 })
 *   .bone('head', 'chest', { length: 37 });
 * const TORSO = BODY.skin(TUNIC, { chain: ['hips', 'chest'] }, { spacing: 6 });
 * piece(ctx, TORSO.at(BODY.pose({ chest: { turn: 0.05, along: 0.93 } })), …);
 * ```
 */
export const skeleton = <const N extends string>(name: N, rest: RootRest): Skeleton<N> =>
  build<N>([{ name, parent: -1, at: rest.at, angle: rest.angle, length: rest.length }]);
