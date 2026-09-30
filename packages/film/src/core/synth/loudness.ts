// How loud a sound is, as ITU-R BS.1770-4 measures it: each channel through
// the K-weighting (a +4 dB high shelf, then a 38 Hz high-pass), channel powers
// summed with weight 1 (no surround channels here), then read over 400 ms
// blocks. `integrated` gates the blocks (absolute at -70 LUFS, relative at
// -10 LU) as the standard does; `momentaryMax` is the loudest block (100 ms
// apart, ungated), which is how a one-shot is levelled; `peak` is the sample
// peak. The filters are the RBJ biquads at the standard's analog parameters,
// so any rate measures alike (pyloudnorm's approach; within 0.1 dB of
// libebur128 on the prototype's sounds). Pure.

import type { Pcm } from '../audio.ts';
import { type Coefficients, runBiquad } from './signal.ts';

/** A sound's loudness: integrated and momentary max in LUFS, sample peak in dBFS; silence is -Infinity. */
export interface Loudness {
  readonly integrated: number;
  readonly momentaryMax: number;
  readonly peak: number;
}

/** BS.1770's block and hop, in seconds. */
const BLOCK = 0.4;
const HOP = 0.1;
/** The gates: absolute, and relative to the mean of what passed the absolute one. */
const ABSOLUTE_GATE = -70;
const RELATIVE_GATE = -10;

/**
 * The K-weighting's two stages at `rate`, designed from the standard's analog
 * parameters by the bilinear transform as libebur128 does: the shelf, then
 * the RLB high-pass.
 */
const kWeighting = (rate: number): ReadonlyArray<Coefficients> => {
  const shelf = (() => {
    const k = Math.tan((Math.PI * 1681.974450955533) / rate);
    const q = 0.7071752369554196;
    const vh = 10 ** (3.999843853973347 / 20);
    const vb = vh ** 0.4996667741545416;
    const a0 = 1 + k / q + k * k;
    return {
      b0: (vh + (vb * k) / q + k * k) / a0,
      b1: (2 * (k * k - vh)) / a0,
      b2: (vh - (vb * k) / q + k * k) / a0,
      a1: (2 * (k * k - 1)) / a0,
      a2: (1 - k / q + k * k) / a0,
    };
  })();
  const highPass = (() => {
    const k = Math.tan((Math.PI * 38.13547087602444) / rate);
    const q = 0.5003270373238773;
    const a0 = 1 + k / q + k * k;
    return { b0: 1, b1: -2, b2: 1, a1: (2 * (k * k - 1)) / a0, a2: (1 - k / q + k * k) / a0 };
  })();
  return [shelf, highPass];
};

/** A mean-square power as loudness. */
const lufsOf = (power: number): number => -0.691 + 10 * Math.log10(power);

/** The sum over channels of each block's mean square, K-weighted: one power per block. */
const blockPowers = (pcm: Pcm): ReadonlyArray<number> => {
  const block = Math.round(BLOCK * pcm.rate);
  const hop = Math.round(HOP * pcm.rate);
  const starts: Array<number> = [];
  for (let s = 0; s + block <= pcm.frames; s += hop) starts.push(s);
  // A sound shorter than a block is one block, the rest of it silence.
  if (starts.length === 0) starts.push(0);
  const powers = starts.map(() => 0);
  for (const plane of pcm.channels) {
    let weighted = plane.subarray(0, pcm.frames);
    for (const stage of kWeighting(pcm.rate)) weighted = runBiquad(weighted, stage);
    // Running sums of squares, so each block's power is one subtraction.
    const sums = new Float64Array(pcm.frames + 1);
    for (let i = 0; i < pcm.frames; i++) sums[i + 1] = (sums[i] ?? 0) + (weighted[i] ?? 0) ** 2;
    for (const [k, s] of starts.entries()) {
      const end = Math.min(pcm.frames, s + block);
      powers[k] = (powers[k] ?? 0) + ((sums[end] ?? 0) - (sums[s] ?? 0)) / block;
    }
  }
  return powers;
};

const meanOf = (xs: ReadonlyArray<number>): number =>
  xs.reduce((sum, x) => sum + x, 0) / Math.max(1, xs.length);

/** `pcm`'s loudness. */
export const loudness = (pcm: Pcm): Loudness => {
  const powers = blockPowers(pcm);
  const loud = powers.filter((p) => lufsOf(p) > ABSOLUTE_GATE);
  const relative = lufsOf(meanOf(loud)) + RELATIVE_GATE;
  const gated = loud.filter((p) => lufsOf(p) > relative);
  let peak = 0;
  for (const plane of pcm.channels)
    for (let i = 0; i < pcm.frames; i++) peak = Math.max(peak, Math.abs(plane[i] ?? 0));
  return {
    integrated: gated.length > 0 ? lufsOf(meanOf(gated)) : Number.NEGATIVE_INFINITY,
    momentaryMax: lufsOf(Math.max(0, ...powers)),
    peak: 20 * Math.log10(peak),
  };
};
