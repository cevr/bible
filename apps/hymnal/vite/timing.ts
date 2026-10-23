/* oxlint-disable effect/noGlobals, effect/noNewError -- a build-time host script: the bundler plugin runs it under Bun and reads its JSON from standard output, and the build fails naming the hymn that has no timing. */

/**
 * Every compiled hymn's timing as the follow reads it: `[number, string]` in
 * number order, each string the hymn's sung lines in the encoding
 * `src/follow/timeline.ts` decodes. Read by the `virtual:hymnal-timing`
 * plugin (`hymnal.ts`) and by the app's tests; the compiled set is read as
 * `words.ts` reads it, and the build fails on a hymn with no timing.
 *
 * Times are whole milliseconds from the file's start, through the hymn's
 * tempo map (`Timing.secondsAt`, the same math `sync-check` holds to the
 * recordings). One line per `sung(hymn)` line, in that order, `;` between
 * lines; a line is `<flags>,<start>,<length>[,<word>…]`:
 * - `flags`: 1 when the file plays the line, plus 2 when its times are even
 *   shares rather than its notes';
 * - `start`: after the line before's start (the first, after 0);
 * - `length`: to its `until`, the next line's start (the last, the end);
 * - each `word`: its syllables' starts, `.` between them, each after the
 *   syllable before (the first, after the line's start).
 * Only a line whose words may be lit carries words: played, not even, and
 * in a part aligned syllable by syllable. Any other line is marked whole.
 */

import * as Timing from '@bible/hymnal/timing';
import { type Hymn, sung } from '@bible/hymnal/hymn';
import { Option } from 'effect';

import { readHymns } from './words';

/** Each word's syllable indices, from the syllables' `word` places. */
const wordsOf = (words: ReadonlyArray<number>): ReadonlyArray<ReadonlyArray<number>> => {
  const out: Array<Array<number>> = [];
  words.forEach((word, i) => {
    const last = out.at(-1);
    if (i > 0 && words[i - 1] === word) last?.push(i);
    else out.push([i]);
  });
  return out;
};

/** The hymn's timing in the encoding above; none when it has no timing. */
export const encodeTiming = (hymn: Hymn): Option.Option<string> =>
  Option.map(Option.fromUndefinedOr(hymn.timing), (timing) => {
    const seconds = Timing.secondsAt(timing);
    const ms = (time: number) => Math.round(seconds(time) * 1000);
    const lines = sung(hymn);
    let before = 0;
    return timing.lines
      .map((line, i) => {
        const start = ms(line.start);
        const fields = [
          Number(line.played) + 2 * Number(line.even),
          start - before,
          ms(line.until) - start,
        ];
        before = start;
        const part = lines[i]?.part;
        if (
          !line.played ||
          line.even ||
          part?._tag !== 'Sung' ||
          part.level !== 'syllable' ||
          line.syllables.length === 0
        )
          return fields.join(',');
        const syllables = part.lines[lines[i]?.line ?? 0] ?? [];
        let at = start;
        const words = wordsOf(syllables.map((s) => s.word)).map((word) =>
          word
            .map((k) => {
              const t = ms(line.syllables[k] ?? 0);
              const step = t - at;
              at = t;
              return step;
            })
            .join('.'),
        );
        return [...fields, ...words].join(',');
      })
      .join(';');
  });

export const readTiming = (): ReadonlyArray<readonly [number, string]> =>
  readHymns().map((hymn) => [
    hymn.number,
    Option.getOrThrowWith(
      encodeTiming(hymn),
      () => new Error(`hymnal: hymn ${hymn.number} has no timing`),
    ),
  ]);

if (import.meta.main) process.stdout.write(JSON.stringify(readTiming()));
