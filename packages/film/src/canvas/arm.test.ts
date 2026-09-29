import { describe, expect, test } from 'bun:test';
import { type ArmStyle, GRIPS, arm, handAt, strip } from './arm.ts';
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
