/**
 * The room's impulse response, made from a seed: per channel, Gaussian noise
 * split into four bands by FFT (below 250 Hz, to 1 kHz, to 4 kHz, above),
 * each band decaying by its own RT60 (−60 dB at RT60), the sum shifted by
 * the predelay, given a 12 ms soft onset, and scaled to unit energy. The
 * channels draw their own noise, so the room is wide. Pure.
 */

import type { Pcm } from '@bible/film/measure';
import { seeded } from './stems.js';

export interface Reverb {
  readonly rt60: readonly [number, number, number, number];
  readonly predelay: number;
  readonly seed: number;
}

const EDGES = [0, 250, 1000, 4000];

/** `re` and `im` in bit-reversed order, in place: the FFT's first step. */
const bitReverse = (re: Float64Array, im: Float64Array) => {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j] ?? 0, re[i] ?? 0];
      [im[i], im[j]] = [im[j] ?? 0, im[i] ?? 0];
    }
  }
};

/** One block of `size` butterflies from `start`, twiddled by the angle step `angle`. */
const butterflies = (
  re: Float64Array,
  im: Float64Array,
  start: number,
  size: number,
  angle: number,
) => {
  const [wr, wi] = [Math.cos(angle), Math.sin(angle)];
  let [cr, ci] = [1, 0];
  for (let k = 0; k < size / 2; k++) {
    const a = start + k;
    const b = a + size / 2;
    const tr = (re[b] ?? 0) * cr - (im[b] ?? 0) * ci;
    const ti = (re[b] ?? 0) * ci + (im[b] ?? 0) * cr;
    re[b] = (re[a] ?? 0) - tr;
    im[b] = (im[a] ?? 0) - ti;
    re[a] = (re[a] ?? 0) + tr;
    im[a] = (im[a] ?? 0) + ti;
    [cr, ci] = [cr * wr - ci * wi, cr * wi + ci * wr];
  }
};

/** An in-place radix-2 FFT of `re` + i`im` (length a power of two); `inverse` scales by 1/n. */
const fft = (re: Float64Array, im: Float64Array, inverse: boolean) => {
  const n = re.length;
  bitReverse(re, im);
  for (let size = 2; size <= n; size <<= 1) {
    const angle = ((inverse ? 2 : -2) * Math.PI) / size;
    for (let start = 0; start < n; start += size) butterflies(re, im, start, size, angle);
  }
  if (inverse) for (let i = 0; i < n; i++) re[i] = (re[i] ?? 0) / n;
};

/** Standard normal draws by Box–Muller over the seeded generator. */
const gaussian = (draw: () => number) => () => {
  const u = 1 - draw();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * draw());
};

/** The stereo impulse response at `rate`: as long as the longest RT60 plus a tenth, after the predelay. */
export const impulse = (spec: Reverb, rate: number): Pcm => {
  const frames = Math.floor(rate * (Math.max(...spec.rt60) * 1.1 + spec.predelay));
  const size = 2 ** Math.ceil(Math.log2(frames));
  const pre = Math.floor(spec.predelay * rate);
  const normal = gaussian(seeded(`impulse:${spec.seed}`));
  const channels = [0, 1].map(() => {
    const re = Float64Array.from({ length: size }, normal);
    const im = new Float64Array(size);
    fft(re, im, false);
    const ir = new Float64Array(frames);
    for (const [b, rt] of spec.rt60.entries()) {
      const [low, high] = [EDGES[b] ?? 0, EDGES[b + 1] ?? rate];
      const [br, bi] = [new Float64Array(size), new Float64Array(size)];
      for (let k = 0; k < size; k++) {
        // Bin k and its mirror carry the frequency min(k, size − k) · rate / size.
        const hz = (Math.min(k, size - k) * rate) / size;
        if (hz >= low && hz < high) {
          br[k] = re[k] ?? 0;
          bi[k] = im[k] ?? 0;
        }
      }
      fft(br, bi, true);
      for (let i = 0; i < frames; i++)
        ir[i] = (ir[i] ?? 0) + (br[i] ?? 0) * Math.exp((-6.9078 * i) / rate / rt);
    }
    const out = new Float32Array(frames);
    let energy = 0;
    for (let i = pre; i < frames; i++) {
      const t = i / rate;
      const value = (ir[i - pre] ?? 0) * Math.min(1, t / 0.012 + 0.05);
      out[i] = value;
      energy += value * value;
    }
    const scale = 1 / Math.sqrt(energy);
    for (let i = 0; i < frames; i++) out[i] = (out[i] ?? 0) * scale;
    return out;
  });
  return { rate, frames, channels };
};
