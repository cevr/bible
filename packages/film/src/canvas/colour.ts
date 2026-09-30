// Colours as a film writes them: hex, `#rrggbb` (or `#rgb`). A colour between
// two, and a colour's own fully clear shade for a gradient to fade into. Any
// other colour (a name, `rgb(…)`, hex with alpha) is refused, named: read as
// hex it would make a NaN fill a canvas ignores, or a stop it refuses.

import { clamp, lerp } from '../core/time.ts';

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** The red, green and blue of a hex colour, 0..255 each, written into `out`; throws naming any other colour. */
export const rgbOf = (out: [number, number, number], hex: string): [number, number, number] => {
  if (!HEX.test(hex)) throw new Error(`colour "${hex}" is not #rgb or #rrggbb hex`);
  const short = hex.length === 4;
  for (let i = 0; i < 3; i++) {
    const at = short ? 1 + i : 1 + i * 2;
    const digits = short ? hex[at]?.repeat(2) : hex.slice(at, at + 2);
    out[i] = Number.parseInt(digits ?? '0', 16);
  }
  return out;
};

/** Scratch for the two ends of a `mix`, read within one call. */
const A: [number, number, number] = [0, 0, 0];
const B: [number, number, number] = [0, 0, 0];

/** Two hex digits for a channel, 0..255. */
const hex2 = (v: number) => Math.round(v).toString(16).padStart(2, '0');

/** A colour `t` (0..1, clamped) of the way from hex colour `a` to `b`, as `#rrggbb`. */
export const mix = (a: string, b: string, t: number): string => {
  rgbOf(A, a);
  rgbOf(B, b);
  const k = clamp(t);
  return `#${hex2(lerp(A[0], B[0], k))}${hex2(lerp(A[1], B[1], k))}${hex2(lerp(A[2], B[2], k))}`;
};

/** Hex colour `color` fully clear: what a glow fades into at its rim, the same colour at alpha 0. */
export const clearOf = (color: string): string => {
  rgbOf(A, color);
  return `rgba(${A[0]}, ${A[1]}, ${A[2]}, 0)`;
};
