// What the Transcript view shows and lights, pure: a talk's words as the
// server reads them (`TalkWords`), each with its offset in the transcript's
// one text (the words in play order, a space between, struck ones too, so an
// offset never moves as "Show cuts" turns), and, for a word the cut plays,
// when it starts on the film's clock (its section's start, where the
// section's voice starts, and when the word is heard in it). The word lit is
// the one playing at `T`, or the last one said before it in that section;
// the words selected are painted as their ranges of the one text. Mark here
// names its mark from the word.

import { Array as Arr, Option } from 'effect';
import type { TalkWords } from '../../core/api.ts';
import { type Placed, sceneAt } from '../../core/layout.ts';
import type { CodeRange } from '../../core/schema.ts';
import { CLOCK_EPSILON } from '../../core/time.ts';

/** A word of the transcript as the view lays it out. */
export interface Row {
  /** Its index in its take. */
  readonly index: number;
  /** As the captions spell it. */
  readonly text: string;
  /** Whether the cut strikes it. */
  readonly struck: boolean;
  /** Its offset in the transcript's one text. */
  readonly from: number;
  /** When it starts, in film seconds: none for a struck word, or a section the film does not lay out. */
  readonly start: Option.Option<number>;
}

/** A section of the transcript: its id (its scene), its take, its words, and its marks. */
export interface SectionRows {
  readonly id: string;
  readonly take: string;
  readonly rows: ReadonlyArray<Row>;
  readonly marks: Readonly<Record<string, number>>;
}

/** `talk`'s sections as the view lays them out, against the film laid out as `placed`. */
export const rowsOf = (
  talk: TalkWords,
  placed: ReadonlyArray<Placed>,
): ReadonlyArray<SectionRows> => {
  let at = 0;
  return talk.sections.map((section) => {
    const speech = Option.map(
      Arr.findFirst(placed, (p) => p.spec.id === section.id),
      (p) => p.start + p.speechStart,
    );
    const rows = section.words.map((word): Row => {
      const from = at;
      at += word.text.length + 1;
      return {
        index: word.index,
        text: word.text,
        struck: word.struck,
        from,
        start: Option.flatMap(speech, (s) =>
          Option.map(Option.fromUndefinedOr(word.heard), ([heard]) => s + heard),
        ),
      };
    });
    return { id: section.id, take: section.take, rows, marks: section.marks };
  });
};

/** A word of a section: what the view lights, selects and follows. */
export interface WordAt {
  readonly section: string;
  readonly index: number;
}

/**
 * The word at film seconds `T`: in the section under `T`, the last word
 * played that starts at or before it (the one playing, or the one just
 * said); none before the section's first word, or in a section the talk does
 * not cut.
 */
export const wordAt = (
  sections: ReadonlyArray<SectionRows>,
  placed: ReadonlyArray<Placed>,
  T: number,
): Option.Option<WordAt> =>
  Option.flatMap(sceneAt(placed, T), (p) =>
    Option.flatMap(
      Arr.findFirst(sections, (s) => s.id === p.spec.id),
      (section) =>
        Option.map(
          Arr.findLast(section.rows, (r) => Option.exists(r.start, (s) => s - T <= CLOCK_EPSILON)),
          (r) => ({ section: section.id, index: r.index }),
        ),
    ),
  );

/** The rows of section `id` whose indices `from`–`to` take in. */
export const rowsIn = (
  sections: ReadonlyArray<SectionRows>,
  id: string,
  from: number,
  to: number,
): ReadonlyArray<Row> =>
  Option.getOrElse(
    Option.map(
      Arr.findFirst(sections, (s) => s.id === id),
      (s) => s.rows.filter((r) => r.index >= from && r.index <= to),
    ),
    () => [],
  );

/** `rows` as the ranges of the one text the highlights paint. */
export const rangesOf = (rows: ReadonlyArray<Row>): ReadonlyArray<CodeRange> =>
  rows.map((r) => [r.from, r.from + r.text.length]);

/**
 * The mark Mark here sets on word `index` (spelt `text`), given the marks its
 * section has: the word in lower-case letters and digits (`mark` when it has
 * none), with `-2`, `-3`, … while another word of the section has that name;
 * a mark already on the word is its own name again.
 */
export const markName = (
  text: string,
  index: number,
  marks: Readonly<Record<string, number>>,
): string => {
  const base = text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '') || 'mark';
  const free = (name: string) =>
    Option.match(Option.fromUndefinedOr(marks[name]), {
      onNone: () => true,
      onSome: (on) => on === index,
    });
  const named = (k: number) => {
    if (k === 0) return base;
    return `${base}-${k + 1}`;
  };
  return Option.getOrElse(
    Arr.findFirst(Arr.makeBy(Object.keys(marks).length + 1, named), free),
    () => base,
  );
};
