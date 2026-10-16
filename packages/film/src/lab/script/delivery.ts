// How the Script reader shows and edits a beat's delivery marks (`core/
// delivery.ts`) and reads its staging take: the stress on a word and the
// pause in the gap before it, the marks a tap on Stress or a gap's choice
// leaves, the take's pace against the band the delivery rules time a line
// at, the word heard at a moment of the take, and the stretch of the take
// that says words `from`–`to`, and whether a poll of the takes shows a
// line changed under the reader. Pure, so the reader and its tests share it.

import { Array as Arr, Option } from 'effect';
import {
  HOLD_DEFAULT,
  type Mark,
  inOrder,
  isPause,
  paceBand,
  wordsAMinute,
} from '../../core/delivery.ts';
import type { StagingTake } from '../../core/api.ts';
import type { TakeWord } from '../../core/schema.ts';

/** The seconds a hold is picked from: no text box, a tap on one. */
export const HOLD_CHOICES: ReadonlyArray<number> = [0.4, HOLD_DEFAULT, 1, 1.5, 2, 3];

/** What stands in a gap, as the reader offers it: nothing, a breath, or a hold of its seconds. */
export type Gap =
  | { readonly _tag: 'None' }
  | { readonly _tag: 'Breath' }
  | { readonly _tag: 'Hold'; readonly seconds: number };

/** Whether word `at` is stressed. */
export const stressed = (marks: ReadonlyArray<Mark>, at: number): boolean =>
  marks.some((m) => m._tag === 'Stress' && m.word === at);

/** What stands in the gap before word `at`. */
export const gapBefore = (marks: ReadonlyArray<Mark>, at: number): Gap =>
  Option.getOrElse(
    Arr.findFirst(marks, (m): Option.Option<Gap> => {
      if (m._tag === 'Breath' && m.before === at) return Option.some({ _tag: 'Breath' });
      if (m._tag === 'Hold' && m.before === at)
        return Option.some({ _tag: 'Hold', seconds: m.seconds });
      return Option.none();
    }),
    (): Gap => ({ _tag: 'None' }),
  );

/**
 * The marks with words `from`–`to` stressed, or, when every one of them is
 * already, with none of them stressed: Stress is one toggle over the words
 * selected.
 */
export const stressToggled = (
  marks: ReadonlyArray<Mark>,
  from: number,
  to: number,
): ReadonlyArray<Mark> => {
  const words = Arr.range(from, to);
  const unstressed = marks.filter((m) => m._tag !== 'Stress' || m.word < from || m.word > to);
  if (words.every((w) => stressed(marks, w))) return unstressed;
  return inOrder([...unstressed, ...words.map((word): Mark => ({ _tag: 'Stress', word }))]);
};

/** The marks with `gap` in the gap before word `at`, in place of what stood there. */
export const gapSet = (marks: ReadonlyArray<Mark>, at: number, gap: Gap): ReadonlyArray<Mark> => {
  const rest = marks.filter((m) => !isPause(m) || m.before !== at);
  if (gap._tag === 'None') return rest;
  if (gap._tag === 'Breath') return inOrder([...rest, { _tag: 'Breath', before: at }]);
  return inOrder([...rest, { _tag: 'Hold', before: at, seconds: gap.seconds }]);
};

/** Whether the gap before word `at` of a line `words` long may hold a pause: never its first or its last. */
export const gapOpen = (at: number, words: number): boolean => at > 0 && at < words;

/** A take's pace: its words a minute from its first word heard to its last, and where that stands against the band. */
interface Pace {
  readonly wpm: number;
  readonly band: 'slow' | 'in' | 'fast';
}

/** The pace of a take that says `words`: none for a take with no words. */
export const paceOf = (words: ReadonlyArray<TakeWord>): Option.Option<Pace> =>
  Option.flatMap(
    Option.zipWith(Arr.head(words), Arr.last(words), (first, last) =>
      wordsAMinute(words.length, last.voiced.end - first.voiced.start),
    ),
    (wpm) => Option.map(wpm, (n) => ({ wpm: Math.round(n), band: paceBand(n) })),
  );

/** The word heard at second `t` of the take: the last one whose voice has started by then. */
export const heardAt = (words: ReadonlyArray<TakeWord>, t: number): Option.Option<number> =>
  Arr.findLastIndex(words, (w) => w.voiced.start <= t);

/** The stretch of the take that says words `from`–`to`: none when the take has neither. */
export const spanOf = (
  words: ReadonlyArray<TakeWord>,
  from: number,
  to: number,
): Option.Option<{ readonly start: number; readonly end: number }> =>
  Option.zipWith(Arr.get(words, from), Arr.get(words, to), (first, last) => ({
    start: first.start,
    end: last.end,
  }));

/**
 * Whether the takes `now` show a line changed since `before`: a beat whose
 * take was ready is now another file, or none ready. A take is keyed by its
 * line's words and marks, so its file changes only when the line does (or
 * the film's voice); a take first made (still voicing, then ready) is not a
 * change.
 */
export const retaken = (
  before: ReadonlyMap<string, StagingTake>,
  now: ReadonlyMap<string, StagingTake>,
): boolean =>
  Arr.some([...before], ([beat, was]) => {
    if (was._tag !== 'Ready') return false;
    return Option.exists(
      Option.fromUndefinedOr(now.get(beat)),
      (is) => is._tag !== 'Ready' || is.file !== was.file,
    );
  });
