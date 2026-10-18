// A section's words as the page lays them out and paints them, pure: each
// word with its offset in the section's one text (the words in order, a space
// between), and, for a word the film plays, when it starts on the film's
// clock; the words lit or selected are painted as their ranges of that text.

import { Array as Arr, Option, Order } from 'effect';
import type { CodeRange } from '../../core/schema.ts';

/** A word of a section as the page lays it out. */
export interface Row {
  /** Its index in its take. */
  readonly index: number;
  /** As the captions spell it. */
  readonly text: string;
  /** Whether the cut strikes it. */
  readonly struck: boolean;
  /** Its offset in the one text. */
  readonly from: number;
  /** When it starts, in film seconds: none for a struck word, or a section the film does not lay out. */
  readonly start: Option.Option<number>;
}

/** A section of words: its id (its scene), its take, its words, and its marks (each by the index of the word it stands before). */
export interface SectionRows {
  readonly id: string;
  readonly take: string;
  readonly rows: ReadonlyArray<Row>;
  readonly marks: Readonly<Record<string, number>>;
}

/** A word of a section: what the page lights and selects. */
export interface WordAt {
  readonly section: string;
  readonly index: number;
}

/** The row of word `at` among `sections`. */
export const rowOf = (sections: ReadonlyArray<SectionRows>, at: WordAt): Option.Option<Row> =>
  Option.flatMap(
    Arr.findFirst(sections, (s) => s.id === at.section),
    (s) => Arr.findFirst(s.rows, (r) => r.index === at.index),
  );

/**
 * `rows` as the ranges of the one text the highlights paint, in its order:
 * one for each run of words next to each other in it (the space between
 * them in the range too), so a span of words is painted as one; a word
 * given twice is painted once.
 */
export const rangesOf = (rows: ReadonlyArray<Row>): ReadonlyArray<CodeRange> =>
  Arr.sort(
    rows.map((r): CodeRange => [r.from, r.from + r.text.length]),
    Order.mapInput(Order.Number, ([from]: CodeRange) => from),
  ).reduce<ReadonlyArray<CodeRange>>(
    (runs, [from, to]) =>
      Option.match(
        Option.filter(Arr.last(runs), ([, end]) => from <= end + 1),
        {
          onNone: () => [...runs, [from, to]],
          onSome: ([start, end]) => [...Arr.dropRight(runs, 1), [start, Math.max(end, to)]],
        },
      ),
    [],
  );
