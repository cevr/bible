// Sound as numbers: planar PCM, one Float32Array per channel. The mixer makes
// it and the Media service reads and writes it. Pure and DOM-free.

/** Planar audio: `channels` arrays of `frames` samples each, at `rate` Hz. */
export interface Pcm {
  readonly rate: number;
  readonly frames: number;
  readonly channels: ReadonlyArray<Float32Array>;
}

/** Silence: `channels` × `frames` zeros. */
export const silence = (rate: number, frames: number, channels: number): Pcm => ({
  rate,
  frames,
  channels: Array.from({ length: channels }, () => new Float32Array(frames)),
});

/** Blocks of one sound (each `channels` wide), joined end to end. */
export const concat = (rate: number, channels: number, blocks: ReadonlyArray<Pcm>): Pcm => {
  const frames = blocks.reduce((sum, block) => sum + block.frames, 0);
  const out = Array.from({ length: channels }, () => new Float32Array(frames));
  let at = 0;
  for (const block of blocks) {
    for (const [c, plane] of block.channels.entries())
      out[c]?.set(plane.subarray(0, block.frames), at);
    at += block.frames;
  }
  return { rate, frames, channels: out };
};

/** `frames` frames of `pcm` from frame `from`; any past its end are silence. */
export const slice = (pcm: Pcm, from: number, frames: number): Pcm => ({
  rate: pcm.rate,
  frames,
  channels: pcm.channels.map((plane) => {
    const out = new Float32Array(frames);
    out.set(plane.subarray(from, Math.min(pcm.frames, from + frames)));
    return out;
  }),
});

/** A stretch of a sound: `frames` frames from frame `from`. */
export interface Piece {
  readonly from: number;
  readonly frames: number;
}

/**
 * `pieces` of `pcm`, joined end to end in order (a short's spans), each join
 * crossed by a fade: the last `fade` frames before it ramp down to silence and
 * the first `fade` after it ramp up, so a cut between two takes never clicks.
 * The outer edges are left as they are; one piece is a plain slice.
 */
export const splice = (pcm: Pcm, pieces: ReadonlyArray<Piece>, fade: number): Pcm => {
  const out = concat(
    pcm.rate,
    pcm.channels.length,
    pieces.map((p) => slice(pcm, p.from, p.frames)),
  );
  let at = 0;
  for (const [k, piece] of pieces.entries()) {
    const n = Math.min(fade, piece.frames);
    for (const plane of out.channels)
      for (let i = 0; i < n; i++) {
        const gain = (i + 0.5) / n;
        if (k > 0) plane[at + i] = (plane[at + i] ?? 0) * gain;
        if (k < pieces.length - 1) {
          const j = at + piece.frames - 1 - i;
          plane[j] = (plane[j] ?? 0) * gain;
        }
      }
    at += piece.frames;
  }
  return out;
};

/**
 * `pcm` fading in from silence over its first `seconds` and out to silence
 * over its last (linear, sample by sample: the first and last samples are 0),
 * every sample between as it was. A copy; `pcm` is left alone.
 */
export const fadeEdges = (pcm: Pcm, seconds: number): Pcm => {
  const n = Math.min(Math.round(seconds * pcm.rate), Math.floor(pcm.frames / 2));
  return {
    ...pcm,
    channels: pcm.channels.map((plane) => {
      const out = plane.slice(0, pcm.frames);
      for (let i = 0; i < n; i++) {
        const k = i / n;
        out[i] = (out[i] ?? 0) * k;
        out[pcm.frames - 1 - i] = (out[pcm.frames - 1 - i] ?? 0) * k;
      }
      return out;
    }),
  };
};

/**
 * Two channels. Mono spreads to both sides at −3 dB, as ffmpeg's rematrix did
 * in the graph the mix was balanced with (libswresample/rematrix.c,
 * `center_mix_level`); stereo passes through; more channels keep their first two.
 */
export const toStereo = (pcm: Pcm): Pcm => {
  const [first, second] = pcm.channels;
  if (first === undefined) return silence(pcm.rate, pcm.frames, 2);
  if (second !== undefined) return { ...pcm, channels: [first, second] };
  const side = first.map((x) => x * Math.SQRT1_2);
  return { ...pcm, channels: [side, side.slice()] };
};

/** C's `lrint` in the default rounding mode: to nearest, ties to even. */
const lrint = (v: number): number => {
  const floor = Math.floor(v);
  const frac = v - floor;
  if (frac > 0.5) return floor + 1;
  if (frac < 0.5) return floor;
  return floor % 2 === 0 ? floor : floor + 1;
};

/**
 * Interleaved 16-bit samples, converted as libswresample does
 * (audioconvert.c: `av_clip_int16(lrint(x * (1 << 15)))`).
 */
export const toInt16 = (pcm: Pcm): Int16Array => {
  const n = pcm.channels.length;
  const out = new Int16Array(pcm.frames * n);
  for (const [c, channel] of pcm.channels.entries())
    for (let i = 0; i < pcm.frames; i++)
      out[i * n + c] = Math.max(-32768, Math.min(32767, lrint((channel[i] ?? 0) * 32768)));
  return out;
};

/** How loud a sound is, in dBFS: its mean power and its peak (what ffmpeg's volumedetect reports). */
export interface Levels {
  readonly mean: number;
  readonly peak: number;
}

/** `pcm`'s levels over every sample of every channel; silence is −Infinity. */
export const levels = (pcm: Pcm): Levels => {
  let power = 0;
  let peak = 0;
  for (const channel of pcm.channels)
    for (const x of channel) {
      power += x * x;
      peak = Math.max(peak, Math.abs(x));
    }
  const samples = pcm.frames * pcm.channels.length;
  return {
    mean: 10 * Math.log10(samples > 0 ? power / samples : 0),
    peak: 20 * Math.log10(peak),
  };
};

/** One channel: the mean of `pcm`'s channels, sample by sample. */
export const toMono = (pcm: Pcm): Pcm => {
  const out = new Float32Array(pcm.frames);
  const n = Math.max(1, pcm.channels.length);
  for (const channel of pcm.channels)
    for (let i = 0; i < pcm.frames; i++) out[i] = (out[i] ?? 0) + (channel[i] ?? 0) / n;
  return { rate: pcm.rate, frames: pcm.frames, channels: [out] };
};

/** The RMS level in dBFS of each `window` frames of `plane`, in order; the last may be short. */
export const windowLevels = (plane: Float32Array, window: number): Float64Array => {
  const out = new Float64Array(Math.ceil(plane.length / window));
  for (let w = 0; w < out.length; w++) {
    const from = w * window;
    const to = Math.min(plane.length, from + window);
    let power = 0;
    for (let i = from; i < to; i++) power += (plane[i] ?? 0) ** 2;
    out[w] = 10 * Math.log10(power / Math.max(1, to - from));
  }
  return out;
};

/** `pcm` made `db` decibels louder (quieter when negative). */
export const gain = (pcm: Pcm, db: number): Pcm => {
  const k = 10 ** (db / 20);
  return { ...pcm, channels: pcm.channels.map((channel) => channel.map((x) => x * k)) };
};
