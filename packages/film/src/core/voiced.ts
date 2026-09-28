// When a word is heard. The aligner that times a take puts the pause before a
// word into that word's start, so an aligned start can lead the voice by most
// of a second. The voice's own onset and offset are measured once, from the
// take's audio, when the take is timed (`narrate`, `takes import`, the lab's
// studio): the first and last 10 ms window inside the word's aligned span
// whose level passes a −40 dBFS gate. The take keeps both (`TakeWord`): a mark
// reads the aligned start, and what must meet the ear (a short's captions,
// its hook, its loop) reads the voice. Pure and DOM-free: no decode here.

import type { Pcm } from './audio.ts';
import type { TakeWord, Voiced, Word } from './schema.ts';

/** A window is voiced when its level is over this, in dBFS. */
export const VOICE_GATE_DB = -40;
/** The windows the level is read over, in seconds. */
export const VOICE_WINDOW = 0.01;

/** The gate as a mean square: `VOICE_GATE_DB` is 10·log10 of it. */
const GATE = 10 ** (VOICE_GATE_DB / 10);

/** Seconds to the millisecond, as the timings keep them. */
const ms = (s: number) => Math.round(s * 1000) / 1000;

/** The mean square of `pcm` over frames `[from, to)`, every channel together. */
const meanSquare = (pcm: Pcm, from: number, to: number): number => {
  let sum = 0;
  let n = 0;
  for (const plane of pcm.channels)
    for (let i = from; i < to; i++) {
      const x = plane[i] ?? 0;
      sum += x * x;
      n++;
    }
  return sum / Math.max(1, n);
};

/**
 * Where the voice is heard inside the take's seconds `[start, end]`: from the
 * first `VOICE_WINDOW` window over the gate to the end of the last, windows
 * counted from `start` and the last cut at `end`. A span no window of which
 * passes the gate holds no voice: the aligner has put the word's voice past
 * it (in the next word's span), so the word is heard no sooner than `end`.
 */
export const voicedSpan = (pcm: Pcm, start: number, end: number): Voiced => {
  const step = Math.max(1, Math.round(VOICE_WINDOW * pcm.rate));
  const from = Math.max(0, Math.round(start * pcm.rate));
  const to = Math.min(pcm.frames, Math.round(end * pcm.rate));
  let first = -1;
  let last = -1;
  for (let a = from; a < to; a += step) {
    const b = Math.min(to, a + step);
    if (meanSquare(pcm, a, b) <= GATE) continue;
    if (first < 0) first = a;
    last = b;
  }
  if (first < 0) return { start: end, end };
  // On the timings' millisecond grid, and never outside the span it was read in.
  const on = Math.min(end, Math.max(start, ms(first / pcm.rate)));
  return { start: on, end: Math.min(end, Math.max(on, ms(last / pcm.rate))) };
};

/** Each word of a take with where its voice is heard, read from the take's audio. */
export const voicedWords = (words: ReadonlyArray<Word>, pcm: Pcm): Array<TakeWord> =>
  words.map((w) => ({
    text: w.text,
    start: w.start,
    end: w.end,
    voiced: voicedSpan(pcm, w.start, w.end),
  }));

/** Words with no audio to measure (an estimate's): each is heard over its whole span. */
export const unmeasured = (words: ReadonlyArray<Word>): Array<TakeWord> =>
  words.map((w) => ({ ...w, voiced: { start: w.start, end: w.end } }));

/** Words timed by their voice: each word's span is where it is heard. */
export const heard = (words: ReadonlyArray<TakeWord>): Array<Word> =>
  words.map((w) => ({ text: w.text, start: w.voiced.start, end: w.voiced.end }));
