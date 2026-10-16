// The sound graph's own transcendentals: sine and cosine of a phase in turns,
// e^x, 2^x, ln x, tanh x and the decibel's gain. ECMA-262 leaves a host's
// Math.sin, exp, log, pow and tanh implementation-approximated, and hosts do
// round their last bits apart, so a code sound rendered with them could be
// other samples on another host. These are built from + − × ÷, floor and round
// alone, which IEEE 754 fixes exactly, so a render is the same samples on every
// host (packages/film/lint/synth-own-math.ts holds the graph to them).
//
// The polynomials and the reductions are fdlibm's (k_sin.c, k_cos.c, e_exp.c,
// e_log.c, s_tanh.c): "Copyright (C) 1993 by Sun Microsystems, Inc. All rights
// reserved. Developed at SunPro, a Sun Microsystems, Inc. business. Permission
// to use, copy, modify, and distribute this software is freely granted,
// provided that this notice is preserved." Each stays within a few units in the
// last place of the host's (math.test.ts measures the bounds).

/** 2^k for k in −1022..1023: each the last doubled or halved, so every one is exact. */
const POW2 = ((): Float64Array => {
  const out = new Float64Array(2046);
  out[1022] = 1;
  for (let k = 1; k <= 1023; k++) out[1022 + k] = (out[1021 + k] ?? 0) * 2;
  for (let k = 1; k <= 1022; k++) out[1022 - k] = (out[1023 - k] ?? 0) / 2;
  return out;
})();

/** 2^k, exact, for k in −1022..1023. */
const pow2 = (k: number): number => POW2[k + 1022] ?? 0;

/** 2^−54: a subnormal result is scaled in two steps, so it rounds once. */
const TWO_M54 = 1 / 18014398509481984;

/** `y` × 2^k for k in −1075..1024, rounded once. */
const scaled = (y: number, k: number): number => {
  if (k > 1023) return y * 2 * pow2(k - 1);
  if (k < -1022) return y * pow2(k + 54) * TWO_M54;
  return y * pow2(k);
};

/** The largest k with 2^k ≤ x, for a normal positive x (a search of the table). */
const exponentOf = (x: number): number => {
  let lo = -1022;
  let hi = 1023;
  while (lo < hi) {
    // A shift, not Math.ceil: the middle of −1 and 0 is +0, so ln 1 is +0.
    const mid = (lo + hi + 1) >> 1;
    if (pow2(mid) <= x) lo = mid;
    else hi = mid - 1;
  }
  return lo;
};

// Sine and cosine. A phase in turns reduces exactly (its fraction, times 4, less
// its nearest quadrant), so only the last step, the quadrant's turns as
// radians, rounds: a phase of 10^6 turns keeps the accuracy of a phase of 1.

const PIO2 = Math.PI / 2;

const S1 = -1.6666666666666632e-1;
const S2 = 8.33333333332249e-3;
const S3 = -1.984126982985795e-4;
const S4 = 2.7557313707070068e-6;
const S5 = -2.5050760253406863e-8;
const S6 = 1.58969099521155e-10;

/** sin r for |r| ≤ π/4 (fdlibm's __kernel_sin). */
const kernelSin = (r: number): number => {
  const z = r * r;
  return r + z * r * (S1 + z * (S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)))));
};

const C1 = 4.16666666666666e-2;
const C2 = -1.388888888887411e-3;
const C3 = 2.480158728947673e-5;
const C4 = -2.7557314351390663e-7;
const C5 = 2.087572321298175e-9;
const C6 = -1.1359647557788195e-11;

/** cos r for |r| ≤ π/4 (fdlibm's __kernel_cos). */
const kernelCos = (r: number): number => {
  const z = r * r;
  const tail = z * z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
  const half = 0.5 * z;
  const w = 1 - half;
  return w + (1 - w - half + tail);
};

// A negative quadrant is `0 - kernel`, never `-kernel`: sin π is +0, not −0.

/** sin 2πt, `t` in turns. */
export const sinTurn = (t: number): number => {
  const quarters = (t - Math.floor(t)) * 4;
  const q = Math.round(quarters);
  const r = (quarters - q) * PIO2;
  switch (q) {
    case 1:
      return kernelCos(r);
    case 2:
      return 0 - kernelSin(r);
    case 3:
      return 0 - kernelCos(r);
    default:
      return kernelSin(r);
  }
};

/** cos 2πt, `t` in turns. */
export const cosTurn = (t: number): number => {
  const quarters = (t - Math.floor(t)) * 4;
  const q = Math.round(quarters);
  const r = (quarters - q) * PIO2;
  switch (q) {
    case 1:
      return 0 - kernelSin(r);
    case 2:
      return 0 - kernelCos(r);
    case 3:
      return kernelSin(r);
    default:
      return kernelCos(r);
  }
};

// e^x. x = k ln 2 + r with |r| ≤ ln 2 / 2, ln 2 split in two so k ln 2 is
// exact; e^r by fdlibm's rational form; then 2^k from the table.

const LN2_HI = 6.931471803691238e-1;
const LN2_LO = 1.9082149292705877e-10;
const INV_LN2 = 1.4426950408889634;
const EXP_OVER = 709.782712893384;
const EXP_UNDER = -745.1332191019411;

const P1 = 1.6666666666666602e-1;
const P2 = -2.7777777777015593e-3;
const P3 = 6.613756321437934e-5;
const P4 = -1.6533902205465252e-6;
const P5 = 4.1381367970572385e-8;

/** e^x. */
export const exp = (x: number): number => {
  if (Number.isNaN(x)) return x;
  if (x > EXP_OVER) return Infinity;
  if (x < EXP_UNDER) return 0;
  const k = Math.round(x * INV_LN2);
  const hi = x - k * LN2_HI;
  const lo = k * LN2_LO;
  const r = hi - lo;
  const t = r * r;
  const c = r - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
  return scaled(1 - (lo - (r * c) / (2 - c) - hi), k);
};

/** 2^x: exact at every integer, so twelve semitones are a ratio of exactly 2. */
export const exp2 = (x: number): number => {
  if (!Number.isFinite(x)) return exp(x);
  const k = Math.round(x);
  return scaled(exp((x - k) * Math.LN2), k);
};

// ln x. x = m 2^k with √2/2 < m ≤ √2 (exact: a power of two divides out), then
// fdlibm's series in s = f / (2 + f), f = m − 1.

const LG1 = 6.666666666666735e-1;
const LG2 = 3.999999999940942e-1;
const LG3 = 2.857142874366239e-1;
const LG4 = 2.2222198432149784e-1;
const LG5 = 1.818357216161805e-1;
const LG6 = 1.5313837699209373e-1;
const LG7 = 1.4798198605116586e-1;

/** The smallest normal double: below it, x is scaled up before it is split. */
const MIN_NORMAL = pow2(-1022);

/** ln x for a positive normal x. */
const logNormal = (x: number): number => {
  let k = exponentOf(x);
  let m = x / pow2(k);
  if (m > Math.SQRT2) {
    m /= 2;
    k += 1;
  }
  const f = m - 1;
  const s = f / (2 + f);
  const z = s * s;
  const w = z * z;
  const even = w * (LG2 + w * (LG4 + w * LG6));
  const odd = z * (LG1 + w * (LG3 + w * (LG5 + w * LG7)));
  const half = 0.5 * f * f;
  return k * LN2_HI - (half - (s * (half + odd + even) + k * LN2_LO) - f);
};

/** ln x: −∞ at 0, NaN below it. */
export const log = (x: number): number => {
  if (Number.isNaN(x) || x < 0) return Number.NaN;
  if (x === 0) return -Infinity;
  if (x === Infinity) return x;
  if (x < MIN_NORMAL) return logNormal(x * 18014398509481984) - 54 * Math.LN2;
  return logNormal(x);
};

// tanh x = −t / (t + 2) with t = e^(−2|x|) − 1, its sign put back. Near 0,
// e^(−2|x|) − 1 cancels, so there t is the series of e^r − 1.

/** 1/n! for n = 1..15: the series of e^r − 1, r^1 to r^15. */
const FACTORIAL_INVERSES: ReadonlyArray<number> = Array.from({ length: 15 }, (_, i) => {
  let f = 1;
  for (let n = 2; n <= i + 1; n++) f *= n;
  return 1 / f;
});

/** e^r − 1 for |r| < 0.35, by its series to r^15 (the rest is under 10^−18 of |r|). */
const expm1Near0 = (r: number): number => {
  let sum = 0;
  for (let i = FACTORIAL_INVERSES.length - 1; i >= 0; i--)
    sum = sum * r + (FACTORIAL_INVERSES[i] ?? 0);
  return sum * r;
};

/** tanh x. */
export const tanh = (x: number): number => {
  if (Number.isNaN(x)) return x;
  const a = Math.abs(x);
  if (a > 22) return Math.sign(x);
  const r = -2 * a;
  const t = r > -0.35 ? expm1Near0(r) : exp(r) - 1;
  const z = -t / (t + 2);
  return x < 0 ? -z : z;
};

/** ln 10 / 20: a decibel as natural log of an amplitude. */
const DB_LN = Math.LN10 / 20;

/** A level in dB as the amplitude it multiplies by: 10^(db/20). */
export const dbToGain = (db: number): number => exp(db * DB_LN);
