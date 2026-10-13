// The axis property: every option of every art-direction axis
// (`direction.ts`), one axis at a time with the others at K1, builds a valid
// rig, passes the figure-parts tests, keeps both heads inside their
// artboards (what `paintGl` copies), declares a face probe as tall as the
// head it draws, and reaches every part its axis names.

import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, test } from 'bun:test';
import { Console, Effect, FileSystem, Result } from 'effect';
import { ramps } from '../../palette.ts';
import { paperProps } from '../cutpaper/court.ts';
import { accusedFace, accusedHead } from './accused-rig.ts';
import { compile, rive } from './build.ts';
import { type Direction, K1, OPTIONS, inkOf, propsOf } from './direction.ts';
import { figureRigs, figuresRml } from './figures.ts';
import { judgeFace } from './judge-rig.ts';
import { type Mat, type Pt, boxOf } from './parts.ts';
import { type Element, argb } from './rml.ts';

/** Every option, by the study's name, as a direction: K1 with that one axis changed. */
const CASES = Object.entries(OPTIONS).map(
  ([name, set]) => [name, { ...K1, ...set } satisfies Direction] as const,
);

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
      paints: palm.children.filter((e) => e.name !== 'PointsPath').map((e) => attr(e, 'name')),
    });
    const shapes = palms.map(shapeOf);
    expect(shapes[0]?.points).toBe(12);
    expect(shapes[0]?.paints).toContain('Paper');
    for (const shape of shapes)
      expect(shape).toEqual({ paths: 1, points: 12, paints: shapes[0]?.paints ?? [] });
  });

  test('the accused and the judge wear the same face kit, the judge at his own scale', () => {
    const parts = ['face', 'features', 'brows', 'eyeL', 'eyeR', 'mouthLine', 'mouthOh', 'faceRest'];
    for (const part of parts)
      expect([part, named([accused], part).length, named([judge], part).length]).toEqual([
        part,
        1,
        1,
      ]);
    expect(attr(named([judge], 'face')[0], 'scaleX')).toBeGreaterThan(1);
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

  test('the outline axis lays what it names: a line outside the paper, a light core on the cut', () => {
    const pieces = [accused, judge, hand].flatMap((b) =>
      walk([b]).filter(
        (e) => e.name === 'Shape' && e.children.some((c) => attr(c, 'name') === 'Paper'),
      ),
    );
    const paints = pieces.map((p) => p.children.map((c) => attr(c, 'name')));
    const under = paints.some(
      (ps) => ps.indexOf('Ink') !== -1 && ps.indexOf('Ink') < ps.indexOf('Paper'),
    );
    const core = paints.some((ps) => ps.includes('Core'));
    expect({ under, core }).toEqual({
      under: d.outline === 'thick' || d.outline === 'both',
      core: d.outline === 'edge' || d.outline === 'both',
    });
  });

  test("every head and hand is the people's one figure paper", () => {
    for (const [b, shape] of [
      [accused, 'head'],
      [accused, 'nearPalm'],
      [accused, 'farPalm'],
      [judge, 'head'],
      [hand, 'palm'],
    ] as const) {
      const paper = named([b], shape)[0]?.children.find((c) => attr(c, 'name') === 'Paper');
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

  test('every crease turns the hue: at least half its colour step is hue, never the paper dimmed (CRAFT 12)', () => {
    const creases = [accused, judge, hand].flatMap((b) =>
      walk([b])
        .filter((e) => e.name === 'LinearGradient')
        .map((g) => g.children.map((s) => hexOf(String(attr(s, 'colorValue')))))
        .map((stops) => [stops[0] ?? '', stops[2] ?? ''] as const),
    );
    expect(creases.length).toBeGreaterThan(0);
    for (const [base, shade] of new Map(creases.map((c) => [c.join(), c])).values())
      expect([base, shade, hueShare(base, shade) >= 0.5]).toEqual([base, shade, true]);
  });
});
