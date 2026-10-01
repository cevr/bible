// Where a bed loops: how its end meets its start. A loop that jumps in level
// or steps sharply across the join is heard as a seam every time it repeats.

import type { Pcm } from '../audio.ts';

/** How a bed's end meets its start when looped. */
interface Seam {
  /** The difference in short-term (3 s) level either side of the join, in dB. */
  readonly db: number;
  /** The sample step across the join, as a multiple of the sound's median step. */
  readonly click: number;
}

/** A bed's loop point may change its short-term level by at most this, in dB. */
const SEAM_DB = 1;
/** A step across the join larger than this many median steps is a click. */
const SEAM_CLICK = 8;

/** The mean square of every channel over `[from, to)`. */
const power = (pcm: Pcm, from: number, to: number): number => {
  let sum = 0;
  for (const plane of pcm.channels) for (let i = from; i < to; i++) sum += (plane[i] ?? 0) ** 2;
  return sum / Math.max(1, (to - from) * pcm.channels.length);
};

const db = (p: number) => 10 * Math.log10(Math.max(p, 1e-12));

/** The step from the last sample to the first, against the median step, on the worst channel. */
const clickOf = (pcm: Pcm): number => {
  let worst = 0;
  const stride = Math.max(1, Math.floor(pcm.frames / 4096));
  for (const plane of pcm.channels) {
    const steps: Array<number> = [];
    for (let i = 1; i < pcm.frames; i += stride)
      steps.push(Math.abs((plane[i] ?? 0) - (plane[i - 1] ?? 0)));
    steps.sort((a, b) => a - b);
    const typical = Math.max(steps[Math.floor(steps.length / 2)] ?? 0, 1e-9);
    worst = Math.max(worst, Math.abs((plane[0] ?? 0) - (plane[pcm.frames - 1] ?? 0)) / typical);
  }
  return worst;
};

/** How `pcm` meets itself when looped. */
export const loopSeam = (pcm: Pcm): Seam => {
  const window = Math.min(Math.floor(pcm.frames / 2), Math.round(3 * pcm.rate));
  return {
    db: Math.abs(db(power(pcm, pcm.frames - window, pcm.frames)) - db(power(pcm, 0, window))),
    click: clickOf(pcm),
  };
};

/** Whether the seam is heard. */
export const seamHeard = (seam: Seam): boolean => seam.db > SEAM_DB || seam.click > SEAM_CLICK;
