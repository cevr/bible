// What the Transcript view and the Script show and light, pure: a talk's
// words as the server reads them (`TalkWords`), or a narrated film's lines
// as its beats say them (`lineRows`), each word with its offset in the
// one text (the words in play order, a space between, struck ones too, so an
// offset never moves as "Show cuts" turns), and, for a word the film plays,
// when it starts on the film's clock (its section's start, where the
// section's voice starts, and when the word is heard in it). The word lit is
// the one playing at `T`, or the last one said before it in that section;
// the words selected are painted as their ranges of the one text. Mark here
// names its mark from the word.

import { Array as Arr, Option, Order, Record as Rec, Result } from 'effect';
import type { TalkWords } from '../../core/api.ts';
import { type Placed, sceneAt } from '../../core/layout.ts';
import { parse } from '../../core/narration.ts';
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

/** A section of the transcript: its id (its scene), its take, its words, and its marks (each by the index of the word it stands before). */
export interface SectionRows {
  readonly id: string;
  readonly take: string;
  readonly rows: ReadonlyArray<Row>;
  readonly marks: Readonly<Record<string, number>>;
}

/**
 * The marks of `p`'s line, each by the index of the word it stands before, as
 * the line parses (`parse`; the voice keeps each mark's time, not its word);
 * none for a line that does not parse, which the film's layout refuses first.
 */
const lineMarks = (p: Placed): Readonly<Record<string, number>> =>
  Result.match(
    parse(
      p.spec.id,
      Option.getOrElse(Option.fromUndefinedOr(p.spec.say), () => ''),
    ),
    {
      onFailure: () => ({}),
      onSuccess: (parsed) => Object.fromEntries(parsed.marks),
    },
  );

/**
 * A narrated film's lines as the Script lays them out, against the film laid
 * out as `placed`: each beat that says a line is a section (its take the
 * recording's file, none for an estimate), its words as the line is said
 * (`voice.spoken`), each starting where its beat's voice starts plus where
 * its take, or the estimate, voices it; the offsets run on across the beats,
 * as a talk's do across its sections.
 */
export const lineRows = (placed: ReadonlyArray<Placed>): ReadonlyArray<SectionRows> => {
  let at = 0;
  return placed
    .filter((p) => p.voice.spoken !== '')
    .map((p) => {
      const speech = p.start + p.speechStart;
      const rows = p.voice.spoken.split(' ').map((text, index): Row => {
        const from = at;
        at += text.length + 1;
        return {
          index,
          text,
          struck: false,
          from,
          start: Option.map(
            Option.fromUndefinedOr(p.voice.words[index]),
            (w) => speech + w.voiced.start,
          ),
        };
      });
      return {
        id: p.spec.id,
        take: Option.getOrElse(Option.fromUndefinedOr(p.voice.file), () => ''),
        rows,
        marks: lineMarks(p),
      };
    });
};

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

/** Whether `a` and `b` are the same word, or both none: a word lit settles while the word does. */
export const sameWord = (a: Option.Option<WordAt>, b: Option.Option<WordAt>): boolean =>
  Option.getOrElse(
    Option.zipWith(a, b, (x, y) => x.section === y.section && x.index === y.index),
    () => Option.isNone(a) && Option.isNone(b),
  );

/** The row of word `at` among `sections`. */
export const rowOf = (sections: ReadonlyArray<SectionRows>, at: WordAt): Option.Option<Row> =>
  Option.flatMap(
    Arr.findFirst(sections, (s) => s.id === at.section),
    (s) => Arr.findFirst(s.rows, (r) => r.index === at.index),
  );

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

/**
 * The mark Mark here sets on word `index` (spelt `text`), given the marks its
 * section has: the word in lower-case ASCII letters and digits, a letter's
 * accent let go (`café` is `cafe`; `mark` when none is left), so it is a name
 * the talk's decode keeps (`MarkName`: the server refuses any other), with
 * `-2`, `-3`, … while another word of the section has that name; a mark
 * already on the word is its own name again.
 */
export const markName = (
  text: string,
  index: number,
  marks: Readonly<Record<string, number>>,
): string => {
  const base =
    text
      .normalize('NFD')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '') || 'mark';
  const free = (name: string) =>
    Option.match(Rec.get(marks, name), {
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
