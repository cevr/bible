// Where the score sits (CRAFT rule 10): `under` the voice wherever anyone
// speaks, short pauses included, and `alone` where no one speaks for a while
// (the title card, a held beat, the landing, the credits), rising a moment
// after the voice stops and settling back before it speaks again. Both levels
// are dB against the voice, as BS.1770 hears each: the voice bus's integrated
// loudness against the score's own over the stretches it plays at that level,
// so a score that swells where the voice rests is not turned down for it.
// Pure: the mix builds the envelope from its voice bus.

import { type Pcm, SPEECH_GATE, concat, slice, windowPowers } from './audio.ts';
import { loudness } from './synth/loudness.ts';
import type { Interval } from './time.ts';

export const SCORE = {
  /** The voice is read in windows this long (seconds); one under `SPEECH_GATE` is no one speaking. */
  window: 0.1,
  /** A pause at least this long (seconds) lets the score play alone. */
  alone: 3,
  /** The score waits this long after the voice stops before it rises, and is down this long before it speaks. */
  lead: 0.25,
  /** Each rise and fall between `under` and `alone` takes this long (seconds). */
  ramp: 1,
} as const;

/**
 * Where the voice speaks: each run of windows over `SPEECH_GATE`, in film
 * seconds (the last window may be short; a span in it ends at the voice's end).
 */
export const speechSpans = (voice: Pcm): ReadonlyArray<Interval> => {
  const size = Math.max(1, Math.round(SCORE.window * voice.rate));
  const end = voice.frames / voice.rate;
  const levels = windowPowers(voice, size);
  const spans: Array<Interval> = [];
  let open = -1;
  for (const [w, level] of levels.entries()) {
    const speaking = level > SPEECH_GATE;
    if (speaking && open < 0) open = w;
    if (!speaking && open >= 0) {
      spans.push({ from: (open * size) / voice.rate, to: (w * size) / voice.rate });
      open = -1;
    }
  }
  if (open >= 0) spans.push({ from: (open * size) / voice.rate, to: end });
  return spans;
};

/**
 * A stretch where the score plays alone: `hold` at the alone level, with a
 * ramp up into it (none where the film opens without a voice) and down out of
 * it (none where the film ends without one).
 */
interface Alone {
  readonly hold: Interval;
  readonly rise: boolean;
  readonly fall: boolean;
}

/** Each pause in `speech` long enough for the score to play alone, over a film `seconds` long. */
export const aloneSpans = (
  speech: ReadonlyArray<Interval>,
  seconds: number,
): ReadonlyArray<Alone> => {
  const bounds = [{ from: 0, to: 0 }, ...speech, { from: seconds, to: seconds }];
  const out: Array<Alone> = [];
  for (let k = 0; k + 1 < bounds.length; k++) {
    const a = bounds[k]?.to ?? 0;
    const b = bounds[k + 1]?.from ?? seconds;
    const rise = k > 0;
    const fall = k + 2 < bounds.length;
    const edge = SCORE.lead + SCORE.ramp;
    let from = a;
    if (rise) from = a + edge;
    let to = b;
    if (fall) to = b - edge;
    const long = b - a >= SCORE.alone || !rise || !fall;
    if (long && to > from) out.push({ hold: { from, to }, rise, fall });
  }
  return out;
};

/**
 * How far into `alone` the score is at each frame: 0 under the voice, 1 alone,
 * linear through each ramp.
 */
export const aloneWeights = (
  spans: ReadonlyArray<Alone>,
  rate: number,
  frames: number,
): Float32Array => {
  const weights = new Float32Array(frames);
  const at = (secs: number) => Math.max(0, Math.min(frames, Math.round(secs * rate)));
  for (const span of spans) {
    const from = at(span.hold.from);
    const to = at(span.hold.to);
    weights.fill(1, from, to);
    const ramp = Math.round(SCORE.ramp * rate);
    if (span.rise)
      for (let i = Math.max(0, from - ramp); i < from; i++)
        weights[i] = Math.max(weights[i] ?? 0, 1 - (from - i) / ramp);
    if (span.fall)
      for (let i = to; i < Math.min(frames, to + ramp); i++)
        weights[i] = Math.max(weights[i] ?? 0, 1 - (i - to + 1) / ramp);
  }
  return weights;
};

/** `pcm`'s frames where `keep` holds, joined end to end (a measure, not something to play). */
const where = (pcm: Pcm, weights: Float32Array, keep: (w: number) => boolean): Pcm => {
  const blocks: Array<Pcm> = [];
  let open = -1;
  for (let i = 0; i <= pcm.frames; i++) {
    const on = i < pcm.frames && keep(weights[i] ?? 0);
    if (on && open < 0) open = i;
    if (!on && open >= 0) {
      blocks.push(slice(pcm, open, i - open));
      open = -1;
    }
  }
  return concat(pcm.rate, pcm.channels.length, blocks);
};

/** The two gains (linear) the score plays at: under the voice, and alone. */
interface ScoreGains {
  readonly under: number;
  readonly alone: number;
}

/**
 * The gains that put `score` `under` dB and `alone` dB against `voice`, each
 * measured where the score plays at it. Where the score is silent (or never
 * plays at one of them) that gain is 1: there is nothing to level.
 */
export const scoreGains = (
  score: Pcm,
  voice: Pcm,
  weights: Float32Array,
  levels: { readonly under: number; readonly alone: number },
): ScoreGains => {
  const target = loudness(voice).integrated;
  const gain = (part: Pcm, db: number) => {
    const measured = loudness(part).integrated;
    if (!Number.isFinite(measured) || !Number.isFinite(target)) return 1;
    return 10 ** ((target + db - measured) / 20);
  };
  return {
    under: gain(
      where(score, weights, (w) => w === 0),
      levels.under,
    ),
    alone: gain(
      where(score, weights, (w) => w === 1),
      levels.alone,
    ),
  };
};

/** Apply the envelope in place: each frame at its weight between the two gains, in dB. */
export const applyScore = (
  channels: ReadonlyArray<Float32Array>,
  weights: Float32Array,
  gains: ScoreGains,
): void => {
  const under = Math.log(gains.under);
  const alone = Math.log(gains.alone);
  for (const plane of channels)
    for (let i = 0; i < plane.length; i++) {
      const w = weights[i] ?? 0;
      plane[i] = (plane[i] ?? 0) * Math.exp(under + (alone - under) * w);
    }
};
