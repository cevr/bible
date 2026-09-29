import { describe, expect, test } from 'bun:test';
import {
  type ArmStyle,
  CLOSE_SPAN,
  type CloseShape,
  GRIPS,
  arm,
  closeShape,
  handAt,
  palmUpFrame,
  strip,
  turning,
} from './arm.ts';
import type { Pt } from './ink.ts';

const SHOULDER: Pt = [17, -111];
const HAND = { boil: 0, seed: 1 };
const STYLE: ArmStyle = {
  body: '#888888',
  skin: '#999999',
  outline: '#111111',
  width: [13, 8],
  length: 78,
  mitten: 22,
  line: 2.5,
};

/** A copy of the strip's centre line: `strip` writes into one buffer it reuses. */
const centre = (to: Pt, grow: number, away: -1 | 1 = 1): Pt[] =>
  strip(SHOULDER, to, grow, away, STYLE.length).map(([x, y]): Pt => [x, y]);

/** The furthest any point of the centre line moved between two strips. */
const moved = (a: ReadonlyArray<Pt>, b: ReadonlyArray<Pt>) =>
  Math.max(...a.map((p, i) => Math.hypot(p[0] - (b[i]?.[0] ?? 0), p[1] - (b[i]?.[1] ?? 0))));

/** A context that records every call and every write made on it. */
const recording = () => {
  const calls: string[] = [];
  const ctx = new Proxy(
    {},
    {
      get: (_, key) => {
        calls.push(String(key));
        return () => undefined;
      },
      set: (_, key) => {
        calls.push(`set ${String(key)}`);
        return true;
      },
    },
  ) as CanvasRenderingContext2D;
  return { ctx, calls };
};

describe('strip', () => {
  test('never flips: a target swept across the shoulder line moves the arm a little at a time', () => {
    // Round the shoulder at arm's length, through the tie straight out and
    // straight up, and across the body: each small step of the target moves
    // the strip by about as much, never by a jump.
    const STEPS = 720;
    for (const r of [30, 45, 70, 110]) {
      let before = centre([SHOULDER[0] + r, SHOULDER[1]], 1);
      for (let i = 1; i <= STEPS; i++) {
        const a = (2 * Math.PI * i) / STEPS;
        const to: Pt = [SHOULDER[0] + r * Math.cos(a), SHOULDER[1] + r * Math.sin(a)];
        const now = centre(to, 1);
        const step = r * ((2 * Math.PI) / STEPS);
        expect(moved(before, now)).toBeLessThan(6 * step);
        before = now;
      }
    }
    // And along a straight sweep through the shoulder's own height.
    let last = centre([SHOULDER[0] + 80, SHOULDER[1] + 40], 1);
    for (let y = 39; y >= -40; y--) {
      const now = centre([SHOULDER[0] + 80, SHOULDER[1] + y], 1);
      expect(moved(last, now)).toBeLessThan(6);
      last = now;
    }
  });

  test('bows down and away from the body', () => {
    // Straight out to the side (away +x): the strip sags below the line.
    const out = centre([SHOULDER[0] + 60, SHOULDER[1]], 1);
    const mid = out[Math.floor(out.length / 2)] ?? SHOULDER;
    expect(mid[1]).toBeGreaterThan(SHOULDER[1]);
    // Straight up: it bows away, to +x for the arm whose away side is +x, to −x for the other.
    const up = centre([SHOULDER[0], SHOULDER[1] - 60], 1, 1);
    expect((up[Math.floor(up.length / 2)] ?? SHOULDER)[0]).toBeGreaterThan(SHOULDER[0]);
    const upFar = centre([SHOULDER[0], SHOULDER[1] - 60], 1, -1);
    expect((upFar[Math.floor(upFar.length / 2)] ?? SHOULDER)[0]).toBeLessThan(SHOULDER[0]);
    // Up and in over the head (look's stack): still out, never hooked over the head.
    const over: Pt = [SHOULDER[0] - 20, SHOULDER[1] - 50];
    const lifted = centre(over, 1, 1);
    const bend = lifted[Math.floor(lifted.length / 2)] ?? SHOULDER;
    expect(bend[0]).toBeGreaterThan((SHOULDER[0] + over[0]) / 2);
    // Down across the belly (word's unshrug): it sags below the line, not up into the chest.
    const across: Pt = [SHOULDER[0] - 40, SHOULDER[1] + 55];
    const hung = centre(across, 1, 1);
    const sag = hung[Math.floor(hung.length / 2)] ?? SHOULDER;
    const [lx, ly] = [(SHOULDER[0] + across[0]) / 2, (SHOULDER[1] + across[1]) / 2];
    expect(
      (across[0] - SHOULDER[0]) * (sag[1] - ly) - (across[1] - SHOULDER[1]) * (sag[0] - lx),
    ).toBeLessThan(0);
  });

  test('its length follows the target: grown, the hand lands on it, near or far', () => {
    for (const d of [12, 40, 70, 120, 260]) {
      const to: Pt = [SHOULDER[0] + d * 0.6, SHOULDER[1] - d * 0.8];
      const tip = centre(to, 1).at(-1) ?? SHOULDER;
      expect(tip[0]).toBeCloseTo(to[0], 6);
      expect(tip[1]).toBeCloseTo(to[1], 6);
    }
  });

  test('grows continuously from the shoulder: at 0 it is only the shoulder', () => {
    const to: Pt = [90, -60];
    for (const p of centre(to, 0)) {
      expect(p[0]).toBeCloseTo(SHOULDER[0], 9);
      expect(p[1]).toBeCloseTo(SHOULDER[1], 9);
    }
    let before = centre(to, 0);
    for (let i = 1; i <= 100; i++) {
      const now = centre(to, i / 100);
      expect(moved(before, now)).toBeLessThan(2.5);
      before = now;
    }
  });
});

describe('arm', () => {
  test('grow 0 draws nothing, whatever the target', () => {
    const { ctx, calls } = recording();
    arm(ctx, SHOULDER, 1, { to: [90, -60], grow: 0 }, STYLE, HAND);
    arm(ctx, SHOULDER, -1, { to: [-90, -160], grow: -0.2, grip: 'point' }, STYLE, HAND);
    expect(calls).toEqual([]);
  });

  test('its hand is on the target once grown, and part way along the strip while growing', () => {
    for (const grip of GRIPS) {
      const to: Pt = [90, -60];
      expect(handAt(SHOULDER, 1, { to, grow: 1, grip }, STYLE)).toEqual(to);
      const half = handAt(SHOULDER, 1, { to, grow: 0.5, grip }, STYLE);
      expect(Math.hypot(half[0] - to[0], half[1] - to[1])).toBeGreaterThan(10);
      expect(Math.hypot(half[0] - SHOULDER[0], half[1] - SHOULDER[1])).toBeGreaterThan(10);
    }
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
    // Its hand is still where the arm ends: what it holds rides the palm's middle.
    expect(handAt(SHOULDER, 1, { to, grow: 1, turn: 1 }, STYLE)).toEqual(to);
  });
});
