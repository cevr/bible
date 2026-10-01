// What a sound is like, in numbers an agent can compare when it cannot
// listen: where it starts and stops being heard, how bright it is (spectral
// centroid) and how noise-like (spectral flatness: 1 for white noise, near 0
// for a pure tone). Used to rank candidates before a person auditions them.

import type { Pcm } from '../audio.ts';

/** A sound described. Seconds, Hz, and a 0–1 flatness. */
interface Described {
  readonly secs: number;
  /** When it first comes within 30 dB of its loudest 10 ms. */
  readonly onset: number;
  /**
   * When its loudest 10 ms begins: a one-shot's hit (the stamp landing, the
   * stack settling), which a take can hold back well after its onset.
   */
  readonly hit: number;
  /** When it last is within 40 dB of its loudest 10 ms. */
  readonly end: number;
  readonly centroid: number;
  readonly flatness: number;
}

const WINDOW = 0.01;
const FFT_SIZE = 2048;

/** Each 10 ms window's level in dB (mean over channels of the mean square). */
const windowDb = (pcm: Pcm): ReadonlyArray<number> => {
  const n = Math.max(1, Math.round(WINDOW * pcm.rate));
  const out: Array<number> = [];
  for (let from = 0; from < pcm.frames; from += n) {
    let sum = 0;
    const to = Math.min(pcm.frames, from + n);
    for (const plane of pcm.channels) for (let i = from; i < to; i++) sum += (plane[i] ?? 0) ** 2;
    out.push(
      10 * Math.log10(Math.max(1e-12, sum / Math.max(1, (to - from) * pcm.channels.length))),
    );
  }
  return out;
};

/** `re` and `im` put in bit-reversed order, in place. */
const bitReverse = (re: Float64Array, im: Float64Array): void => {
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

/** One butterfly between `a` and `b`, turned by `(wr, wi)`. */
const butterfly = (
  re: Float64Array,
  im: Float64Array,
  a: number,
  b: number,
  wr: number,
  wi: number,
): void => {
  const tr = (re[b] ?? 0) * wr - (im[b] ?? 0) * wi;
  const ti = (re[b] ?? 0) * wi + (im[b] ?? 0) * wr;
  re[b] = (re[a] ?? 0) - tr;
  im[b] = (im[a] ?? 0) - ti;
  re[a] = (re[a] ?? 0) + tr;
  im[a] = (im[a] ?? 0) + ti;
};

/** Each stage's turns, `size` by `size` up to `FFT_SIZE`: worked out once, not per butterfly. */
const TWIDDLES = Array.from({ length: Math.log2(FFT_SIZE) }, (_, stage) => {
  const size = 2 << stage;
  const step = (-2 * Math.PI) / size;
  return {
    cos: Float64Array.from({ length: size / 2 }, (_, k) => Math.cos(step * k)),
    sin: Float64Array.from({ length: size / 2 }, (_, k) => Math.sin(step * k)),
  };
});

/** The Hann window over one `FFT_SIZE` frame. */
const HANN = Float64Array.from(
  { length: FFT_SIZE },
  (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1)),
);

/** An in-place radix-2 FFT over `re` and `im` (`FFT_SIZE` long). */
const fft = (re: Float64Array, im: Float64Array): void => {
  const n = re.length;
  bitReverse(re, im);
  TWIDDLES.forEach(({ cos, sin }, stage) => {
    const size = 2 << stage;
    for (let start = 0; start < n; start += size)
      for (let k = 0; k < size / 2; k++)
        butterfly(re, im, start + k, start + k + size / 2, cos[k] ?? 1, sin[k] ?? 0);
  });
};

/** The power spectrum averaged over Hann-windowed frames of the first channel. */
const spectrum = (pcm: Pcm): Float64Array => {
  const plane = pcm.channels[0] ?? new Float32Array();
  const power = new Float64Array(FFT_SIZE / 2);
  let frames = 0;
  for (let from = 0; from + FFT_SIZE <= Math.max(FFT_SIZE, plane.length); from += FFT_SIZE / 2) {
    const re = new Float64Array(FFT_SIZE);
    const im = new Float64Array(FFT_SIZE);
    for (let i = 0; i < FFT_SIZE; i++) re[i] = (plane[from + i] ?? 0) * (HANN[i] ?? 0);
    fft(re, im);
    for (let k = 0; k < power.length; k++)
      power[k] = (power[k] ?? 0) + (re[k] ?? 0) ** 2 + (im[k] ?? 0) ** 2;
    frames++;
  }
  return power.map((p) => p / Math.max(1, frames));
};

/** `pcm` described. */
export const describeSound = (pcm: Pcm): Described => {
  const levels = windowDb(pcm);
  const loudest = Math.max(...levels);
  const first = levels.findIndex((db) => db >= loudest - 30);
  const last = levels.findLastIndex((db) => db >= loudest - 40);
  const power = spectrum(pcm);
  let weighted = 0;
  let total = 0;
  let logSum = 0;
  // Skip the DC bin: flatness is over the audible bins.
  for (let k = 1; k < power.length; k++) {
    const p = Math.max(power[k] ?? 0, 1e-20);
    weighted += p * ((k * pcm.rate) / FFT_SIZE);
    total += p;
    logSum += Math.log(p);
  }
  const bins = power.length - 1;
  return {
    secs: pcm.frames / pcm.rate,
    onset: Math.max(0, first) * WINDOW,
    hit: Math.max(0, levels.indexOf(loudest)) * WINDOW,
    end: Math.min(pcm.frames / pcm.rate, (Math.max(0, last) + 1) * WINDOW),
    centroid: total > 0 ? weighted / total : 0,
    flatness: total > 0 ? Math.exp(logSum / bins) / (total / bins) : 0,
  };
};
