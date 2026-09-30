// How a mix measures against the film's sound rules (CRAFT rule 10): each
// effect against the voice around it, both read by `windowPowers` as a
// listener hears them. Pure: the check renders the mix and hands its buses
// here.

import { Array as Arr } from 'effect';
import { type Pcm, SPEECH_GATE, windowPowers } from './audio.ts';
import { MASTER, type Placement, repitch } from './mix.ts';

export const BALANCE = {
  /**
   * The master's integrated loudness, in LUFS (CRAFT rule 10): the mix masters
   * to it, so a miss means headroom held the lift back (a peak too hot).
   */
  master: MASTER.loudness,
  /** How far the master may sit from its loudness, in dB. */
  tolerance: 3,
  /** How close under the voice (dB) an effect's loudest moment may come where the voice speaks. */
  hot: 3,
  /** The window an effect's loudest moment is read over, in seconds: a thud's attack is this short. */
  hotWindow: 0.05,
  /** The voice around an effect: this many seconds either side of it. */
  around: 1,
  /** Less voice than this around an effect (seconds over `SPEECH_GATE`) is no one speaking. */
  speaking: 0.25,
} as const;

/** The level of each `window` seconds of `pcm` from second `from` to `to` (`windowPowers`). */
const levelsOver = (pcm: Pcm, from: number, to: number, window: number): Array<number> => [
  ...windowPowers(
    pcm,
    Math.round(window * pcm.rate),
    Math.round(from * pcm.rate),
    Math.round(to * pcm.rate),
  ),
];

/** The `p`th fraction of `values`, low to high; −Infinity when there are none. */
const percentile = (values: ReadonlyArray<number>, p: number): number => {
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * p)] ?? Number.NEGATIVE_INFINITY;
};

/** An effect whose loudest `hotWindow` comes within `BALANCE.hot` dB under the voice around it. */
export interface HotEffect {
  readonly name: string;
  readonly at: number;
  /** Its loudest moment against the voice around it, in dB (negative: under it). */
  readonly over: number;
}

/**
 * The effects that crowd the words: each placement's loudest `hotWindow` (at
 * its gain and pitch, as the mix plays it) against the voice's 70th
 * percentile over `hotWindow`s from `around` seconds before it to `around`
 * after it ends. An effect with no one speaking around it is not held to the
 * voice.
 */
export const hotEffects = (
  voice: Pcm,
  effects: ReadonlyArray<Placement<Pcm>>,
): ReadonlyArray<HotEffect> =>
  Arr.flatMap(effects, (fx) => {
    const sound = repitch(fx.sound, fx.pitch);
    const secs = sound.frames / sound.rate;
    const heard = levelsOver(sound, 0, secs, BALANCE.hotWindow);
    const loudest = Math.max(...heard) + 20 * Math.log10(fx.gain);
    const around = levelsOver(
      voice,
      fx.at - BALANCE.around,
      fx.at + secs + BALANCE.around,
      BALANCE.hotWindow,
    ).filter((db) => db > SPEECH_GATE);
    if (around.length * BALANCE.hotWindow < BALANCE.speaking) return [];
    const over = loudest - percentile(around, 0.7);
    if (over <= -BALANCE.hot) return [];
    return [{ name: fx.name, at: fx.at, over }];
  });
