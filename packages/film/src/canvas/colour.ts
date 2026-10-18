// Colours as a film writes them: hex, `#rrggbb` (or `#rgb`). A colour between
// two, and a colour's own fully clear shade for a gradient to fade into. Any
// other colour (a name, `rgb(…)`, hex with alpha) is refused, named: read as
// hex it would make a NaN fill a canvas ignores, or a stop it refuses.

import { clamp, lerp } from '../core/time.ts';

/**
 * A colour as a film writes it: `#rgb` or `#rrggbb`. The type keeps a name or
 * `rgb(…)` out where it is written; `rgbOf` still refuses one that reaches it
 * computed.
 */
export type Hex = `#${string}`;

/** A colour fully clear, as `clearOf` writes it: a gradient's stop to fade into. */
export type Clear = `rgba(${number}, ${number}, ${number}, 0)`;

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** The red, green and blue of a hex colour, 0..255 each, written into `out`; throws naming any other colour. */
const rgbOf = (out: [number, number, number], hex: Hex): [number, number, number] => {
  if (!HEX.test(hex)) throw new Error(`colour "${hex}" is not #rgb or #rrggbb hex`);
  const short = hex.length === 4;
  for (let i = 0; i < 3; i++) {
    const at = short ? 1 + i : 1 + i * 2;
    const digits = short ? hex[at]?.repeat(2) : hex.slice(at, at + 2);
    out[i] = Number.parseInt(digits ?? '0', 16);
  }
  return out;
};

/** The red, green and blue of hex colour `hex`, 0..255 each, as a new triple; throws naming any other colour. */
export const channelsOf = (hex: Hex): [number, number, number] => rgbOf([0, 0, 0], hex);

/** Scratch for the two ends of a `mix`, read within one call. */
const A: [number, number, number] = [0, 0, 0];
const B: [number, number, number] = [0, 0, 0];

/** Two hex digits for a channel, 0..255. */
const hex2 = (v: number) => Math.round(v).toString(16).padStart(2, '0');

/** A colour `t` (0..1, clamped) of the way from hex colour `a` to `b`, as `#rrggbb`. */
export const mix = (a: Hex, b: Hex, t: number): Hex => {
  rgbOf(A, a);
  rgbOf(B, b);
  const k = clamp(t);
  return `#${hex2(lerp(A[0], B[0], k))}${hex2(lerp(A[1], B[1], k))}${hex2(lerp(A[2], B[2], k))}`;
};

/** Hex colour `color` fully clear: what a glow fades into at its rim, the same colour at alpha 0. */
export const clearOf = (color: Hex): Clear => {
  rgbOf(A, color);
  return `rgba(${A[0]}, ${A[1]}, ${A[2]}, 0)`;
};

// ─── ramps: shading with colour (CRAFT rule 12) ──────────────────────────────

/**
 * A colour's ramp under one key light (`ramp`): its shade, a darker hue turned
 * toward the light's complement and never the base dimmed; the base; and its
 * light, a lighter hue leaning to the light's own and never grey.
 */
export interface Ramp {
  readonly shade: Hex;
  readonly base: Hex;
  readonly light: Hex;
}

/**
 * How a look shades: `ramp`'s knobs, tuned on its stills. In CIE LCh (D65):
 * lightness 0..100, chroma, hue in degrees. No knob goes under CRAFT 12's
 * floors (`FLOORS`): `ramp` refuses knobs that do, so a look tuned by eye
 * can never shade grey or leave a shade unturned.
 */
export interface Shading {
  /**
   * Degrees a strong colour's shade turns toward the key's complement, and
   * its light toward the key's hue; at least `FLOORS.turn`. A near-neutral
   * turns further (`deep` and `neutral` for a shade, `warm` and `fade` for a
   * light), since it has little hue of its own to keep.
   */
  readonly turn: number;
  /** The share of its lightness a shade loses; from `FLOORS.step` to `FLOORS.darkest`. */
  readonly dark: number;
  /** The share of the way to white a light rises; at least `FLOORS.step`. */
  readonly lift: number;
  /**
   * The least chroma a shade carries (at least `FLOORS.chroma`), so a grey's
   * shade is the complement at this chroma. A colour below twice it is that
   * much near-neutral: at `deep` it turns past `turn` by `neutral` of the
   * rest of the way, rising to all of it at chroma 0; at twice `deep`, by
   * `turn` alone.
   */
  readonly deep: number;
  /**
   * How far a near-neutral shade turns past `turn`, as a share (0..1) of
   * the rest of the way to the key's complement: 1 lands it on the
   * complement (a warm grey's shade a slate blue under a pale gold), less
   * stops it short (a lavender). A hueless grey turns all the way whatever
   * this is: it has no hue of its own to stop at.
   */
  readonly neutral: number;
  /**
   * The least chroma a light carries (at least `FLOORS.chroma`): no light is
   * grey. A light is near-neutral by the chroma it keeps (`fade` of its
   * base's): at half this or under it takes the key's hue, at this or over
   * it turns by `turn` alone. So a cool paper's light leans toward the key,
   * but only a grey's takes the key's hue, and a slate's edge does not pass
   * through green to reach a gold.
   */
  readonly warm: number;
  /** The share of its base's chroma a light keeps (it pales toward the light), never under `warm`. */
  readonly fade: number;
}

/**
 * CRAFT 12's floors, which no `Shading` lowers (`ramp` refuses knobs under
 * them): what "shade with colour, never with black or grey" means in
 * numbers, whatever a look tunes.
 */
const FLOORS = {
  /**
   * The least chroma a shade or a light carries (sRGB allowing): under it a
   * colour reads grey. The near-grey lights CRAFT 12 threw out sat at C 3.2
   * and 3.4; every light that read warm on the stills at 6.4 or more.
   */
  chroma: 6,
  /** The least turn, degrees, a shade takes toward the key's complement and a light toward the key's hue. */
  turn: 10,
  /** The least share of its lightness a shade loses, and of the way to white a light rises. */
  step: 0.1,
  /** The most share of its lightness a shade loses: past it a mid-tone's shade falls to near black (L under 8 at a base of L 20). */
  darkest: 0.6,
} as const;

/** Why knobs `k` break CRAFT 12's floors (`FLOORS`), leave a share outside 0..1, or are no finite number: one reason per knob. */
const floorFaults = (k: Shading): string[] => [
  ...Object.entries(k).flatMap(([n, v]) =>
    Number.isFinite(v) ? [] : [`${n} ${v} not a finite number`],
  ),
  ...(k.turn >= FLOORS.turn ? [] : [`turn ${k.turn} under ${FLOORS.turn}°`]),
  ...(k.dark >= FLOORS.step && k.dark <= FLOORS.darkest
    ? []
    : [`dark ${k.dark} outside ${FLOORS.step}..${FLOORS.darkest}`]),
  ...(k.lift >= FLOORS.step && k.lift < 1 ? [] : [`lift ${k.lift} outside ${FLOORS.step}..1`]),
  ...(k.deep >= FLOORS.chroma ? [] : [`deep ${k.deep} under chroma ${FLOORS.chroma}`]),
  ...(k.warm >= FLOORS.chroma ? [] : [`warm ${k.warm} under chroma ${FLOORS.chroma}`]),
  ...(k.neutral >= 0 && k.neutral <= 1 ? [] : [`neutral ${k.neutral} outside 0..1`]),
  ...(k.fade >= 0 && k.fade <= 1 ? [] : [`fade ${k.fade} outside 0..1`]),
];

/** A colour in CIE LCh (D65). */
interface Lch {
  readonly L: number;
  readonly C: number;
  readonly h: number;
}

const WHITE = [0.95047, 1, 1.08883] as const;
const EPSILON = 216 / 24389;
const KAPPA = 24389 / 27;
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const labF = (t: number) => (t > EPSILON ? Math.cbrt(t) : (KAPPA * t + 16) / 116);
const labFi = (t: number) => (t ** 3 > EPSILON ? t ** 3 : (116 * t - 16) / KAPPA);

/** Scratch for `lchOf`. */
const RGB: [number, number, number] = [0, 0, 0];

/** Hex colour `hex` in CIE LCh. */
const lchOf = (hex: Hex): Lch => {
  rgbOf(RGB, hex);
  const r = toLinear(RGB[0] / 255);
  const g = toLinear(RGB[1] / 255);
  const b = toLinear(RGB[2] / 255);
  const x = labF((0.4124 * r + 0.3576 * g + 0.1805 * b) / WHITE[0]);
  const y = labF(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = labF((0.0193 * r + 0.1192 * g + 0.9505 * b) / WHITE[2]);
  const A = 500 * (x - y);
  const B = 200 * (y - z);
  return {
    L: 116 * y - 16,
    C: Math.hypot(A, B),
    h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360,
  };
};

/** LCh `c` in sRGB, 0..1 a channel, unclamped: past 0..1 it lies outside the gamut. */
const srgbOf = ({ L, C, h }: Lch): [number, number, number] => {
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const fy = (L + 16) / 116;
  const X = WHITE[0] * labFi(fy + a / 500);
  const Y = labFi(fy);
  const Z = WHITE[2] * labFi(fy - b / 200);
  return [
    toGamma(3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z),
    toGamma(-0.969266 * X + 1.8760108 * Y + 0.041556 * Z),
    toGamma(0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z),
  ];
};

const inGamut = (rgb: ReadonlyArray<number>) => rgb.every((v) => v >= -1e-6 && v <= 1 + 1e-6);

/** LCh `c` as hex, its chroma lowered (lightness and hue kept) only as far as sRGB needs. */
const hexOfLch = (c: Lch): Hex => {
  let lo = 0;
  let hi = c.C;
  if (!inGamut(srgbOf(c))) {
    for (let i = 0; i < 32; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(srgbOf({ ...c, C: mid }))) lo = mid;
      else hi = mid;
    }
  } else lo = c.C;
  const rgb = srgbOf({ ...c, C: lo });
  return `#${hex2(clamp(rgb[0]) * 255)}${hex2(clamp(rgb[1]) * 255)}${hex2(clamp(rgb[2]) * 255)}`;
};

/**
 * Hue `h` turned toward hue `to`: the short way round, all the way when it is
 * within `turn` of it; past that by `turn`, plus the rest of the way by
 * `neutral` (0..1). On a tie, through the purples (across hue 0), so a warm
 * colour's shade under a warm key cools through violet, never through green.
 */
const turned = (h: number, to: number, turn: number, neutral: number) => {
  let d = ((to - h + 540) % 360) - 180;
  if (Math.abs(d) >= 180 - 1e-9) d = h < 180 ? -180 : 180;
  const apart = Math.abs(d);
  const by = apart <= turn ? apart : turn + (apart - turn) * neutral;
  return (h + Math.sign(d) * by + 360) % 360;
};

/**
 * How near-neutral chroma `c` is against a floor of chroma `least` (0..1): a
 * colour at or under the floor has little hue of its own to keep once raised
 * to it; one at twice the floor or more turns by `turn` alone.
 */
const nearNeutral = (c: number, least: number) => clamp((2 * least - c) / least);

/**
 * The share of the rest of the way a shade of chroma `c` turns past `turn`
 * (`Shading.neutral`): `neutral` for a near-neutral at the floor, rising to
 * all the way for a hueless grey, none at twice the floor.
 */
const shadeTurn = (c: number, k: Shading) =>
  nearNeutral(c, k.deep) * (1 - (1 - k.neutral) * clamp(c / k.deep));

/**
 * The ramp of `base` under the key light `key`, shaded by `k` (CRAFT rule 12:
 * shade with colour, never with black or grey):
 * - the shade is darker, its hue turned toward the key's complement, its
 *   chroma kept or raised to `k.deep`;
 * - the light is lighter, its hue leaning to the key's, its chroma at least
 *   `k.warm`, so it is never grey.
 *
 * A cast shadow is the shade of the surface it falls on. Each colour keeps
 * its lightness and hue and gives up only the chroma sRGB cannot show. Pure;
 * throws on a key with no hue (a grey light has no complement), and on knobs
 * under CRAFT 12's floors (`FLOORS`), naming each.
 */
export const ramp = (base: Hex, key: Hex, k: Shading): Ramp => {
  const under = floorFaults(k);
  if (under.length > 0) throw new Error(`knobs under CRAFT 12's floors: ${under.join(', ')}`);
  const light = lchOf(key);
  if (light.C < 1) throw new Error(`key light "${key}" has no hue to shade toward`);
  const b = lchOf(base);
  return {
    shade: hexOfLch({
      L: b.L * (1 - k.dark),
      C: Math.max(b.C, k.deep),
      h: turned(b.h, (light.h + 180) % 360, k.turn, shadeTurn(b.C, k)),
    }),
    base,
    light: hexOfLch({
      L: b.L + (100 - b.L) * k.lift,
      C: Math.max(b.C * k.fade, k.warm),
      h: turned(b.h, light.h, k.turn, nearNeutral(b.C * k.fade, k.warm / 2)),
    }),
  };
};
