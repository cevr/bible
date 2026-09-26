// The mix's signal processing: sounds added in at a frame, the score's fades,
// the duck under the voice and the final limiter. The fade, duck and limiter
// are ported from the ffmpeg filters the mix was first built and balanced with
// (FFmpeg n9.0.1, libavfilter: afade, sidechaincompress, alimiter) and keep
// their arithmetic, so a mix sounds as it did when it was balanced. Pure
// sample loops over planar Float32Arrays; past an array's end reads silence.

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
export interface Fade {
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
 * `input` through af_alimiter.c `filter_frame` with `level=false`, no
 * auto-release and no latency compensation: the output runs one attack
 * window (less a frame) behind the input, as it did in the ffmpeg graph.
 * Returns new channels, `input`'s length.
 */
export const limit = (
  input: ReadonlyArray<Float32Array>,
  rate: number,
  spec: Limit,
): Array<Float32Array> => {
  const channels = input.length;
  const frames = Math.max(0, ...input.map((channel) => channel.length));
  const ceiling = spec.limit;
  const release = spec.release / 1000;
  // One interleaved ring of `bufferSize` samples (the attack window), and the
  // queue of gain steps still to take (`nextpos`/`nextdelta`), as alimiter keeps them.
  const ringSize = Math.trunc((rate * channels * 100) / 1000 + channels);
  let bufferSize = Math.trunc(rate * (spec.attack / 1000) * channels);
  bufferSize -= bufferSize % channels;
  const buffer = new Float64Array(ringSize);
  const nextdelta = new Float64Array(ringSize);
  const nextpos = new Int32Array(ringSize).fill(-1);
  const out = input.map(() => new Float32Array(frames));
  const peakAt = (at: number) => {
    let peak = 0;
    for (let c = 0; c < channels; c++) peak = Math.max(peak, Math.abs(buffer[at + c] ?? 0));
    return peak;
  };
  let pos = 0;
  let att = 1;
  let delta = 0;
  let nextiter = 0;
  let nextlen = 0;

  for (let n = 0; n < frames; n++) {
    for (const [c, channel] of input.entries()) buffer[pos + c] = channel[n] ?? 0;
    const peak = peakAt(pos);

    if (peak > ceiling) {
      const patt = Math.min(ceiling / peak, 1);
      const rdelta = (1 - patt) / (rate * release);
      const next = ((ceiling / peak - att) / bufferSize) * channels;
      if (next < delta) {
        delta = next;
        nextpos[0] = pos;
        nextpos[1] = -1;
        nextdelta[0] = rdelta;
        nextlen = 1;
        nextiter = 0;
      } else {
        let i = nextiter;
        let found = false;
        for (; i < nextiter + nextlen; i++) {
          const j = i % bufferSize;
          const at = nextpos[j] ?? -1;
          const ppeak = at >= 0 ? peakAt(at) : 0;
          const span = Math.trunc(((bufferSize - at + pos) % bufferSize) / channels);
          const pdelta = (ceiling / peak - ceiling / ppeak) / span;
          if (pdelta < (nextdelta[j] ?? 0)) {
            nextdelta[j] = pdelta;
            found = true;
            break;
          }
        }
        if (found) {
          nextlen = i - nextiter + 1;
          nextpos[(nextiter + nextlen) % bufferSize] = pos;
          nextdelta[(nextiter + nextlen) % bufferSize] = rdelta;
          nextpos[(nextiter + nextlen + 1) % bufferSize] = -1;
          nextlen++;
        }
      }
    }

    const oldest = (pos + channels) % bufferSize;
    att += delta;
    const gain = att;

    if (oldest === nextpos[nextiter]) {
      delta = nextdelta[nextiter] ?? 0;
      att = ceiling / peakAt(oldest);
      nextlen -= 1;
      nextpos[nextiter] = -1;
      nextiter = (nextiter + 1) % bufferSize;
    }
    if (att > 1) {
      att = 1;
      delta = 0;
      nextiter = 0;
      nextlen = 0;
      nextpos[0] = -1;
    }
    if (att <= 0) {
      att = 0.0000000000001;
      delta = (1 - att) / (rate * release);
    }
    if (att !== 1 && 1 - att < 0.0000000000001) att = 1;
    if (delta !== 0 && Math.abs(delta) < 0.00000000000001) delta = 0;

    for (const [c, channel] of out.entries())
      channel[n] = Math.min(ceiling, Math.max(-ceiling, (buffer[oldest + c] ?? 0) * gain));
    pos = (pos + channels) % bufferSize;
  }
  return out;
};
