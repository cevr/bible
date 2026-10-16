// A beat's take as a page plays it (an ask's audio, the studio's Voice): the
// attempt named, else the take its timings name, an attempt kept or a
// staging take in the film's `narration/` (`StudioAttempts.staged`), with
// what speech-to-text heard an attempt say. One read of a beat's takes
// (`GET …/studio/takes/:beat/attempts`) answers both pages.

import { Array as Arr, Option } from 'effect';
import { attemptUrl } from '../core/api.ts';
import type { StudioAttempts } from '../core/studio.ts';
import { narrationFileUrl } from '../player/narrated.ts';

/** A take to play: its audio, whose it is, what was heard of it (an attempt's), and how long it lasts. */
export interface TakeHeard {
  readonly url: string;
  /** An owner's recording, or the staging voice's. */
  readonly source: 'recorded' | 'staging';
  readonly heard: Option.Option<string>;
  readonly duration: number;
}

/**
 * Film `film`'s take of the beat `read` lists: the attempt `attempt` names
 * when it names one, else the one kept, else the staging take the timings
 * name; none when there is none of these.
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
        (a): TakeHeard => ({
          url: attemptUrl(film, read.beat, a.file),
          source: 'recorded',
          heard: Option.some(a.transcript),
          duration: a.duration,
        }),
      ),
    onNone: () =>
      Option.orElse(
        Option.map(
          Arr.findFirst(read.attempts, (a) => a.kept),
          (a): TakeHeard => ({
            url: attemptUrl(film, read.beat, a.file),
            source: 'recorded',
            heard: Option.some(a.transcript),
            duration: a.duration,
          }),
        ),
        () =>
          Option.map(Option.fromUndefinedOr(read.staged), (s): TakeHeard => ({
            url: narrationFileUrl(film, s.file),
            source: 'staging',
            heard: Option.none(),
            duration: s.duration,
          })),
      ),
  });
