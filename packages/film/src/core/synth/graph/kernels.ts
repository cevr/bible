// The sound graph's sample loops. Each writes or changes the first `n` frames
// of an array its caller owns (Float32 samples; Float64 per-frame values) and
// allocates nothing per sample. Arithmetic is IEEE's + − × ÷ and sqrt and the
// graph's own transcendentals (math.ts), so a kernel gives the same samples on
// every host.

import { rng } from '../../random.ts';
import { cosTurn, dbToGain, exp, exp2, sinTurn, tanh } from './math.ts';
import type { FILTERS, PARTIAL_SETS } from './nodes.ts';
import { triangle } from './track.ts';
import { CONTROL, SYNTH_RATE } from './units.ts';

// Sources.

/** The PolyBLEP residual at phase `t` (turns) for a step of `dt` turns a frame. */
const blep = (t: number, dt: number): number => {
  if (t < dt) {
    const x = t / dt;
    return x + x - x * x - 1;
  }
  if (t > 1 - dt) {
    const x = (t - 1) / dt;
    return x * x + x + x + 1;
  }
  return 0;
};

/** The fraction of `t`, in [0, 1). */
const frac = (t: number): number => t - Math.floor(t);

type Wave = 'sine' | 'triangle' | 'saw' | 'square';

/** One sample of `wave` at phase `p` (turns), stepping `dt` turns a frame, high for `duty` of a square's cycle. */
const waveAt = (wave: Wave, p: number, dt: number, duty: number): number => {
  switch (wave) {
    case 'sine':
      return sinTurn(p);
    case 'triangle':
      return triangle(p);
    case 'saw':
      return 2 * p - 1 - blep(p, dt);
    case 'square':
      return (p < duty ? 1 : -1) + blep(p, dt) - blep(frac(p - duty), dt);
  }
};

/** A tone: `wave` at `hz[i]` from `phase` (turns); saw and square band-limited by PolyBLEP. */
export const oscillate = (
  out: Float32Array,
  n: number,
  wave: Wave,
  hz: Float64Array,
  duty: Float64Array,
  phase: number,
): void => {
  let p = frac(phase);
  for (let i = 0; i < n; i++) {
    const dt = Math.min(0.5, (hz[i] ?? 0) / SYNTH_RATE);
    const d = Math.min(1, Math.max(0, duty[i] ?? 0.5));
    out[i] = waveAt(wave, p, dt, d);
    p += dt;
    if (p >= 1) p -= Math.floor(p);
  }
};

type Color = 'white' | 'pink' | 'brown';

/** Noise from the stream `seed`, in order, so a longer noise keeps its first samples. */
export const noise = (out: Float32Array, n: number, color: Color, seed: number): void => {
  const r = rng(seed);
  if (color === 'white') {
    for (let i = 0; i < n; i++) out[i] = r() * 2 - 1;
    return;
  }
  if (color === 'brown') {
    // A leaky random walk.
    let last = 0;
    for (let i = 0; i < n; i++) {
      last = (last + 0.02 * (r() * 2 - 1)) / 1.02;
      out[i] = last * 3.5;
    }
    return;
  }
  // Paul Kellet's economy filter over white noise: about −3 dB an octave.
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
};

/** A struck mode: its ratio to the pitch, its level, its decay's time constant in seconds. */
interface Mode {
  readonly ratio: number;
  readonly level: number;
  readonly decay: number;
}

/** The named sets of struck modes. */
export const MODES: Readonly<Record<(typeof PARTIAL_SETS)[number], ReadonlyArray<Mode>>> = {
  // A wine glass: nearly harmonic, long and pure.
  glass: [
    { ratio: 1, level: 1, decay: 1.3 },
    { ratio: 2, level: 0.28, decay: 0.8 },
    { ratio: 3.01, level: 0.1, decay: 0.45 },
    { ratio: 4.18, level: 0.05, decay: 0.3 },
  ],
  // A small bell: the inharmonic partials of a struck bar.
  bell: [
    { ratio: 1, level: 1, decay: 1.1 },
    { ratio: 2, level: 0.35, decay: 0.7 },
    { ratio: 2.76, level: 0.25, decay: 0.5 },
    { ratio: 5.4, level: 0.1, decay: 0.25 },
    { ratio: 8.93, level: 0.04, decay: 0.12 },
  ],
};

/** Below this share of its level a mode's decay is no longer heard: its loop stops there. */
const DECAYED = 1e-9;

/**
 * Struck modes at `hz`: each a sine from a phase drawn in order from `seed`
 * (a mode above the Nyquist is skipped after its draw), a linear attack over
 * `attack` frames and an exponential decay from frame 0.
 */
export const strike = (
  out: Float32Array,
  n: number,
  hz: number,
  modes: ReadonlyArray<Mode>,
  struck: { readonly attack: number; readonly decayScale: number },
  seed: number,
): void => {
  const r = rng(seed);
  for (const mode of modes) {
    const phase = r();
    const step = (hz * mode.ratio) / SYNTH_RATE;
    if (step >= 0.5) continue;
    const fall = exp(-1 / (mode.decay * struck.decayScale * SYNTH_RATE));
    let level = mode.level;
    const quiet = mode.level * DECAYED;
    for (let i = 0; i < n && level > quiet; i++) {
      const rise = struck.attack > 0 ? Math.min(1, i / struck.attack) : 1;
      out[i] = (out[i] ?? 0) + rise * level * sinTurn(phase + i * step);
      level *= fall;
    }
  }
};

// Shapers, each in place over the first `n` frames.

/** `out` times `gain[i]`, a linear gain. */
export const amplify = (out: Float32Array, n: number, gain: Float64Array): void => {
  for (let i = 0; i < n; i++) out[i] = (out[i] ?? 0) * (gain[i] ?? 0);
};

/** `out` times one gain. */
export const scale = (out: Float32Array, n: number, gain: number): void => {
  for (let i = 0; i < n; i++) out[i] = (out[i] ?? 0) * gain;
};

/** A track of levels in dB, as linear gains, in place. */
export const gainsOf = (db: Float64Array, n: number): void => {
  for (let i = 0; i < n; i++) db[i] = dbToGain(db[i] ?? 0);
};

/** Faded in over the first `fadeIn` frames and out over the last `fadeOut` (linear; 0 is no fade). */
export const fade = (out: Float32Array, n: number, fadeIn: number, fadeOut: number): void => {
  for (let i = 0; i < n; i++) {
    const rise = fadeIn > 0 ? i / fadeIn : 1;
    const fall = fadeOut > 0 ? (n - 1 - i) / fadeOut : 1;
    out[i] = (out[i] ?? 0) * Math.min(1, rise, fall);
  }
};

type Transfer = 'tanh' | 'soft' | 'hard' | 'fold';

/** One sample through a drive's transfer curve. */
const transferred = (transfer: Transfer, x: number): number => {
  switch (transfer) {
    case 'tanh':
      return tanh(x);
    case 'soft': {
      const c = Math.min(1, Math.max(-1, x));
      return 1.5 * c - 0.5 * c * c * c;
    }
    case 'hard':
      return Math.min(1, Math.max(-1, x));
    case 'fold': {
      // A triangle of x: x itself on [−1, 1], folded back beyond.
      const y = x + 1;
      return 1 - Math.abs(y - 4 * Math.floor(y / 4) - 2);
    }
  }
};

/** `out` driven by `gain[i]` (linear) through `transfer`. */
export const drive = (
  out: Float32Array,
  n: number,
  gain: Float64Array,
  transfer: Transfer,
): void => {
  for (let i = 0; i < n; i++) out[i] = transferred(transfer, (out[i] ?? 0) * (gain[i] ?? 0));
};

/** `out` held at `hz[i]` (sample and hold): a new sample each time the hold's phase turns over. */
export const hold = (out: Float32Array, n: number, hz: Float64Array): void => {
  let phase = 1;
  let held = 0;
  for (let i = 0; i < n; i++) {
    if (phase >= 1) {
      phase -= Math.floor(phase);
      held = out[i] ?? 0;
    }
    out[i] = held;
    phase += Math.max(0, hz[i] ?? 0) / SYNTH_RATE;
  }
};

/** `out` at `bits` bits: each sample rounded to a step of 2^(1 − bits). */
export const quantize = (out: Float32Array, n: number, bits: number): void => {
  const steps = exp2(bits - 1);
  for (let i = 0; i < n; i++) out[i] = Math.round((out[i] ?? 0) * steps) / steps;
};

/**
 * `from` (its first `m` frames) played `ratio` times as fast into `n` frames
 * of `out`: a four-point Catmull–Rom read between samples, silence past its
 * ends. No anti-alias filter: a `Filter` before it removes what would fold.
 */
export const resample = (
  from: Float32Array,
  m: number,
  out: Float32Array,
  n: number,
  ratio: number,
): void => {
  const at = (j: number) => (j >= 0 && j < m ? (from[j] ?? 0) : 0);
  for (let i = 0; i < n; i++) {
    const position = i * ratio;
    const j = Math.floor(position);
    const f = position - j;
    const x0 = at(j - 1);
    const x1 = at(j);
    const x2 = at(j + 1);
    const x3 = at(j + 2);
    const c1 = 0.5 * (x2 - x0);
    const c2 = x0 - 2.5 * x1 + 2 * x2 - 0.5 * x3;
    const c3 = 0.5 * (x3 - x0) + 1.5 * (x1 - x2);
    out[i] = ((c3 * f + c2) * f + c1) * f + x1;
  }
};

// The filter.

type FilterType = (typeof FILTERS)[number];

/** A normalised biquad: `y = b0 x + b1 x1 + b2 x2 − a1 y1 − a2 y2`. */
interface Coefficients {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

/** The highest frequency a filter is set to: just under the Nyquist, where its design holds. */
const TOP_HZ = 0.49 * SYNTH_RATE;

/** `c` set to `b / a0` and `a / a0`. */
const normalise = (
  c: Coefficients,
  b: readonly [number, number, number],
  a: readonly [number, number, number],
) => {
  c.b0 = b[0] / a[0];
  c.b1 = b[1] / a[0];
  c.b2 = b[2] / a[0];
  c.a1 = a[1] / a[0];
  c.a2 = a[2] / a[0];
};

/** A shelf's coefficients (the Audio EQ Cookbook's, its slope set by Q): `low` boosts below `hz`. */
const shelf = (c: Coefficients, low: boolean, cs: number, alpha: number, gain: number) => {
  const s = 2 * Math.sqrt(gain) * alpha;
  const up = gain + 1;
  const down = gain - 1;
  const sign = low ? -1 : 1;
  normalise(
    c,
    [
      gain * (up + sign * down * cs + s),
      -2 * sign * gain * (down + sign * up * cs),
      gain * (up + sign * down * cs - s),
    ],
    [up - sign * down * cs + s, 2 * sign * (down - sign * up * cs), up - sign * down * cs - s],
  );
};

/** `c` set to the Audio EQ Cookbook's design of `type` at `hz`, `q` and `db`. */
const design = (c: Coefficients, type: FilterType, hz: number, q: number, db: number): void => {
  const turns = Math.min(TOP_HZ, Math.max(1, hz)) / SYNTH_RATE;
  const cs = cosTurn(turns);
  const alpha = sinTurn(turns) / (2 * Math.max(0.05, q));
  const a: readonly [number, number, number] = [1 + alpha, -2 * cs, 1 - alpha];
  switch (type) {
    case 'lowpass':
      return normalise(c, [(1 - cs) / 2, 1 - cs, (1 - cs) / 2], a);
    case 'highpass':
      return normalise(c, [(1 + cs) / 2, -(1 + cs), (1 + cs) / 2], a);
    case 'bandpass':
      return normalise(c, [alpha, 0, -alpha], a);
    case 'notch':
      return normalise(c, [1, -2 * cs, 1], a);
    case 'allpass':
      return normalise(c, [1 - alpha, -2 * cs, 1 + alpha], a);
    case 'peak': {
      const gain = dbToGain(db / 2);
      return normalise(
        c,
        [1 + alpha * gain, -2 * cs, 1 - alpha * gain],
        [1 + alpha / gain, -2 * cs, 1 - alpha / gain],
      );
    }
    case 'lowshelf':
      return shelf(c, true, cs, alpha, dbToGain(db / 2));
    case 'highshelf':
      return shelf(c, false, cs, alpha, dbToGain(db / 2));
  }
};

/** What a filter reads each `CONTROL` frames: its frequency, Q and gain at that frame. */
export interface FilterTracks {
  readonly hz: Float64Array;
  readonly q: Float64Array;
  readonly db: Float64Array;
  /** Whether all three hold still, so one design serves every frame. */
  readonly held: boolean;
}

/** `out` through a `type` biquad (direct form I), redesigned every `CONTROL` frames unless held. */
export const biquad = (
  out: Float32Array,
  n: number,
  type: FilterType,
  tracks: FilterTracks,
): void => {
  const c: Coefficients = { b0: 0, b1: 0, b2: 0, a1: 0, a2: 0 };
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < n; i++) {
    if (i === 0 || (!tracks.held && i % CONTROL === 0))
      design(c, type, tracks.hz[i] ?? 0, tracks.q[i] ?? 0, tracks.db[i] ?? 0);
    const x0 = out[i] ?? 0;
    const y = c.b0 * x0 + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y;
    out[i] = y;
  }
};

// Space, each in place over the first `n` frames: the child in its head, silence after.

/** The longest echo a delay takes, in frames. */
const MOST_DELAY = 2 * SYNTH_RATE;

/** An echo `secs[i]` behind (read between samples), fed back by `feedback`, mixed in by `wet`. */
export const echo = (
  out: Float32Array,
  n: number,
  secs: Float64Array,
  mix: { readonly feedback: number; readonly wet: number },
  ring: Float64Array,
): void => {
  const size = ring.length;
  let write = 0;
  for (let i = 0; i < n; i++) {
    const behind = Math.min(size - 2, Math.max(1, (secs[i] ?? 0) * SYNTH_RATE));
    let read = write - behind;
    if (read < 0) read += size;
    const j = Math.floor(read);
    const f = read - j;
    const a = ring[j] ?? 0;
    const heard = a + ((ring[j + 1 === size ? 0 : j + 1] ?? 0) - a) * f;
    const x = out[i] ?? 0;
    ring[write] = x + mix.feedback * heard;
    out[i] = (1 - mix.wet) * x + mix.wet * heard;
    write = write + 1 === size ? 0 : write + 1;
  }
};

/** The ring an echo of at most `secs` needs, in frames. */
export const ringFrames = (secs: number): number =>
  Math.min(MOST_DELAY, Math.ceil(secs * SYNTH_RATE)) + 2;

/** Freeverb's comb lengths at 44.1 kHz (Jezar, public domain). */
export const COMBS = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617] as const;
/** Freeverb's allpass lengths at 44.1 kHz. */
export const ALLPASSES = [556, 441, 341, 225] as const;

/** What reaches Freeverb's combs: its fixed input gain. */
const FREEVERB_IN = 0.015;
/** Freeverb's wet scale. */
const FREEVERB_WET = 3;

/** A room's settings: its combs' feedback, their lowpass's coefficient, and the wet mix. */
interface Room {
  readonly feedback: number;
  readonly damp: number;
  readonly wet: number;
}

/** A room's feedback for `size` in [0, 1] (Freeverb's room scale). */
export const roomFeedback = (size: number): number => size * 0.28 + 0.7;

/** A comb's one-pole lowpass coefficient for a corner at `hz`. */
export const dampOf = (hz: number): number => exp((-2 * Math.PI * hz) / SYNTH_RATE);

/** A room's delay lines: Freeverb's 8 combs and 4 allpasses, each its own length, zeroed. */
interface RoomLines {
  readonly combs: ReadonlyArray<Float64Array>;
  readonly allpasses: ReadonlyArray<Float64Array>;
}

/**
 * The 8 combs in parallel for one frame: each reads its line, lowpasses it
 * (its state in `kept`) and writes `input` plus that, fed back.
 */
const combs = (lines: RoomLines, at: Int32Array, kept: Float64Array, input: number, room: Room) => {
  let sum = 0;
  for (let c = 0; c < lines.combs.length; c++) {
    const line = lines.combs[c];
    if (line === undefined) continue;
    const k = at[c] ?? 0;
    const y = line[k] ?? 0;
    const low = y * (1 - room.damp) + (kept[c] ?? 0) * room.damp;
    kept[c] = low;
    line[k] = input + low * room.feedback;
    at[c] = (k + 1) % line.length;
    sum += y;
  }
  return sum;
};

/** The 4 allpasses in series for one frame (feedback 0.5); their places follow the combs' in `at`. */
const allpasses = (lines: RoomLines, at: Int32Array, input: number) => {
  let acc = input;
  for (let a = 0; a < lines.allpasses.length; a++) {
    const line = lines.allpasses[a];
    if (line === undefined) continue;
    const k = at[lines.combs.length + a] ?? 0;
    const back = line[k] ?? 0;
    line[k] = acc + back * 0.5;
    acc = back - acc;
    at[lines.combs.length + a] = (k + 1) % line.length;
  }
  return acc;
};

/** A mono Freeverb over `out`: 8 combs in parallel, then 4 allpasses in series. */
export const reverb = (out: Float32Array, n: number, room: Room, lines: RoomLines): void => {
  const kept = new Float64Array(lines.combs.length);
  const at = new Int32Array(lines.combs.length + lines.allpasses.length);
  for (let i = 0; i < n; i++) {
    const x = out[i] ?? 0;
    const wet = allpasses(lines, at, combs(lines, at, kept, x * FREEVERB_IN, room));
    out[i] = (1 - room.wet) * x + room.wet * FREEVERB_WET * wet;
  }
};

/** `from`'s last `k` of `m` frames crossfaded (equal power) into its head, so its end runs on into its start. */
export const crossfade = (from: Float32Array, m: number, out: Float32Array, k: number): void => {
  const n = m - k;
  for (let i = 0; i < k; i++) {
    const g = i / k;
    out[i] = (from[i] ?? 0) * Math.sqrt(g) + (from[n + i] ?? 0) * Math.sqrt(1 - g);
  }
  for (let i = k; i < n; i++) out[i] = from[i] ?? 0;
};

/** `x` (its first `n` frames) times `gain`, added into `into` from frame `at`. */
export const addInto = (
  into: Float32Array,
  x: Float32Array,
  n: number,
  at: number,
  gain: number,
): void => {
  for (let i = 0; i < n; i++) into[at + i] = (into[at + i] ?? 0) + (x[i] ?? 0) * gain;
};

/** `out` scaled so its sample peak sits at `db` dBFS; silence stays silent. */
export const peakTo = (out: Float32Array, n: number, db: number): void => {
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i] ?? 0));
  if (peak > 0) scale(out, n, dbToGain(db) / peak);
};
