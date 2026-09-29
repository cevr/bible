// Plane polygons, pure and DOM-free: the check's collisions (`film check`) and
// the probe's hands (whether a hand lies inside its own body) ask the same
// question of a shape.

import { Array as Arr } from 'effect';
import type { Point } from './schema.ts';

/** Whether `p` lies inside the polygon `poly` (even-odd; any winding, convex or not). */
export const insidePolygon = (poly: ReadonlyArray<Point>, p: Point): boolean =>
  poly.reduce((inside, a, i) => {
    const b = Arr.getUnsafe(poly, (i + poly.length - 1) % poly.length);
    const crosses =
      a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0];
    return crosses !== inside;
  }, false);
