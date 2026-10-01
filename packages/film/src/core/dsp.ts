// The mix's signal processing: sounds added in at a frame, the score's fades,
// the duck under the voice and the final limiter. The fade, duck and limiter
// keep the arithmetic of libavfilter's afade, sidechaincompress and alimiter
// (n9.0.1), the filters the mix was balanced with, so a mix sounds as it
// did when it was balanced. Pure sample loops over planar Float32Arrays;
// past an array's end reads silence.

/** `secs` as a frame count at `rate`, to the nearest frame. */
export const toFrames = (secs: number, rate: number): number => Math.round(secs * rate);

/** Add `src` × `gain` into `dst` from frame `at`; what falls past `dst`'s end is dropped. */
export const addInto = (
  dst: ReadonlyArray<Float32Array>,
  src: ReadonlyArray<Float32Array>,
  at: number,
  gain: number,
): void => {
  for (const [c, out] of dst.entries()) {
    const from = src[c];
    if (from === undefined) continue;
    const end = Math.min(from.length, out.length - at);
    for (let i = Math.max(0, -at); i < end; i++)
      out[at + i] = (out[at + i] ?? 0) + (from[i] ?? 0) * gain;
  }
};

/** A linear fade (afade, `curve=tri`). */
interface Fade {
  readonly type: 'in' | 'out';
  /** The first frame of the fade. */
  readonly start: number;
  /** Its length in frames. */
  readonly frames: number;
}

/**
 * Apply `spec` in place (af_afade.c `fade_gain` with `curve=tri`): a fade-in
 * is silent before `start`; a fade-out is silent after `start + frames`.
 */
export const fade = (channels: ReadonlyArray<Float32Array>, spec: Fade): void => {
  for (const channel of channels)
    for (let i = 0; i < channel.length; i++) {
      const index = spec.type === 'in' ? i - spec.start : spec.start + spec.frames - i;
      const gain = Math.min(1, Math.max(0, index / spec.frames));
      if (gain !== 1) channel[i] = (channel[i] ?? 0) * gain;
    }
};

/** Downward compression keyed by another signal (sidechaincompress). */
export interface Duck {
  /** Linear level the key must pass. */
  readonly threshold: number;
  readonly ratio: number;
  /** Milliseconds. */
  readonly attack: number;
  readonly release: number;
  /** Knee width as a level ratio. */
  readonly knee: number;
}

/** The knee's curve (libavfilter hermite.h `hermite_interpolation`). */
const hermite = (
  x: number,
  x0: number,
  x1: number,
  p0: number,
  p1: number,
  m0: number,
  m1: number,
): number => {
  const width = x1 - x0;
  const t = (x - x0) / width;
  const t2 = t * t;
  const t3 = t2 * t;
  const ct1 = m0 * width;
  const ct2 = -3 * p0 - 2 * m0 * width + 3 * p1 - m1 * width;
  const ct3 = 2 * p0 + m0 * width - 2 * p1 + m1 * width;
  return ct3 * t3 + ct2 * t2 + ct1 * t + p0;
};

/**
 * Duck `main` in place under `key` (af_sidechaincompress.c `compressor` with
 * its defaults: RMS detection, channels averaged, downward, no makeup, fully
 * wet).
 */
export const duck = (
  main: ReadonlyArray<Float32Array>,
  key: ReadonlyArray<Float32Array>,
  rate: number,
  spec: Duck,
): void => {
  const thres = Math.log(spec.threshold);
  const linKneeStart = spec.threshold / Math.sqrt(spec.knee);
  const adjKneeStart = linKneeStart * linKneeStart;
  const kneeStart = Math.log(linKneeStart);
  const kneeStop = Math.log(spec.threshold * Math.sqrt(spec.knee));
  const compressedKneeStop = (kneeStop - thres) / spec.ratio + thres;
  const attack = Math.min(1, 1 / ((spec.attack * rate) / 4000));
  const release = Math.min(1, 1 / ((spec.release * rate) / 4000));

  const gainAt = (linSlope: number): number => {
    const slope = Math.log(linSlope) * 0.5;
    const gain =
      spec.knee > 1 && slope < kneeStop
        ? hermite(slope, kneeStart, kneeStop, kneeStart, compressedKneeStop, 1, 1 / spec.ratio)
        : (slope - thres) / spec.ratio + thres;
    return Math.exp(gain - slope);
  };

  const frames = Math.max(0, ...main.map((channel) => channel.length));
  let linSlope = 0;
  for (let i = 0; i < frames; i++) {
    let level = 0;
    for (const channel of key) level += Math.abs(channel[i] ?? 0);
    level /= key.length;
    level *= level;
    linSlope += (level - linSlope) * (level > linSlope ? attack : release);
    if (!(linSlope > 0 && linSlope > adjKneeStart)) continue;
    const gain = gainAt(linSlope);
    for (const channel of main) channel[i] = (channel[i] ?? 0) * gain;
  }
};

/** A brick-wall limiter with look-ahead (alimiter). */
export interface Limit {
  /** Linear ceiling. */
  readonly limit: number;
  /** Milliseconds. */
  readonly attack: number;
  readonly release: number;
}

/**
 * The limiter's running state, as alimiter's context keeps it: one interleaved
 * ring of `bufferSize` samples (the attack window), the gain now (`att`) and
 * its step per frame (`delta`), and the queue of gain steps still to take
 * (`nextpos`/`nextdelta`, `nextlen` of them from `nextiter`).
 */
interface Limiter {
  readonly channels: number;
  readonly bufferSize: number;
  readonly ceiling: number;
  /** Frames the release takes to recover from full attenuation. */
  readonly releaseFrames: number;
  readonly buffer: Float64Array;
  readonly nextdelta: Float64Array;
  readonly nextpos: Int32Array;
  pos: number;
  att: number;
  delta: number;
  nextiter: number;
  nextlen: number;
}

/** The loudest channel of the frame at ring index `at`. */
const peakAt = (l: Limiter, at: number): number => {
  let peak = 0;
  for (let c = 0; c < l.channels; c++) peak = Math.max(peak, Math.abs(l.buffer[at + c] ?? 0));
  return peak;
};

/**
 * The first queued step, from `nextiter`, that the frame just in (`peak` over
 * the ceiling) makes steeper: lowered to reach it, and its index; -1 when none.
 */
const steepenQueued = (l: Limiter, peak: number): number => {
  for (let i = l.nextiter; i < l.nextiter + l.nextlen; i++) {
    const j = i % l.bufferSize;
    const at = l.nextpos[j] ?? -1;
    const ppeak = at >= 0 ? peakAt(l, at) : 0;
    const span = Math.trunc(((l.bufferSize - at + l.pos) % l.bufferSize) / l.channels);
    const pdelta = (l.ceiling / peak - l.ceiling / ppeak) / span;
    if (pdelta < (l.nextdelta[j] ?? 0)) {
      l.nextdelta[j] = pdelta;
      return i;
    }
  }
  return -1;
};

/**
 * Queue the gain steps a frame over the ceiling needs: a steeper fall than
 * the one under way restarts the queue at it; otherwise it steepens a queued
 * step and queues its own release after it.
 */
const queuePeak = (l: Limiter, peak: number): void => {
  const patt = Math.min(l.ceiling / peak, 1);
  const rdelta = (1 - patt) / l.releaseFrames;
  const next = ((l.ceiling / peak - l.att) / l.bufferSize) * l.channels;
  if (next < l.delta) {
    l.delta = next;
    l.nextpos[0] = l.pos;
    l.nextpos[1] = -1;
    l.nextdelta[0] = rdelta;
    l.nextlen = 1;
    l.nextiter = 0;
    return;
  }
  const i = steepenQueued(l, peak);
  if (i < 0) return;
  l.nextlen = i - l.nextiter + 1;
  l.nextpos[(l.nextiter + l.nextlen) % l.bufferSize] = l.pos;
  l.nextdelta[(l.nextiter + l.nextlen) % l.bufferSize] = rdelta;
  l.nextpos[(l.nextiter + l.nextlen + 1) % l.bufferSize] = -1;
  l.nextlen++;
};

/**
 * Past the frame leaving the ring at `oldest`: take the queued step due there,
 * then hold the gain inside (0, 1] and snap what is within rounding of 1 or 0.
 */
const advance = (l: Limiter, oldest: number): void => {
  if (oldest === l.nextpos[l.nextiter]) {
    l.delta = l.nextdelta[l.nextiter] ?? 0;
    l.att = l.ceiling / peakAt(l, oldest);
    l.nextlen -= 1;
    l.nextpos[l.nextiter] = -1;
    l.nextiter = (l.nextiter + 1) % l.bufferSize;
  }
  if (l.att > 1) {
    l.att = 1;
    l.delta = 0;
    l.nextiter = 0;
    l.nextlen = 0;
    l.nextpos[0] = -1;
  }
  if (l.att <= 0) {
    l.att = 0.0000000000001;
    l.delta = (1 - l.att) / l.releaseFrames;
  }
  if (l.att !== 1 && 1 - l.att < 0.0000000000001) l.att = 1;
  if (l.delta !== 0 && Math.abs(l.delta) < 0.00000000000001) l.delta = 0;
};

/** `input` through `limitInto`, as new channels `input`'s length. */
export const limit = (
  input: ReadonlyArray<Float32Array>,
  rate: number,
  spec: Limit,
): Array<Float32Array> => {
  const frames = Math.max(0, ...input.map((channel) => channel.length));
  const out = input.map(() => new Float32Array(frames));
  limitInto(input, rate, spec, out);
  return out;
};

/**
 * `input` through af_alimiter.c `filter_frame` with `level=false`, no
 * auto-release and no latency compensation, written into `out`: the output
 * runs one attack window (less a frame) behind the input, as alimiter's does.
 * `out` may be `input` itself: each frame is read before it is written.
 */
export const limitInto = (
  input: ReadonlyArray<Float32Array>,
  rate: number,
  spec: Limit,
  out: ReadonlyArray<Float32Array>,
): void => {
  const channels = input.length;
  const frames = Math.max(0, ...input.map((channel) => channel.length));
  const ceiling = spec.limit;
  const release = spec.release / 1000;
  const ringSize = Math.trunc((rate * channels * 100) / 1000 + channels);
  let bufferSize = Math.trunc(rate * (spec.attack / 1000) * channels);
  bufferSize -= bufferSize % channels;
  const l: Limiter = {
    channels,
    bufferSize,
    ceiling,
    releaseFrames: rate * release,
    buffer: new Float64Array(ringSize),
    nextdelta: new Float64Array(ringSize),
    nextpos: new Int32Array(ringSize).fill(-1),
    pos: 0,
    att: 1,
    delta: 0,
    nextiter: 0,
    nextlen: 0,
  };
  for (let n = 0; n < frames; n++) {
    for (const [c, channel] of input.entries()) l.buffer[l.pos + c] = channel[n] ?? 0;
    const peak = peakAt(l, l.pos);
    if (peak > ceiling) queuePeak(l, peak);

    const oldest = (l.pos + channels) % bufferSize;
    l.att += l.delta;
    const gain = l.att;
    advance(l, oldest);

    for (const [c, channel] of out.entries())
      channel[n] = Math.min(ceiling, Math.max(-ceiling, (l.buffer[oldest + c] ?? 0) * gain));
    l.pos = (l.pos + channels) % bufferSize;
  }
};
