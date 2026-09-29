// The procedural synth's signal parts: seeded noise, the RBJ biquad (fixed or
// swept), envelopes, a slow seeded wobble, and the finishing a loop needs.
// Every source of randomness is a seeded generator (`rng`, random.ts): the
// same seed always makes the same samples. One channel of Float32 samples at
// `SYNTH_RATE`, the mix's rate. Pure sample loops, like dsp.ts.

import { rng } from '../random.ts';

/** Every procedural sound is made at the mix's rate, so it never resamples. */
export const SYNTH_RATE = 44100;

/** `secs` as a sample count at `SYNTH_RATE`. */
export const samples = (secs: number): number => Math.max(0, Math.round(secs * SYNTH_RATE));

/** A seeded generator of floats in [0, 1). */
export type Random = () => number;

/** A seeded generator (mulberry32). */
export const random = (seed: number): Random => rng(seed);

/** White noise in [-1, 1). */
export const white = (r: Random, n: number): Float32Array => {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = r() * 2 - 1;
  return out;
};

/** Pink noise: Paul Kellet's economy filter over white noise (about -3 dB an octave). */
export const pink = (r: Random, n: number): Float32Array => {
  const out = new Float32Array(n);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let i = 0; i < n; i++) {
    const w = r() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.963 * b1 + w * 0.2965164;
    b2 = 0.57 * b2 + w * 1.0526913;
    out[i] = (b0 + b1 + b2 + w * 0.1848) * 0.25;
  }
  return out;
};

/** Brown noise: a leaky random walk (rumble, the body of wind and room tone). */
export const brown = (r: Random, n: number): Float32Array => {
  const out = new Float32Array(n);
  let last = 0;
  for (let i = 0; i < n; i++) {
    last = (last + 0.02 * (r() * 2 - 1)) / 1.02;
    out[i] = last * 3.5;
  }
  return out;
};

/** A normalised biquad: `y = b0 x + b1 x1 + b2 x2 - a1 y1 - a2 y2`. */
export interface Coefficients {
  readonly b0: number;
  readonly b1: number;
  readonly b2: number;
  readonly a1: number;
  readonly a2: number;
}

export type FilterKind = 'lowPass' | 'highPass' | 'bandPass' | 'peak' | 'highShelf';

/** One biquad's design: its kind, corner or centre, Q, and gain (peak and shelf only). */
export interface FilterSpec {
  readonly kind: FilterKind;
  readonly hz: number;
  readonly q: number;
  readonly db: number;
  readonly rate: number;
}

/** The RBJ Audio EQ Cookbook's coefficients for `spec`. */
export const biquad = (spec: FilterSpec): Coefficients => {
  const w = (2 * Math.PI * spec.hz) / spec.rate;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / (2 * spec.q);
  const a = 10 ** (spec.db / 40);
  const norm = (b0: number, b1: number, b2: number, a0: number, a1: number, a2: number) => ({
    b0: b0 / a0,
    b1: b1 / a0,
    b2: b2 / a0,
    a1: a1 / a0,
    a2: a2 / a0,
  });
  switch (spec.kind) {
    case 'lowPass':
      return norm((1 - cos) / 2, 1 - cos, (1 - cos) / 2, 1 + alpha, -2 * cos, 1 - alpha);
    case 'highPass':
      return norm((1 + cos) / 2, -(1 + cos), (1 + cos) / 2, 1 + alpha, -2 * cos, 1 - alpha);
    case 'bandPass':
      return norm(alpha, 0, -alpha, 1 + alpha, -2 * cos, 1 - alpha);
    case 'peak':
      return norm(1 + alpha * a, -2 * cos, 1 - alpha * a, 1 + alpha / a, -2 * cos, 1 - alpha / a);
    case 'highShelf': {
      const s = 2 * Math.sqrt(a) * alpha;
      return norm(
        a * (a + 1 + (a - 1) * cos + s),
        -2 * a * (a - 1 + (a + 1) * cos),
        a * (a + 1 + (a - 1) * cos - s),
        a + 1 - (a - 1) * cos + s,
        2 * (a - 1 - (a + 1) * cos),
        a + 1 - (a - 1) * cos - s,
      );
    }
  }
};

/** `x` through one biquad (direct form I); a new array. */
export const runBiquad = (x: Float32Array, c: Coefficients): Float32Array => {
  const out = new Float32Array(x.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const x0 = x[i] ?? 0;
    const y = c.b0 * x0 + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y;
    out[i] = y;
  }
  return out;
};

/** How often a swept filter recomputes its coefficients, in samples. */
const SWEEP_STEP = 32;

/** `x` through a `kind` filter at `hz` (SYNTH_RATE). */
export const filter = (x: Float32Array, kind: FilterKind, hz: number, q: number): Float32Array =>
  runBiquad(x, biquad({ kind, hz, q, db: 0, rate: SYNTH_RATE }));

/**
 * `x` through a `kind` filter whose frequency is a function of the sample
 * index: a sweep, its coefficients recomputed every 32 samples.
 */
export const sweep = (
  x: Float32Array,
  kind: FilterKind,
  hz: (i: number) => number,
  q: number,
): Float32Array => {
  const design = (i: number) => biquad({ kind, hz: hz(i), q, db: 0, rate: SYNTH_RATE });
  const out = new Float32Array(x.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  let c = design(0);
  for (let i = 0; i < x.length; i++) {
    if (i % SWEEP_STEP === 0) c = design(i);
    const x0 = x[i] ?? 0;
    const y = c.b0 * x0 + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y;
    out[i] = y;
  }
  return out;
};

/** `x` times `envelope(i)`, sample by sample; a new array. */
export const envelop = (x: Float32Array, envelope: (i: number) => number): Float32Array =>
  x.map((v, i) => v * envelope(i));

/** Add `x` × `gain` into `into` from sample `at`; what falls past its end is dropped. */
export const addAt = (into: Float32Array, x: Float32Array, at: number, gain: number): void => {
  for (let i = 0; i < x.length && at + i < into.length; i++)
    if (at + i >= 0) into[at + i] = (into[at + i] ?? 0) + (x[i] ?? 0) * gain;
};

/** A linear attack then an exponential decay, in seconds (the decay's time constant). */
export const attackDecay =
  (attack: number, decay: number) =>
  (i: number): number => {
    const t = i / SYNTH_RATE;
    if (t < attack) return t / attack;
    return Math.exp(-(t - attack) / decay);
  };

/** A smooth seeded wobble in [0, 1] at about `hz` over `n` samples (value noise). */
export const wobble = (r: Random, n: number, hz: number): ((i: number) => number) => {
  const step = SYNTH_RATE / hz;
  const points = Array.from({ length: Math.ceil(n / step) + 2 }, r);
  return (i) => {
    const k = i / step;
    const j = Math.floor(k);
    const f = k - j;
    const s = f * f * (3 - 2 * f);
    return (points[j] ?? 0) * (1 - s) + (points[j + 1] ?? 0) * s;
  };
};

/** `x` faded in over its first `secs` and out over its last (linear). */
export const fadeEnds = (x: Float32Array, secs: number): Float32Array => {
  const k = Math.max(1, samples(secs));
  return x.map((v, i) => v * Math.min(1, i / k, (x.length - 1 - i) / k));
};

/**
 * `x` made to loop: its last `secs` crossfaded (equal power) into its head,
 * and dropped from its end, so the end runs on into the start with no seam.
 */
export const loopable = (x: Float32Array, secs: number): Float32Array => {
  const k = samples(secs);
  const out = x.slice(0, x.length - k);
  for (let i = 0; i < k; i++) {
    const g = i / k;
    out[i] = (x[i] ?? 0) * Math.sqrt(g) + (x[x.length - k + i] ?? 0) * Math.sqrt(1 - g);
  }
  return out;
};

/** `x` scaled so its sample peak sits at `db` dBFS; silence stays silent. */
export const peakTo = (x: Float32Array, db: number): Float32Array => {
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  if (peak === 0) return x.slice();
  const k = 10 ** (db / 20) / peak;
  return x.map((v) => v * k);
};
