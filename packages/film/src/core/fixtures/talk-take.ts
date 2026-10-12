// A take made up for the tests, as its transcript reads (`core/footage.ts`):
// each word voiced for 0.3 s after a pause, and the voice's loudness every
// 10 ms, loud (-20 dB) where a word is voiced and silent (-80 dB) between.
// What a talk is cut on (`core/talk.ts`), with no recording behind it.

import type { TalkTake } from '../talk.ts';
import { voicedAt } from '../voiced.ts';

/** The footage source a synthetic take is, unless it names another. */
export const SYNTHETIC_SOURCE = 'take.why/0123456789ab';

/** How long each word of a synthetic take is voiced, in seconds. */
const VOICED = 0.3;

/**
 * A take of `texts`, the first word after 0.3 s of room, each word voiced
 * `VOICED` s after a pause of `pauses[i]` (0.1 s where none is given), with
 * 0.5 s of room after the last: the source `source`, a phone's 1080 × 1920
 * picture unless `size` says otherwise.
 */
export const syntheticTake = (
  texts: ReadonlyArray<string>,
  pauses: ReadonlyArray<number> = [],
  source: string = SYNTHETIC_SOURCE,
  size: { readonly width: number; readonly height: number } = { width: 1080, height: 1920 },
): TalkTake => {
  let t = 0.3;
  const words = texts.map((text, i) => {
    const before = t;
    const start = before + (pauses[i] ?? 0.1);
    const end = start + VOICED;
    t = end;
    return { text, start: before, end, voiced: voicedAt(start, end) };
  });
  const seconds = t + 0.5;
  const envelope = Array.from({ length: Math.ceil(seconds / 0.01) }, (_, k) => {
    const at = k * 0.01 + 0.005;
    return [-80, -20][Number(words.some((w) => at > w.voiced.start && at < w.voiced.end))] ?? -80;
  });
  return { source, words, envelope, ...size };
};
