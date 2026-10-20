/**
 * The dry mix: each stem cut or padded to the hymn's length, levelled by its
 * own integrated loudness to −23 LUFS plus its level, panned, and summed.
 * Stems come one at a time, so the mix holds one stem beside the sum. Pure.
 */

import { addInto, loudness, type Pcm } from '@bible/film/measure';

/** The pan law: each side's gain at `pan` (−1 left, 1 right), the centre at unity, never above it. */
export const panGains = (pan: number): readonly [number, number] => {
  if (pan === 0) return [1, 1];
  const angle = ((pan + 1) * Math.PI) / 4;
  return [Math.min(1, Math.cos(angle) * Math.SQRT2), Math.min(1, Math.sin(angle) * Math.SQRT2)];
};

/** `pcm` as stereo of exactly `frames`: a mono stem doubled, the rest cut, silence padded. */
export const fitted = (pcm: Pcm, frames: number): Pcm => {
  const [left, right = left] = pcm.channels;
  const fit = (plane: Float32Array | undefined) => {
    const out = new Float32Array(frames);
    if (plane !== undefined) out.set(plane.subarray(0, frames));
    return out;
  };
  return { rate: pcm.rate, frames, channels: [fit(left), fit(right)] };
};

/** A stereo sum of `frames` at `rate`, silent until stems are added. */
export const emptyMix = (rate: number, frames: number): Pcm => ({
  rate,
  frames,
  channels: [new Float32Array(frames), new Float32Array(frames)],
});

/**
 * Adds `stem` into `mix` levelled to `lufs` and panned; answers the stem's
 * own integrated loudness. A silent stem adds nothing.
 */
export const addStem = (mix: Pcm, stem: Pcm, lufs: number, pan: number): number => {
  const fit = fitted(stem, mix.frames);
  const own = loudness(fit).integrated;
  if (!Number.isFinite(own)) return own;
  const gain = 10 ** ((lufs - own) / 20);
  const sides = panGains(pan);
  for (const c of [0, 1] as const) {
    const [into, from] = [mix.channels[c], fit.channels[c]];
    if (into !== undefined && from !== undefined) addInto([into], [from], 0, gain * sides[c]);
  }
  return own;
};
