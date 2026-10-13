// The axis property: every option of every art-direction axis
// (`direction.ts`), one axis at a time with the others at K1, builds a valid
// rig, passes the figure-parts tests, keeps both heads inside their
// artboards (what `paintGl` copies), declares a face probe as tall as the
// head it draws, and reaches every part its axis names. Every hand is one
// closed circle, and every line the outline axis names is laid on every
// piece and on the gavel as drawn.
//
// The colours, under K1 and every option: one colour model owns the look
// (`ramp`, CRAFT 12, its law checked in the film's `colour.test.ts`). Every
// colour a rig paints is read from the built rig by its role and must be a
// base the palette declares or what `ramp` derives from one under the court's
// key light: a crease's far side and a cut edge's light core from their
// paper, every cast from the paper it falls on, the ink from the direction.
// A clipped cast's surface is read from its clip, which holds in every pose; a
// piece's own shadow must move with what it falls on, so its rest is every
// pose; no timeline animates a colour. A cast is laid only where it can show
// past its piece's ink. The judge's hand, a rig over the host's scenery, lays
// no cast of its own: the host lays it, read from the drawing in every pose
// and checked against the court's own geometry (`underHand`, the one
// inventory). Every colour the host lays round the figures, read whole from
// the drawing (fills, rectangles, strokes, the shadows they cast, a
// gradient's every stop), is a base, a derived shade, an ink or the kit's
// named shading (`KIT_SHADING`). The knobs themselves are held to CRAFT 12's
// floors by the model (`ramp` refuses knobs under them).

import { type Hex, ramp } from '@bible/film/canvas';
import { type Style, isPattern, recorder, withDom } from '@bible/film/stand-in';
import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, test } from 'bun:test';
import { Console, Effect, FileSystem, Predicate, Result } from 'effect';
import { GAVEL_REST } from '../../../righteousness-by-faith/court.ts';
import { C } from '../../../righteousness-by-faith/kit.ts';
import { type Ramp, hues, keyLight, ramps, robes, shading } from '../../palette.ts';
import type { CourtFrame } from '../../scenes/court.ts';
import { type Props, paperProps } from '../cutpaper/court.ts';
import { HAND as ACCUSED_HAND, accusedFace, accusedHead } from './accused-rig.ts';
import { riveAccused } from './accused.ts';
import { compile, rive } from './build.ts';
import { DIRECTION, type Direction, K1, OPTIONS, inkOf, propsOf } from './direction.ts';
import { figureRigs, figuresRml } from './figures.ts';
import { HAND_ART, JUDGE_FACE, judgeFace } from './judge-rig.ts';
import { handAt, judgeOf, riveJudge, underHand } from './judge.ts';
import { HAND_LIFT, INK, LIFT, type Mat, type Pt, boxOf } from './parts.ts';
import { type Element, argb, el } from './rml.ts';

/** Every option, by the study's name, as a direction: K1 with that one axis changed. */
const CASES = Object.entries(OPTIONS).map(
  ([name, set]) => [name, { ...K1, ...set } satisfies Direction] as const,
);

/** The options, and K1 itself: every direction the colours must hold under. */
const SHADED = [['K1', K1] as const, ...CASES];

/** The centred line (A0): its thin ink leaves the casts showing, so the host lays the hand's and the rigs lay theirs. */
const A0 = SHADED.find(([name]) => name === 'A0')?.[1] ?? K1;

// ─── reading the generated rigs ──────────────────────────────────────────────

const attr = (e: Element | undefined, key: string) => e?.attrs.find(([k]) => k === key)?.[1];
const num = (e: Element | undefined, key: string, otherwise: number) =>
  Number(attr(e, key) ?? otherwise);

/** Every element under `roots`, depth first. */
const walk = (roots: ReadonlyArray<Element>): Element[] =>
  roots.flatMap((e) => [e, ...walk(e.children)]);

const named = (roots: ReadonlyArray<Element>, name: string) =>
  walk(roots).filter((e) => attr(e, 'name') === name);

const mul = (m: Mat, n: Mat): Mat => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
const placed = (x: number, y: number, r: number, sx = 1, sy = 1): Mat => [
  Math.cos(r) * sx,
  Math.sin(r) * sx,
  -Math.sin(r) * sy,
  Math.cos(r) * sy,
  x,
  y,
];
const apply = (m: Mat, [x, y]: Pt): Pt => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

/**
 * Each element under `roots` with the frame its own coordinates are in, at
 * rest, and its ancestors (nearest last): a node or a shape places, turns and
 * scales its children; a root bone stands where it is put; a bone stands at
 * its parent bone's tip.
 */
const framed = (
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
const pointsOf = (board: Element, shape: string): Pt[] => {
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
const reachOf = (board: Element, shape: string) => {
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
const MOVES = 0.9 + 8;

/** A colour value as RML writes it, back to `#rrggbb`. */
const hexOf = (argbValue: string) => `#${argbValue.slice(2).toLowerCase()}`;

/** A paint of `shape` by its name. */
const paintNamed = (shape: Element, name: string) =>
  shape.children.find((c) => attr(c, 'name') === name);

/** A paint's colours, as `#rrggbb`: its solid's, or its gradient's stops in order. */
const coloursOf = (paint: Element) =>
  walk([paint])
    .filter((e) => e.name === 'SolidColor' || e.name === 'GradientStop')
    .map((e) => hexOf(String(attr(e, 'colorValue'))));

/** The paper a shape is cut from: its `Paper` fill's base (its first stop). */
const paperOf = (shape: Element) => {
  const paint = paintNamed(shape, 'Paper');
  return paint === undefined ? undefined : coloursOf(paint)[0];
};

/** A shape of an artboard as drawn: its element, its place in the draw (0 on top), its outline at rest on the artboard, and its ancestors. */
interface Drawn {
  readonly e: Element;
  readonly name: string;
  readonly order: number;
  readonly outline: ReadonlyArray<Pt>;
  readonly up: ReadonlyArray<Element>;
}

/** Every shape of `board`, top first (Rive draws a node's first child over the ones after it). */
const drawnOf = (board: Element): ReadonlyArray<Drawn> =>
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
const inside = ([x, y]: Pt, poly: ReadonlyArray<Pt>) => {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i] ?? [0, 0];
    const [xj, yj] = poly[j] ?? [0, 0];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
};

/** How far `p` lies from the nearest edge of the closed polygon `poly`. */
const edgeDistance = ([x, y]: Pt, poly: ReadonlyArray<Pt>) => {
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
const isPaper = (s: Drawn) => paintNamed(s.e, 'Paper') !== undefined;

/**
 * What moves `s`: the ancestors that place it or that a timeline or a
 * constraint can reach (an id), and the bones its skin bends with. Two
 * shapes moved by the same lie together in every pose as they do at rest.
 */
const moversOf = (s: Drawn) => ({
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
const moveTogether = (a: Drawn, b: Drawn) => {
  const [p, q] = [moversOf(a), moversOf(b)];
  return (
    p.frames.length === q.frames.length &&
    p.frames.every((f, i) => f === q.frames[i]) &&
    p.bones.join() === q.bones.join()
  );
};

// ─── the one colour model (CRAFT 12) ─────────────────────────────────────────

/** Whether `c` is a hex colour the colour model takes. */
const isHex = (c: string): c is Hex => /^#[0-9a-f]{6}$/i.test(c);

/**
 * The ramp CRAFT 12 derives from `base` under the court's key light
 * (`ramp`): every shade, light and cast of that paper is one of it. A base
 * that is no hex colour derives nothing a rig could paint.
 */
const derived = (base: string): { readonly shade: string; readonly light: string } =>
  isHex(base)
    ? ramp(base, keyLight, shading)
    : { shade: `no shade of ${base}`, light: `no light of ${base}` };

/** A colour and its LCh chroma, so a near-grey reads as one in a failure. */
const shown = (hex: string | undefined) => {
  if (hex === undefined || !/^#[0-9a-f]{6}$/i.test(hex)) return String(hex);
  const lin = (i: number) => {
    const s = Number.parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [lin(0), lin(1), lin(2)];
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return `${hex} (C ${Math.hypot(500 * (x - y), 200 * (y - z)).toFixed(1)})`;
};

/** Every base the palette declares: the papers the look may cut from. */
const BASES: ReadonlySet<string> = new Set(
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
const GROUND = new Map<string, string>([
  ['Accused', ramps.paper.base],
  ['Judge', ramps.paper.base],
  ['Hand', 'host'],
]);

/** How far the renderer paints a feather past its shape, per unit of strength (Rive's `paint_outset`), and a pixel of antialiasing, units. */
const FEATHER_EXTENT = 1.5;
const AA = 1;

/** How far a piece's ink and light core reach outside its cut: half its widest stroke. */
const coverOf = (shape: Element) =>
  Math.max(
    0,
    ...shape.children.filter((c) => c.name === 'Stroke').map((s) => num(s, 'thickness', 0) / 2),
  );

/** A shadow's offset, and how far past its shape it paints anything. */
const shadowOf = (shadow: Element) => {
  const f = walk([shadow]).find((e) => e.name === 'Feather');
  const offset: Pt = [num(f, 'offsetX', 0), num(f, 'offsetY', 0)];
  return {
    offset,
    reach: Math.hypot(offset[0], offset[1]) + FEATHER_EXTENT * num(f, 'strength', 0) + AA,
  };
};

/** The casts of the piece `name`: its clipped casts on its figure's surfaces and its ground cast. */
const castsOf = (shapes: ReadonlyArray<Drawn>, name: string) =>
  shapes.filter((s) => s.name === `${name}Cast` || s.name.startsWith(`${name}CastOn`));

/**
 * What a piece's own shadow falls on at rest: points just past its ink on
 * the side away from the light, each on the topmost paper drawn under the
 * piece there, else the artboard's ground.
 */
const receiversOf = (shapes: ReadonlyArray<Drawn>, caster: Drawn, shadow: Element) => {
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
interface Audit {
  readonly d: Direction;
  readonly ground: string;
  readonly shapes: ReadonlyArray<Drawn>;
  readonly byId: ReadonlyMap<string, Drawn>;
}

/** A fault when `laid` is not `want`, both shown with their chroma. */
const differs = (what: string, laid: string | undefined, want: string) =>
  laid === want ? [] : [`${what}: ${shown(laid)}, derives ${shown(want)}`];

/** The shade a cast on `surface` must be: its paper's. */
const shadeOn = (surface: Drawn | undefined) => {
  const paper = surface === undefined ? undefined : paperOf(surface.e);
  return paper === undefined ? 'a surface’s shade' : derived(paper).shade;
};

/** A paper: a declared base, and past its crease (if it has one) that base's shade. */
const paperFaults = (at: string, cs: ReadonlyArray<string>) => {
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
const clippedFaults = (a: Audit, s: Drawn, at: string, laid: string | undefined, name: string) => {
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
const ownShadowFaults = (
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
const shadowFaults = (
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
const paintFaults = (a: Audit, s: Drawn, paint: Element): string[] => {
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
const auditOf = (board: Element, d: Direction): string[] => {
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

// ─── building with the Rive CLI ──────────────────────────────────────────────

/** `d`'s project built as `build.ts` builds it, in a directory of its own: its warnings and problems. */
const builtIn = (d: Direction) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const built = yield* compile(yield* fs.makeTempDirectoryScoped(), figuresRml(d));
    return { warnings: built.warnings, problems: built.problems };
  }).pipe(Effect.scoped, Effect.provide(BunServices.layer));

// Top-level await, deliberately: `test.skipIf` needs the boolean at module
// evaluation. CI has no Rive CLI; there the builds skip and say so.
// oxlint-disable-next-line effect/noAsyncFunction -- test.skipIf needs this at module-evaluation time
const cli = await Effect.runPromise(
  Effect.result(rive('rive --version', ['--version'])).pipe(Effect.provide(BunServices.layer)),
);
const noCli = Result.isFailure(cli);

test('reports whether the Rive CLI is here, so a skipped build is never silent', () =>
  Effect.runPromise(
    Effect.gen(function* () {
      if (noCli)
        yield* Console.warn('[papercut] no Rive CLI (`rive`, or `RIVE`): option builds SKIPPED');
      expect(Result.isSuccess(cli) || Result.isFailure(cli)).toBe(true);
    }),
  ));

/** How to rebuild `figures.riv` when it is stale, and the CLI that built this one. */
const REBUILD = {
  run: 'cd apps/animations/src/films/cold-studies && bun looks/rive/build.ts',
  cli: Result.isSuccess(cli) ? cli.success.trim() : 'none',
};

// The film reads `DIRECTION` (props, probes, gaze) beside the committed riv:
// the two must be one build, or a pick without a rebuild pairs new props with
// old figures. The compile is deterministic, so the bytes are the check.
test.skipIf(noCli)(
  'the committed figures.riv is the build of DIRECTION',
  () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const built = yield* compile(yield* fs.makeTempDirectoryScoped(), figuresRml(DIRECTION));
        const fresh = yield* fs.readFile(built.riv);
        const committed = yield* fs.readFile(`${import.meta.dir}/figures.riv`);
        expect({ fresh: Buffer.from(committed).equals(Buffer.from(fresh)), ...REBUILD }).toEqual({
          fresh: true,
          ...REBUILD,
        });
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
    ),
  30_000,
);

// ─── the property ────────────────────────────────────────────────────────────

describe.each(CASES)('option %s', (_, d) => {
  const rigs = figureRigs(d);
  const board = (rig: ReadonlyArray<Element>) => rig[0] as Element;
  const accused = board(rigs.accused);
  const judge = board(rigs.judge);
  const hand = board(rigs.hand);

  test.skipIf(noCli)(
    'builds with the Rive CLI with no warnings and no problems',
    () =>
      Effect.runPromise(
        Effect.gen(function* () {
          expect(yield* builtIn(d)).toEqual({ warnings: [], problems: [] });
        }),
      ),
    30_000,
  );

  test('the project file has no thumbs and no mittens', () => {
    expect(figuresRml(d)).not.toMatch(/thumb|mitten/i);
  });

  test('the project file is the same text every time, and every id in it is its own', () => {
    const rml = figuresRml(d);
    expect(figuresRml(d)).toBe(rml);
    const defined = [...rml.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(defined).size).toBe(defined.length);
  });

  test('every hand is the same part: one circle of twelve points, creased and outlined alike', () => {
    const palms = [
      ...named([accused], 'nearPalm'),
      ...named([accused], 'farPalm'),
      ...named([hand], 'palm'),
    ];
    expect(palms).toHaveLength(3);
    const shapeOf = (palm: Element) => ({
      paths: palm.children.filter((e) => e.name === 'PointsPath').length,
      points: walk([palm]).filter((e) => e.name === 'CubicMirroredVertex').length,
      // A shadow is laid where it shows and on what it falls on (`casts` in `parts.ts`), so it
      // differs by hand: the paper and its edge are the part.
      paints: palm.children
        .filter((e) => e.name !== 'PointsPath' && attr(e, 'name') !== 'Shadow')
        .map((e) => attr(e, 'name')),
    });
    const shapes = palms.map(shapeOf);
    expect(shapes[0]?.points).toBe(12);
    expect(shapes[0]?.paints).toContain('Paper');
    for (const shape of shapes)
      expect(shape).toEqual({ paths: 1, points: 12, paints: shapes[0]?.paints ?? [] });
    // Nothing but the one path and paints: no part hangs off a hand.
    for (const palm of palms)
      for (const child of palm.children)
        expect([child.name, ['PointsPath', 'Fill', 'Stroke'].includes(child.name)]).toEqual([
          child.name,
          true,
        ]);
  });

  test('the accused and the judge wear the same face kit, the judge at his own scale', () => {
    const parts = ['face', 'features', 'brows', 'eyeL', 'eyeR', 'mouthLine', 'mouthOh', 'faceRest'];
    for (const part of parts)
      expect([part, named([accused], part).length, named([judge], part).length]).toEqual([
        part,
        1,
        1,
      ]);
    // The kit scales with the head the axis draws: the accused's by the head's scale, the judge's by his own times it.
    const hs = accusedHead(d).scale;
    expect(num(named([accused], 'face')[0], 'scaleX', 1)).toBeCloseTo(hs, 6);
    expect(num(named([judge], 'face')[0], 'scaleX', 1)).toBeCloseTo(JUDGE_FACE * hs, 6);
    expect(JUDGE_FACE).toBeGreaterThan(1);
  });

  test('both heads, their ink, shadow and moves, sit inside their artboards (what paintGl copies)', () => {
    for (const b of [accused, judge]) {
      const box = boxOf(pointsOf(b, 'head'));
      const pad = reachOf(b, 'head') + MOVES;
      const width = num(b, 'width', 0);
      const height = num(b, 'height', 0);
      expect({
        artboard: attr(b, 'name'),
        top: box.y0 - pad >= 0,
        bottom: box.y1 + pad <= height,
      }).toEqual({
        artboard: attr(b, 'name'),
        top: true,
        bottom: true,
      });
      expect([box.x0 - pad >= 0, box.x1 + pad <= width]).toEqual([true, true]);
    }
  });

  test('each face probe is as tall as the head it is declared on', () => {
    for (const [b, face] of [
      [accused, accusedFace(d)],
      [judge, judgeFace(d)],
    ] as const) {
      const box = boxOf(pointsOf(b, 'head'));
      // The outline's points fall a little inside the curve through them.
      expect(Math.abs(face.height / (box.y1 - box.y0) - 1)).toBeLessThan(0.03);
      expect(named([b], face.node)).toHaveLength(1);
    }
    expect(accusedHead(d).scale).toBeGreaterThan(0);
  });

  test('the ink reaches every line it names: the figures, the sheets, the block and the gavel', () => {
    const inks = [accused, judge, hand].flatMap((b) =>
      named([b], 'Ink').flatMap((paint) =>
        paint.children.filter((c) => c.name === 'SolidColor').map((c) => attr(c, 'colorValue')),
      ),
    );
    expect(inks.length).toBeGreaterThan(0);
    expect(new Set(inks)).toEqual(new Set([argb(inkOf(d))]));
    const props = propsOf(d);
    if (d.colour === 'grey' && d.ink === 'warm') expect(props).toEqual(paperProps);
    else
      expect([props.sheetInk, props.blockInk, props.gavelInk]).toEqual([
        inkOf(d),
        inkOf(d),
        inkOf(d),
      ]);
  });

  test("every head and hand is the people's one figure paper", () => {
    for (const [b, shape] of [
      [accused, 'head'],
      [accused, 'nearPalm'],
      [accused, 'farPalm'],
      [judge, 'head'],
      [hand, 'palm'],
    ] as const) {
      const paper = named([b], shape)
        .find((e) => e.name === 'Shape')
        ?.children.find((c) => attr(c, 'name') === 'Paper');
      const stops = walk(paper ? [paper] : [])
        .filter((e) => e.name === 'GradientStop')
        .map((e) => attr(e, 'colorValue'));
      expect([shape, stops]).toEqual([
        shape,
        [ramps.figure.base, ramps.figure.base, ramps.figure.shade, ramps.figure.shade].map((c) =>
          argb(c),
        ),
      ]);
    }
  });
});

// ─── the colours, for every direction (CRAFT 12) ─────────────────────────────

/** The HSV saturation of hex colour `hex`, to the hundredth a hex can hold it to. */
const saturation = (hex: string) => {
  const [r, g, b] = [0, 1, 2].map((i) => Number.parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16));
  const most = Math.max(r ?? 0, g ?? 0, b ?? 0);
  return most === 0
    ? 0
    : Math.round((100 * (most - Math.min(r ?? 0, g ?? 0, b ?? 0))) / most) / 100;
};

test('every garment, robe and prop base sits in the film’s saturation band (CRAFT 12; shades may leave it)', () => {
  const bases = [
    ...Object.entries(hues).flatMap(([name, v]: [string, Hex | Ramp | ReadonlyArray<Hex>]) =>
      Predicate.isString(v)
        ? [[name, v] as const]
        : Array.isArray(v)
          ? v.map((h, i) => [`${name}[${i}]`, h] as const)
          : [[name, (v as Ramp).base] as const],
    ),
    ...Object.entries(robes).map(([name, r]) => [`robes.${name}`, r.base] as const),
  ];
  const out = bases
    .filter(([, hex]) => saturation(hex) < 0.2 || saturation(hex) > 0.35)
    .map(([name, hex]) => `${name}: ${hex} at ${saturation(hex)}`);
  expect(out).toEqual([]);
});

/** `board` with a second colour, black, in the first paint named `role`: a light or a shadow shaded with black part way across. */
const blackenedSecond = (board: Element, role: string): Element => {
  let done = false;
  const visit = (e: Element): Element => {
    if (!done && attr(e, 'name') === role && (e.name === 'Fill' || e.name === 'Stroke')) {
      done = true;
      return { ...e, children: [...e.children, el('SolidColor', { colorValue: argb('#000000') })] };
    }
    return { ...e, children: e.children.map(visit) };
  };
  return visit(board);
};

test.each(['Core', 'Shadow'])(
  'a %s with a black second colour fails: every colour of a paint is read',
  (role) => {
    const board = figureRigs(K1).accused[0] as Element;
    expect(auditOf(board, K1)).toEqual([]);
    expect(auditOf(blackenedSecond(board, role), K1).join('; ')).toContain('#000000');
  },
);

describe.each(SHADED)('the colours under %s', (_, d) => {
  const rigs = figureRigs(d);
  const boards = [rigs.accused, rigs.judge, rigs.hand].map((rig) => rig[0] as Element);

  test('every colour a rig paints is a declared base or what ramp derives from one (CRAFT 12)', () => {
    expect(boards.flatMap((b) => auditOf(b, d))).toEqual([]);
  });

  test('no timeline animates a colour, so what holds at rest holds in every pose', () => {
    const keyed = [rigs.accused, rigs.judge, rigs.hand]
      .flatMap((rig) => walk(rig))
      .filter((e) => e.name === 'KeyFrameColor');
    expect(keyed).toHaveLength(0);
  });

  test('a cast is laid only where it can show past its piece’s ink', () => {
    const edge = figureRigs({ ...d, outline: 'edge' });
    const edgeBoards = [edge.accused, edge.judge, edge.hand].map((rig) => rig[0] as Element);
    const wrong: string[] = [];
    const reaches = (all: ReadonlyArray<Drawn>, p: Drawn) =>
      [p, ...castsOf(all, p.name)].flatMap((s) => {
        const shadow = paintNamed(s.e, 'Shadow');
        return shadow === undefined ? [] : [[s.name, shadowOf(shadow).reach] as const];
      });
    boards.forEach((b, i) => {
      const shapes = drawnOf(b);
      const twins = drawnOf(edgeBoards[i] as Element);
      for (const p of shapes.filter(isPaper)) {
        const cover = coverOf(p.e);
        const laid = reaches(shapes, p);
        for (const [name, reach] of laid)
          if (reach <= cover)
            wrong.push(
              `${attr(b, 'name')}.${name}: reaches ${reach.toFixed(2)}, under an ink of ${cover.toFixed(2)}`,
            );
        // Laid nowhere: under no ink (`edge`) the same piece shows how far its cast reaches.
        const twin = twins.find((t) => t.name === p.name);
        const could = twin === undefined ? [] : reaches(twins, twin);
        const reach = Math.max(0, ...could.map(([, r]) => r));
        if (laid.length === 0 && reach > cover)
          wrong.push(
            `${attr(b, 'name')}.${p.name}: no cast, though it reaches ${reach.toFixed(2)} past an ink of ${cover.toFixed(2)}`,
          );
      }
    });
    expect(wrong).toEqual([]);
  });
});

// ─── what the host draws ─────────────────────────────────────────────────────

type Rule = 'nonzero' | 'evenodd';

/** A region a canvas fills or clips to: its subpaths in device units, and its fill rule. */
interface Region {
  readonly paths: ReadonlyArray<ReadonlyArray<Pt>>;
  readonly rule: Rule;
}

/**
 * One paint: a fill (`fill`, `fillRect`), a stroke, or the shadow a fill or
 * stroke casts (`shadowColor`); its region, the clips in force, its colours
 * (a gradient's every stop; a pre-blended face's tile colour), whether it is
 * one opaque flat colour (`flat`: how an ink line is laid, `ink.ts` filling
 * a line's outline so) and whether it paints over (`source-over`).
 */
interface Laid extends Region {
  readonly kind: 'fill' | 'stroke' | 'shadow';
  readonly clips: ReadonlyArray<Region>;
  readonly colours: ReadonlyArray<string>;
  readonly flat: boolean;
  readonly over: boolean;
}

/** Whether `region` covers `p`, by its rule. */
const covers = (region: Region, [x, y]: Pt) => {
  let winding = 0;
  let crossings = 0;
  for (const poly of region.paths)
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i] ?? [0, 0];
      const [xj, yj] = poly[j] ?? [0, 0];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
        crossings += 1;
        winding += yi > yj ? 1 : -1;
      }
    }
  return region.rule === 'evenodd' ? crossings % 2 === 1 : winding !== 0;
};

/** A colour as a canvas takes it, as `#rrggbb` (its alpha dropped). */
const hexOfCss = (colour: string) => {
  const s = colour.trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(s)) return `#${[...s.slice(1)].map((c) => `${c}${c}`).join('')}`;
  if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/.test(s)) return s.slice(0, 7);
  const rgb = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(s);
  if (rgb === null) return s;
  return `#${[rgb[1], rgb[2], rgb[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('')}`;
};

/** A colour's own alpha, 0..1: `rgba(…, a)`, `#rrggbbaa`, `transparent`; 1 for any other. */
const alphaOfCss = (colour: string) => {
  const s = colour.replace(/\s/g, '').toLowerCase();
  if (s === 'transparent') return 0;
  const hex = /^#[0-9a-f]{6}([0-9a-f]{2})$/.exec(s)?.[1];
  if (hex !== undefined) return Number.parseInt(hex, 16) / 255;
  const a = /^rgba\([^,]+,[^,]+,[^,]+,([\d.]+)\)$/.exec(s)?.[1];
  return a === undefined ? 1 : Number(a);
};

/**
 * A paint style's colours as `#rrggbb`: a colour's own, a gradient's every
 * stop's, a pattern's the colours its tile was filled with (a pre-blended
 * face's tile holds one fill, the face's colour, under its grain: `faceOf`).
 */
const coloursOfStyle = (style: string | CanvasGradient | CanvasPattern): ReadonlyArray<string> => {
  if (Predicate.isString(style)) return [hexOfCss(style)];
  const as = style as unknown as Style;
  if (isPattern(as))
    return as.tile.drawn.fills.flatMap((f) =>
      Predicate.isString(f.style) ? [hexOfCss(f.style)] : [],
    );
  // The stand-in's gradients keep their stops, as added (`StandInGradient`).
  const stops = Predicate.hasProperty(style, 'stops') ? style.stops : undefined;
  return Array.isArray(stops)
    ? stops.flatMap((stop) =>
        Array.isArray(stop) && Predicate.isString(stop[1]) ? [hexOfCss(stop[1])] : [],
      )
    : [];
};

/** Whether a canvas lays a shadow under what it paints now: a colour not fully clear, blurred or moved. */
const castsShadow = (ctx: CanvasRenderingContext2D) => {
  const c = ctx.shadowColor.replace(/\s/g, '').toLowerCase();
  const clear =
    c === 'transparent' || /^rgba\(\d+,\d+,\d+,0(\.0*)?\)$/.test(c) || /^#[0-9a-f]{6}00$/.test(c);
  return !clear && (ctx.shadowBlur > 0 || ctx.shadowOffsetX !== 0 || ctx.shadowOffsetY !== 0);
};

/**
 * What `draw` paints, in order, drawn into a recording context: each fill
 * (`fill`, `fillRect`) and stroke, and the shadow each casts, with its region
 * and clips in device units (the recorder's transform at each path call) and
 * its every colour. A rig it draws (`f.rive`) is not drawn here.
 */
const drawing = (draw: (f: CourtFrame) => void): ReadonlyArray<Laid> =>
  withDom(() => {
    const rec = recorder();
    const laid: Laid[] = [];
    let path: Pt[][] = [];
    let clips: ReadonlyArray<Region> = [];
    const saved: Array<ReadonlyArray<Region>> = [];
    const to = (x: number, y: number): Pt => {
      const [a, b, c, d, e, f] = rec.now();
      return [a * x + c * y + e, b * x + d * y + f];
    };
    const add = (p: Pt) => {
      const sub = path.at(-1);
      if (sub === undefined) path.push([p]);
      else sub.push(p);
    };
    const bezier = (ps: ReadonlyArray<Pt>, t: number): Pt =>
      ps.length <= 1
        ? (ps[0] ?? [0, 0])
        : bezier(
            ps.slice(1).map((q, i): Pt => {
              const p = ps[i] ?? q;
              return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
            }),
            t,
          );
    const curve = (ps: ReadonlyArray<Pt>) => {
      const from = path.at(-1)?.at(-1) ?? ps[0] ?? [0, 0];
      for (let k = 1; k <= 12; k++) add(bezier([from, ...ps], k / 12));
    };
    const arc = (
      [x, y, rx, ry, rot, a0, a1]: readonly [
        number,
        number,
        number,
        number,
        number,
        number,
        number,
      ],
      ccw: boolean,
    ) => {
      const turn = 2 * Math.PI;
      const sweep = ccw
        ? a0 - a1 >= turn
          ? -turn
          : -((((a0 - a1) % turn) + turn) % turn)
        : a1 - a0 >= turn
          ? turn
          : (((a1 - a0) % turn) + turn) % turn;
      for (let k = 0; k <= 32; k++) {
        const a = a0 + (sweep * k) / 32;
        const [ex, ey] = [rx * Math.cos(a), ry * Math.sin(a)];
        add(
          to(
            x + ex * Math.cos(rot) - ey * Math.sin(rot),
            y + ex * Math.sin(rot) + ey * Math.cos(rot),
          ),
        );
      }
    };
    type Op = (n: ReadonlyArray<number>, raw: ReadonlyArray<unknown>) => void;
    const ops = new Map<PropertyKey, Op>([
      [
        'beginPath',
        () => {
          path = [];
        },
      ],
      ['moveTo', ([x = 0, y = 0]) => path.push([to(x, y)])],
      ['lineTo', ([x = 0, y = 0]) => add(to(x, y))],
      [
        'closePath',
        () => {
          const first = path.at(-1)?.[0];
          if (first !== undefined) path.push([first]);
        },
      ],
      [
        'bezierCurveTo',
        ([a = 0, b = 0, c = 0, d = 0, e = 0, f = 0]) => curve([to(a, b), to(c, d), to(e, f)]),
      ],
      ['quadraticCurveTo', ([a = 0, b = 0, c = 0, d = 0]) => curve([to(a, b), to(c, d)])],
      [
        'arc',
        ([x = 0, y = 0, r = 0, a0 = 0, a1 = 0], raw) =>
          arc([x, y, r, r, 0, a0, a1], raw[5] === true),
      ],
      [
        'ellipse',
        ([x = 0, y = 0, rx = 0, ry = 0, rot = 0, a0 = 0, a1 = 0], raw) =>
          arc([x, y, rx, ry, rot, a0, a1], raw[7] === true),
      ],
      [
        'rect',
        ([x = 0, y = 0, w = 0, h = 0]) =>
          path.push([to(x, y), to(x + w, y), to(x + w, y + h), to(x, y + h)], [to(x, y)]),
      ],
      ['save', () => saved.push(clips)],
      [
        'restore',
        () => {
          clips = saved.pop() ?? clips;
        },
      ],
      [
        'clip',
        (_, raw) => {
          const region: Region = {
            paths: path.map((s) => [...s]),
            rule: raw[0] === 'evenodd' ? 'evenodd' : 'nonzero',
          };
          clips = [...clips, region];
        },
      ],
    ]);
    /** The region a paint call covers: the path for `fill` and `stroke`, its rectangle for `fillRect`. */
    const painted = (
      key: PropertyKey,
      [x = 0, y = 0, w = 0, h = 0]: ReadonlyArray<number>,
      raw: ReadonlyArray<unknown>,
    ): Region | undefined => {
      if (key === 'fill' || key === 'stroke')
        return {
          paths: path.map((s) => [...s]),
          rule: raw[0] === 'evenodd' ? 'evenodd' : 'nonzero',
        };
      if (key !== 'fillRect') return undefined;
      return { paths: [[to(x, y), to(x + w, y), to(x + w, y + h), to(x, y + h)]], rule: 'nonzero' };
    };
    /** One paint over `region`, and first the shadow it casts if the context lays one. */
    const lay = (target: CanvasRenderingContext2D, kind: 'fill' | 'stroke', region: Region) => {
      const over = target.globalCompositeOperation === 'source-over';
      if (castsShadow(target))
        laid.push({
          ...region,
          kind: 'shadow',
          clips,
          colours: [hexOfCss(target.shadowColor)],
          flat: false,
          over,
        });
      const style = kind === 'stroke' ? target.strokeStyle : target.fillStyle;
      laid.push({
        ...region,
        kind,
        clips,
        colours: coloursOfStyle(style),
        flat: Predicate.isString(style) && target.globalAlpha * alphaOfCss(style) >= 0.999,
        over,
      });
    };
    const ctx = new Proxy(rec.ctx, {
      get: (target, key) => {
        const value = Reflect.get(target, key);
        if (!Predicate.isFunction(value)) return value;
        return (...args: ReadonlyArray<unknown>) => {
          const n = args.map((a) => (Predicate.isNumber(a) ? a : 0));
          const region = painted(key, n, args);
          if (region === undefined) ops.get(key)?.(n, args);
          else lay(target, key === 'stroke' ? 'stroke' : 'fill', region);
          return Reflect.apply(value as (...a: ReadonlyArray<unknown>) => unknown, target, args);
        };
      },
      set: (target, key, value) => Reflect.set(target, key, value),
    });
    draw({
      ctx,
      boil: 0,
      hand: (key: string | number) => ({ boil: 0, seed: String(key).length }),
      rive: () => undefined,
      at: () => 0,
      t: 0,
      cue: () => ({ start: 0, dur: 1 }),
    } as unknown as CourtFrame);
    return laid;
  });

/** The colours of the topmost fill over `p`, inside every clip in force, or `none`. */
const laidAt = (laid: ReadonlyArray<Laid>, p: Pt): ReadonlyArray<string> =>
  laid.findLast(
    (l) =>
      l.kind === 'fill' &&
      l.over &&
      l.colours.length > 0 &&
      covers(l, p) &&
      l.clips.every((c) => covers(c, p)),
  )?.colours ?? ['none'];

/** The gavel's turns across its fall: raised, at rest, swinging down, down on the block. */
const SWINGS = [-0.3, GAVEL_REST, 0.9, 1.4, 1.62];
/** How far he leans in: upright, halfway, all the way. */
const LEANS = [0, 0.5, 1];

/** How near a surface's edge a sample is too near to say which surface it is on (the boil, the cut's rim, its ink), units. */
const EDGE = 3;

/**
 * Points round a hand at `c` where its cast shows: past its ink (`cover`)
 * and within the reach of its shadow, the hand's outline moved along the
 * light by its lift and feathered as the renderer feathers it.
 */
const castBand = (c: Pt, cover: number): Pt[] => {
  const offset: Pt = [LIFT.x * HAND_LIFT, LIFT.y * HAND_LIFT];
  const R = HAND_ART.r + FEATHER_EXTENT * LIFT.feather * HAND_LIFT;
  return Array.from({ length: 36 }, (_, k): Pt => [
    Math.cos((k * Math.PI) / 18),
    Math.sin((k * Math.PI) / 18),
  ]).flatMap((u) => {
    const along = u[0] * offset[0] + u[1] * offset[1];
    const disc = R * R - (offset[0] ** 2 + offset[1] ** 2) + along * along;
    const inner = HAND_ART.r + cover + 0.25;
    const outer = disc > 0 ? along + Math.sqrt(disc) : 0;
    const rho = (inner + outer) / 2;
    return outer - inner < 0.1 ? [] : [[c[0] + u[0] * rho, c[1] + u[1] * rho] as const];
  });
};

/**
 * Under `d`, leaning `lean` with the gavel turned `swing`: each place the
 * hand's cast shows, the surface the court's geometry puts there, and the
 * colour laid there: the rig's own shadow if it lays one, else the topmost
 * fill the host draws there.
 */
const handCasts = (d: Direction, lean: number, swing: number, as: Mutation = (f) => f) => {
  const palm = drawnOf(figureRigs(d).hand[0] as Element).find((s) => s.name === 'palm');
  const rigCast = palm === undefined ? undefined : paintNamed(palm.e, 'Shadow');
  const fills = drawing((f) => judgeOf(d).over(as(f), swing, lean, propsOf(d)));
  const surfaces = underHand(d, swing, lean, propsOf(d));
  const outlined = surfaces.flatMap((s) =>
    s.outline === undefined ? [] : [{ ...s, outline: s.outline }],
  );
  const wall = surfaces.find((s) => s.outline === undefined);
  return castBand(handAt(swing, lean), palm === undefined ? 0 : coverOf(palm.e))
    .filter((p) => outlined.every((s) => edgeDistance(p, s.outline) >= EDGE))
    .map((p) => {
      const under = outlined.find((s) => inside(p, s.outline)) ?? wall;
      return {
        on: under?.name ?? 'nothing',
        want: under === undefined ? 'no surface' : derived(under.paper).shade,
        laid: rigCast === undefined ? laidAt(fills, p) : coloursOf(rigCast),
      };
    });
};

/** A frame drawn some other way: a negative control's mutation of what the host draws. */
type Mutation = (f: CourtFrame) => CourtFrame;

/** `f` with every radial gradient's middle stop black, its alpha kept: a cast shaded with black part way across. */
const blackMiddleStop: Mutation = (f) => {
  const ctx = new Proxy(f.ctx, {
    get: (target, key) =>
      key === 'createRadialGradient'
        ? (...args: Parameters<CanvasRenderingContext2D['createRadialGradient']>) => {
            const g = target.createRadialGradient(...args);
            const add = g.addColorStop.bind(g);
            g.addColorStop = (t: number, c: string) =>
              add(t, t === 0.5 ? `#000000${c.length === 9 ? c.slice(7) : ''}` : c);
            return g;
          }
        : Reflect.get(target, key),
    set: (target, key, value) => Reflect.set(target, key, value),
  });
  return { ...f, ctx } as CourtFrame;
};

/** Whether a cast lies in its surface's shade: every colour laid there (each stop of its feather) is it. */
const castHolds = (c: ReturnType<typeof handCasts>[number]) =>
  c.laid.length > 0 && c.laid.every((l) => l === c.want);

/** The faults among a hand's casts: each place it lies in a colour not its surface's shade. */
const castFaults = (casts: ReturnType<typeof handCasts>) =>
  casts.filter((c) => !castHolds(c)).map((c) => `on the ${c.on}: ${c.laid.map(shown).join(', ')}`);

describe('the judge’s hand', () => {
  test('a cast shaded with black part way across fails: every stop of its feather is read', () => {
    expect(castFaults(handCasts(A0, 0, GAVEL_REST))).toEqual([]);
    expect(castFaults(handCasts(A0, 0, GAVEL_REST, blackMiddleStop)).length).toBeGreaterThan(0);
  });

  test('its cast is the shade of each surface it falls on, in every option and pose, past its ink', () => {
    const casts = SHADED.flatMap(([name, d]) =>
      LEANS.flatMap((lean) =>
        SWINGS.flatMap((swing) =>
          handCasts(d, lean, swing).map((c) => ({
            ...c,
            at: `${name} lean ${lean} swing ${swing}`,
          })),
        ),
      ),
    );
    expect(casts.length).toBeGreaterThan(0);
    const wrong = new Map(
      casts
        .filter((c) => !castHolds(c))
        .map((c) => [
          `${c.at} on the ${c.on}`,
          `${[...new Set(c.laid)].map(shown).join(', ')}, derives ${shown(c.want)}`,
        ]),
    );
    expect(Object.fromEntries(wrong)).toEqual({});
  });
});

// ─── the hand, and what the outline axis lays ─────────────────────────────────

/** A circle's handle length for `n` points round radius `r`: what makes each cubic arc a circle's. */
const circleHandle = (r: number, n: number) => (4 / 3) * Math.tan(Math.PI / (2 * n)) * r;

describe.each(CASES)('hands and lines under %s', (_, d) => {
  const rigs = figureRigs(d);
  const accused = rigs.accused[0] as Element;
  const judge = rigs.judge[0] as Element;
  const hand = rigs.hand[0] as Element;

  test('each hand node holds one shape, the palm: one closed path, a circle by its points and its handles', () => {
    for (const [node, r] of [
      [named([accused], 'nearHand')[0], ACCUSED_HAND.r],
      [named([accused], 'farHand')[0], ACCUSED_HAND.r],
      [named([hand], 'hand')[0], HAND_ART.r],
    ] as const) {
      const all = walk(node ? [node] : []).filter((e) => e.name === 'Shape');
      const shapes = all.filter((e) => !String(attr(e, 'name')).includes('Cast'));
      expect([attr(node, 'name'), shapes.length]).toEqual([attr(node, 'name'), 1]);
      // Anything else in the node is the palm's cast shadow: its outline again, with only a shadow.
      const palm = String(attr(shapes[0], 'name'));
      const outline = (s: Element | undefined) =>
        walk(s ? [s] : [])
          .filter((v) => v.name === 'CubicMirroredVertex')
          .map((v) => [
            num(v, 'x', 0),
            num(v, 'y', 0),
            num(v, 'rotation', 0),
            num(v, 'distance', 0),
          ]);
      for (const cast of all.filter((e) => String(attr(e, 'name')).includes('Cast'))) {
        const name = String(attr(cast, 'name'));
        expect([name, name.startsWith(`${palm}Cast`)]).toEqual([name, true]);
        expect([name, outline(cast)]).toEqual([name, outline(shapes[0])]);
        const paints = cast.children
          .filter((c) => c.name === 'Fill' || c.name === 'Stroke')
          .map((c) => attr(c, 'name'));
        expect([name, paints]).toEqual([name, ['Shadow']]);
      }
      const paths = (shapes[0]?.children ?? []).filter((c) => c.name === 'PointsPath');
      expect(paths).toHaveLength(1);
      expect(String(attr(paths[0], 'isClosed'))).toBe('true');
      const vertices = paths[0]?.children ?? [];
      expect(vertices.every((v) => v.name === 'CubicMirroredVertex')).toBe(true);
      const n = vertices.length;
      expect(n).toBe(12);
      const knots = vertices.map((v) => {
        const [x, y, rot, dist] = [
          num(v, 'x', 0),
          num(v, 'y', 0),
          num(v, 'rotation', 0),
          num(v, 'distance', 0),
        ];
        return {
          at: [x, y] as Pt,
          out: [x + Math.cos(rot) * dist, y + Math.sin(rot) * dist] as Pt,
          into: [x - Math.cos(rot) * dist, y - Math.sin(rot) * dist] as Pt,
          rot,
          dist,
        };
      });
      for (const k of knots) {
        // On the circle, its handle along the circle's tangent, as long as a circle's.
        expect(Math.hypot(k.at[0], k.at[1])).toBeCloseTo(r, 6);
        const tangent = Math.atan2(k.at[1], k.at[0]) + Math.PI / 2;
        expect(Math.abs(Math.sin(k.rot - tangent))).toBeLessThan(1e-6);
        expect(Math.cos(k.rot - tangent)).toBeGreaterThan(0);
        expect(Math.abs(k.dist / circleHandle(r, n) - 1)).toBeLessThan(0.1);
      }
      // And what it draws between them is the circle: every arc within half a percent of the radius.
      knots.forEach((k, i) => {
        const next = knots[(i + 1) % n] ?? k;
        for (const t of [0.25, 0.5, 0.75]) {
          const s = 1 - t;
          const p = [0, 1].map(
            (j) =>
              s ** 3 * (k.at[j] ?? 0) +
              3 * s ** 2 * t * (k.out[j] ?? 0) +
              3 * s * t ** 2 * (next.into[j] ?? 0) +
              t ** 3 * (next.at[j] ?? 0),
          );
          expect(Math.abs(Math.hypot(p[0] ?? 0, p[1] ?? 0) / r - 1)).toBeLessThan(0.005);
        }
      });
    }
  });

  test('the outline axis lays what it names on every piece, by the line the piece carries', () => {
    // A piece's line by its weight under the centred line (A0): outer 5, small 3.5, trim 2.5, none.
    const lineRigs = figureRigs({ ...d, outline: 'line' });
    const weightOf = new Map(
      [lineRigs.accused, lineRigs.judge, lineRigs.hand].flatMap((rig) =>
        drawnOf(rig[0] as Element)
          .filter(isPaper)
          .map((s) => {
            const ink = paintNamed(s.e, 'Ink');
            const width = ink === undefined ? 0 : num(ink, 'thickness', 0);
            const weight = width === 0 ? 'none' : width === INK.trim ? 'trim' : 'silhouette';
            return [`${attr(rig[0], 'name')}.${s.name}`, weight] as const;
          }),
      ),
    );
    const LAYS = {
      none: { line: ['Paper'], thick: ['Paper'], edge: ['Paper'], both: ['Paper'] },
      trim: {
        line: ['Paper', 'Ink'],
        thick: ['Paper', 'Ink'],
        edge: ['Paper', 'Core'],
        both: ['Ink', 'Paper', 'Core'],
      },
      silhouette: {
        line: ['Paper', 'Ink'],
        thick: ['Ink', 'Paper'],
        edge: ['Paper', 'Core'],
        both: ['Ink', 'Paper', 'Core'],
      },
    } as const;
    const pieces = [accused, judge, hand].flatMap((b) =>
      drawnOf(b)
        .filter(isPaper)
        .map((s) => [`${attr(b, 'name')}.${s.name}`, s] as const),
    );
    expect(pieces.length).toBe(weightOf.size);
    for (const [name, s] of pieces) {
      const weight = weightOf.get(name) ?? 'none';
      const laid = s.e.children
        .map((c) => String(attr(c, 'name')))
        .filter((n) => n === 'Ink' || n === 'Paper' || n === 'Core');
      expect([name, weight, laid]).toEqual([name, weight, [...LAYS[weight][d.outline]]]);
    }
    expect([...weightOf.values()].filter((w) => w === 'silhouette').length).toBeGreaterThan(5);
    // Only the stains go unlined: they are marks on the tunic, not pieces of their own.
    for (const [name, weight] of weightOf)
      expect([name, weight === 'none']).toEqual([name, name.startsWith('Accused.stain')]);
  });

  test('the gavel and the paper he reads are drawn lined in the props’ inks', () => {
    const props = propsOf(d);
    const drawn = benchTopInks(props);
    expect(drawn.filter((c) => c === props.gavelInk.toLowerCase()).length).toBeGreaterThanOrEqual(
      2,
    );
    expect(drawn).toContain(props.sheetInk.toLowerCase());
  });
});

/**
 * The colours `riveJudge.over` fills with, in order, drawn into a recording
 * context: what the bench top (the sheet he reads, the gavel) is drawn in.
 * His hand is a rig, which this context does not draw.
 */
const benchTopInks = (props: Props): string[] =>
  drawing((f) => riveJudge.over(f, 0.2, 0.5, props))
    .filter((l) => l.kind === 'fill')
    .flatMap((l) => l.colours);

test('the bench top is lined in the props it is given, never the kit’s own outline', () => {
  const props: Props = { ...propsOf(K1), sheetInk: '#0a0b0c', gavelInk: '#0d0e0f' };
  const drawn = benchTopInks(props);
  expect(drawn.filter((c) => c === '#0d0e0f').length).toBeGreaterThanOrEqual(2);
  expect(drawn).toContain('#0a0b0c');
  expect(drawn).not.toContain(C.outline.toLowerCase());
});

// ─── what the host lays round the figures (CRAFT 12) ─────────────────────────

/**
 * What laid a paint, which says what it may be (CRAFT 12: an ink may line a
 * piece, never shade it): a `line` is one opaque flat colour, as the kit lays
 * an ink line (`ink.ts` fills the line's outline) and a paper's flat face; a
 * `wash` is a gradient, a see-through fill or a pre-blended face; a `shadow`
 * is what a paint casts (`shadowColor`).
 */
type Role = 'line' | 'wash' | 'shadow';

/** The role of what laid `l`. */
const roleOf = (l: Laid): Role => (l.kind === 'shadow' ? 'shadow' : l.flat ? 'line' : 'wash');

/**
 * The kit's own shading, which the host lays round the Rive figures and no
 * ramp derives: the look's one named exception to "every colour is a base or
 * derived from one", each with its reason and the roles it may take.
 *
 * Why it stays: these are the engine's (`packages/film/src/canvas`), and the
 * court's scenery lays the same ones under every piece it cuts. Derived here
 * alone, the frame would hold two shadow styles. The `shade` unit owns them
 * and changes them together with the canvas looks; that change flips this
 * entry.
 */
const KIT_SHADING: ReadonlyMap<string, { readonly why: string; readonly as: ReadonlyArray<Role> }> =
  new Map([
    [
      '#281c10',
      {
        why: 'the kit’s warm dark, rgba(40, 28, 16, …): the cast shadow under each cut piece (`cutout`) and the contact shadow under a figure’s feet (`ground`); a shadow or a wash, never a solid piece',
        as: ['wash', 'shadow'],
      },
    ],
    [
      '#fbf6ea',
      {
        why: 'the kit’s paper core: the cream a cut or torn piece’s rim shows, laid flat',
        as: ['line'],
      },
    ],
  ]);

/**
 * The colours the host may lay round the figures under `d`, posed, by what
 * laid them: each paper it cuts (the sheet he reads, the gavel) or casts on
 * (the hand's receivers) as a line or a wash; that paper's shade as any; the
 * props' inks as a line only; the kit's named shading as its entry says.
 */
const hostColours = (
  d: Direction,
  swing: number,
  lean: number,
): Record<Role, ReadonlySet<string>> => {
  const props = propsOf(d);
  const papers = underHand(d, swing, lean, props).map((s) => s.paper);
  const shades = papers.map((p) => derived(p).shade);
  const kit = (role: Role) =>
    [...KIT_SHADING].flatMap(([c, { as }]) => (as.includes(role) ? [c] : []));
  const low = (cs: ReadonlyArray<string>) => new Set(cs.map((c) => c.toLowerCase()));
  return {
    line: low([...papers, ...shades, props.sheetInk, props.gavelInk, ...kit('line')]),
    wash: low([...papers, ...shades, ...kit('wash')]),
    shadow: low([...shades, ...kit('shadow')]),
  };
};

/** Why what the host laid is not what it may lay: each colour outside its role's allowance, and each paint with no colour to read, once. */
const hostFaults = (laid: ReadonlyArray<Laid>, allowed: Record<Role, ReadonlySet<string>>) => [
  ...new Set(
    laid.flatMap((l) =>
      l.colours.length === 0
        ? [`${l.kind}: no colour to read`]
        : l.colours.flatMap((c) =>
            allowed[roleOf(l)].has(c)
              ? []
              : [
                  `${roleOf(l)} ${shown(c)}: not a base, a derived colour, an ink line or the kit’s named shading in that role`,
                ],
          ),
    ),
  ),
];

/** The accused's host: the contact shadow under the rig (`riveAccused`), the same under every option. */
const accusedHost = (as: Mutation = (f) => f) => drawing((f) => riveAccused(as(f)));

/** A black contact shadow laid where the kit's lies: a solid black-alpha ellipse's box under the feet. */
const blackGround: Mutation = (f) => {
  f.ctx.save();
  f.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  f.ctx.fillRect(-50, -6, 100, 12);
  f.ctx.restore();
  return f;
};

/** A cut piece casting a black shadow: an alpha-black layer, which CRAFT 12 forbids. */
const blackShadow: Mutation = (f) => {
  f.ctx.save();
  f.ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  f.ctx.shadowBlur = 4;
  f.ctx.shadowOffsetY = 3;
  f.ctx.fillStyle = ramps.paper.base;
  f.ctx.beginPath();
  f.ctx.rect(-20, -40, 40, 30);
  f.ctx.fill();
  f.ctx.restore();
  return f;
};

/** A cut piece casting its shadow in `ink`, half clear: an ink may line a piece, never shade one. */
const inkShadow =
  (ink: string): Mutation =>
  (f) => {
    f.ctx.save();
    f.ctx.shadowColor = `${ink}80`;
    f.ctx.shadowBlur = 4;
    f.ctx.shadowOffsetY = 3;
    f.ctx.fillStyle = ramps.paper.base;
    f.ctx.beginPath();
    f.ctx.rect(-20, -40, 40, 30);
    f.ctx.fill();
    f.ctx.restore();
    return f;
  };

/** The kit's warm dark laid opaque, as a solid piece: it may shadow or wash, never be cut. */
const kitDarkPiece: Mutation = (f) => {
  f.ctx.save();
  f.ctx.fillStyle = 'rgba(40, 28, 16, 1)';
  f.ctx.beginPath();
  f.ctx.rect(-60, -6, 120, 16);
  f.ctx.fill();
  f.ctx.restore();
  return f;
};

/** A face cut in black, filled as the kit fills a pre-blended face: a pattern whose tile holds its one colour. */
const blackFace: Mutation = (f) => {
  const tile = document.createElement('canvas');
  tile.width = 8;
  tile.height = 8;
  const t = tile.getContext('2d');
  if (t !== null) {
    t.fillStyle = '#000000';
    t.fillRect(0, 0, 8, 8);
  }
  f.ctx.save();
  f.ctx.fillStyle = f.ctx.createPattern(tile, 'repeat') ?? '#000000';
  f.ctx.beginPath();
  f.ctx.rect(-20, -40, 40, 30);
  f.ctx.fill();
  f.ctx.restore();
  return f;
};

/** The centred line under each ink (A0, A0 + B2): the casts show, and B2's ink is black, so a black line is allowed and a black shading still is not. */
const CONTROLLED = [
  ['A0', A0],
  ['A0 + B2', { ...A0, ink: 'black' }],
] as const satisfies ReadonlyArray<readonly [string, Direction]>;

describe('what the host lays round the figures', () => {
  test('every paint is what laid it may be, in every option and pose: a line a paper, its shade, an ink or the kit’s core; a wash a paper, its shade or the kit’s shading; a shadow a shade or the kit’s warm dark', () => {
    const wrong = SHADED.flatMap(([name, d]) =>
      LEANS.flatMap((lean) =>
        SWINGS.flatMap((swing) =>
          hostFaults(
            drawing((f) => judgeOf(d).over(f, swing, lean, propsOf(d))),
            hostColours(d, swing, lean),
          ).map((f) => `${name} lean ${lean} swing ${swing}: ${f}`),
        ),
      ),
    );
    const accused = hostFaults(accusedHost(), hostColours(K1, GAVEL_REST, 0)).map(
      (f) => `the accused: ${f}`,
    );
    expect([...new Set([...wrong, ...accused])]).toEqual([]);
  });

  test('the kit’s named shading is what the host lays, so the exception names nothing stale', () => {
    const laid = new Set(
      [
        ...accusedHost(),
        ...drawing((f) => riveJudge.over(f, GAVEL_REST, 0, propsOf(DIRECTION))),
      ].flatMap((l) => l.colours),
    );
    expect([...KIT_SHADING.keys()].filter((c) => !laid.has(c))).toEqual([]);
  });

  test('the kit’s named shading is laid in each role it names', () => {
    const laid = [
      ...accusedHost(),
      ...drawing((f) => riveJudge.over(f, GAVEL_REST, 0, propsOf(DIRECTION))),
    ];
    const missing = [...KIT_SHADING].flatMap(([c, { as }]) =>
      as.flatMap((role) =>
        laid.some((l) => roleOf(l) === role && l.colours.includes(c)) ? [] : [`${c} as a ${role}`],
      ),
    );
    expect(missing).toEqual([]);
  });

  const controls: ReadonlyArray<
    readonly [string, (d: Direction) => ReadonlyArray<Laid>, (d: Direction) => string]
  > = [
    ['a black contact shadow', () => accusedHost(blackGround), () => '#000000'],
    ['a piece casting an alpha-black shadow', () => accusedHost(blackShadow), () => '#000000'],
    [
      'the hand’s cast black part way across',
      (d) => drawing((f) => judgeOf(d).over(blackMiddleStop(f), GAVEL_REST, 0, propsOf(d))),
      () => '#000000',
    ],
    ['a piece casting its shadow in the ink', (d) => accusedHost(inkShadow(inkOf(d))), inkOf],
    ['the kit’s warm dark as a solid piece', () => accusedHost(kitDarkPiece), () => '#281c10'],
    ['a face cut in black', () => accusedHost(blackFace), () => '#000000'],
  ];
  test.each(
    CONTROLLED.flatMap(([name, d]) =>
      controls.map(([what, laid, wrong]) => [what, name, d, laid, wrong] as const),
    ),
  )('%s fails under %s', (_, __, d, laid, wrong) => {
    expect(hostFaults(laid(d), hostColours(d, GAVEL_REST, 0)).join('; ')).toContain(
      wrong(d).toLowerCase(),
    );
  });
});
