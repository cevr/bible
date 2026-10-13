// The axis property: every option of every art-direction axis
// (`direction.ts`), one axis at a time with the others at K1, builds a valid
// rig, passes the figure-parts tests, keeps both heads inside their
// artboards (what `paintGl` copies), declares a face probe as tall as the
// head it draws, and reaches every part its axis names. Under the court's
// key light (`keyLight`) every shaded thing it draws keeps CRAFT 12: each
// crease and ramp shade turns toward the light's complement, each highlight
// leans to the light, and each cast shadow is the shade of the surface it
// falls on. Every hand is one closed circle, and every line the outline axis
// names is laid on every piece and on the gavel as drawn.

import { recorder, withDom } from '@bible/film/stand-in';
import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, test } from 'bun:test';
import { Console, Effect, FileSystem, Predicate, Result } from 'effect';
import { C } from '../../../righteousness-by-faith/kit.ts';
import { type Ramp, hues, keyLight, ramps, robes } from '../../palette.ts';
import type { CourtFrame } from '../../scenes/court.ts';
import { type Props, paperProps } from '../cutpaper/court.ts';
import { HAND as ACCUSED_HAND, accusedFace, accusedHead } from './accused-rig.ts';
import { compile, rive } from './build.ts';
import { DIRECTION, type Direction, K1, OPTIONS, dressOf, inkOf, propsOf } from './direction.ts';
import { figureRigs, figuresRml } from './figures.ts';
import { HAND_ART, JUDGE_FACE, judgeFace } from './judge-rig.ts';
import { riveJudge } from './judge.ts';
import { INK, type Mat, type Pt, boxOf } from './parts.ts';
import { type Element, argb } from './rml.ts';

/** Every option, by the study's name, as a direction: K1 with that one axis changed. */
const CASES = Object.entries(OPTIONS).map(
  ([name, set]) => [name, { ...K1, ...set } satisfies Direction] as const,
);

/** The options, and K1 itself: every direction the shading must hold under. */
const SHADED = [['K1', K1] as const, ...CASES];

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
 * rest: a node or a shape places, turns and scales its children; a root bone
 * stands where it is put; a bone stands at its parent bone's tip.
 */
const framed = (
  roots: ReadonlyArray<Element>,
  frame: Mat = [1, 0, 0, 1, 0, 0],
  bone?: Element,
): ReadonlyArray<{ readonly e: Element; readonly at: Mat }> =>
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
    return [{ e, at }, ...framed(e.children, at, isBone ? e : bone)];
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

/** A colour's CIE LCh (D65). */
const lch = (hex: string) => {
  const lin = (i: number) => {
    const s = Number.parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [lin(0), lin(1), lin(2)];
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return { L: 116 * y - 16, a: 500 * (x - y), b: 200 * (y - z) };
};

/** The share of a crease's colour step that is hue (ΔH over ΔE76), 0..1. */
const hueShare = (base: string, shade: string) => {
  const p = lch(base);
  const q = lch(shade);
  const dE = Math.hypot(q.L - p.L, q.a - p.a, q.b - p.b);
  const dC = Math.hypot(q.a, q.b) - Math.hypot(p.a, p.b);
  const dH = Math.sqrt(Math.max(0, dE ** 2 - (q.L - p.L) ** 2 - dC ** 2));
  return dH / dE;
};

/** A colour value as RML writes it, back to `#rrggbb`. */
const hexOf = (argbValue: string) => `#${argbValue.slice(2).toLowerCase()}`;

// ─── CRAFT 12 under the key light ────────────────────────────────────────────

/** A colour's LCh hue, degrees. */
const hueOf = (hex: string) => {
  const { a, b } = lch(hex);
  return ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
};
/** How far apart two hues are, the short way round, degrees. */
const apart = (h: number, k: number) => {
  const d = Math.abs(h - k) % 360;
  return d > 180 ? 360 - d : d;
};
/** HSV saturation, 0..1: what CRAFT 12 says a shade keeps or raises. */
const saturationOf = (hex: string) => {
  const [r, g, b] = [0, 1, 2].map((i) => Number.parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16));
  const top = Math.max(r ?? 0, g ?? 0, b ?? 0);
  return top === 0 ? 0 : (top - Math.min(r ?? 0, g ?? 0, b ?? 0)) / top;
};

/** The key light's hue, and its complement, which every shade turns toward. */
const KEY = hueOf(keyLight);
const COMPLEMENT = (KEY + 180) % 360;
/** A hue this near its target already sits on it: a base there need not move further. */
const NEAR = 10;

/**
 * Why `shade` is no CRAFT 12 shade of `base`: it must be darker, turn toward
 * the key's complement (nearer it than the base, or already on it), be at
 * least half hue by its colour step, and keep or raise the saturation.
 */
const shadeFaults = (base: string, shade: string): string[] => {
  const faults: string[] = [];
  if (lch(shade).L >= lch(base).L) faults.push('not darker');
  const from = apart(hueOf(base), COMPLEMENT);
  const to = apart(hueOf(shade), COMPLEMENT);
  if (to >= from && to > NEAR)
    faults.push(`turns away from the complement (${from.toFixed(1)}° → ${to.toFixed(1)}°)`);
  if (hueShare(base, shade) < 0.5)
    faults.push(`hue share ${(100 * hueShare(base, shade)).toFixed(0)} %`);
  if (saturationOf(shade) < saturationOf(base) - 0.005) faults.push('loses saturation');
  return faults;
};

/** Why `light` is no CRAFT 12 highlight of `base`: it must be lighter and lean to the key's hue (nearer it than the base, or on it). */
const lightFaults = (base: string, light: string): string[] => {
  const faults: string[] = [];
  if (lch(light).L <= lch(base).L) faults.push('not lighter');
  const from = apart(hueOf(base), KEY);
  const to = apart(hueOf(light), KEY);
  if (to >= from && to > NEAR)
    faults.push(`turns away from the light (${from.toFixed(1)}° → ${to.toFixed(1)}°)`);
  return faults;
};

/** Every paper the palette ramps, by name, the robe's options last (the drawn one is `hues.robe`). */
const PAPERS: ReadonlyArray<readonly [string, Ramp]> = [
  ...Object.entries(ramps).map(([name, ramp]) => [`ramps.${name}`, ramp] as const),
  ...Object.entries(hues).flatMap(([name, hue]) =>
    Predicate.hasProperty(hue, 'base') ? [[`hues.${name}`, hue] as const] : [],
  ),
  ...Object.entries(robes).map(([name, ramp]) => [`robes.${name}`, ramp] as const),
];

/** The shade of the paper whose base is `base`, from the palette's ramps (the first that has it). */
const shadeOfBase = (base: string) =>
  PAPERS.find(([, paper]) => paper.base.toLowerCase() === base.toLowerCase())?.[1].shade;

describe('the palette under the key light (CRAFT 12)', () => {
  test.each(PAPERS)(
    '%s: its shade is darker, turned toward the light’s complement, mostly hue, as saturated',
    (name, paper) => {
      expect([name, paper.base, paper.shade, shadeFaults(paper.base, paper.shade)]).toEqual([
        name,
        paper.base,
        paper.shade,
        [],
      ]);
    },
  );
  test.each(PAPERS.filter(([, paper]) => paper.light !== undefined))(
    '%s: its light is lighter and leans to the light’s hue',
    (name, paper) => {
      const light = paper.light ?? paper.base;
      expect([name, light, lightFaults(paper.base, light)]).toEqual([name, light, []]);
    },
  );
});

// ─── reading what a rig paints ───────────────────────────────────────────────

/** A paint's colour: its solid, or a gradient's first stop. */
const colourOf = (paint: Element | undefined) => {
  const stop = walk(paint ? [paint] : []).find(
    (e) => e.name === 'SolidColor' || e.name === 'GradientStop',
  );
  const value = attr(stop, 'colorValue');
  return value === undefined ? undefined : hexOf(String(value));
};
const paintNamed = (shape: Element, name: string) =>
  shape.children.find((c) => attr(c, 'name') === name);

/** A shape of an artboard as drawn: its element, its place in the draw (0 on top), and its outline at rest on the artboard. */
interface Drawn {
  readonly e: Element;
  readonly name: string;
  readonly order: number;
  readonly outline: ReadonlyArray<Pt>;
}

/** Every shape of `board`, top first (Rive draws a node's first child over the ones after it). */
const drawnOf = (board: Element): ReadonlyArray<Drawn> =>
  framed([board])
    .filter(({ e }) => e.name === 'Shape')
    .map(({ e, at }, order) => ({
      e,
      name: String(attr(e, 'name')),
      order,
      outline: e.children
        .filter((c) => c.name === 'PointsPath')
        .flatMap((p) => p.children)
        .filter((v) => v.name === 'CubicMirroredVertex' || v.name === 'StraightVertex')
        .map((v) => apply(at, [num(v, 'x', 0), num(v, 'y', 0)])),
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

/** A paper piece: a shape with a `Paper` fill (not a face mark, not a cast). */
const isPaper = (s: Drawn) => paintNamed(s.e, 'Paper') !== undefined;

/**
 * The cast shadows `caster` lays, as the renderer shows them at `p`: its own
 * `Shadow` fill, drawn with it over whatever lies under it; else the casts
 * clipped to a surface (shapes named `<caster>Cast…` with a `ClippingShape`),
 * where that surface is; else its unclipped cast, drawn behind the figure,
 * where no surface of the rig covers it.
 */
const castAt = (
  shapes: ReadonlyArray<Drawn>,
  caster: Drawn,
  under: Drawn | undefined,
): string | undefined => {
  const own = paintNamed(caster.e, 'Shadow');
  if (own !== undefined) return colourOf(own);
  const casts = shapes.filter((s) => s.name.startsWith(`${caster.name}Cast`));
  const clipOf = (s: Drawn) =>
    attr(
      s.e.children.find((c) => c.name === 'ClippingShape'),
      'sourceId',
    );
  const lay =
    under === undefined
      ? casts.find((s) => clipOf(s) === undefined)
      : casts.find((s) => clipOf(s) === attr(under.e, 'id'));
  return lay === undefined ? undefined : colourOf(paintNamed(lay.e, 'Shadow'));
};

/** How far `caster`'s cast falls from it, along the light: its shadow's offset. */
const offsetOf = (shapes: ReadonlyArray<Drawn>, caster: Drawn): Pt | undefined => {
  const own = paintNamed(caster.e, 'Shadow');
  const cast = shapes.find((s) => s.name.startsWith(`${caster.name}Cast`));
  const paint = own ?? (cast ? paintNamed(cast.e, 'Shadow') : undefined);
  const feather = walk(paint ? [paint] : []).find((e) => e.name === 'Feather');
  return feather === undefined
    ? undefined
    : [num(feather, 'offsetX', 0), num(feather, 'offsetY', 0)];
};

/**
 * Every place a piece's cast shadow shows, at rest: points just past its
 * edge on the side away from the light, each with the surface it falls on
 * (the topmost paper drawn under the piece there, else the artboard's
 * ground) and the colour the cast lays there.
 */
const castsOf = (board: Element, ground: string) => {
  const shapes = drawnOf(board);
  return shapes.filter(isPaper).flatMap((caster) => {
    const offset = offsetOf(shapes, caster);
    if (offset === undefined || caster.outline.length === 0) return [];
    const reach = Math.hypot(offset[0], offset[1]);
    const away: Pt = [offset[0] / reach, offset[1] / reach];
    const box = boxOf(caster.outline);
    const centre: Pt = [(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2];
    const above = shapes.filter((s) => s.order < caster.order);
    const below = shapes.filter(
      (s) => s.order > caster.order && isPaper(s) && !s.name.includes('Cast'),
    );
    return caster.outline.flatMap((v) => {
      const n = Math.hypot(v[0] - centre[0], v[1] - centre[1]);
      const normal: Pt = [(v[0] - centre[0]) / n, (v[1] - centre[1]) / n];
      if (normal[0] * away[0] + normal[1] * away[1] < 0.7) return [];
      const p: Pt = [v[0] + normal[0] * reach * 0.5, v[1] + normal[1] * reach * 0.5];
      if (inside(p, caster.outline) || above.some((s) => inside(p, s.outline))) return [];
      const under = below.find((s) => inside(p, s.outline));
      const surface = under === undefined ? 'ground' : under.name;
      const want =
        under === undefined ? ground : shadeOfBase(colourOf(paintNamed(under.e, 'Paper')) ?? '');
      return [
        {
          caster: caster.name,
          surface,
          want: want ?? 'no ramp',
          laid: castAt(shapes, caster, under) ?? 'none',
        },
      ];
    });
  });
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
        expect(Buffer.from(committed).equals(Buffer.from(fresh))).toBe(true);
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
      // Its shadow is laid on its own where nothing of its figure lies under it (the judge's hand
      // over the bench), and as casts beside it where something does (`casts` in `parts.ts`).
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

// ─── shading, for every direction (CRAFT 12) ─────────────────────────────────

describe.each(SHADED)('shading under %s (CRAFT 12)', (_, d) => {
  const rigs = figureRigs(d);
  const boards = [rigs.accused, rigs.judge, rigs.hand].map((rig) => rig[0] as Element);

  test('every crease turns toward the light’s complement: darker, mostly hue, as saturated', () => {
    const creases = boards.flatMap((b) =>
      walk([b])
        .filter((e) => e.name === 'LinearGradient')
        .map((g) => g.children.map((s) => hexOf(String(attr(s, 'colorValue')))))
        .map((stops) => [stops[0] ?? '', stops[2] ?? ''] as const),
    );
    expect(creases.length).toBeGreaterThan(0);
    for (const [base, shade] of new Map(creases.map((c) => [c.join(), c])).values())
      expect([base, shade, shadeFaults(base, shade)]).toEqual([base, shade, []]);
  });

  test('every highlight (a cut edge’s light core) is lighter than its paper and leans to the light', () => {
    const cores = boards.flatMap((b) =>
      walk([b])
        .filter((e) => e.name === 'Shape' && paintNamed(e, 'Core') !== undefined)
        .map(
          (e) =>
            [
              String(attr(e, 'name')),
              colourOf(paintNamed(e, 'Paper')) ?? '',
              colourOf(paintNamed(e, 'Core')) ?? '',
            ] as const,
        ),
    );
    if (d.outline === 'edge' || d.outline === 'both') expect(cores.length).toBeGreaterThan(0);
    for (const [name, base, core] of cores)
      expect([name, base, core, lightFaults(base, core)]).toEqual([name, base, core, []]);
  });

  test('every cast shadow is the shade of the surface it falls on', () => {
    const [accused, judge, hand] = boards as [Element, Element, Element];
    const casts = [
      ...castsOf(accused, ramps.paper.shade),
      ...castsOf(judge, ramps.paper.shade),
      ...castsOf(hand, dressOf(d).bench.shade),
    ];
    expect(casts.length).toBeGreaterThan(0);
    const wrong = new Map(
      casts
        .filter((c) => c.laid !== c.want)
        .map((c) => [`${c.caster} on ${c.surface}`, `wants ${c.want}, laid ${c.laid}`]),
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
  withDom(() => {
    const rec = recorder();
    const filled: string[] = [];
    const ctx = new Proxy(rec.ctx, {
      get: (target, key) => {
        const value = Reflect.get(target, key);
        if (key === 'fill')
          return (...args: ReadonlyArray<unknown>) => {
            filled.push(String(Reflect.get(target, 'fillStyle')).toLowerCase());
            return Reflect.apply(value as (...a: ReadonlyArray<unknown>) => unknown, target, args);
          };
        return Predicate.isFunction(value) ? value.bind(target) : value;
      },
      set: (target, key, value) => Reflect.set(target, key, value),
    });
    const f = {
      ctx,
      boil: 0,
      hand: (key: string | number) => ({ boil: 0, seed: String(key).length }),
      rive: () => undefined,
    } as unknown as CourtFrame;
    riveJudge.over(f, 0.2, 0.5, props);
    return filled;
  });

test('the bench top is lined in the props it is given, never the kit’s own outline', () => {
  const props: Props = { ...propsOf(K1), sheetInk: '#0a0b0c', gavelInk: '#0d0e0f' };
  const drawn = benchTopInks(props);
  expect(drawn.filter((c) => c === '#0d0e0f').length).toBeGreaterThanOrEqual(2);
  expect(drawn).toContain('#0a0b0c');
  expect(drawn).not.toContain(C.outline.toLowerCase());
});
