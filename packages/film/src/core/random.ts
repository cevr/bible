// Deterministic randomness. Every frame must render identically on every run,
// so nothing in a film may call Math.random — derive from a seed instead.

/** Integer hash → [0, 1). */
export const hash = (n: number): number => {
  let x = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
};

export const hash2 = (a: number, b: number): number =>
  hash(Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263));

/** Hash a string to a seed, so seeds can be named ("sheep", "robe"). */
export const seedOf = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

/** A seeded generator of floats in [0, 1). */
export const rng = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Smooth 1D value noise in [-1, 1]. */
export const noise1 = (x: number, seed = 0): number => {
  const i = Math.floor(x);
  const f = x - i;
  const a = hash2(i, seed);
  const b = hash2(i + 1, seed);
  return (a + (b - a) * smooth(f)) * 2 - 1;
};

/** Smooth 2D value noise in [-1, 1]. */
export const noise2 = (x: number, y: number, seed = 0): number => {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = smooth(x - xi);
  const yf = smooth(y - yi);
  const s = Math.imul(seed | 0, 1013);
  const a = hash2(xi + s, yi);
  const b = hash2(xi + 1 + s, yi);
  const c = hash2(xi + s, yi + 1);
  const d = hash2(xi + 1 + s, yi + 1);
  const top = a + (b - a) * xf;
  const bottom = c + (d - c) * xf;
  return (top + (bottom - top) * yf) * 2 - 1;
};

/** Fractal noise: a few octaves of noise2, normalised to roughly [-1, 1]. */
export const fbm = (x: number, y: number, seed = 0, octaves = 4): number => {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += noise2(x, y, seed + o * 31) * amp;
    norm += amp;
    x *= 2.03;
    y *= 2.03;
    amp *= 0.5;
  }
  return sum / norm;
};
