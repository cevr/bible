import { describe, expect, test } from 'bun:test';

import { COARSE_POINTER, LESS_MOTION, raysTurn } from './query.ts';
import { ASPECT, SUN, sunLight, TURN, turnAt } from './sun.ts';

/** A seeded draw in [0, 1). */
const draws = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
};

/** Times drawn from a seed: within a period, many periods on, and a tab left open for days. */
const times = (seed: number, count: number) => {
  const draw = draws(seed);
  return Array.from(
    { length: count },
    (_, n) => draw() * ([TURN.period, 50 * TURN.period, 3e5][n % 3] ?? 1),
  );
};

/** A browser that matches exactly the queries it is given. */
const matching =
  (...matched: ReadonlyArray<string>) =>
  (query: string) =>
    matched.includes(query);

/** The sun's light at `d` widths out of its centre, toward `angle`. */
const along = (angle: number, d: number) =>
  sunLight(SUN.u + Math.cos(angle) * d, SUN.v + Math.sin(angle) * d * ASPECT);

describe('the light from the sun', () => {
  test('is brightest at the sun and falls off along a ray as it goes', () => {
    expect(along(-2.47, SUN.radius)).toBeGreaterThan(along(-2.47, 0.2));
    expect(along(-2.47, 0.2)).toBeGreaterThan(along(-2.47, 0.6));
  });

  test('never grows brighter as it goes out of the sun, in any direction', () => {
    const grows: Array<string> = [];
    for (let a = 0; a < 360; a++) {
      const angle = (a / 180) * Math.PI - Math.PI;
      let last = along(angle, SUN.radius);
      for (let d = SUN.radius; d < 2; d += 0.005) {
        const here = along(angle, d);
        if (here > last + 1e-12) grows.push(`angle=${angle.toFixed(3)} d=${d.toFixed(3)}`);
        last = here;
      }
    }
    expect(grows).toEqual([]);
  });
});

describe('the rays’ turn', () => {
  test('stays within the swing at every time, and reaches both ends of it', () => {
    const outside = times(0x5eed, 3000).filter((t) => Math.abs(turnAt(t, true)) > TURN.swing);
    expect(outside).toEqual([]);
    const turns = Array.from({ length: 600 }, (_, n) => turnAt((n / 600) * TURN.period, true));
    expect(Math.max(...turns)).toBeCloseTo(TURN.swing, 4);
    expect(Math.min(...turns)).toBeCloseTo(-TURN.swing, 4);
  });

  test('is subtle: a few degrees each way over most of a minute or more, never a spin', () => {
    expect(TURN.swing).toBeGreaterThan(0);
    expect(TURN.swing).toBeLessThanOrEqual((5 / 180) * Math.PI);
    expect(TURN.period).toBeGreaterThanOrEqual(40);
    expect(TURN.period).toBeLessThanOrEqual(90);
  });

  test('starts at the still’s angles', () => {
    expect(turnAt(0, true)).toBe(0);
  });

  test('is 0 at every time under less motion or a coarse pointer, and turns otherwise', () => {
    for (const media of [
      matching(LESS_MOTION),
      matching(COARSE_POINTER),
      matching(LESS_MOTION, COARSE_POINTER),
    ])
      expect(times(0xa11, 300).filter((t) => turnAt(t, raysTurn(media)) !== 0)).toEqual([]);
    expect(raysTurn(matching())).toBe(true);
    expect(turnAt(TURN.period / 4, raysTurn(matching()))).toBeCloseTo(TURN.swing, 9);
  });
});
