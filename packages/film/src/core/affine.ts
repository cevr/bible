// 2D affine transforms as the canvas reports them (`getTransform()`), for the
// lab's knob handles: where a knob read under a transform lands on the frame,
// and back. Pure and DOM-free.

import { Array as Arr, Option } from 'effect';
import type { Point } from './schema.ts';

/**
 * `[a, b, c, d, e, f]`, as `DOMMatrix` and `setTransform` take it: a point
 * `[x, y]` lands at `[a x + c y + e, b x + d y + f]`.
 */
export type Affine = readonly [number, number, number, number, number, number];

export const IDENTITY: Affine = [1, 0, 0, 1, 0, 0];

/** Where `p` lands under `m`. */
export const applyAffine = (m: Affine, p: Point): Point => [
  m[0] * p[0] + m[2] * p[1] + m[4],
  m[1] * p[0] + m[3] * p[1] + m[5],
];

/** The transform that undoes `m`; none when `m` squashes the plane flat. */
export const invertAffine = (m: Affine): Option.Option<Affine> => {
  const [a, b, c, d, e, f] = m;
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-12) return Option.none();
  return Option.some([
    d / det,
    -b / det,
    -c / det,
    a / det,
    (c * f - d * e) / det,
    (b * e - a * f) / det,
  ]);
};

/** The same transform, to within `eps` in every entry. */
export const sameAffine = (m: Affine, n: Affine, eps = 1e-6): boolean =>
  Arr.zipWith(m, n, (v, w) => Math.abs(v - w) <= eps).every(Boolean);
