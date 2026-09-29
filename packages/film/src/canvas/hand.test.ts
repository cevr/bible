import { describe, expect, test } from 'bun:test';
import {
  CLOSE_SPAN,
  type CloseShape,
  GRIPS,
  type Gesture,
  type HandRoot,
  type HandStyle,
  breathOf,
  closeShape,
  handAt,
  handShape,
  palmUpFrame,
  turning,
} from './hand.ts';
import { BOIL_FPS, type Pt } from './ink.ts';

const SHOULDER: Pt = [17, -111];
/** A near hand floating at rest beside the hip, the figure's breath held. */
const NEAR: HandRoot = { shoulder: SHOULDER, rest: [42, -50], away: 1, breath: 0 };
const FAR: HandRoot = { shoulder: [-17, -111], rest: [-42, -50], away: -1, breath: 0 };
const STYLE: HandStyle = {
  skin: '#999999',
  outline: '#111111',
  mitten: 22,
  line: 2.5,
  radius: 120,
};

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** The furthest any point moved between two point lists, point for point. */
const moved = (a: ReadonlyArray<Pt>, b: ReadonlyArray<Pt>) =>
  Math.max(...a.map((p, i) => Math.hypot(p[0] - (b[i]?.[0] ?? 0), p[1] - (b[i]?.[1] ?? 0))));

/** The hand's path from its rest to `to`, `n` steps of reach. */
const path = (root: HandRoot, to: Pt, n = 400, grip?: Gesture['grip']): Pt[] =>
  Array.from({ length: n + 1 }, (_, k) => handAt(root, { to, reach: k / n, grip }, STYLE));

/** Targets a figure's hands work at: out, up, over the head, across the chest, down across the belly, far out. */
const TARGETS: ReadonlyArray<Pt> = [
  [90, -60],
  [60, -190],
  [0, -230],
  [-20, -85],
  [-23, -56],
  [118, -112],
  [-78, -205],
];

describe('a floating hand', () => {
  test('rests at its spot, bobbing only with the breath, and still once at work', () => {
    expect(handAt(NEAR, undefined, STYLE)).toEqual(NEAR.rest);
    expect(handAt(NEAR, { to: [90, -60], reach: 0 }, STYLE)).toEqual(NEAR.rest);
    for (const breath of [-1, 1]) {
      const [x, y] = handAt({ ...NEAR, breath }, undefined, STYLE);
      expect(x).toBeCloseTo(NEAR.rest[0], 9);
      // A small bob, up and down with the breath, never a drift away.
      expect(Math.sign(y - NEAR.rest[1])).toBe(breath);
      expect(Math.abs(y - NEAR.rest[1])).toBeLessThan(0.1 * STYLE.mitten);
      // At work it holds still on what it works at.
      const at = handAt({ ...NEAR, breath }, { to: [90, -60], reach: 1 }, STYLE);
      expect(at[0]).toBeCloseTo(90, 9);
      expect(at[1]).toBeCloseTo(-60, 9);
    }
  });

  test('breathes slowly on the boil clock, each figure in its own phase', () => {
    let before = breathOf({ boil: 0, seed: 7 });
    for (let boil = 1; boil <= 10 * BOIL_FPS; boil++) {
      const now = breathOf({ boil, seed: 7 });
      expect(Math.abs(now)).toBeLessThanOrEqual(1);
      expect(Math.abs(now - before)).toBeLessThan(0.2);
      before = now;
    }
    expect(breathOf({ boil: 0, seed: 7 })).not.toBeCloseTo(breathOf({ boil: 0, seed: 8 }), 3);
  });

  test('lands on its target once it has travelled there, whatever its grip or side', () => {
    for (const root of [NEAR, FAR])
      for (const grip of GRIPS)
        for (const to of TARGETS) {
          const at = handAt(root, { to, reach: 1, grip }, STYLE);
          expect(at[0]).toBeCloseTo(to[0], 9);
          expect(at[1]).toBeCloseTo(to[1], 9);
        }
  });

  test('travels a soft arc round its shoulder, never a straight line', () => {
    const to: Pt = [60, -150];
    const half = handAt(NEAR, { to, reach: 0.5 }, STYLE);
    const straight: Pt = [(NEAR.rest[0] + to[0]) / 2, (NEAR.rest[1] + to[1]) / 2];
    expect(dist(half, straight)).toBeGreaterThan(10);
    // Swung out round the shoulder, away from the body, not in across it.
    expect(half[0]).toBeGreaterThan(straight[0]);
  });

  test('moves a little at a time: no pop from rest to work, or back', () => {
    for (const root of [NEAR, FAR])
      for (const to of TARGETS) {
        const steps = path(root, to);
        for (let k = 1; k < steps.length; k++)
          expect(dist(steps[k - 1] ?? to, steps[k] ?? to)).toBeLessThan(2);
      }
  });

  test('keeps within its reach: never farther from its shoulder than its rest or its target, but for the settle', () => {
    for (const root of [NEAR, FAR])
      for (const to of TARGETS) {
        const most = Math.max(dist(root.rest, root.shoulder), dist(to, root.shoulder));
        for (const p of path(root, to))
          expect(dist(p, root.shoulder)).toBeLessThanOrEqual(most + 0.4 * STYLE.mitten);
      }
  });

  test('settles: swings a little past its reach just before it arrives, then lands', () => {
    const to: Pt = [90, -60];
    const steps = path(NEAR, to);
    const reach = dist(to, SHOULDER);
    const past = Math.max(...steps.slice(240).map((p) => dist(p, SHOULDER)));
    expect(past).toBeGreaterThan(reach + 0.12 * STYLE.mitten);
    expect(dist(steps.at(-1) ?? SHOULDER, to)).toBeLessThan(1e-9);
  });

  test('never passes over its own head', () => {
    const HEAD: Pt = [0, -165];
    for (const root of [NEAR, FAR])
      for (const to of TARGETS)
        for (const p of path(root, to)) expect(dist(p, HEAD)).toBeGreaterThan(38);
  });

  test('never flips: a target swept round the shoulder moves the hand on its way a little at a time', () => {
    // Round the shoulder at arm's length, all but where the head is (up and
    // in, where no hand reaches): a small step of the target moves the hand
    // half way there by about as much, never by a jump.
    const STEPS = 720;
    for (const root of [NEAR, FAR]) {
      const head = root.away === 1 ? (-3 * Math.PI) / 4 : -Math.PI / 4;
      for (const r of [40, 70, 110]) {
        let before: Pt | undefined;
        for (let i = 0; i <= STEPS; i++) {
          const a = head + 0.35 + ((2 * Math.PI - 0.7) * i) / STEPS;
          const [sx, sy] = root.shoulder;
          const to: Pt = [sx + r * Math.cos(a), sy + r * Math.sin(a)];
          const now = handAt(root, { to, reach: 0.5 }, STYLE);
          if (before !== undefined) expect(dist(before, now)).toBeLessThan(3);
          before = now;
        }
      }
    }
  });
});

/** A copy of a mitten's palm outline: `handShape` writes into a buffer it reuses. */
const shapeOf = (g: Gesture | undefined, s: number): Pt[] =>
  handShape(g, s).map(([x, y]): Pt => [x, y]);

describe("a hand's grip", () => {
  const TO: Pt = [90, -60];
  /** In unit shape: a step moving any point more than this is a frame that swaps a grip. */
  const STEP = 0.02;

  test('forms from the open rest as it arrives, as before, when it names no grip it was', () => {
    for (const grip of GRIPS) {
      expect(shapeOf({ to: TO, reach: 0, grip }, 0)).toEqual(shapeOf(undefined, 0));
      expect(shapeOf({ to: TO, reach: 1, grip }, 1)).toEqual(
        shapeOf({ to: TO, reach: 1, grip: 'hold', was: grip, change: 0 }, 1),
      );
    }
  });

  test('morphs from the grip it was into its new one, point for point, never swapped in a frame', () => {
    const N = 100;
    for (const was of GRIPS)
      for (const grip of GRIPS) {
        const start = shapeOf({ to: TO, reach: 1, grip: was }, 1);
        const end = shapeOf({ to: TO, reach: 1, grip }, 1);
        let before = shapeOf({ to: TO, reach: 1, grip, was, change: 0 }, 1);
        expect(before).toEqual(start);
        for (let k = 1; k <= N; k++) {
          const now = shapeOf({ to: TO, reach: 1, grip, was, change: k / N }, 1);
          expect(moved(before, now)).toBeLessThan(STEP);
          before = now;
        }
        expect(moved(before, end)).toBeLessThan(1e-9);
      }
  });

  test('stays smooth whichever way the hand goes: arriving, changing, and going home changed', () => {
    // Out to its work holding, the grip changes to open, then back home: the
    // travel and the change each move the mitten a little a frame.
    const N = 100;
    const frames: Array<[number, number]> = [
      ...Array.from({ length: N + 1 }, (_, k): [number, number] => [k / N, 0]),
      ...Array.from({ length: N + 1 }, (_, k): [number, number] => [1, k / N]),
      ...Array.from({ length: N + 1 }, (_, k): [number, number] => [1 - k / N, 1]),
    ];
    let before: Pt[] | undefined;
    for (const [reach, change] of frames) {
      const now = shapeOf({ to: TO, reach, grip: 'open', was: 'point', change }, reach);
      if (before !== undefined) expect(moved(before, now)).toBeLessThan(STEP * 2);
      before = now;
    }
    expect(moved(before ?? [], shapeOf(undefined, 0))).toBeLessThan(1e-9);
  });
});

/** A copy of an outline: `closeShape` writes into buffers it reuses. */
const copy = (pts: ReadonlyArray<Pt>): Pt[] => pts.map(([x, y]): Pt => [x, y]);

/** The nearest distance from `p` to the closed outline `poly`. */
const toOutline = (p: Pt, poly: ReadonlyArray<Pt>) => {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i] ?? p;
    const b = poly[(i + 1) % poly.length] ?? p;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    const t =
      l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
    best = Math.min(best, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy));
  }
  return best;
};

/** How far apart two closed outlines are as shapes (however their points are numbered): the farther of the two one-way distances. */
const apart = (a: ReadonlyArray<Pt>, b: ReadonlyArray<Pt>) =>
  Math.max(...a.map((p) => toOutline(p, b)), ...b.map((p) => toOutline(p, a)));

/** Whether `p` lies inside the closed outline `poly`. */
const inside = (p: Pt, poly: ReadonlyArray<Pt>) => {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i] ?? p;
    const b = poly[j] ?? p;
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      hit = !hit;
  }
  return hit;
};

/** The largest turn (radians) between two neighbouring edges of a closed outline: its sharpest corner. */
const sharpest = (poly: ReadonlyArray<Pt>) => {
  let worst = 0;
  const n = poly.length - 1; // the last point closes onto the first
  for (let i = 0; i < n; i++) {
    const a = poly[(i + n - 1) % n] ?? [0, 0];
    const b = poly[i] ?? [0, 0];
    const c = poly[(i + 1) % n] ?? [0, 0];
    const u = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const v = Math.atan2(c[1] - b[1], c[0] - b[0]);
    const turn = Math.abs(((v - u + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
    // A straight run between two balls has no corner at its ends.
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 1e-6 && Math.hypot(c[0] - b[0], c[1] - b[1]) > 1e-6)
      worst = Math.max(worst, turn);
  }
  return worst;
};

interface Taken {
  readonly fingers: Pt[];
  readonly thumb: Pt[];
  readonly creases: Pt[][];
  readonly scalars: readonly number[];
}
const take = (s: CloseShape): Taken => ({
  fingers: copy(s.fingers),
  thumb: copy(s.thumb),
  creases: s.creases.map(copy),
  scalars: [s.curl, s.over, s.creaseInk],
});

/** The palm's middle, where a light or the gifts are laid. */
const PALM_MIDDLE: Pt = [0, 0];
const top = (pts: ReadonlyArray<Pt>) => Math.min(...pts.map((p) => p[1]));
const bottom = (pts: ReadonlyArray<Pt>) => Math.max(...pts.map((p) => p[1]));

describe('closeShape', () => {
  test('the curl is continuous: from open to closed no frame pops', () => {
    // A hand closing over two seconds at 60 fps moves 1/120 of the range a
    // frame; step ten times finer and nothing may move more than a few units.
    const STEPS = 1200;
    let before = take(closeShape(1));
    for (let i = 1; i <= STEPS; i++) {
      const now = take(closeShape(1 - i / STEPS));
      expect(apart(before.fingers, now.fingers)).toBeLessThan(4);
      expect(apart(before.thumb, now.thumb)).toBeLessThan(4);
      for (const [k, c] of now.creases.entries())
        expect(moved(before.creases[k] ?? c, c)).toBeLessThan(4);
      // The ink and paper that come in as the fingers come over the palm come in gradually.
      for (const [k, v] of now.scalars.entries())
        expect(Math.abs(v - (before.scalars[k] ?? v))).toBeLessThan(0.03);
      before = now;
    }
  });

  test('open, the fingers run on up the frame past the palm; closing, they come back down over it and the thumb comes in', () => {
    const open = take(closeShape(1));
    const shut = take(closeShape(0));
    const reach = (pts: ReadonlyArray<Pt>) => Math.max(...pts.map((p) => p[0]));
    // Open: the fingers run on up past the knuckles, no ink over the palm, the joints showing.
    expect(top(open.fingers)).toBeLessThan(top(copy(closeShape(1).palm)) - 150);
    expect(open.scalars).toEqual([0, 0, 1]);
    // Closed: their round tip lies back down over the palm, its edge inked, the joints turned away.
    expect(bottom(shut.fingers)).toBeGreaterThan(0);
    expect(top(shut.fingers)).toBeGreaterThan(top(open.fingers) + 100);
    expect(shut.scalars).toEqual([1, 1, 0]);
    // The thumb comes in toward the fingers.
    expect(reach(shut.thumb)).toBeGreaterThan(reach(open.thumb));
  });

  test('the palm is the biggest shape', () => {
    const area = (poly: ReadonlyArray<Pt>) =>
      Math.abs(
        poly.reduce((s, a, i) => {
          const b = poly[(i + 1) % poly.length] ?? a;
          return s + a[0] * b[1] - b[0] * a[1];
        }, 0) / 2,
      );
    const s = closeShape(1);
    expect(area(s.palm)).toBeGreaterThan(area(s.fingers));
    expect(area(s.palm)).toBeGreaterThan(area(s.thumb));
  });

  test('round everywhere: no bend of the fingers shows a square corner', () => {
    for (let open = 1; open >= 0; open -= 0.05)
      expect(sharpest(closeShape(open).fingers)).toBeLessThan(Math.PI / 6);
  });

  test('a cup, not a lid: through the film deepest curl the palm middle stays uncovered', () => {
    for (let open = 1; open >= 0.45; open -= 0.01)
      expect(inside(PALM_MIDDLE, closeShape(open).fingers)).toBe(false);
  });
});

describe('the palm-up turn', () => {
  test('turns like a card: the length along the fingers narrows to the edge and back, the shape changing only there', () => {
    const STEPS = 1000;
    let before = turning(0);
    expect(before.along).toBe(1);
    expect(before.cup).toBe(false);
    let edge = 1;
    for (let i = 1; i <= STEPS; i++) {
      const now = { ...turning(i / STEPS) };
      expect(Math.abs(now.along - before.along)).toBeLessThan(0.01);
      if (now.cup !== before.cup) {
        // The grip gives way to the palm-up shape only where the hand is edge on.
        expect(now.along).toBeLessThan(0.21);
        edge = Math.min(edge, now.along);
      }
      before = now;
    }
    expect(edge).toBeLessThan(0.21);
    expect(before.along).toBeCloseTo(1, 9);
    expect(before.cup).toBe(true);
  });

  test('turned palm up, the hand is the close-up at the mitten size: its palm middle on the target, fingers up, thumb on the mitten side', () => {
    const to: Pt = [60, -150];
    const apply = (m: Readonly<number[]>, [x, y]: Pt): Pt => [
      (m[0] ?? 0) * x + (m[2] ?? 0) * y + (m[4] ?? 0),
      (m[1] ?? 0) * x + (m[3] ?? 0) * y + (m[5] ?? 0),
    ];
    for (const away of [1, -1] as const) {
      const m = [...palmUpFrame(to, -Math.PI / 2, STYLE.mitten, away)];
      // The palm's middle on the target.
      const middle = apply(m, [0, 0]);
      expect(middle[0]).toBeCloseTo(to[0], 9);
      expect(middle[1]).toBeCloseTo(to[1], 9);
      // Heel to fingertips is the mitten's length, straight up.
      const tip = apply(m, [0, -CLOSE_SPAN]);
      expect(tip[0]).toBeCloseTo(to[0], 9);
      expect(tip[1]).toBeCloseTo(to[1] - STYLE.mitten, 9);
      // The thumb (−x in the close-up) lies on the side away from the arm, as
      // the close-up's does when its forearm comes in from that arm's side.
      expect(Math.sign(apply(m, [-CLOSE_SPAN, 0])[0] - to[0])).toBe(-away);
    }
    // Still facing along the arm, the same shape: a rotation and a uniform scale.
    const m = palmUpFrame(to, 0.4, STYLE.mitten, 1);
    expect(Math.hypot(m[0], m[1])).toBeCloseTo(Math.hypot(m[2], m[3]), 9);
    expect(m[0] * m[2] + m[1] * m[3]).toBeCloseTo(0, 9);
    // Turned, the hand is still on its target: what it holds rides the palm's middle.
    const turned = handAt(NEAR, { to, reach: 1, turn: 1 }, STYLE);
    expect(turned[0]).toBeCloseTo(to[0], 9);
    expect(turned[1]).toBeCloseTo(to[1], 9);
  });
});
