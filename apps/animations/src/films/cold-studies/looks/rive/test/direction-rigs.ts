// What the direction tests (`direction-*.test.ts`) read of the generated
// rigs: the shapes of an artboard as drawn, the one colour model (CRAFT 12)
// and the audit of every colour a rig paints. The property itself is told
// in `direction-options.test.ts`.

import { type Hex, ramp } from '@bible/film/canvas';
import { expect } from 'bun:test';
import { Predicate } from 'effect';
import { type Ramp, hues, keyLight, ramps, robes, shading } from '../../../palette.ts';
import { type Direction, K1, OPTIONS, inkOf } from '../direction.ts';
import { type Mat, type Pt, boxOf } from '../parts.ts';
import type { Element } from '../rml.ts';

/** Every option, by the study's name, as a direction: K1 with that one axis changed. */
export const CASES = Object.entries(OPTIONS).map(
  ([name, set]) => [name, { ...K1, ...set } satisfies Direction] as const,
);

/** The options, and K1 itself: every direction the colours must hold under. */
export const SHADED = [['K1', K1] as const, ...CASES];

/** The centred line (A0): its thin ink leaves the casts showing, so the host lays the hand's and the rigs lay theirs. */
export const A0 = SHADED.find(([name]) => name === 'A0')?.[1] ?? K1;

// ─── reading the generated rigs ──────────────────────────────────────────────

export const attr = (e: Element | undefined, key: string) => e?.attrs.find(([k]) => k === key)?.[1];
export const num = (e: Element | undefined, key: string, otherwise: number) =>
  Number(attr(e, key) ?? otherwise);

/** Every element under `roots`, depth first. */
export const walk = (roots: ReadonlyArray<Element>): Element[] =>
  roots.flatMap((e) => [e, ...walk(e.children)]);

export const named = (roots: ReadonlyArray<Element>, name: string) =>
  walk(roots).filter((e) => attr(e, 'name') === name);

export const mul = (m: Mat, n: Mat): Mat => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
export const placed = (x: number, y: number, r: number, sx = 1, sy = 1): Mat => [
  Math.cos(r) * sx,
  Math.sin(r) * sx,
  -Math.sin(r) * sy,
  Math.cos(r) * sy,
  x,
  y,
];
export const apply = (m: Mat, [x, y]: Pt): Pt => [
  m[0] * x + m[2] * y + m[4],
  m[1] * x + m[3] * y + m[5],
];

/**
 * Each element under `roots` with the frame its own coordinates are in, at
 * rest, and its ancestors (nearest last): a node or a shape places, turns and
 * scales its children; a root bone stands where it is put; a bone stands at
 * its parent bone's tip.
 */
export const framed = (
  roots: ReadonlyArray<Element>,
  frame: Mat = [1, 0, 0, 1, 0, 0],
  bone?: Element,
  up: ReadonlyArray<Element> = [],
): ReadonlyArray<{
  readonly e: Element;
  readonly at: Mat;
  readonly up: ReadonlyArray<Element>;
}> =>
  roots.flatMap((e) => {
    const r = num(e, 'rotation', 0);
    const at: Mat =
      e.name === 'Bone'
        ? mul(frame, placed(num(bone, 'length', 0), 0, r))
        : e.name === 'RootBone'
          ? mul(frame, placed(num(e, 'x', 0), num(e, 'y', 0), r))
          : e.name === 'Node' || e.name === 'Shape'
            ? mul(
                frame,
                placed(num(e, 'x', 0), num(e, 'y', 0), r, num(e, 'scaleX', 1), num(e, 'scaleY', 1)),
              )
            : frame;
    const isBone = e.name === 'Bone' || e.name === 'RootBone';
    return [{ e, at, up }, ...framed(e.children, at, isBone ? e : bone, [...up, e])];
  });

/** A shape's outline points on its artboard, at rest. */
export const pointsOf = (board: Element, shape: string): Pt[] => {
  const all = framed([board]);
  const target = all.find(({ e }) => e.name === 'Shape' && attr(e, 'name') === shape);
  expect([shape, target !== undefined]).toEqual([shape, true]);
  if (target === undefined) return [];
  return target.e.children
    .filter((c) => c.name === 'PointsPath')
    .flatMap((p) => p.children)
    .filter((v) => v.name === 'CubicMirroredVertex')
    .map((v) => apply(target.at, [num(v, 'x', 0), num(v, 'y', 0)]));
};

/** How far a shape's paint reaches past its outline: its widest stroke's half, its shadow's offset and feather. */
export const reachOf = (board: Element, shape: string) => {
  const target = named([board], shape)[0];
  const strokes = (target?.children ?? []).filter((c) => c.name === 'Stroke');
  const feathers = walk(target?.children ?? []).filter((c) => c.name === 'Feather');
  return Math.max(
    0,
    ...strokes.map((s) => num(s, 'thickness', 0) / 2),
    ...feathers.map(
      (f) =>
        Math.max(Math.abs(num(f, 'offsetX', 0)), Math.abs(num(f, 'offsetY', 0))) +
        num(f, 'strength', 0),
    ),
  );
};

/** The outline's crawl (the boil's widest wander) and what the timelines move a head at most (breath, lift, lean), units. */
export const MOVES = 0.9 + 8;

/** A colour value as RML writes it, back to `#rrggbb`. */
export const hexOf = (argbValue: string) => `#${argbValue.slice(2).toLowerCase()}`;

/** A paint of `shape` by its name. */
export const paintNamed = (shape: Element, name: string) =>
  shape.children.find((c) => attr(c, 'name') === name);

/** A paint's colours, as `#rrggbb`: its solid's, or its gradient's stops in order. */
export const coloursOf = (paint: Element) =>
  walk([paint])
    .filter((e) => e.name === 'SolidColor' || e.name === 'GradientStop')
    .map((e) => hexOf(String(attr(e, 'colorValue'))));

/** The paper a shape is cut from: its `Paper` fill's base (its first stop). */
export const paperOf = (shape: Element) => {
  const paint = paintNamed(shape, 'Paper');
  return paint === undefined ? undefined : coloursOf(paint)[0];
};

/** A shape of an artboard as drawn: its element, its place in the draw (0 on top), its outline at rest on the artboard, and its ancestors. */
export interface Drawn {
  readonly e: Element;
  readonly name: string;
  readonly order: number;
  readonly outline: ReadonlyArray<Pt>;
  readonly up: ReadonlyArray<Element>;
}

/** Every shape of `board`, top first (Rive draws a node's first child over the ones after it). */
export const drawnOf = (board: Element): ReadonlyArray<Drawn> =>
  framed([board])
    .filter(({ e }) => e.name === 'Shape')
    .map(({ e, at, up }, order) => ({
      e,
      name: String(attr(e, 'name')),
      order,
      outline: e.children
        .filter((c) => c.name === 'PointsPath')
        .flatMap((p) => p.children)
        .filter((v) => v.name === 'CubicMirroredVertex' || v.name === 'StraightVertex')
        .map((v) => apply(at, [num(v, 'x', 0), num(v, 'y', 0)])),
      up,
    }));

/** Whether `p` lies inside the closed polygon `poly`. */
export const inside = ([x, y]: Pt, poly: ReadonlyArray<Pt>) => {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i] ?? [0, 0];
    const [xj, yj] = poly[j] ?? [0, 0];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
};

/** How far `p` lies from the nearest edge of the closed polygon `poly`. */
export const edgeDistance = ([x, y]: Pt, poly: ReadonlyArray<Pt>) => {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j] ?? [0, 0];
    const [bx, by] = poly[i] ?? [0, 0];
    const len = (bx - ax) ** 2 + (by - ay) ** 2;
    const t =
      len === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / len));
    best = Math.min(best, Math.hypot(x - ax - t * (bx - ax), y - ay - t * (by - ay)));
  }
  return best;
};

/** A paper piece: a shape with a `Paper` fill (not a face mark, not a cast). */
export const isPaper = (s: Drawn) => paintNamed(s.e, 'Paper') !== undefined;

/**
 * What moves `s`: the ancestors that place it or that a timeline or a
 * constraint can reach (an id), and the bones its skin bends with. Two
 * shapes moved by the same lie together in every pose as they do at rest.
 */
export const moversOf = (s: Drawn) => ({
  frames: s.up.filter(
    (a) =>
      ['Node', 'Bone', 'RootBone', 'Shape'].includes(a.name) &&
      ['id', 'x', 'y', 'rotation', 'scaleX', 'scaleY'].some((k) => attr(a, k) !== undefined),
  ),
  bones: walk(s.e.children)
    .filter((c) => c.name === 'Tendon')
    .map((t) => String(attr(t, 'boneId')))
    .sort(),
});
export const moveTogether = (a: Drawn, b: Drawn) => {
  const [p, q] = [moversOf(a), moversOf(b)];
  return (
    p.frames.length === q.frames.length &&
    p.frames.every((f, i) => f === q.frames[i]) &&
    p.bones.join() === q.bones.join()
  );
};

// ─── the one colour model (CRAFT 12) ─────────────────────────────────────────

/** Whether `c` is a hex colour the colour model takes. */
export const isHex = (c: string): c is Hex => /^#[0-9a-f]{6}$/i.test(c);

/**
 * The ramp CRAFT 12 derives from `base` under the court's key light
 * (`ramp`): every shade, light and cast of that paper is one of it. A base
 * that is no hex colour derives nothing a rig could paint.
 */
export const derived = (base: string): { readonly shade: string; readonly light: string } =>
  isHex(base)
    ? ramp(base, keyLight, shading)
    : { shade: `no shade of ${base}`, light: `no light of ${base}` };

/** Hex colour `hex` in CIE LCh (D65): lightness 0..100, chroma, hue in degrees. */
export const lchOf = (hex: string) => {
  const lin = (i: number) => {
    const s = Number.parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [lin(0), lin(1), lin(2)];
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  const [A, B] = [500 * (x - y), 200 * (y - z)];
  return {
    L: 116 * y - 16,
    C: Math.hypot(A, B),
    h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360,
  };
};

/** A colour and its LCh chroma, so a near-grey reads as one in a failure. */
export const shown = (hex: string | undefined) =>
  hex === undefined || !/^#[0-9a-f]{6}$/i.test(hex)
    ? String(hex)
    : `${hex} (C ${lchOf(hex).C.toFixed(1)})`;

/** Every base the palette declares: the papers the look may cut from. */
export const BASES: ReadonlySet<string> = new Set(
  [...Object.values(ramps), ...Object.values(hues), ...Object.values(robes)].flatMap(
    (v: Hex | Ramp | ReadonlyArray<Hex>) =>
      Predicate.hasProperty(v, 'base') && Predicate.isString(v.base) ? [v.base.toLowerCase()] : [],
  ),
);

/**
 * What a cast falls on past each artboard's figure: the court's parchment
 * behind the accused and the judge; the host's scenery under the judge's
 * hand, where the host lays its cast (`riveJudge.over`).
 */
export const GROUND = new Map<string, string>([
  ['Accused', ramps.paper.base],
  ['Judge', ramps.paper.base],
  ['Hand', 'host'],
]);

/** How far the renderer paints a feather past its shape, per unit of strength (Rive's `paint_outset`), and a pixel of antialiasing, units. */
export const FEATHER_EXTENT = 1.5;
export const AA = 1;

/** How far a piece's ink and light core reach outside its cut: half its widest stroke. */
export const coverOf = (shape: Element) =>
  Math.max(
    0,
    ...shape.children.filter((c) => c.name === 'Stroke').map((s) => num(s, 'thickness', 0) / 2),
  );

/** A shadow's offset, and how far past its shape it paints anything. */
export const shadowOf = (shadow: Element) => {
  const f = walk([shadow]).find((e) => e.name === 'Feather');
  const offset: Pt = [num(f, 'offsetX', 0), num(f, 'offsetY', 0)];
  return {
    offset,
    reach: Math.hypot(offset[0], offset[1]) + FEATHER_EXTENT * num(f, 'strength', 0) + AA,
  };
};

/** The casts of the piece `name`: its clipped casts on its figure's surfaces and its ground cast. */
export const castsOf = (shapes: ReadonlyArray<Drawn>, name: string) =>
  shapes.filter((s) => s.name === `${name}Cast` || s.name.startsWith(`${name}CastOn`));

/**
 * What a piece's own shadow falls on at rest: points just past its ink on
 * the side away from the light, each on the topmost paper drawn under the
 * piece there, else the artboard's ground.
 */
export const receiversOf = (shapes: ReadonlyArray<Drawn>, caster: Drawn, shadow: Element) => {
  const { offset, reach } = shadowOf(shadow);
  const cover = coverOf(caster.e);
  const n = Math.hypot(offset[0], offset[1]);
  if (n === 0 || reach <= cover || caster.outline.length === 0) return [];
  const away: Pt = [offset[0] / n, offset[1] / n];
  const box = boxOf(caster.outline);
  const centre: Pt = [(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2];
  const above = shapes.filter((s) => s.order < caster.order && isPaper(s));
  const below = shapes.filter((s) => s.order > caster.order && isPaper(s));
  const found = new Set<Drawn | 'ground'>();
  for (const v of caster.outline) {
    const m = Math.hypot(v[0] - centre[0], v[1] - centre[1]);
    if (m === 0 || ((v[0] - centre[0]) * away[0] + (v[1] - centre[1]) * away[1]) / m < 0.7)
      continue;
    const dist = (cover + reach) / 2;
    const p: Pt = [v[0] + away[0] * dist, v[1] + away[1] * dist];
    if (inside(p, caster.outline) || above.some((s) => inside(p, s.outline))) continue;
    found.add(below.find((s) => inside(p, s.outline)) ?? 'ground');
  }
  return [...found];
};

/** One artboard as the audit reads it: the direction, what lies past its figure, and its shapes, by id too. */
export interface Audit {
  readonly d: Direction;
  readonly ground: string;
  readonly shapes: ReadonlyArray<Drawn>;
  readonly byId: ReadonlyMap<string, Drawn>;
}

/** A fault when `laid` is not `want`, both shown with their chroma. */
export const differs = (what: string, laid: string | undefined, want: string) =>
  laid === want ? [] : [`${what}: ${shown(laid)}, derives ${shown(want)}`];

/** The shade a cast on `surface` must be: its paper's. */
export const shadeOn = (surface: Drawn | undefined) => {
  const paper = surface === undefined ? undefined : paperOf(surface.e);
  return paper === undefined ? 'a surface’s shade' : derived(paper).shade;
};

/** A paper: a declared base, and past its crease (if it has one) that base's shade. */
export const paperFaults = (at: string, cs: ReadonlyArray<string>) => {
  const base = cs[0] ?? '';
  if (!BASES.has(base)) return [`${at}: ${shown(base)} is no base the palette declares`];
  if (cs.length === 1) return [];
  if (cs.length !== 4) return [`${at}: ${cs.length} stops`];
  return [
    ...differs(`${at} light side`, cs[1], base),
    ...differs(`${at} crease`, cs[2], derived(base).shade),
    ...differs(`${at} crease`, cs[3], derived(base).shade),
  ];
};

/** A cast clipped to `name`: clipped to it, drawn just over it, in its shade. Its clip holds it there in every pose. */
export const clippedFaults = (
  a: Audit,
  s: Drawn,
  at: string,
  laid: string | undefined,
  name: string,
) => {
  const clip = attr(
    s.e.children.find((c) => c.name === 'ClippingShape'),
    'sourceId',
  );
  const surface = a.byId.get(String(clip));
  const target = walk([s.e]).find((e) => e.name === 'DrawTarget');
  const drawnOver =
    attr(target, 'drawableId') === attr(surface?.e, 'id') &&
    attr(target, 'placementValue') === 'before';
  return [
    ...(surface?.name === name ? [] : [`${at}: clipped to ${surface?.name ?? 'nothing'}`]),
    ...(drawnOver ? [] : [`${at}: not drawn just over ${name}`]),
    ...differs(at, laid, shadeOn(surface)),
  ];
};

/** A piece's own shadow: the shade of the one thing it falls on, which moves with it, so its rest is every pose. */
export const ownShadowFaults = (
  a: Audit,
  s: Drawn,
  shadow: Element,
  at: string,
  laid: string | undefined,
) => {
  if (a.ground === 'host')
    return [`${at}: ${shown(laid)} on the host’s scenery, which the host lays`];
  const receivers = receiversOf(a.shapes, s, shadow);
  const receiver = receivers[0];
  if (receivers.length > 1)
    return [
      `${at}: falls on ${receivers.map((r) => (r === 'ground' ? 'the ground' : r.name)).join(' and ')}: one cast per surface`,
    ];
  if (receiver === undefined || receiver === 'ground') {
    const apart = a.shapes.filter((t) => t.order > s.order && isPaper(t) && !moveTogether(s, t));
    return [
      ...(apart.length > 0
        ? [`${at}: ${apart.map((t) => t.name).join(', ')} can move under it`]
        : []),
      ...differs(at, laid, derived(a.ground).shade),
    ];
  }
  return [
    ...(moveTogether(s, receiver) ? [] : [`${at}: lies on ${receiver.name} at rest only`]),
    ...differs(at, laid, shadeOn(receiver)),
  ];
};

/** A shadow: clipped to a surface of its figure, its ground cast, or the piece's own. */
export const shadowFaults = (
  a: Audit,
  s: Drawn,
  shadow: Element,
  at: string,
  laid: string | undefined,
) => {
  const on = /^(.+)CastOn(.+)$/.exec(s.name);
  if (on !== null) return clippedFaults(a, s, at, laid, on[2] ?? '');
  if (a.shapes.some((p) => `${p.name}Cast` === s.name))
    return a.ground === 'host'
      ? [`${at}: a cast on the host’s scenery, which the host lays`]
      : differs(at, laid, derived(a.ground).shade);
  return ownShadowFaults(a, s, shadow, at, laid);
};

/** One paint of `s`, by its role. */
export const paintFaults = (a: Audit, s: Drawn, paint: Element): string[] => {
  const role = String(attr(paint, 'name'));
  const cs = coloursOf(paint);
  const at = `${s.name} ${role}`;
  switch (role) {
    case 'Ink':
      return cs.flatMap((c) => differs(at, c, inkOf(a.d).toLowerCase()));
    case 'Paper':
      return paperFaults(at, cs);
    case 'Core':
      return cs.length === 0
        ? [`${at}: no colour`]
        : cs.flatMap((c) => differs(at, c, derived(paperOf(s.e) ?? 'no paper').light));
    case 'Shadow':
      return cs.length === 0
        ? [`${at}: no colour`]
        : [...new Set(cs.flatMap((c) => shadowFaults(a, s, paint, at, c)))];
    default:
      return [`${at}: a paint the look does not name`];
  }
};

/**
 * Why the colours `board` paints under `d` are not the one colour model's:
 * every paint read by its role. Paper is a declared base, its crease's far
 * side that base's shade; a core is its paper's light; ink is the
 * direction's; a clipped cast is its clip surface's shade, drawn just over
 * it; a ground cast is the ground's shade; a piece's own shadow is the shade
 * of the one thing it falls on, which must move with it. Anything else is
 * a fault.
 */
export const auditOf = (board: Element, d: Direction): string[] => {
  const name = String(attr(board, 'name'));
  const shapes = drawnOf(board);
  const a: Audit = {
    d,
    ground: GROUND.get(name) ?? 'no declared ground',
    shapes,
    byId: new Map(shapes.map((s) => [String(attr(s.e, 'id')), s])),
  };
  const faults = shapes.flatMap((s) =>
    s.e.children
      .filter((c) => c.name === 'Fill' || c.name === 'Stroke')
      .flatMap((paint) => paintFaults(a, s, paint)),
  );
  return [...new Set(faults.map((f) => `${name}.${f}`))];
};
