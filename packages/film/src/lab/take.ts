// A beat's take as a page plays it (an ask's audio, the studio's Voice): the
// attempt named, else the take the beat's timings name, which the read of
// its takes says (`StudioAttempts`): the attempt they name (`kept`), else a
// staging take in the film's `narration/` (`staged`), with what
// speech-to-text heard an attempt say. One read of a beat's takes
// (`GET …/studio/takes/:beat/attempts`) answers both pages.

import { Array as Arr, Option } from 'effect';
import { attemptUrl } from '../core/api.ts';
import type { StudioAttempt, StudioAttempts } from '../core/studio.ts';
import { narrationFileUrl } from '../player/narrated.ts';

/** A take to play: its audio, whose it is, what was heard of it (an attempt's), and how long it lasts. */
export interface TakeHeard {
  readonly url: string;
  /** An owner's recording, or the staging voice's. */
  readonly source: 'recorded' | 'staging';
  readonly heard: Option.Option<string>;
  readonly duration: number;
}

/** Attempt `a` of film `film`'s beat as a take to play: the owner's recording, with what was heard of it. */
const recorded = (film: string, read: StudioAttempts, a: StudioAttempt): TakeHeard => ({
  url: attemptUrl(film, read.beat, a.file),
  source: 'recorded',
  heard: Option.some(a.transcript),
  duration: a.duration,
});

/**
 * The take the beat's timings name: the attempt they name (`kept`), else
 * the staging take (`staged`, which the read gives only when no attempt is
 * the timings' take); none when the timings name no take.
 */
const timingsTake = (film: string, read: StudioAttempts): Option.Option<TakeHeard> =>
  Option.orElse(
    Option.map(
      Arr.findFirst(read.attempts, (a) => a.kept),
      (a) => recorded(film, read, a),
    ),
    () =>
      Option.map(Option.fromUndefinedOr(read.staged), (s): TakeHeard => ({
        url: narrationFileUrl(film, s.file),
        source: 'staging',
        heard: Option.none(),
        duration: s.duration,
      })),
  );

/**
 * Film `film`'s take of the beat `read` lists: the attempt `attempt` names
 * when it names one, else the take the beat's timings name
 * (`timingsTake`); none when there is no such take.
 */
export const takeHeard = (
  film: string,
  read: StudioAttempts,
  attempt: Option.Option<string>,
): Option.Option<TakeHeard> =>
  Option.match(attempt, {
    onSome: (file) =>
      Option.map(
        Arr.findFirst(read.attempts, (a) => a.file === file),
        (a) => recorded(film, read, a),
      ),
    onNone: () => timingsTake(film, read),
  });
