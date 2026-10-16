// What a sound is like, in numbers an agent can compare when it cannot
// listen: where it starts and stops being heard, whether its loudest moment
// stands out as a hit, how bright it is (spectral centroid) and how
// noise-like (spectral flatness: 1 for white noise, near 0 for a pure tone).
// Used to rank candidates before a person auditions them; its power spectrum
// is also the band balance `compare.ts` reads.

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
  /**
   * How far its loudest 10 ms stands over its neighbours, in dB: over the
   * median of the 10 ms windows within 150 ms either side, silence past its
   * ends. A knock stands 17 dB and more; a swell or a steady hiss stands
   * under 1 dB, and has no hit to hear.
   */
  readonly stands: number;
  readonly centroid: number;
  readonly flatness: number;
}

const WINDOW = 0.01;
/** How many windows either side of the loudest its neighbours are: 150 ms. */
const AROUND = 15;
/** The least power a window is read at, so silence has a level. */
const FLOOR = 1e-12;
/** Silence's level in dB: a window past a sound's ends. */
const SILENT_DB = 10 * Math.log10(FLOOR);
/** The FFT the centroid and flatness are read from: the first channel's. */
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
      10 * Math.log10(Math.max(FLOOR, sum / Math.max(1, (to - from) * pcm.channels.length))),
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

/** A `size`-point FFT worked out once, not per butterfly: each stage's turns, and the Hann window over one frame. */
interface FftPlan {
  readonly twiddles: ReadonlyArray<{ readonly cos: Float64Array; readonly sin: Float64Array }>;
  readonly hann: Float64Array;
}

/** Each size's plan, made the first time a spectrum of that size is read. */
const plans = new Map<number, FftPlan>();

/** The plan for a `size`-point FFT (a power of two). */
const planOf = (size: number): FftPlan => {
  const had = plans.get(size);
  if (had !== undefined) return had;
  const plan: FftPlan = {
    twiddles: Array.from({ length: Math.log2(size) }, (_, stage) => {
      const span = 2 << stage;
      const step = (-2 * Math.PI) / span;
      return {
        cos: Float64Array.from({ length: span / 2 }, (_, k) => Math.cos(step * k)),
        sin: Float64Array.from({ length: span / 2 }, (_, k) => Math.sin(step * k)),
      };
    }),
    // Hann's periodic form: frames a quarter of a frame apart sum its square
    // to 1.5 at every sample.
    hann: Float64Array.from(
      { length: size },
      (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size),
    ),
  };
  plans.set(size, plan);
  return plan;
};

/** An in-place radix-2 FFT over `re` and `im`, as long as `plan`'s. */
const fft = (re: Float64Array, im: Float64Array, plan: FftPlan): void => {
  const n = re.length;
  bitReverse(re, im);
  plan.twiddles.forEach(({ cos, sin }, stage) => {
    const span = 2 << stage;
    for (let start = 0; start < n; start += span)
      for (let k = 0; k < span / 2; k++)
        butterfly(re, im, start + k, start + k + span / 2, cos[k] ?? 1, sin[k] ?? 0);
  });
};

/**
 * What a sound holds past its ends: silence, as a one-shot is heard, or its
 * own head again, as the mix loops a bed.
 */
type Ends = 'silent' | 'looped';

/**
 * The power spectrum of one Hann-windowed frame of `plane`: its `size`
 * samples from `from` (`size` a power of two), in `size / 2` bins, what lies
 * past its ends read as `ends` says. A full-scale sine's bin reads (size / 4)².
 */
const spectrumAt = (plane: Float32Array, from: number, size: number, ends: Ends): Float64Array => {
  const plan = planOf(size);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  const length = plane.length;
  if (ends === 'looped' && length > 0)
    for (let i = 0; i < size; i++) re[i] = (plane[(from + i) % length] ?? 0) * (plan.hann[i] ?? 0);
  else for (let i = 0; i < size; i++) re[i] = (plane[from + i] ?? 0) * (plan.hann[i] ?? 0);
  fft(re, im, plan);
  const power = new Float64Array(size / 2);
  for (let k = 0; k < power.length; k++) power[k] = (re[k] ?? 0) ** 2 + (im[k] ?? 0) ** 2;
  return power;
};

/**
 * The power spectrum of one Hann-windowed frame of `plane`: its `size`
 * samples from `from` (`size` a power of two; silence before its start and
 * past its end), in `size / 2` bins. A full-scale sine's bin reads (size / 4)².
 */
export const frameSpectrum = (plane: Float32Array, from: number, size: number): Float64Array =>
  spectrumAt(plane, from, size, 'silent');

/**
 * Where the frames of `plane`'s spectrum start, about a quarter of a frame
 * apart, so that every sample lies in four of them. Silent ends: from the
 * first frame that reaches its first sample to the last that holds its last.
 * Looped: around the loop once, the starts spread evenly over its length.
 */
const frameStarts = (length: number, size: number, ends: Ends): ReadonlyArray<number> => {
  const hop = size / 4;
  if (ends === 'looped') {
    const count = Math.max(4, Math.round(length / hop));
    return Array.from({ length: count }, (_, k) => Math.floor((k * length) / count));
  }
  return Array.from(
    { length: Math.ceil(Math.max(1, length) / hop) + 3 },
    (_, k) => hop - size + k * hop,
  );
};

/**
 * `plane`'s power spectrum in `size / 2` bins (`size` a power of two), each
 * sample weighed alike: averaged over Hann-windowed frames about a quarter
 * of a frame apart (`frameStarts`), what lies past its ends read as `ends`
 * says. Every sample lies in four frames, whose squared windows (Hann's
 * periodic form) sum to 1.5, so a click at the very start or end of a sound
 * counts as much as one in its middle.
 */
export const powerSpectrum = (plane: Float32Array, size: number, ends: Ends): Float64Array => {
  const power = new Float64Array(size / 2);
  const starts = frameStarts(plane.length, size, ends);
  for (const from of starts) {
    const frame = spectrumAt(plane, from, size, ends);
    for (let k = 0; k < power.length; k++) power[k] = (power[k] ?? 0) + (frame[k] ?? 0);
  }
  return power.map((p) => p / starts.length);
};

/** How far the window at `at` stands over the median of its neighbours, silence past the ends. */
const standing = (levels: ReadonlyArray<number>, at: number): number => {
  const near = Array.from(
    { length: 2 * AROUND + 1 },
    (_, k) => levels[at - AROUND + k] ?? SILENT_DB,
  ).sort((a, b) => a - b);
  return (levels[at] ?? SILENT_DB) - (near[AROUND] ?? SILENT_DB);
};

/** `pcm` described. */
export const describeSound = (pcm: Pcm): Described => {
  const levels = windowDb(pcm);
  const loudest = Math.max(...levels);
  const hit = Math.max(0, levels.indexOf(loudest));
  const first = levels.findIndex((db) => db >= loudest - 30);
  const last = levels.findLastIndex((db) => db >= loudest - 40);
  const power = powerSpectrum(pcm.channels[0] ?? new Float32Array(), FFT_SIZE, 'silent');
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
    hit: hit * WINDOW,
    end: Math.min(pcm.frames / pcm.rate, (Math.max(0, last) + 1) * WINDOW),
    stands: standing(levels, hit),
    centroid: total > 0 ? weighted / total : 0,
    flatness: total > 0 ? Math.exp(logSum / bins) / (total / bins) : 0,
  };
};
