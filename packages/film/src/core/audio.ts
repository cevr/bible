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

/**
 * A lighter copy to preview with: mono (the channels averaged) at half the
 * rate (each pair of frames averaged). The editor and the page play it under
 * the Film; the render encodes from the master, never from this.
 */
export const preview = (pcm: Pcm): Pcm => {
  const frames = Math.floor(pcm.frames / 2);
  const out = new Float32Array(frames);
  const n = Math.max(1, pcm.channels.length);
  for (const channel of pcm.channels)
    for (let i = 0; i < frames; i++)
      out[i] = (out[i] ?? 0) + ((channel[2 * i] ?? 0) + (channel[2 * i + 1] ?? 0)) / (2 * n);
  return { rate: pcm.rate / 2, frames, channels: [out] };
};
