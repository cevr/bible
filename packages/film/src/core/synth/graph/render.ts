// A code sound rendered: a pure function of its resolved graph and a seed. One
// channel at `SYNTH_RATE`, its peak at `SYNTH_PEAK`, the same samples for the
// same graph and seed on every run and every host. Its buffers come from one
// pool for the render, and a sound it samples is made once per seed.

import type { Pcm } from '../../audio.ts';
import { peakTo } from './kernels.ts';
import { type Kit, ROOT, type ResolvedSound, planNode } from './plan.ts';
import { SYNTH_PEAK, SYNTH_RATE } from './units.ts';

/**
 * The renderer's version: the first 8 hex of the sha256 of its probes' pins
 * (fixtures/golden.ts, asserted by render.test.ts). A change to the DSP that
 * moves one sample of one probe moves it, and with it the key of every code
 * sound's render and mix.
 */
export const RENDER_VERSION = 'a45dbac0';

/** Buffers are borrowed in blocks of this many bytes, so lengths that differ a little share one. */
const BLOCK = 16384;

/** `sound` with `seed` into a new array of its own, peaked. */
const rendered = (sound: ResolvedSound, seed: number, kit: Kit): Float32Array => {
  const planned = planNode(sound.sound.play, ROOT, { seed, sound, kit });
  const out = new Float32Array(planned.frames);
  planned.fill(out);
  peakTo(out, planned.frames, SYNTH_PEAK);
  return out;
};

/** A pool of zeroed buffers by size, and the samples made, for one render. */
const kitOf = (): Kit => {
  const free: Array<ArrayBufferLike> = [];
  const claim = (bytes: number): ArrayBufferLike => {
    let best = -1;
    for (let i = 0; i < free.length; i++) {
      const size = free[i]?.byteLength ?? 0;
      if (size >= bytes && (best < 0 || size < (free[best]?.byteLength ?? 0))) best = i;
    }
    const found = best < 0 ? undefined : free.splice(best, 1)[0];
    return found ?? new ArrayBuffer(Math.max(BLOCK, Math.ceil(bytes / BLOCK) * BLOCK));
  };
  const made = new Map<string, Float32Array>();
  const kit: Kit = {
    take: (frames) => new Float32Array(claim(frames * 4), 0, frames).fill(0),
    give: (buffer) => void free.push(buffer.buffer),
    takeWide: (frames) => new Float64Array(claim(frames * 8), 0, frames).fill(0),
    giveWide: (buffer) => void free.push(buffer.buffer),
    sample: (sound, seed) => {
      const key = `${sound.hash}/${seed}`;
      const found = made.get(key);
      if (found !== undefined) return found;
      const plane = rendered(sound, seed, kit);
      made.set(key, plane);
      return plane;
    },
  };
  return kit;
};

/** `sound` rendered with `seed`: variant n is seed n. */
export const renderCode = (sound: ResolvedSound, seed: number): Pcm => {
  const plane = rendered(sound, seed, kitOf());
  return { rate: SYNTH_RATE, frames: plane.length, channels: [plane] };
};
