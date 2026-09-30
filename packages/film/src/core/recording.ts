// A person's recording made into a take the film can use as it uses a staging
// take: one channel, the silence either side trimmed to the padding the
// ElevenLabs takes have, and levelled to their speech loudness by one clean
// gain, never past the ceiling. The numbers are measured from the committed
// staging takes (30 takes across both films, 2026-09-28; see
// packages/film/README.md), not chosen, so a recorded beat sits in the mix
// where a staged one did.
//
// Pure: the tools decode and encode around it.

import { Array as Arr, Option } from 'effect';
import {
  type Pcm,
  concat,
  fadeEdges,
  gain,
  levels,
  silence,
  slice,
  toMono,
  windowPowers,
} from './audio.ts';

/**
 * The staging takes' loudness, in dBFS: `speech` is the median of their
 * speech level (`speechLevel`; −17.10, from −17.90 to −15.67), and `ceiling`
 * the peak a take may reach (theirs run −0.4 to −3.0, median −1.3).
 */
export const TAKE_LEVEL = { speech: -17.1, ceiling: -1 } as const;

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
 * A recording whose loudest speech is under this, in dBFS, holds none:
 * a quiet room reads −70 or lower, a voice at a normal distance −30 or higher.
 */
export const TAKE_FLOOR = -60;

/**
 * Sound over the gate is speech when it lasts this long, in seconds, counting
 * any gaps under `TAKE_HOLD` inside it: a click, a tap or a lip smack is
 * shorter, and is trimmed with the silence around it.
 */
export const TAKE_MIN_SPEECH = 0.1;

/** Speech goes on across a gap under this, in seconds: a stop inside a word, or a breath between two. */
export const TAKE_HOLD = 0.25;

/** A take fades in and out over this long, in seconds, so neither trim clicks. */
export const TAKE_FADE = 0.005;

/**
 * How loud the speech in `pcm` is, in dBFS, with pauses left out: the mean
 * power of its `TAKE_WINDOW` windows over −70 dBFS and within 10 dB of those
 * windows' mean, gated in two stages as ITU-R BS.1770-4 gates loudness (on
 * 10 ms windows, not its 400 ms blocks, so a pause's edges touch one window
 * each; no K-weighting). A pause is under the gate, so pausing longer never
 * makes a take louder or quieter. −Infinity when nothing passes.
 */
export const speechLevel = (pcm: Pcm): number => {
  const window = Math.max(1, Math.round(TAKE_WINDOW * pcm.rate));
  const powers = [...windowPowers(toMono(pcm), window)].map((db) => 10 ** (db / 10));
  const db = (p: number) => 10 * Math.log10(p);
  const meanOf = (ps: ReadonlyArray<number>) =>
    ps.reduce((sum, p) => sum + p, 0) / Math.max(1, ps.length);
  const loud = powers.filter((p) => db(p) > -70);
  const relative = db(meanOf(loud)) - 10;
  const gated = loud.filter((p) => db(p) > relative);
  if (gated.length === 0) return Number.NEGATIVE_INFINITY;
  return db(meanOf(gated));
};

/** A run of windows, `[from, to)`. */
interface Run {
  readonly from: number;
  readonly to: number;
}

/**
 * The runs of windows at or over `gate` that are speech: joined across gaps
 * under `hold` windows, and kept when `min` windows long or longer.
 */
const speechRuns = (
  level: ReadonlyArray<number>,
  gate: number,
  hold: number,
  min: number,
): ReadonlyArray<Run> => {
  const runs: Array<Run> = [];
  for (const [w, l] of level.entries()) {
    if (!(l >= gate)) continue;
    const open = Arr.last(runs).pipe(Option.filter((r) => w - r.to < hold));
    if (Option.isSome(open)) runs[runs.length - 1] = { from: open.value.from, to: w + 1 };
    else runs.push({ from: w, to: w + 1 });
  }
  return runs.filter((r) => r.to - r.from >= min);
};

/**
 * Where the speech in a mono recording starts and ends, in frames: the first
 * and last run of sound within `TAKE_GATE` of its loudest speech that lasts
 * (a click or tap outside it is not speech). None when no speech in it
 * reaches `TAKE_FLOOR`.
 */
const speechBounds = (
  mono: Pcm,
): Option.Option<{ readonly onset: number; readonly end: number }> => {
  const window = Math.max(1, Math.round(TAKE_WINDOW * mono.rate));
  const level = [...windowPowers(mono, window)];
  const hold = Math.round(TAKE_HOLD / TAKE_WINDOW);
  const min = Math.round(TAKE_MIN_SPEECH / TAKE_WINDOW);
  // The loudest speech, not the loudest click: only sound that lasts counts.
  const loudest = Math.max(
    ...speechRuns(level, TAKE_FLOOR, hold, min).flatMap((r) => level.slice(r.from, r.to)),
  );
  if (!(loudest >= TAKE_FLOOR)) return Option.none();
  const runs = speechRuns(level, loudest - TAKE_GATE, hold, min);
  return Option.zipWith(Arr.head(runs), Arr.last(runs), (first, last) => ({
    onset: first.from * window,
    end: Math.min(mono.frames, last.to * window),
  }));
};

/**
 * Silence after a staging take's last speech, in seconds, that is left as
 * ElevenLabs sent it: more is trimmed (`trimTail`).
 */
export const TAKE_TAIL_SLACK = 0.1;

/**
 * A staging take with the silence after its last speech trimmed to
 * `TAKE_PAD.tail`, as `prepareTake` trims a recording's, faded over
 * `TAKE_FADE`: a take that trails seconds of silence would hold its scene
 * and the next voice back by them. Its lead and level are ElevenLabs' own,
 * kept. None when it ends within `TAKE_TAIL_SLACK` of its speech, or holds
 * none: the take is kept as it was sent.
 */
export const trimTail = (take: Pcm): Option.Option<Pcm> =>
  Option.flatMap(speechBounds(toMono(take)), ({ end }) => {
    const to = Math.min(take.frames, end + Math.round(TAKE_PAD.tail * take.rate));
    if (take.frames - to <= TAKE_TAIL_SLACK * take.rate) return Option.none();
    return Option.some(fadeEdges(slice(take, 0, to), TAKE_FADE));
  });

/**
 * The recording as a take: one channel at its own rate, from `TAKE_PAD.lead`
 * before the first speech to `TAKE_PAD.tail` after the last (a click or tap
 * outside the speech trimmed with the silence), faded over `TAKE_FADE` at
 * both ends, and made louder or quieter by one gain: to `TAKE_LEVEL.speech`,
 * or less when that would take its peak past `TAKE_LEVEL.ceiling`. Nothing
 * limits or compresses it, so the voice keeps its own dynamics. None when no
 * speech in it reaches `TAKE_FLOOR`.
 */
export const prepareTake = (recording: Pcm): Option.Option<Pcm> => {
  const mono = toMono(recording);
  const bounds = speechBounds(mono);
  if (Option.isNone(bounds)) return Option.none();
  const { onset, end } = bounds.value;
  const lead = Math.round(TAKE_PAD.lead * mono.rate);
  const tail = Math.round(TAKE_PAD.tail * mono.rate);
  const from = Math.max(0, onset - lead);
  const to = Math.min(mono.frames, end + tail);
  // A recording that starts or stops on a word gets the rest of its padding in silence.
  const trimmed = fadeEdges(
    concat(mono.rate, 1, [
      silence(mono.rate, from - (onset - lead), 1),
      slice(mono, from, to - from),
      silence(mono.rate, end + tail - to, 1),
    ]),
    TAKE_FADE,
  );
  return Option.some(gain(trimmed, takeLift(trimmed)));
};

/**
 * The one gain, in dB, that puts a take's speech at `TAKE_LEVEL.speech`, or
 * less when that would take its peak past `TAKE_LEVEL.ceiling`: how a
 * recording is levelled on import, and a staging take in the mix. 0 for a
 * take with no speech.
 */
export const takeLift = (take: Pcm): number => {
  const lift = Math.min(
    TAKE_LEVEL.speech - speechLevel(take),
    TAKE_LEVEL.ceiling - levels(take).peak,
  );
  if (!Number.isFinite(lift)) return 0;
  return lift;
};
