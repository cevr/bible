import { describe, expect, test } from 'bun:test';

import { ASPECT, SUN, sunLight } from './sun.ts';

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
