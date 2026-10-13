// The notes on the Script's words, pure: where a note on words of a beat's
// line stands in the line as it reads now (`placedWords`: its words where
// they were, else the first run of the line that reads as they did, else
// nowhere, when the line no longer says them), which notes the reader shows
// (each still open or replied, and the one selected whatever its status),
// where its marker stands (after its last word; at the line's end for one
// whose words are gone), and how its words are painted: a note's underlined,
// a correction's or a removal's struck, as what it asks would leave them.

import { Array as Arr, Option } from 'effect';
import type { HighlightName } from '../../browser/highlights.ts';
import { kindOf } from '../../core/notes.ts';
import type { CodeRange, Note, NoteKind, NoteWords } from '../../core/schema.ts';
import { type Row, type SectionRows, rangesOf } from '../transcript/lit.ts';

/** A note on words of a line, as the reader shows it. */
export interface Noted {
  readonly note: Note;
  /** What it asks of its words. */
  readonly kind: NoteKind;
  readonly words: NoteWords;
  /** The words of the line it is on now: none when the line no longer says them. */
  readonly rows: ReadonlyArray<Row>;
}

/** What `rows` read, a space between each word. */
const reading = (rows: ReadonlyArray<Row>) => rows.map((r) => r.text).join(' ');

/**
 * The words of `line` a note on `words` is on now: the words at its indices
 * while they read as they did, else the first run of as many words that
 * does (a word added or cut before them moved them), else none.
 */
const placedWords = (line: SectionRows, words: NoteWords): ReadonlyArray<Row> => {
  const count = words.to - words.from + 1;
  const at = line.rows.filter((r) => r.index >= words.from && r.index <= words.to);
  if (at.length === count && reading(at) === words.text) return at;
  const runs = line.rows
    .map((_, i) => line.rows.slice(i, i + count))
    .filter((run) => run.length === count);
  return Option.getOrElse(
    Arr.findFirst(runs, (run) => reading(run) === words.text),
    (): ReadonlyArray<Row> => [],
  );
};

/**
 * The notes on words of `line` the reader shows: each not yet resolved, and
 * the one selected (`selected`, its id) whatever its status, in the order
 * they were made.
 */
export const notedOn = (
  notes: ReadonlyArray<Note>,
  line: SectionRows,
  selected: Option.Option<string>,
): ReadonlyArray<Noted> =>
  notes.flatMap((note): Array<Noted> => {
    if (note.status === 'resolved' && !Option.contains(selected, note.id)) return [];
    return Option.toArray(
      Option.map(
        Option.filter(Option.fromUndefinedOr(note.words), (w) => w.beat === line.id),
        (words): Noted => ({ note, kind: kindOf(note), words, rows: placedWords(line, words) }),
      ),
    );
  });

/** The notes of a line by where each marker stands: after word `index`, or at the line's end. */
interface LineNoted {
  readonly at: (index: number) => ReadonlyArray<Noted>;
  readonly end: ReadonlyArray<Noted>;
}

/** Where the markers of `noted` stand in their line: each after its last word, a note whose words are gone at the end. */
export const notedIn = (noted: ReadonlyArray<Noted>): LineNoted => ({
  at: (index) => noted.filter((n) => Option.exists(Arr.last(n.rows), (r) => r.index === index)),
  end: noted.filter((n) => n.rows.length === 0),
});

/** The highlight the reader paints a note's words with, by what it asks: a note's underlined, a correction's or a removal's struck. */
const NOTED_PAINT = {
  note: 'lab-noted',
  correction: 'lab-struck',
  removal: 'lab-struck',
} as const satisfies Record<NoteKind, HighlightName>;

/** A highlight the notes on words paint. */
type NotedPaint = (typeof NOTED_PAINT)[NoteKind];

/** The ranges of the one text the words of `noted` cover, by the highlight each is painted with. */
export const notedPainted = (
  noted: ReadonlyArray<Noted>,
): Readonly<Record<NotedPaint, ReadonlyArray<CodeRange>>> => {
  const painted = (name: NotedPaint) =>
    rangesOf(noted.filter((n) => NOTED_PAINT[n.kind] === name).flatMap((n) => n.rows));
  return { 'lab-noted': painted('lab-noted'), 'lab-struck': painted('lab-struck') };
};
