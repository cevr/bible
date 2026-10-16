import { describe, expect, test } from 'bun:test';
import { K1 } from './direction.ts';
import { type K, LIGHT, type Pt, creaseOf, figure, reachAbout } from './parts.ts';
import { ids } from './rml.ts';

// The parts every figure is built from, whatever the art direction. What a
// direction changes is checked for every option in `direction-*.test.ts`.

describe('the figure parts', () => {
  test('an outline crawls: no point moves more than a fifth of its wander a tick, round the loop too', () => {
    const fig = figure(ids(), 'Test', 7, 0, K1);
    fig.boil('piece', [[3, 4]], 1);
    const { x = [], y = [] } = fig.boilTracks()['piece.0'] ?? {};
    expect(x).toHaveLength(48);
    const step = (keys: ReadonlyArray<K>) =>
      Math.max(...keys.map(([, v], i) => Math.abs((keys[(i + 1) % keys.length]?.[1] ?? v) - v)));
    expect(step(x)).toBeLessThanOrEqual(0.21);
    expect(step(y)).toBeLessThanOrEqual(0.21);
    for (const [, v] of x) expect(Math.abs(v - 3)).toBeLessThanOrEqual(1);
  });

  test('the crease runs along the one light, from the upper left', () => {
    const { start, end, at } = creaseOf({ x0: -10, y0: -20, x1: 30, y1: 40 });
    expect(Math.atan2(end[1] - start[1], end[0] - start[0])).toBeCloseTo(LIGHT.toward);
    expect(start[0]).toBeLessThan(end[0]);
    expect(start[1]).toBeLessThan(end[1]);
    expect(at).toBe(LIGHT.crease);
  });
});

describe('reachAbout', () => {
  const shoulder: Pt = [0, 0];
  const rest: Pt = [0, 100];
  const to: Pt = [100, 0];

  test('starts at rest and ends on what it reaches for', () => {
    for (const [reach, at] of [
      [0, rest],
      [1, to],
    ] as const) {
      const [x, y] = reachAbout(shoulder, rest, to, reach);
      expect(x).toBeCloseTo(at[0]);
      expect(y).toBeCloseTo(at[1]);
    }
  });

  test('travels round the shoulder, bowed away from the straight line between', () => {
    const [x, y] = reachAbout(shoulder, rest, to, 0.5);
    expect(Math.hypot(x, y)).toBeCloseTo(100);
    // The chord's midpoint is (50, 50), about 70.7 from the shoulder.
    expect(Math.hypot(x, y)).toBeGreaterThan(Math.hypot(50, 50));
  });

  test('holds its reach to 0..1', () => {
    expect(reachAbout(shoulder, rest, to, -1)).toEqual(reachAbout(shoulder, rest, to, 0));
    expect(reachAbout(shoulder, rest, to, 2)).toEqual(reachAbout(shoulder, rest, to, 1));
  });
});
