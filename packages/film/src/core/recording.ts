// A person's recording made into a take the film can use as it uses a staging
// take: one channel, the silence either side trimmed to the padding the
// ElevenLabs takes have, and levelled to their loudness under the same
// ceiling. The numbers are measured from the committed staging takes (30
// takes across both films, 2026-09-28; see packages/film/README.md), not
// chosen, so a recorded beat sits in the mix where a staged one did.
//
// Pure: the tools decode and encode around it.

import { Array as Arr, Option } from 'effect';
import { type Pcm, concat, gain, levels, silence, slice, toMono, windowLevels } from './audio.ts';
import { limit } from './dsp.ts';

/**
 * The staging takes' loudness, in dBFS: `mean` is the median of their mean
 * power over the whole take (−19.69; `levels`, as ffmpeg's volumedetect
 * reports it), and `ceiling` the peak a take may reach (theirs run −0.4 to
 * −3.0, median −1.4).
 */
export const TAKE_LEVEL = { mean: -19.7, ceiling: -1 } as const;

/**
 * The silence the staging takes keep, in seconds: before the first 10 ms
 * that reaches the gate (median 0.07) and after the last (median 0.00:
 * ElevenLabs ends a take on its last sound).
 */
export const TAKE_PAD = { lead: 0.07, tail: 0 } as const;

/** Sound is measured this many seconds at a time. */
export const TAKE_WINDOW = 0.01;

/**
 * A window is speech when it is within this many dB of the take's loudest.
 * The staging takes' loudest window is about −9.5 dBFS, so this is the −50
 * dBFS gate their padding was measured at.
 */
export const TAKE_GATE = 40;

/**
 * A recording whose loudest window is under this, in dBFS, holds no speech:
 * a quiet room reads −70 or lower, a voice at a normal distance −30 or higher.
 */
export const TAKE_FLOOR = -60;

/** The limiter that holds the ceiling: 5 ms look-ahead, as the mix's. */
const ATTACK_MS = 5;

/**
 * `pcm` under the ceiling. The limiter's output runs one attack window less a
 * frame behind its input; the take is padded by that much and read back from
 * it, so no word moves.
 */
const underCeiling = (pcm: Pcm): Pcm => {
  const delay = Math.trunc((pcm.rate * ATTACK_MS) / 1000) - 1;
  const padded = pcm.channels.map((channel) => {
    const out = new Float32Array(pcm.frames + delay);
    out.set(channel);
    return out;
  });
  const limited = limit(padded, pcm.rate, {
    limit: 10 ** (TAKE_LEVEL.ceiling / 20),
    attack: ATTACK_MS,
    release: 50,
  });
  return {
    rate: pcm.rate,
    frames: pcm.frames,
    channels: limited.map((channel) => channel.slice(delay, delay + pcm.frames)),
  };
};

/**
 * The recording as a take: one channel at its own rate, from `TAKE_PAD.lead`
 * before the first speech to `TAKE_PAD.tail` after the last, levelled to
 * `TAKE_LEVEL.mean` and held under `TAKE_LEVEL.ceiling`. None when nothing in
 * it reaches `TAKE_FLOOR`.
 */
export const prepareTake = (recording: Pcm): Option.Option<Pcm> => {
  const mono = toMono(recording);
  const window = Math.max(1, Math.round(TAKE_WINDOW * mono.rate));
  const level = [...windowLevels(Arr.getUnsafe(mono.channels, 0), window)];
  const loudest = Math.max(...level);
  if (!(loudest >= TAKE_FLOOR)) return Option.none();
  const speech = (l: number) => l >= loudest - TAKE_GATE;
  const first = Arr.findFirstIndex(level, speech);
  const last = Arr.findLastIndex(level, speech);
  if (Option.isNone(first) || Option.isNone(last)) return Option.none();
  const lead = Math.round(TAKE_PAD.lead * mono.rate);
  const tail = Math.round(TAKE_PAD.tail * mono.rate);
  const onset = first.value * window;
  const end = (last.value + 1) * window;
  const from = Math.max(0, onset - lead);
  const to = Math.min(mono.frames, end + tail);
  // A recording that starts or stops on a word gets the rest of its padding in silence.
  const trimmed = concat(mono.rate, 1, [
    silence(mono.rate, from - (onset - lead), 1),
    slice(mono, from, to - from),
    silence(mono.rate, end + tail - to, 1),
  ]);
  return Option.some(underCeiling(gain(trimmed, TAKE_LEVEL.mean - levels(trimmed).mean)));
};
