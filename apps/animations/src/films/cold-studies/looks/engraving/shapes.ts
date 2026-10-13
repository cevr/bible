// The forms the burin cuts: bodies turned about an axis (a column, a robe,
// a head, a scroll), with folds pressed into them; limbs swept along a path
// (a sleeve, a beard's lock), carrying their own line coordinates; and plain
// blocks. Every form is made once, from fixed numbers and a seed, in metres.

import { BoxGeometry, BufferAttribute, BufferGeometry, SphereGeometry, Vector3 } from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** A profile point: radius, height. */
export type Profile = ReadonlyArray<readonly [number, number]>;

/** How a turned body's surface is pressed: its radius times this at angle `a`, height `y`. */
export type Press = (a: number, y: number) => number;

/**
 * A body turned about its y axis from `profile` (bottom to top), `segs`
 * round, its radius pressed by `press` and squashed front to back by
 * `depth` (1 round). Its seam is shared, so its normals run smooth all round.
 */
export const turned = (
  profile: Profile,
  segs: number,
  press?: Press,
  depth = 1,
): BufferGeometry => {
  const rows = profile.length;
  const pos = new Float32Array(rows * segs * 3);
  for (let i = 0; i < rows; i++) {
    const [r, y] = profile[i] ?? [0, 0];
    for (let j = 0; j < segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      const k = press === undefined ? 1 : press(a, y);
      const o = (i * segs + j) * 3;
      pos[o] = Math.sin(a) * r * k;
      pos[o + 1] = y;
      pos[o + 2] = Math.cos(a) * r * k * depth;
    }
  }
  const index: number[] = [];
  for (let i = 0; i < rows - 1; i++)
    for (let j = 0; j < segs; j++) {
      const a = i * segs + j;
      const b = i * segs + ((j + 1) % segs);
      const c = (i + 1) * segs + j;
      const d = (i + 1) * segs + ((j + 1) % segs);
      index.push(a, c, b, b, c, d);
    }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('aHatch', new BufferAttribute(new Float32Array(rows * segs * 2), 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
};

/** Folds hanging from `top`, deepening toward the hem: `n` round, `amp` deep at the hem, seeded. */
export const folds =
  (n: number, amp: number, top: number, seed: number, slant = 0): Press =>
  (a, y) => {
    const fall = Math.max(0, Math.min(1, (top - y) / top));
    const lean = slant * y * Math.cos(a + seed);
    const wave =
      Math.sin(n * a + seed + lean + 0.7 * Math.sin(2 * a + seed * 1.7)) * 0.7 +
      Math.sin((n * 2 + 1) * a + seed * 2.3 - lean * 1.6) * 0.3;
    return 1 + amp * (0.25 + 0.75 * fall) * wave;
  };

/**
 * A limb swept along `path`, its radius at each point `radii`, `segs` round.
 * Its lines run along it and around it (`aHatch`: length along, then the
 * distance round at a mean radius), its seam doubled so they never wrap.
 */
export const swept = (
  path: ReadonlyArray<Vector3>,
  radii: ReadonlyArray<number>,
  segs = 14,
  depth = 1,
): BufferGeometry => {
  const rows = path.length;
  const cols = segs + 1;
  const pos = new Float32Array(rows * cols * 3);
  const nor = new Float32Array(rows * cols * 3);
  const hatch = new Float32Array(rows * cols * 2);
  const mean = radii.reduce((s, r) => s + r, 0) / Math.max(1, radii.length);
  let along = 0;
  const up = new Vector3(0, 1, 0);
  const side = new Vector3();
  const norm = new Vector3();
  const tan = new Vector3();
  for (let i = 0; i < rows; i++) {
    const p = path[i] ?? new Vector3();
    const prev = path[Math.max(0, i - 1)] ?? p;
    const next = path[Math.min(rows - 1, i + 1)] ?? p;
    tan.subVectors(next, prev).normalize();
    if (i > 0) along += p.distanceTo(prev);
    const ref = Math.abs(tan.dot(up)) > 0.9 ? new Vector3(1, 0, 0) : up;
    side.crossVectors(tan, ref).normalize();
    norm.crossVectors(side, tan).normalize();
    const r = radii[i] ?? mean;
    for (let j = 0; j < cols; j++) {
      const a = (j / segs) * Math.PI * 2;
      const nx = side.x * Math.cos(a) + norm.x * Math.sin(a) * depth;
      const ny = side.y * Math.cos(a) + norm.y * Math.sin(a) * depth;
      const nz = side.z * Math.cos(a) + norm.z * Math.sin(a) * depth;
      const o = (i * cols + j) * 3;
      pos[o] = p.x + nx * r;
      pos[o + 1] = p.y + ny * r;
      pos[o + 2] = p.z + nz * r;
      const l = Math.hypot(nx, ny, nz) || 1;
      nor[o] = nx / l;
      nor[o + 1] = ny / l;
      nor[o + 2] = nz / l;
      hatch[(i * cols + j) * 2] = along;
      hatch[(i * cols + j) * 2 + 1] = a * mean;
    }
  }
  const index: number[] = [];
  for (let i = 0; i < rows - 1; i++)
    for (let j = 0; j < segs; j++) {
      const a = i * cols + j;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('normal', new BufferAttribute(nor, 3));
  g.setAttribute('aHatch', new BufferAttribute(hatch, 2));
  g.setIndex(index);
  return g;
};

/** A block `w` × `h` × `d`, its base at y 0 when `grounded`, centred otherwise. */
export const block = (w: number, h: number, d: number, grounded = true): BufferGeometry => {
  const g = new BoxGeometry(w, h, d);
  if (grounded) g.translate(0, h / 2, 0);
  g.setAttribute(
    'aHatch',
    new BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2),
  );
  return g;
};

/** A bump on the face, by where it sits on the front of a unit head (x across, y up). */
const bump = (x: number, y: number, cx: number, cy: number, sx: number, sy: number) =>
  Math.exp(-(((x - cx) * (x - cx)) / (sx * sx) + ((y - cy) * (y - cy)) / (sy * sy)));

const smooth = (a: number, b: number, v: number) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * A head modelled as a sculptor roughs one in: an egg, the brow standing
 * over two sockets, the nose, the cheekbones, the line of the mouth and the
 * chin, the jaw narrowing. Its chin at y 0, `s` its scale (1 a man's head,
 * about 0.25 m tall).
 */
export const head = (s = 1): BufferGeometry => {
  const g = new SphereGeometry(1, 56, 40);
  const p = g.getAttribute('position');
  // The engraver's accents, darker than the light makes them: the sockets
  // and the eyes in them, under the brow and the nose, the mouth's line.
  const shade = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const front = smooth(0.05, 0.45, z);
    const both = (cx: number, cy: number, sx: number, sy: number) =>
      bump(x, y, -cx, cy, sx, sy) + bump(x, y, cx, cy, sx, sy);
    shade[i] =
      front *
      (0.28 * both(0.36, 0.14, 0.16, 0.09) +
        0.55 * both(0.34, 0.125, 0.055, 0.04) +
        0.22 * both(0.36, 0.22, 0.18, 0.04) +
        0.4 * bump(x, y, 0, -0.23, 0.12, 0.045) +
        0.25 * both(0.07, -0.18, 0.04, 0.03) +
        0.5 * bump(x, y, 0, -0.42, 0.24, 0.025));
    let r = 1;
    r += 0.1 * bump(x, y, 0, 0.3, 0.6, 0.11) * front;
    r -= 0.13 * (bump(x, y, -0.36, 0.13, 0.17, 0.1) + bump(x, y, 0.36, 0.13, 0.17, 0.1)) * front;
    r +=
      0.34 * Math.exp(-(x * x) / 0.011) * smooth(0.26, -0.08, y) * smooth(-0.3, -0.12, y) * front;
    r += 0.06 * (bump(x, y, -0.48, -0.08, 0.2, 0.16) + bump(x, y, 0.48, -0.08, 0.2, 0.16)) * front;
    r -= 0.05 * bump(x, y, 0, -0.42, 0.28, 0.05) * front;
    r += 0.07 * bump(x, y, 0, -0.66, 0.3, 0.14) * front;
    const jaw = y < 0 ? 1 - 0.3 * -y : 1;
    const back = z < 0 ? 1.06 : 1;
    p.setXYZ(i, x * r * jaw * 0.085 * s, (y * r * 0.122 + 0.125) * s, z * r * back * 0.1 * s);
  }
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g.setAttribute('aShade', new BufferAttribute(shade, 1));
  const one = mergeVertices(g, 1e-5);
  one.setAttribute(
    'aHatch',
    new BufferAttribute(new Float32Array(one.getAttribute('position').count * 2), 2),
  );
  one.computeVertexNormals();
  return one;
};

/** Points along a smooth path through `pts` (Catmull–Rom), `n` per leg. */
export const path = (pts: ReadonlyArray<readonly [number, number, number]>, n = 6): Vector3[] => {
  const v = pts.map(([x, y, z]) => new Vector3(x, y, z));
  const out: Vector3[] = [];
  for (let i = 0; i < v.length - 1; i++) {
    const p0 = v[Math.max(0, i - 1)] ?? new Vector3();
    const p1 = v[i] ?? new Vector3();
    const p2 = v[i + 1] ?? new Vector3();
    const p3 = v[Math.min(v.length - 1, i + 2)] ?? p2;
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 *
        (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push(
        new Vector3(
          f(p0.x, p1.x, p2.x, p3.x),
          f(p0.y, p1.y, p2.y, p3.y),
          f(p0.z, p1.z, p2.z, p3.z),
        ),
      );
    }
  }
  const last = v.at(-1);
  if (last !== undefined) out.push(last.clone());
  return out;
};

/** Radii from `a` to `b` over `n` points, eased. */
export const taper = (n: number, a: number, b: number): number[] =>
  Array.from({ length: n }, (_, i) => a + (b - a) * (i / Math.max(1, n - 1)));
