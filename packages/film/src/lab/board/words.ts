// A beat's line as the Board sets it, and the words a panel holds over: one
// reading of a `say` for the Board's column (over the staged film's beats)
// and an ask's Board (over the lab's read of the film's script), so a panel
// says the same words in both. Pure: no view, no read.

import { Option, Result } from 'effect';
import { parse } from '../../core/narration.ts';

/** A word of a beat's line as the Board sets it: the marks said before it, then the word. */
export interface LineWord {
  readonly marks: ReadonlyArray<string>;
  readonly text: string;
}

/** Beat `id`'s line, `say` as its script writes it: its words, each after the marks said before it (none when it does not parse). */
export const lineWords = (id: string, say: string): ReadonlyArray<LineWord> =>
  Result.match(parse(id, say), {
    onFailure: () => [],
    onSuccess: (parsed) => {
      const words = parsed.spoken.split(/\s+/).filter((w) => w.length > 0);
      const at = [...parsed.marks];
      return words.map((text, i) => ({
        marks: at.filter(([, index]) => index === i).map(([name]) => name),
        text,
      }));
    },
  });

/**
 * The words `line` says while a panel at mark `at` holds: from its mark to
 * the mark of the panel after it (`until`), or to the line's end. A mark the
 * line lacks holds from its end, so nothing.
 */
export const panelWords = (
  line: ReadonlyArray<LineWord>,
  at: string,
  until: Option.Option<string>,
): string => {
  const index = (mark: string): number => {
    if (mark === 'start') return 0;
    return Option.getOrElse(
      Option.liftPredicate(
        line.findIndex((w) => w.marks.includes(mark)),
        (i) => i >= 0,
      ),
      () => line.length,
    );
  };
  const from = index(at);
  const to = Option.match(until, { onNone: () => line.length, onSome: index });
  return line
    .slice(from, Math.max(from, to))
    .map((w) => w.text)
    .join(' ');
};
