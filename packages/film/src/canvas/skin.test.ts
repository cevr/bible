// Bones for paper: a piece's outline bent by a few named bones before
// `piece()` cuts and inks it. At rest nothing moves; a turned bone moves only
// what it weighs; weights share each point out whole; a joint bends an edge
// into a smooth arc, and a large turn keeps its girth; the same pose bends
// the same way whatever was posed before; a curve bends through its own
// control points; and the bent outline is what the cut, the ink and the
// check's probe all see.

import { describe, expect, test } from 'bun:test';
import { recorder } from './fixtures/stand-in.ts';
import { type Pt, rectShape, rounded, spline } from './ink.ts';
import { piece } from './piece.ts';
import { type ProbeSink, probing } from './probe.ts';
import { skeleton } from './skin.ts';

const UP = -Math.PI / 2;

/** A two-bone body: `low` from (0, 0) upward 50, `high` on its tip, 50 more. */
const body = () =>
  skeleton('low', { at: [0, 0], angle: UP, length: 50 }).bone('high', 'low', { length: 50 });

/** A column of points `x` across the bones' line, from y = 10 up to y = -110, every `step`. */
const edge = (x: number, step = 1): Pt[] =>
  Array.from({ length: Math.round(120 / step) + 1 }, (_, i): Pt => [x, 10 - i * step]);

/** `p` turned by `a` about `c`. */
const turned = ([x, y]: Pt, [cx, cy]: Pt, a: number): Pt => [
  cx + Math.cos(a) * (x - cx) - Math.sin(a) * (y - cy),
  cy + Math.sin(a) * (x - cx) + Math.cos(a) * (y - cy),
];

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Whether two point lists are the same numbers, bit for bit (signed zeros apart). */
const identical = (a: ReadonlyArray<Pt>, b: ReadonlyArray<Pt>) =>
  a.length === b.length &&
  a.every((p, i) => Object.is(p[0], b[i]?.[0]) && Object.is(p[1], b[i]?.[1]));

/** The signed turn between each pair of adjacent segments of a polyline, in radians. */
const bends = (pts: ReadonlyArray<Pt>): number[] => {
  const out: number[] = [];
  for (let i = 2; i < pts.length; i++) {
    const [a, b, c] = [pts[i - 2], pts[i - 1], pts[i]];
    if (a === undefined || b === undefined || c === undefined) continue;
    const t0 = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const t1 = Math.atan2(c[1] - b[1], c[0] - b[0]);
    out.push(Math.atan2(Math.sin(t1 - t0), Math.cos(t1 - t0)));
  }
  return out;
};

describe('skin: names', () => {
  test('a pose, chain or parent naming a bone the skeleton lacks, or a second bone of one name, does not compile', () => {
    const bones = body();
    // @ts-expect-error: the skeleton has no bone `hgih`
    bones.pose({ hgih: { turn: 1 } });
    // @ts-expect-error: the skeleton has no bone `mid`
    bones.skin([[0, 0]], { chain: ['low', 'mid'] });
    // @ts-expect-error: the skeleton has no bone `mid` to start from
    bones.bone('tip', 'mid', { length: 1 });
    // @ts-expect-error: a bone of this name already exists
    bones.bone('high', 'low', { length: 1 });
    expect(bones.names).toEqual(['low', 'high']);
  });
});

describe('skin: at rest', () => {
  test('a still pose, empty or named at rest, leaves every point bit for bit', () => {
    const bones = body();
    const outline = rounded(0, -50, 60, 110, 18);
    const torso = bones.skin(outline, { chain: ['low', 'high'] }, { spacing: 5 });
    expect(torso.rest.length).toBeGreaterThan(outline.length);
    for (const pose of [
      bones.pose({}),
      bones.pose({ low: { turn: 0, along: 1, across: 1, shift: [0, 0] }, high: { turn: 0 } }),
    ])
      expect(identical(torso.at(pose), torso.rest)).toBe(true);
    // Without resampling, the rest outline is the path given.
    expect(identical(bones.skin(outline, { chain: ['low', 'high'] }).rest, outline)).toBe(true);
  });
});

describe('skin: one bone turned', () => {
  test('moves only the points it weighs, by the turn about its start', () => {
    const bones = body();
    const pts = edge(20, 5);
    const skin = bones.skin(pts, { chain: ['low', 'high'], blend: 10 }, { closed: false });
    const out = skin.at(bones.pose({ high: { turn: 0.3 } }));
    // The joint is at y = -50, blended ±10: below -40 is `low`'s alone, above -60 `high`'s.
    pts.forEach((p, i) => {
      const q = out[i] ?? [NaN, NaN];
      if (p[1] >= -40) expect(identical([q], [p])).toBe(true);
      else if (p[1] <= -60) expect(dist(q, turned(p, [0, -50], 0.3))).toBeLessThan(1e-9);
      else {
        // Between, part of the way: never past the whole turn's move.
        expect(dist(q, p)).toBeGreaterThan(0);
        expect(dist(q, p)).toBeLessThanOrEqual(dist(turned(p, [0, -50], 0.3), p) + 1e-9);
      }
    });
  });

  test('a turned parent carries its child; a child turned leaves its parent', () => {
    const bones = body();
    const tip: Pt = [0, -100];
    const skin = bones.skin(
      [tip, [0, -10]],
      { weigh: (p) => (p[1] < -50 ? { high: 1 } : { low: 1 }) },
      { closed: false },
    );
    const [up, down] = skin.at(bones.pose({ low: { turn: 0.2 } }));
    expect(dist(up ?? tip, turned(tip, [0, 0], 0.2))).toBeLessThan(1e-9);
    expect(dist(down ?? tip, turned([0, -10], [0, 0], 0.2))).toBeLessThan(1e-9);
    const [up2, down2] = skin.at(bones.pose({ high: { turn: 0.2 } }));
    expect(dist(up2 ?? tip, turned(tip, [0, -50], 0.2))).toBeLessThan(1e-9);
    expect(identical([down2 ?? tip], [[0, -10]])).toBe(true);
  });
});

describe('skin: scale and shift', () => {
  test('along squashes toward the bone start, across widens, the child rides the shorter tip', () => {
    const bones = body();
    const skin = bones.skin(
      [
        [10, -40],
        [10, -90],
      ],
      { weigh: (p) => (p[1] < -50 ? { high: 1 } : { low: 1 }) },
      { closed: false },
    );
    const [low, high] = skin.at(bones.pose({ low: { along: 0.5, across: 1.5 } }));
    // In `low`'s frame (40 along, 10 across): 20 along, 15 across.
    expect(dist(low ?? [0, 0], [15, -20])).toBeLessThan(1e-9);
    // `high` starts at `low`'s tip, now 25 up instead of 50; its point keeps its own size.
    expect(dist(high ?? [0, 0], [10, -65])).toBeLessThan(1e-9);
  });

  test('a shift moves a root and all it carries by just that much', () => {
    const bones = body();
    const pts = edge(15, 10);
    const skin = bones.skin(pts, { chain: ['low', 'high'] }, { closed: false });
    const out = skin.at(bones.pose({ low: { shift: [3, -2] } }));
    pts.forEach((p, i) => expect(dist(out[i] ?? [0, 0], [p[0] + 3, p[1] - 2])).toBeLessThan(1e-9));
  });
});

describe('skin: weights', () => {
  test('a chain shares every point out whole, past its ends and far off its line too', () => {
    const bones = skeleton('a', { at: [0, 0], angle: UP, length: 30 })
      .bone('b', 'a', { length: 40 })
      .bone('c', 'b', { angle: 0.3, length: 20 });
    const pts: Pt[] = [];
    for (let y = 40; y >= -150; y -= 3) for (const x of [-200, -30, 0, 12, 90]) pts.push([x, y]);
    const skin = bones.skin(pts, { chain: ['a', 'b', 'c'] }, { closed: false });
    pts.forEach((_, i) => {
      const w = skin.weights(i);
      const each = [w.a ?? NaN, w.b ?? NaN, w.c ?? NaN];
      expect(Math.abs(each.reduce((a, b) => a + b, 0) - 1)).toBeLessThan(1e-12);
      for (const k of each) {
        expect(k).toBeGreaterThanOrEqual(0);
        expect(k).toBeLessThanOrEqual(1);
      }
    });
    // Below the start all `a`; above the end all `c`.
    expect(skin.weights(0)).toEqual({ a: 1, b: 0, c: 0 });
    expect(skin.weights(pts.length - 1)).toEqual({ a: 0, b: 0, c: 1 });
  });

  test('a weigh function is normalised, and a point no bone claims rides the root', () => {
    const bones = body();
    const skin = bones.skin(
      [
        [0, -50],
        [5, 5],
      ],
      { weigh: (p) => (p[1] < 0 ? { low: 2, high: 6 } : { high: -1 }) },
      { closed: false },
    );
    expect(skin.weights(0)).toEqual({ low: 0.25, high: 0.75 });
    expect(skin.weights(1)).toEqual({ low: 1, high: 0 });
  });
});

describe('skin: smooth joints', () => {
  test('a two-bone chain bends a straight edge into a smooth arc, no kink', () => {
    const bones = body();
    const turn = 0.6;
    /** The most any segment of each side edge turns, sampled every `step`, with the joint blended `blend`. */
    const sharpest = (step: number, blend: number) =>
      Math.max(
        ...[-25, 0, 25].map((x) => {
          const side = bones.skin(
            edge(x, step),
            { chain: ['low', 'high'], blend },
            { closed: false },
          );
          const each = bends(side.at(bones.pose({ high: { turn } })));
          // Blended, the edge comes out turned by the bone's turn, never folded back on itself.
          const total = each.reduce((a, b) => a + b, 0);
          if (blend > 0) expect(Math.abs(total - turn)).toBeLessThan(0.01);
          return Math.max(...each.map(Math.abs));
        }),
      );
    // Blended over 20 units either side, on the bend's inside, outside and
    // line: no segment turns more than a sixth of the whole turn, and halving
    // the spacing halves that (a curve), where a joint with no blend turns it
    // all at one point however finely it is sampled (a kink).
    const smooth = sharpest(1, 20);
    expect(smooth).toBeLessThan(turn / 6);
    expect(sharpest(0.5, 20) / smooth).toBeLessThan(0.6);
    expect(sharpest(1, 0)).toBeGreaterThan(turn * 0.9);
    expect(sharpest(0.5, 0)).toBeGreaterThan(turn * 0.9);
  });

  test('a large turn keeps the joint full: no collapse toward it', () => {
    const bones = body();
    const joint: Pt = [0, -50];
    // A ring round the joint, inside the blend, so every point is shared by both bones.
    const ring = Array.from({ length: 24 }, (_, i): Pt => {
      const a = (2 * Math.PI * i) / 24;
      return [joint[0] + 12 * Math.cos(a), joint[1] + 12 * Math.sin(a)];
    });
    const skin = bones.skin(ring, { chain: ['low', 'high'], blend: 25 });
    for (const turn of [1.2, 2.6, -3])
      skin.at(bones.pose({ high: { turn } })).forEach((p) => {
        expect(Math.abs(dist(p, joint) - 12)).toBeLessThan(1e-9);
      });
  });
});

describe('skin: pure', () => {
  test('the same pose bends the same, whatever was posed before; nothing given is written', () => {
    const outline = rounded(0, -50, 60, 110, 18);
    const kept = outline.map((p): Pt => [p[0], p[1]]);
    const frames = [
      { low: { turn: 0.1, along: 0.9 }, high: { turn: -0.4, across: 1.2 } },
      { high: { turn: 2 } },
      { low: { shift: [40, 3] } },
    ] as const;
    /** Pose `k` bent by a skeleton and skin of its own, built fresh. */
    const alone = (k: number) => {
      const bones = body();
      return bones
        .skin(outline, { chain: ['low', 'high'] }, { spacing: 4 })
        .at(bones.pose(frames[k] ?? {}));
    };
    const fresh = frames.map((_, k) => alone(k));
    // The poses differ, so a result carried over from another pose would show.
    expect(identical(fresh[0] ?? [], fresh[1] ?? [])).toBe(false);
    expect(identical(fresh[1] ?? [], fresh[2] ?? [])).toBe(false);
    // One skin posed in any order, by its own skeleton or a twin built the
    // same (bones are found by name), bends each pose as it bends alone.
    const bones = body();
    const twin = body();
    const skin = bones.skin(outline, { chain: ['low', 'high'] }, { spacing: 4 });
    for (const k of [1, 0, 2, 0, 1, 2]) {
      expect(identical(skin.at(bones.pose(frames[k] ?? {})), fresh[k] ?? [])).toBe(true);
      expect(identical(skin.at(twin.pose(frames[k] ?? {})), fresh[k] ?? [])).toBe(true);
    }
    expect(identical(outline, kept)).toBe(true);
  });
});

describe('skin: curves', () => {
  test('a curve bends through its own control points, which move with their anchors', () => {
    const bones = body();
    const controls: Pt[] = [
      [-20, 0],
      [-26, -50],
      [-18, -100],
      [18, -100],
      [26, -50],
      [20, 0],
    ];
    const pose = bones.pose({ high: { turn: 0.35 }, low: { along: 0.95 } });
    const curve = bones.skin(controls, { chain: ['low', 'high'] }, { smooth: 8 });
    const points = bones.skin(controls, { chain: ['low', 'high'] });
    const moved = points.at(pose);
    const drawn = curve.at(pose);
    expect(identical(drawn, spline(moved, 8, true))).toBe(true);
    moved.forEach((p, i) => expect(identical([drawn[i * 8] ?? [NaN, NaN]], [p])).toBe(true));
    expect(identical(curve.rest, controls)).toBe(true);
  });
});

describe('skin: drawn through piece', () => {
  test("the cut, the ink and the check's probe all see the bent outline", () => {
    const bones = body();
    const torso = bones.skin(
      rectShape(-20, -100, 40, 100),
      { chain: ['low', 'high'] },
      { spacing: 4 },
    );
    const drawn = (turn: number) => {
      const sink: ProbeSink = { texts: [], inks: [] };
      const { ctx } = recorder();
      probing(ctx, { sink, scene: 's', dx: 0, alpha: 1 }, () =>
        piece(
          ctx,
          torso.at(bones.pose({ high: { turn } })),
          { color: '#888888', role: 'figure', outline: '#111111', grain: 0, shadow: 0 },
          { boil: 0, seed: 3 },
        ),
      );
      return sink.inks;
    };
    const rest = drawn(0);
    const bent = drawn(0.5);
    expect(bent.map((m) => m.kind)).toEqual(['fill', 'stroke']);
    const right = (m: (typeof rest)[number] | undefined) => (m === undefined ? NaN : m.x + m.w);
    // At rest the 40-wide rect reaches x = 20 (and the cut's tear); the top
    // half turned 0.5 about (0, -50) swings its far corner out to x ≈ 41.5.
    const far = turned([20, -100], [0, -50], 0.5);
    for (const m of rest) expect(right(m)).toBeLessThan(23);
    for (const m of bent) {
      expect(right(m)).toBeGreaterThan(far[0] - 3);
      expect(right(m)).toBeLessThan(far[0] + 3);
    }
  });
});
