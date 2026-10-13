// What ties a beat's cues to its line's words, pure: each cue of the beat's
// timeline (`spec.timeline`) where `layout()` placed it (`placed.cues`, in
// seconds into the beat), what its span says it starts from and runs until,
// and where its start and its end land in the line. A span on a mark lands
// on the word the mark stands before, or on the word pinned after it; one
// `after` a cue lands where that cue ends and one `with` a cue where it
// starts, followed back along the chain; an end `until` a mark lands on that
// mark's word, and an end a cue's length past its start lands with its
// start. A landmark (the beat's start, its speech) lands on no word. So a
// mark's ties are the cues that land on it directly or through a chain, and
// words' are the cues that land on any of them. A picture's brief names its
// cues and marks in backticks, each read here as the thing it names.

import { Array as Arr, Data, Option, Order, Predicate, Record as Rec } from 'effect';
import type { Placed } from '../../core/layout.ts';
import { readsWord } from '../../core/narration.ts';
import type { Span, Timeline, Until } from '../../core/schema.ts';
import { untilEndText } from '../../core/timeline.ts';
import { anchorText } from '../editor/format.ts';
import type { SectionRows } from '../transcript/lit.ts';

/** A cue of a beat as the Script ties it to the beat's line. */
export interface Tie {
  readonly cue: string;
  /** Where `layout()` placed it, in seconds into its beat. */
  readonly start: number;
  readonly end: number;
  /** What its span says, as the editor words it: `mark {rise}`, `after cue drop · until {held}`. */
  readonly said: string;
  /** The marks its start and its end land on, through its chain. */
  readonly marks: ReadonlyArray<string>;
  /** The words of the line its start and its end land on, by index. */
  readonly words: ReadonlyArray<number>;
}

/** Where a point of a cue lands in its beat's line: the mark it is tied to, and the word it lands on (none past the line's last word). */
interface Landing {
  readonly mark: string;
  readonly word: Option.Option<number>;
}

/**
 * The word mark `mark` stands before in `line`, or, with `word` (a pin), the
 * first word at or after it that reads as `word`: none for a mark the line
 * does not have, or one past its last word.
 */
const wordOf = (
  line: Option.Option<SectionRows>,
  mark: string,
  word: Option.Option<string>,
): Option.Option<number> =>
  Option.flatMap(line, (l) =>
    Option.flatMap(Rec.get(l.marks, mark), (at) =>
      Option.map(
        Arr.findFirst(
          l.rows,
          (r) =>
            r.index >= at &&
            Option.match(word, { onNone: () => true, onSome: (w) => readsWord(r.text, w) }),
        ),
        (r) => r.index,
      ),
    ),
  );

/** One beat's chains: where each cue's start and end land in its line, followed back past every `after` and `with`. */
const landingsIn = (timeline: Timeline, line: Option.Option<SectionRows>) => {
  const onMark = (mark: string, word: Option.Option<string>): Option.Option<Landing> =>
    Option.some({ mark, word: wordOf(line, mark, word) });
  /** Where cue `name`'s start lands; none for a landmark, a name the timeline lacks, or a cycle (`seen`). */
  const startOf = (name: string, seen: ReadonlyArray<string>): Option.Option<Landing> =>
    Option.flatMap(
      Option.filter(Rec.get(timeline, name), () => !seen.includes(name)),
      (span) => spanStart(span, [...seen, name]),
    );
  /** Where cue `name`'s end lands: its `until`, else with its start. */
  const endOf = (name: string, seen: ReadonlyArray<string>): Option.Option<Landing> =>
    Option.flatMap(
      Option.filter(Rec.get(timeline, name), () => !seen.includes(name)),
      (span) =>
        Option.match(Option.fromUndefinedOr(span.until), {
          onNone: () => spanStart(span, [...seen, name]),
          onSome: (until) => untilAt(until, [...seen, name]),
        }),
    );
  const spanStart = (span: Span, seen: ReadonlyArray<string>): Option.Option<Landing> => {
    if ('mark' in span) return onMark(span.mark, Option.fromUndefinedOr(span.word));
    if ('after' in span) return endOf(span.after, seen);
    if ('with' in span) return startOf(span.with, seen);
    return Option.none();
  };
  /** Where an end `until` a point lands: a mark's word, a cue's edge (its end unless it names the start), or none at a landmark. */
  const untilAt = (until: Until, seen: ReadonlyArray<string>): Option.Option<Landing> => {
    if (Predicate.isString(until)) return onMark(until, Option.none());
    return Option.flatMap(Option.fromUndefinedOr(until.cue), (cue) =>
      Option.match(
        Option.liftPredicate(until.edge, (edge) => edge === 'start'),
        {
          onNone: () => endOf(cue, seen),
          onSome: () => startOf(cue, seen),
        },
      ),
    );
  };
  return { startOf, endOf };
};

/** What a span says: what it starts from, and what it runs until when it names a point. */
const saidOf = (span: Span): string =>
  [
    anchorText(span),
    ...Option.toArray(
      Option.map(
        Option.fromUndefinedOr(span.until),
        (until) => `until ${untilEndText(until, span.untilOffset)}`,
      ),
    ),
  ].join(' · ');

/** Ties in the order they play: by start, then by name. */
const BY_START = Order.combine(
  Order.mapInput(Order.Number, (t: Tie) => t.start),
  Order.mapInput(Order.String, (t: Tie) => t.cue),
);

/**
 * The cues of beat `p` (laid out by `layout()`) tied to its line `line` (as
 * the Script lays it out, `lineRows`), in the order they play: each one
 * `layout()` placed, with what its span says and where its start and end
 * land. A beat with no line ties its cues to no word.
 */
export const tiesOf = (p: Placed, line: Option.Option<SectionRows>): ReadonlyArray<Tie> => {
  const timeline = Option.getOrElse(Option.fromUndefinedOr(p.spec.timeline), () => ({}));
  const { startOf, endOf } = landingsIn(timeline, line);
  return Arr.sort(
    Object.entries(timeline).flatMap(([cue, span]) =>
      Option.toArray(
        Option.map(Option.fromUndefinedOr(p.cues.get(cue)), (placed): Tie => {
          const lands = [startOf(cue, []), endOf(cue, [])].flatMap(Option.toArray);
          return {
            cue,
            start: placed.start,
            end: placed.end,
            said: saidOf(span),
            marks: Arr.dedupe(lands.map((l) => l.mark)),
            words: Arr.dedupe(lands.flatMap((l) => Option.toArray(l.word))),
          };
        }),
      ),
    ),
    BY_START,
  );
};

/** The ties of mark `name`: the cues whose start or end lands on it, directly or through a chain. */
export const tiesOfMark = (ties: ReadonlyArray<Tie>, name: string): ReadonlyArray<Tie> =>
  ties.filter((t) => t.marks.includes(name));

/** The ties of words `from`–`to`: the cues whose start or end lands on any of them. */
export const tiesOfWords = (
  ties: ReadonlyArray<Tie>,
  from: number,
  to: number,
): ReadonlyArray<Tie> => ties.filter((t) => t.words.some((w) => w >= from && w <= to));

/** The ties shown beside cue `name`: the cues that land on a mark it lands on, it among them; itself alone when it lands on none. */
export const tiesOfCue = (ties: ReadonlyArray<Tie>, name: string): ReadonlyArray<Tie> =>
  Option.match(
    Arr.findFirst(ties, (t) => t.cue === name),
    {
      onNone: () => [],
      onSome: (tie) =>
        ties.filter((t) => t.cue === name || t.marks.some((m) => tie.marks.includes(m))),
    },
  );

/** A line's marks as the reader sets them: each before the word it stands before, and those past the last word at the end. */
interface LineMarks {
  /** The marks before word `index`, in the line's order. */
  readonly at: (index: number) => ReadonlyArray<string>;
  /** The marks past the line's last word. */
  readonly end: ReadonlyArray<string>;
}

/** `line`'s marks, each by the word it stands before (`SectionRows.marks`). */
export const marksIn = (line: SectionRows): LineMarks => {
  const last = Option.getOrElse(
    Option.map(Arr.last(line.rows), (r) => r.index),
    () => -1,
  );
  const marks = Object.entries(line.marks);
  return {
    at: (index) => marks.filter(([, at]) => at === index).map(([name]) => name),
    end: marks.filter(([, at]) => at > last).map(([name]) => name),
  };
};

/** Where a tie starts and ends in its beat, to the hundredth of a second, as `film cues` prints it: `0.85–1.90 s`, an instant `0.85 s`. */
export const tieTimes = (tie: Pick<Tie, 'start' | 'end'>): string => {
  const start = tie.start.toFixed(2);
  const end = tie.end.toFixed(2);
  if (start === end) return `${start} s`;
  return `${start}–${end} s`;
};

/** A piece of a picture's brief: words, or a name in backticks, which is a cue of the beat, a mark of its line, or neither. */
export type Brief = Data.TaggedEnum<{
  Text: { readonly text: string };
  Cue: { readonly name: string };
  Mark: { readonly name: string };
  Code: { readonly text: string };
}>;
export const Brief = Data.taggedEnum<Brief>();

/** A name in backticks, on one line. */
const TICKED = /`([^`\n]+)`/;

/**
 * `picture` in pieces: its words, and each name in backticks as the cue of
 * the beat it names (one of `cues`), else the mark of its line (one of
 * `marks`), else code; empty words are left out.
 */
export const briefOf = (
  picture: string,
  cues: ReadonlyArray<string>,
  marks: Readonly<Record<string, number>>,
): ReadonlyArray<Brief> =>
  picture.split(TICKED).flatMap((piece, i): ReadonlyArray<Brief> => {
    if (i % 2 === 0) return Arr.filter([Brief.Text({ text: piece })], () => piece !== '');
    if (cues.includes(piece)) return [Brief.Cue({ name: piece })];
    if (Rec.has(marks, piece)) return [Brief.Mark({ name: piece })];
    return [Brief.Code({ text: piece })];
  });
