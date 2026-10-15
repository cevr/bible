// A series draft (`series/<series>/scripts/<draft>.md` in the app) as the
// Script reader reads it: its beats, each with its line, what its picture
// does and its sources, out of the Markdown the owner and the agents write.
// The Markdown stays the one source: `DraftMarkdown` decodes it and encodes
// it back byte for byte, so a mark the reader writes is one beat's line
// changed (`draftMarked`) and every other character of the file as it was.
//
// A draft is written in one of two layouts:
//
// - a talk's table: a row a beat, its `#` cell the beat's number (and a label
//   after `·`), its Say or Spoken cell the line, its Picture or On screen
//   cell the brief, its Source cell the sources;
//
//       | #        | Spoken (owner, to lens)        | On screen / B-roll | Source note |
//       | 1 · Hook | The first thing God {*}gave.   | A figure of clay.  | Gen 2:7     |
//
// - a film's beat list: a `### \`id\` · label` heading a beat, its line on
//   `**say:**`, its brief on `**picture:**`, its sources on `**cite:**`.
//
//       ### `cold` · STORY · ~30 s
//
//       **say:** {baby}A baby drinks {*}milk. {/} Nobody minds.
//
// A line is read as a film's `say` is (`parse` in `narration.ts`): its cues,
// its turns and its delivery marks in braces, never spoken. A line that does
// not parse, or that stresses a word the Markdown way (`_if_`) or writes a
// pause as a direction (`(0.6 s)`) where a mark (`{*}`, `{//}`) belongs,
// fails the draft, naming the beat: nothing a reader cannot voice is read
// aloud. Pure.

import {
  Array as Arr,
  Effect,
  Match,
  Option,
  Result,
  Schema,
  SchemaIssue,
  SchemaTransformation,
} from 'effect';
import { type Mark, marksMisfit } from './delivery.ts';
import { parse, withDelivery } from './narration.ts';

/** Where a beat's line stands in the Markdown, by character: its text from `start` to `end`. */
const Said = Schema.Struct({
  /** The line as the reader reads it: a table cell's `\|` read as `|`. */
  text: Schema.String,
  start: Schema.Int,
  end: Schema.Int,
});
type Said = typeof Said.Type;

/** A beat of a draft. */
export const DraftBeat = Schema.Struct({
  /** The row's number in a table, the beat's id in a beat list. */
  id: Schema.String,
  /** What the draft calls the beat besides its id (`Hook`, `STORY · ~30 s`); empty where it says nothing. */
  label: Schema.String,
  /** Its line, with its marks; none for a beat that says nothing (a title card). */
  say: Schema.Option(Said),
  /** What the picture does; none where it says nothing. */
  brief: Schema.Option(Schema.String),
  /** Its sources. */
  cite: Schema.Array(Schema.String),
});
export type DraftBeat = typeof DraftBeat.Type;

/** A draft as decoded: its Markdown whole, its title and its beats in order. */
export const Draft = Schema.Struct({
  markdown: Schema.String,
  title: Schema.String,
  beats: Schema.Array(DraftBeat),
});
export type Draft = typeof Draft.Type;

/** Why a draft does not read: the beat (none for the draft as a whole) and the reason. */
interface Unread {
  readonly beat: Option.Option<string>;
  readonly reason: string;
}

const unread = (reason: string, beat: Option.Option<string> = Option.none()): Unread => ({
  beat,
  reason,
});

/** A draft's failure as a sentence: `beat 3: …`, or the reason alone. */
export const unreadText = (u: Unread): string =>
  Option.match(u.beat, { onNone: () => u.reason, onSome: (beat) => `beat ${beat}: ${u.reason}` });

// ---------------------------------------------------------------------------
// Lines of the Markdown, each with where it starts

interface Row {
  readonly text: string;
  readonly at: number;
}

const rowsOf = (markdown: string): ReadonlyArray<Row> =>
  markdown
    .split('\n')
    .reduce<{ readonly rows: ReadonlyArray<Row>; readonly at: number }>(
      (acc, text) => ({ rows: [...acc.rows, { text, at: acc.at }], at: acc.at + text.length + 1 }),
      { rows: [], at: 0 },
    ).rows;

/** The draft's title: its first `# ` heading. */
const titleOf = (rows: ReadonlyArray<Row>): string =>
  Option.getOrElse(
    Option.map(
      Arr.findFirst(rows, (r) => r.text.startsWith('# ')),
      (r) => r.text.slice(2).trim(),
    ),
    () => '',
  );

/** A cell of a table row: its text trimmed, and where that text starts and ends in the Markdown. */
interface Cell {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

/** The cells of table row `row`, split on its unescaped pipes. */
const cellsOf = (row: Row): ReadonlyArray<Cell> => {
  const bars = [...row.text.matchAll(/(?<!\\)\|/g)].map((m) => m.index);
  return bars.slice(0, -1).map((bar, i) => {
    const raw = row.text.slice(bar + 1, bars[i + 1]);
    const lead = raw.length - raw.trimStart().length;
    const text = raw.trim();
    const start = row.at + bar + 1 + lead;
    return { text, start, end: start + text.length };
  });
};

/** `pattern`'s first match in `text`, if any. */
const matchOf = (pattern: RegExp, text: string) => Option.fromNullishOr(pattern.exec(text));

const isTableRow = (row: Row) => row.text.trimStart().startsWith('|');

/** A table cell's text as read: `\|` is a pipe. */
const cellRead = (text: string) => text.replaceAll('\\|', '|');

/** A line as a table cell writes it: a pipe escaped. */
const cellWritten = (text: string) => text.replaceAll('|', '\\|');

/** Which column of a talk's table holds what: the header's cell that starts so, case aside. */
const COLUMNS = {
  id: /^#$/,
  say: /^(say|spoken)\b/i,
  brief: /^(picture|on screen)\b/i,
  cite: /^source\b/i,
} as const;

/** Whether a header row is the script's: a `#` cell and a Say or Spoken one. */
const scriptHeader = (cells: ReadonlyArray<Cell>) =>
  cells.some((c) => COLUMNS.id.test(c.text)) && cells.some((c) => COLUMNS.say.test(c.text));

/** The column of `cells` that `pattern` names: none when no header cell does. */
const columnOf = (cells: ReadonlyArray<Cell>, pattern: RegExp) =>
  Arr.findFirstIndex(cells, (c) => pattern.test(c.text));

/** A cell's text, when the column is there and the cell says something. */
const cellAt = (cells: ReadonlyArray<Cell>, column: Option.Option<number>) =>
  Option.filter(
    Option.flatMap(column, (i) => Arr.get(cells, i)),
    (c) => c.text.length > 0,
  );

/** A talk's table: the beats of the first table whose header has `#` and Say (or Spoken). */
const tableBeats = (
  rows: ReadonlyArray<Row>,
): Option.Option<Result.Result<ReadonlyArray<DraftBeat>, Unread>> =>
  Option.map(
    Arr.findFirstIndex(rows, (r) => isTableRow(r) && scriptHeader(cellsOf(r))),
    (head) => {
      const header = Option.match(Arr.get(rows, head), { onNone: () => [], onSome: cellsOf });
      const column = {
        id: columnOf(header, COLUMNS.id),
        say: columnOf(header, COLUMNS.say),
        brief: columnOf(header, COLUMNS.brief),
        cite: columnOf(header, COLUMNS.cite),
      };
      // The rows under the header and its rule, to the table's end.
      const body = Arr.takeWhile(rows.slice(head + 2), isTableRow);
      return Result.all(body.map((row) => tableBeat(cellsOf(row), column)));
    },
  );

/** A table row's beat: its `#` cell's number its id, the words after `·` its label. */
const tableBeat = (
  cells: ReadonlyArray<Cell>,
  column: Readonly<Record<keyof typeof COLUMNS, Option.Option<number>>>,
): Result.Result<DraftBeat, Unread> => {
  const number = Option.getOrElse(
    Option.map(cellAt(cells, column.id), (c) => c.text),
    () => '',
  );
  const matched = matchOf(/^(\d+)\s*(?:·\s*(.*))?$/, number);
  if (Option.isNone(matched))
    return Result.fail(unread(`a row's # reads "${number}", not a beat's number`));
  const found = matched.value;
  const id = found[1] ?? '';
  return Result.map(
    lineOf(
      id,
      Option.map(cellAt(cells, column.say), (c) => ({
        text: cellRead(c.text),
        start: c.start,
        end: c.end,
      })),
    ),
    (say): DraftBeat => ({
      id,
      label: (found[2] ?? '').trim(),
      say,
      brief: Option.map(cellAt(cells, column.brief), (c) => cellRead(c.text)),
      cite: Option.toArray(Option.map(cellAt(cells, column.cite), (c) => cellRead(c.text))),
    }),
  );
};

/** A film's beat list: a beat for each `### \`id\`` heading, its fields on the lines under it. */
const listBeats = (rows: ReadonlyArray<Row>): Result.Result<ReadonlyArray<DraftBeat>, Unread> => {
  const heads = rows.flatMap((row, i) =>
    Option.toArray(
      Option.map(matchOf(/^### `([^`]+)`\s*(?:·\s*(.*))?$/, row.text), (found) => ({
        i,
        id: found[1] ?? '',
        label: (found[2] ?? '').trim(),
      })),
    ),
  );
  return Result.all(
    heads.map((head) => {
      // The beat's lines: to the next heading of any level.
      const lines = Arr.takeWhile(rows.slice(head.i + 1), (r) => !r.text.startsWith('#'));
      const field = (name: string) =>
        Option.map(
          Arr.findFirst(lines, (r) => r.text.startsWith(`**${name}:** `)),
          (r) => {
            const lead = `**${name}:** `.length;
            const text = r.text.slice(lead).trimEnd();
            return { text, start: r.at + lead, end: r.at + lead + text.length };
          },
        );
      return Result.map(lineOf(head.id, field('say')), (say): DraftBeat => ({
        id: head.id,
        label: head.label,
        say,
        brief: Option.map(field('picture'), (f) => f.text),
        cite: Option.getOrElse(
          Option.map(field('cite'), (f) => f.text.split(/;\s+/).filter((s) => s.length > 0)),
          () => [],
        ),
      }));
    }),
  );
};

/** Markdown's own stress (`_word_`, `*word*`), outside the braces: a delivery mark's work. */
const EMPHASIS = /(?:^|[\s"“(])(_[^_\s][^_]*_|\*[^*\s{}][^*{}]*\*)(?=$|[\s.,;:!?"”)])/;

/** A pause written as a direction, `(0.6 s)`: a hold's work. */
const DIRECTION = /\(\s*\d+(?:\.\d+)?\s*s\b[^)]*\)/;

/** A beat's line read: none when it says nothing; refused when it does not parse or marks itself the Markdown way. */
const lineOf = (
  beat: string,
  said: Option.Option<Said>,
): Result.Result<Option.Option<Said>, Unread> => {
  if (Option.isNone(said)) return Result.succeed(said);
  const text = said.value.text;
  const outside = text.replace(/\{[^}]*\}/g, ' ');
  const emphasis = matchOf(EMPHASIS, outside);
  if (Option.isSome(emphasis))
    return Result.fail(
      unread(
        `stresses ${emphasis.value[1]} the Markdown way: write {*} before the word`,
        Option.some(beat),
      ),
    );
  const direction = matchOf(DIRECTION, outside);
  if (Option.isSome(direction))
    return Result.fail(
      unread(
        `writes the pause ${direction.value[0]} as a direction: write {//} in its gap`,
        Option.some(beat),
      ),
    );
  return Result.match(parse(beat, text), {
    onFailure: (e) => Result.fail(unread(e.message, Option.some(beat))),
    onSuccess: () => Result.succeed(said),
  });
};

/** Every id that names more than one beat. */
const twice = (beats: ReadonlyArray<DraftBeat>) =>
  Arr.findFirst(beats, (b, i) => beats.findIndex((o) => o.id === b.id) !== i);

/** A draft read from its Markdown: its table's beats, else its beat list's; refused when it has neither. */
export const readDraft = (markdown: string): Result.Result<Draft, Unread> => {
  const rows = rowsOf(markdown);
  const beats = Option.getOrElse(tableBeats(rows), () => listBeats(rows));
  return Result.flatMap(beats, (found) => {
    if (found.length === 0)
      return Result.fail(
        unread('it has no beats: no table with a # and a Say column, and no ### `beat` headings'),
      );
    return Option.match(twice(found), {
      onSome: (b) => Result.fail(unread('names two beats alike', Option.some(b.id))),
      onNone: () => Result.succeed({ markdown, title: titleOf(rows), beats: found }),
    });
  });
};

/** Whether a line stands in a table cell: then a pipe in it is written escaped. */
const inCell = (markdown: string, said: Said): boolean => {
  const lineStart = markdown.lastIndexOf('\n', said.start - 1) + 1;
  return markdown.slice(lineStart, said.start).trimStart().startsWith('|');
};

/** A draft's Markdown with each beat's line written where it stands: the Markdown itself when none changed. */
export const writeDraft = (draft: Draft): string =>
  draft.beats
    .flatMap((b) => Option.toArray(b.say))
    .toSorted((a, b) => b.start - a.start)
    .reduce((text, said) => {
      const written = Match.value(inCell(draft.markdown, said)).pipe(
        Match.when(true, () => cellWritten(said.text)),
        Match.orElse(() => said.text),
      );
      return `${text.slice(0, said.start)}${written}${text.slice(said.end)}`;
    }, draft.markdown);

/** A draft's Markdown as its beats: read and written back byte for byte. */
export const DraftMarkdown = Schema.String.pipe(
  Schema.decodeTo(
    Draft,
    SchemaTransformation.transformEffect({
      decode: (markdown: string) =>
        Effect.mapError(
          Effect.fromResult(readDraft(markdown)),
          (u) => new SchemaIssue.InvalidValue({ message: unreadText(u) }, markdown),
        ),
      encode: (draft: Draft) => Effect.succeed(writeDraft(draft)),
    }),
  ),
);

/** Beat `beat`'s line of `draft`, read: none when it has no such beat or the beat says nothing. */
const lineIn = (draft: Draft, beat: string) =>
  Option.flatMap(
    Option.flatMap(
      Arr.findFirst(draft.beats, (b) => b.id === beat),
      (b) => b.say,
    ),
    (said) => Result.getSuccess(parse(beat, said.text)),
  );

/**
 * What a mark write that meant `marks` on beat `beat` missed, read back from
 * the formatted Markdown `after` against `before`, the text it was made
 * from: none when the beat's line has the words it had and exactly those
 * marks, and every other beat reads as it did.
 */
export const draftMissed = (
  after: string,
  before: string,
  beat: string,
  marks: ReadonlyArray<Mark>,
): ReadonlyArray<string> => {
  const was = readDraft(before);
  const now = readDraft(after);
  if (Result.isFailure(now)) return [`the draft no longer reads: ${unreadText(now.failure)}`];
  if (Result.isFailure(was)) return [`the draft did not read: ${unreadText(was.failure)}`];
  // A beat's line as marked, '' for one that says nothing.
  const line = (draft: Draft, id: string) =>
    Option.getOrElse(
      Option.map(lineIn(draft, id), (l) => withDelivery(l.spoken, l.delivery)),
      () => '',
    );
  const others = was.success.beats.filter(
    (b) => b.id !== beat && line(was.success, b.id) !== line(now.success, b.id),
  );
  return Option.match(
    Option.zipWith(lineIn(was.success, beat), lineIn(now.success, beat), (a, b) => ({ a, b })),
    {
      onNone: () => [`beat ${beat} says nothing now`],
      onSome: ({ a, b }) => [
        ...Arr.filter([`beat ${beat} no longer says what it said`], () => a.spoken !== b.spoken),
        ...Arr.filter(
          [
            `beat ${beat} reads “${withDelivery(a.spoken, b.delivery)}”, not “${withDelivery(a.spoken, marks)}”`,
          ],
          () => withDelivery(a.spoken, b.delivery) !== withDelivery(a.spoken, marks),
        ),
        ...others.map((o) => `beat ${o.id} changed too`),
      ],
    },
  );
};

/**
 * Draft `markdown` with beat `beat`'s line marked `marks` and nothing else
 * changed: refused when the draft does not read, the beat says nothing, or a
 * mark does not fit its words (`marksMisfit`, as a film's mark write is).
 */
export const draftMarked = (
  markdown: string,
  beat: string,
  marks: ReadonlyArray<Mark>,
): Result.Result<string, Unread> =>
  Result.flatMap(readDraft(markdown), (draft) => {
    const found = Arr.findFirst(draft.beats, (b) => b.id === beat);
    if (Option.isNone(found))
      return Result.fail(unread('the draft has no such beat', Option.some(beat)));
    if (Option.isNone(found.value.say))
      return Result.fail(unread('says nothing to mark', Option.some(beat)));
    const said = found.value.say.value;
    const words = Option.getOrElse(
      Option.map(lineIn(draft, beat), (l) => l.spoken.split(' ').length),
      () => 0,
    );
    const misfit = marksMisfit(marks, words);
    if (Option.isSome(misfit)) return Result.fail(unread(misfit.value.reason, Option.some(beat)));
    const remarked = Option.some({ ...said, text: withDelivery(said.text, marks) });
    const marked: Draft = {
      ...draft,
      beats: draft.beats.map((b): DraftBeat =>
        Match.value(b.id).pipe(
          Match.when(beat, () => ({ ...b, say: remarked })),
          Match.orElse(() => b),
        ),
      ),
    };
    const written = writeDraft(marked);
    return Result.map(readDraft(written), () => written);
  });
