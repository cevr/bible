// A talk's edit (`talk.ts`) as the lab reads and rewrites it: the
// `export const talk = {…}` literal, parsed with oxc-parser and never
// imported (the lab runs for days and never loads a film's module). The
// Transcript view's words are read from it (`talkWords`), cut on the takes'
// transcripts as the page and the tools cut them (`talkCut`); its writes are
// splices of one section's `cut` or `marks` literal (`editStrikes`,
// `editMark`), each judged by the talk its new text cuts (`talkCutIn`), so a
// write that would leave the talk unplayable is refused in the cut's own
// words and writes nothing. A take, a transcript or the footage lock is
// never written: they are read.
//
// Strikes are kept as sorted, maximal runs (`[[2, 3], [7, 7]]`): a Cut adds
// its words to the section's struck set and a Restore takes them out, each
// written back as the runs of the set; a `cut` left empty is taken away. A
// mark is written where the section names its marks, or after its `cut`
// (else its `to`) when it names none, under a name the talk's decode keeps
// (`MarkName`), and reads back only when the talk decoded from the new text
// has it.
//
// A write splices the literal and nothing else: the author's layout and
// comments stay. A key added goes after the one before it as that one sits:
// on a line of its own in a section written over lines, else on the same
// line; a key taken away goes with the separator before it, or, when a
// comment stands there, with its own comma (its line too, when nothing else
// is on it), so a comment is never taken. So a Restore undoes a Cut to the
// byte, in a section written over lines as on one. One break is the
// formatter's, not the author's: oxfmt prints a cut of two runs or more a run
// to a line, and its section broken with it, and keeps an object broken once;
// the Restore that leaves such a cut one run or none puts the section back
// on one line (`unbroken`), unless a comment in it says the author laid it
// out. A one-line section a Cut's single run pushes past the print width
// stays broken: only Undo gives back its line.

import {
  Array as Arr,
  Boolean as Bool,
  Effect,
  FileSystem,
  Option,
  Order,
  Path,
  Predicate,
  Result,
  Schema,
} from 'effect';
import type { Expression, ObjectExpression, ObjectProperty, ObjectPropertyKind } from 'oxc-parser';
import type { TalkWord, TalkWords } from '../core/api.ts';
import { FootageTranscriptJson } from '../core/footage.ts';
import { SourceRefused } from '../core/refusals.ts';
import {
  MarkName,
  Talk,
  type TalkCut,
  type TalkTake,
  talkCut,
  talkTakes,
  talkTranscripts,
} from '../core/talk.ts';
import { heard } from '../core/voiced.ts';
import { ContentStore } from './content-store.ts';
import { FilmFolder, footageLockManifest } from './film-repo.ts';
import {
  keyName,
  objectOf,
  parseModule,
  propertyOf,
  refuse,
  spliced,
  stringOf,
  stringText,
} from './scene-source.ts';

/** A talk's edit, in its folder. */
export const TALK_FILE = 'talk.ts';

/** One splice of a text: `start`–`end` replaced by `text`. */
interface Splice {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

/** Words struck from a section: from one index to another, both struck. */
type Strike = readonly [number, number];

/** What a write of a talk is: its file as an answer names it (`talk.ts`), and what it sets. */
interface TalkTarget {
  readonly file: string;
  readonly target: string;
}

const refused = <A>(at: TalkTarget, reason: string) => refuse<A>(at.file, at.target, reason);

/**
 * An expression as the data it writes, when it is all literals: an object
 * (no spread, computed key or shorthand), an array (no hole or spread), a
 * string, a number, `true`, `false` or `null`, seen through `as const` and
 * `satisfies`. None for anything computed.
 */
const dataOf = (e: Expression): Option.Option<unknown> => {
  switch (e.type) {
    case 'TSAsExpression':
    case 'TSSatisfiesExpression':
    case 'ParenthesizedExpression':
      return dataOf(e.expression);
    case 'Literal':
      return Option.liftPredicate(
        e.value,
        (v) =>
          Predicate.isString(v) ||
          Predicate.isNumber(v) ||
          Predicate.isBoolean(v) ||
          Predicate.isNull(v),
      );
    case 'UnaryExpression':
      if (e.operator !== '-' || e.argument.type !== 'Literal') return Option.none();
      return Option.map(Option.liftPredicate(e.argument.value, Predicate.isNumber), (n) => -n);
    case 'ArrayExpression':
      return Option.all(
        e.elements.map((el) => {
          if (!Predicate.isNotNullish(el) || el.type === 'SpreadElement') return Option.none();
          return dataOf(el);
        }),
      );
    case 'ObjectExpression': {
      const entries = e.properties.map((p) => {
        if (p.type === 'SpreadElement' || p.shorthand || p.method) return Option.none();
        return Option.zipWith(keyName(p), dataOf(p.value), (k, v) => [k, v] as const);
      });
      return Option.map(Option.all(entries), (all) => Object.fromEntries(all));
    }
    default:
      return Option.none();
  }
};

/** The `talk` literal `source` exports (`export const talk = {…}`). */
const talkObject = (
  at: TalkTarget,
  source: string,
): Result.Result<ObjectExpression, SourceRefused> =>
  Result.flatMap(parseModule(at.file, source), (program) => {
    const found = program.body.flatMap((s) => {
      if (s.type !== 'ExportNamedDeclaration' || s.declaration?.type !== 'VariableDeclaration')
        return [];
      return s.declaration.declarations.flatMap((d) => {
        if (d.id.type !== 'Identifier' || d.id.name !== 'talk' || !Predicate.isNotNullish(d.init))
          return [];
        return Option.toArray(objectOf(d.init));
      });
    });
    return Result.fromOption(Arr.head(found), () =>
      SourceRefused.make({
        file: at.file,
        target: at.target,
        reason: 'it exports no `talk` object literal (`export const talk = {…}`)',
      }),
    );
  });

/**
 * The talk `source` exports, decoded as the edit it is (`Talk`): refused when
 * it is not all literals (what it plays would not be provable without
 * running it) or not a talk.
 */
const talkIn = (at: TalkTarget, source: string): Result.Result<Talk, SourceRefused> =>
  Result.flatMap(talkObject(at, source), (talk) =>
    Option.match(dataOf(talk), {
      onNone: () =>
        refused<Talk>(at, 'its talk is not all literals, so what it plays is not provable'),
      onSome: (data) =>
        Result.mapError(Schema.decodeUnknownResult(Talk)(data), (e) =>
          SourceRefused.make({ file: at.file, target: at.target, reason: e.message }),
        ),
    }),
  );

/** Section `id`'s object literal in the talk's `sections`. */
const sectionObject = (
  at: TalkTarget,
  talk: ObjectExpression,
  id: string,
): Result.Result<ObjectExpression, SourceRefused> =>
  Result.gen(function* () {
    const sections = yield* propertyOf(at.file, at.target, talk, 'sections');
    const list = Option.getOrUndefined(Option.map(sections, (p) => p.value));
    if (list?.type !== 'ArrayExpression')
      return yield* refused<ObjectExpression>(at, 'its sections are not an array literal');
    const named = list.elements.flatMap((el) => {
      if (!Predicate.isNotNullish(el) || el.type === 'SpreadElement') return [];
      return Option.toArray(
        Option.filter(objectOf(el), (o) =>
          o.properties.some(
            (p) =>
              p.type === 'Property' &&
              Option.contains(keyName(p), 'id') &&
              Option.contains(stringOf(p.value), id),
          ),
        ),
      );
    });
    if (named.length > 1)
      return yield* refused<ObjectExpression>(at, `section "${id}" is there ${named.length} times`);
    return yield* Result.fromOption(Arr.head(named), () =>
      SourceRefused.make({ file: at.file, target: at.target, reason: `it has no section "${id}"` }),
    );
  });

/** A property written as a literal: its node, and the data it writes. */
interface Literally {
  readonly node: ObjectProperty;
  readonly value: unknown;
}

/** Property `name` of `obj`, as data; none when it is not there. Refused when it is there but computed. */
const dataProperty = (
  at: TalkTarget,
  obj: ObjectExpression,
  name: string,
): Result.Result<Option.Option<Literally>, SourceRefused> =>
  Result.flatMap(propertyOf(at.file, at.target, obj, name), (found) =>
    Option.match(found, {
      onNone: () => Result.succeed(Option.none()),
      onSome: (node) =>
        Option.match(
          Option.flatMap(
            Option.liftPredicate(node, (n) => !n.shorthand),
            (n) => dataOf(n.value),
          ),
          {
            onNone: () => refused(at, `its ${name} is not a literal, so it is not provable`),
            onSome: (value) => Result.succeed(Option.some({ node, value })),
          },
        ),
    }),
  );

const Strikes = Schema.Array(Schema.Tuple([Schema.Int, Schema.Int]));
const Marks = Schema.Record(Schema.String, Schema.Int);

/** A section's first and last word, its strikes and its marks, as its literal writes them. */
const sectionRead = (at: TalkTarget, section: ObjectExpression) =>
  Result.gen(function* () {
    const number = (name: string) =>
      Result.flatMap(dataProperty(at, section, name), (p) =>
        Result.fromOption(
          Option.filter(
            Option.map(p, (x) => x.value),
            (v): v is number => Number.isInteger(v),
          ),
          () =>
            SourceRefused.make({
              file: at.file,
              target: at.target,
              reason: `its ${name} is not a word index`,
            }),
        ),
      );
    const decoded = <A>(name: string, schema: Schema.Codec<A, unknown>, property: Literally) =>
      Result.mapError(Schema.decodeUnknownResult(schema)(property.value), () =>
        SourceRefused.make({
          file: at.file,
          target: at.target,
          reason: `its ${name} does not read`,
        }),
      );
    const from = yield* number('from');
    const to = yield* number('to');
    const cut = yield* dataProperty(at, section, 'cut');
    const marks = yield* dataProperty(at, section, 'marks');
    const strikes: ReadonlyArray<Strike> = yield* Option.match(cut, {
      onNone: () => Result.succeed<ReadonlyArray<Strike>>([]),
      onSome: (c) => decoded('cut', Strikes, c),
    });
    const named: Readonly<Record<string, number>> = yield* Option.match(marks, {
      onNone: () => Result.succeed({}),
      onSome: (m) => decoded('marks', Marks, m),
    });
    return { from, to, strikes, marks: named, cut, marksNode: marks };
  });

/** The words `strikes` strike, one by one. */
const struckIn = (strikes: ReadonlyArray<Strike>): ReadonlySet<number> =>
  new Set(strikes.flatMap(([a, b]) => Arr.makeBy(Math.max(0, b - a + 1), (k) => a + k)));

const noRuns: ReadonlyArray<Strike> = [];

/** `words`, sorted, as maximal runs: `[2, 3, 4, 7]` is `[[2, 4], [7, 7]]`. */
const runsOf = (words: Iterable<number>): ReadonlyArray<Strike> =>
  Arr.reduce(Arr.sort(new Set(words), Order.Number), noRuns, (runs, w) =>
    Option.match(
      Option.filter(Arr.last(runs), ([, end]) => end + 1 === w),
      {
        onNone: (): ReadonlyArray<Strike> => [...runs, [w, w]],
        onSome: ([start]): ReadonlyArray<Strike> => [...runs.slice(0, -1), [start, w]],
      },
    ),
  );

/** Strikes as the literal writes them: `[[2, 4], [7, 7]]`. */
const strikesText = (runs: ReadonlyArray<Strike>) =>
  `[${runs.map(([a, b]) => `[${a}, ${b}]`).join(', ')}]`;

/** Where the line holding offset `at` of `source` starts. */
const lineStart = (source: string, at: number) => source.lastIndexOf('\n', at - 1) + 1;

/**
 * The splice that takes `p` out of `obj`, every comment left in place: with
 * the separator before it (as `insertionAfter` wrote it) when only a comma
 * and space stand between it and the key before; else (a comment stands
 * there, or it is the first key) with its own comma and the space after it,
 * and its whole line when nothing else is on it.
 */
const removal = (source: string, obj: ObjectExpression, p: ObjectProperty): Splice =>
  Option.getOrElse(
    Option.map(
      Option.filter(Arr.get(obj.properties, obj.properties.indexOf(p) - 1), (before) =>
        /^\s*,?\s*$/.test(source.slice(before.end, p.start)),
      ),
      (before): Splice => ({ start: before.end, end: p.end, text: '' }),
    ),
    (): Splice => {
      const end = p.end + (/^[ \t]*,[ \t]*/.exec(source.slice(p.end))?.[0].length ?? 0);
      const from = lineStart(source, p.start);
      const alone = /^[ \t]*$/.test(source.slice(from, p.start)) && source[end] === '\n';
      return Bool.match(alone, {
        onTrue: () => ({ start: from, end: end + 1, text: '' }),
        onFalse: () => ({ start: p.start, end, text: '' }),
      });
    },
  );

/**
 * The splice that adds `text` (a `key: value`) right after `after`, as
 * `after` sits: on a line of its own, indented as `after`'s, when nothing
 * but its comma and a comment follows it on its line (an object written over
 * lines); else on its line.
 */
const insertionAfter = (
  source: string,
  after: Pick<ObjectPropertyKind, 'start' | 'end'>,
  text: string,
): Splice => {
  const rest = /^[^\n]*/.exec(source.slice(after.end))?.[0] ?? '';
  const indent = /^[ \t]*/.exec(source.slice(lineStart(source, after.start)))?.[0] ?? '';
  return {
    start: after.end,
    end: after.end,
    text: Bool.match(/^[ \t]*,?[ \t]*(\/\/.*|\/\*.*\*\/[ \t]*)?$/.test(rest), {
      onTrue: () => `,\n${indent}${text}`,
      onFalse: () => `, ${text}`,
    }),
  };
};

/** A mark's name as a key: bare when it is a name, else quoted. */
const keyText = (name: string) => {
  if (/^[A-Za-z_$][\w$]*$/.test(name)) return name;
  return stringText(name);
};

/** Words `from`–`to` as a sentence says them: `word 4`, `words 3–4`. */
const wordsText = (from: number, to: number) => {
  if (from === to) return `word ${from}`;
  return `words ${from}–${to}`;
};

/** What a Cut or a Restore of words `from`–`to` of `section` is, as a write names it. */
export const strikeTarget = (strike: boolean, section: string, from: number, to: number) => {
  if (strike) return `cut ${wordsText(from, to)} of ${section}`;
  return `restore ${wordsText(from, to)} of ${section}`;
};

/** What a Mark here of word `word` of `section` is, as a write names it. */
export const markTarget = (section: string, name: string, word: number) =>
  `mark ${name} on word ${word} of ${section}`;

/** Words `from`–`to` of a section, both counted. */
interface Words {
  readonly from: number;
  readonly to: number;
}

/**
 * Section `id` of `source`, as its literal reads, and the runs it strikes
 * once words `from`–`to` are struck (`strike`) or played again: refused for
 * words outside the section.
 */
const strikesPlanned = (
  at: TalkTarget,
  source: string,
  id: string,
  words: Words,
  strike: boolean,
) =>
  Result.gen(function* () {
    const section = yield* sectionObject(at, yield* talkObject(at, source), id);
    const read = yield* sectionRead(at, section);
    if (words.from > words.to || words.from < read.from || words.to > read.to)
      return yield* refused<never>(
        at,
        `words ${words.from}–${words.to} are not in section "${id}", which plays words ${read.from}–${read.to}`,
      );
    const asked = Arr.makeBy(words.to - words.from + 1, (k) => words.from + k);
    const was = [...struckIn(read.strikes)];
    if (strike) return { section, read, now: runsOf([...was, ...asked]) };
    return { section, read, now: runsOf(was.filter((w) => !asked.includes(w))) };
  });

/**
 * `source` with words `from`–`to` of section `id` struck (`strike`) or played
 * again: its `cut` written as the runs the section then strikes, added after
 * its `to` when it has none, taken away when it strikes none. Refused for
 * words outside the section, or a section whose literal does not say what
 * it strikes. Words already so leave the text as it is.
 */
export const editStrikes = (
  at: TalkTarget,
  source: string,
  id: string,
  words: Words,
  strike: boolean,
): Result.Result<string, SourceRefused> =>
  Result.gen(function* () {
    const { section, read, now } = yield* strikesPlanned(at, source, id, words, strike);
    const strikes: ReadonlyArray<Splice> = Option.match(read.cut, {
      onNone: () => {
        if (now.length === 0) return [];
        return Option.toArray(
          Option.map(
            Option.flatten(Result.getSuccess(propertyOf(at.file, at.target, section, 'to'))),
            (to) => insertionAfter(source, to, `cut: ${strikesText(now)}`),
          ),
        );
      },
      onSome: ({ node }) => {
        if (now.length === 0) return [removal(source, section, node)];
        return [{ start: node.value.start, end: node.value.end, text: strikesText(now) }];
      },
    });
    if (strikes.length === 0) return source;
    // Two runs or more broke the section over lines (oxfmt): one or none lets it back on one.
    const unforced = runsOf(struckIn(read.strikes)).length > 1 && now.length < 2;
    return yield* spliced(
      at.file,
      source,
      Bool.match(unforced, {
        onTrue: () => unbroken(source, section, strikes),
        onFalse: () => strikes,
      }),
    );
  });

/** `text` with no comment in it: none outside its strings. */
const uncommented = (text: string) =>
  !/\/[/*]/.test(text.replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, '""'));

/**
 * An object literal's text on one line, as oxfmt prints one that it did not
 * break: every break between its tokens taken out (no string of a literal
 * holds one), a trailing comma with it.
 */
const oneLine = (text: string) =>
  text
    .replace(/\[\s*\n\s*/g, '[')
    .replace(/,?\s*\n\s*\]/g, ']')
    .replace(/\{\s*\n\s*/g, '{ ')
    .replace(/,?\s*\n\s*\}/g, ' }')
    .replace(/\s*\n\s*/g, ' ');

/**
 * `strikes` (splices inside `section`) as one splice of the whole section,
 * put back on one line: the break a cut of two runs or more forced (oxfmt
 * prints such a cut a run to a line, and keeps its section broken after),
 * taken away by the write that leaves it one run or none, so a Restore gives
 * back the line a Cut broke. A section with a comment in it is the author's
 * layout, and keeps its lines.
 */
const unbroken = (
  source: string,
  section: ObjectExpression,
  strikes: ReadonlyArray<Splice>,
): ReadonlyArray<Splice> => {
  const text = strikes
    .toSorted((a, b) => b.start - a.start)
    .reduce(
      (t, s) => `${t.slice(0, s.start - section.start)}${s.text}${t.slice(s.end - section.start)}`,
      source.slice(section.start, section.end),
    );
  if (!text.includes('\n') || !uncommented(text)) return strikes;
  return [{ start: section.start, end: section.end, text: oneLine(text) }];
};

/**
 * `source` with mark `name` set on word `word` of section `id`: added to its
 * `marks`, or a `marks` added after its `cut` (else its `to`). Refused when
 * the name is not one the talk's decode keeps (`MarkName`: it would drop
 * the key, and the mark would mark nothing), or marks another word already;
 * a mark already there leaves the text as it is. Whether the word is played
 * is the talk's own check (`talkCutIn`).
 */
export const editMark = (
  at: TalkTarget,
  source: string,
  id: string,
  name: string,
  word: number,
): Result.Result<string, SourceRefused> =>
  Result.gen(function* () {
    yield* Result.mapError(Schema.decodeResult(MarkName)(name), (e) =>
      SourceRefused.make({
        file: at.file,
        target: at.target,
        reason: `"${name}" is not a mark's name (${e.message}): the talk would drop it`,
      }),
    );
    const talk = yield* talkObject(at, source);
    const section = yield* sectionObject(at, talk, id);
    const read = yield* sectionRead(at, section);
    const entry = `${keyText(name)}: ${word}`;
    const marked = Option.fromUndefinedOr(read.marks[name]);
    if (Option.contains(marked, word)) return source;
    if (Option.isSome(marked))
      return yield* refused<string>(
        at,
        `mark "${name}" is on word ${marked.value} of "${id}" already: name this one another way`,
      );
    const splice: Splice = yield* Option.match(read.marksNode, {
      onSome: ({ node }) =>
        Result.fromOption(
          Option.map(objectOf(node.value), (obj) =>
            Option.match(Arr.last(obj.properties), {
              onNone: (): Splice => ({ start: obj.start, end: obj.end, text: `{ ${entry} }` }),
              onSome: (last) => insertionAfter(source, last, entry),
            }),
          ),
          () =>
            SourceRefused.make({
              file: at.file,
              target: at.target,
              reason: 'its marks are not an object literal',
            }),
        ),
      onNone: () =>
        Result.fromOption(
          Option.map(
            Option.orElse(
              Option.map(read.cut, (c) => c.node),
              () =>
                Option.flatten(Result.getSuccess(propertyOf(at.file, at.target, section, 'to'))),
            ),
            (after) => insertionAfter(source, after, `marks: { ${entry} }`),
          ),
          () =>
            SourceRefused.make({
              file: at.file,
              target: at.target,
              reason: 'its section names no last word',
            }),
        ),
    });
    return yield* spliced(at.file, source, [splice]);
  });

/**
 * What of a strike write does not read back from `after`: the runs section
 * `id` strikes there, against those words `from`–`to` struck (or played
 * again) in `before` make.
 */
export const strikesMissed = (
  at: TalkTarget,
  after: string,
  before: string,
  id: string,
  words: Words,
  strike: boolean,
): Result.Result<ReadonlyArray<string>, SourceRefused> =>
  Result.gen(function* () {
    const { now: asked } = yield* strikesPlanned(at, before, id, words, strike);
    const read = yield* sectionRead(at, yield* sectionObject(at, yield* talkObject(at, after), id));
    const now = runsOf(struckIn(read.strikes));
    if (strikesText(now) === strikesText(asked)) return [];
    return [`${id} strikes ${strikesText(now)}, not ${strikesText(asked)}`];
  });

/**
 * What of a mark write does not read back from `after`, judged by the talk
 * decoded from it (`Talk`), not the literal: a key the decode drops is a
 * mark the talk does not have. A text that is no talk at all (a mark on a
 * word the section does not play) is the check's to refuse, in the talk's
 * own words (`talkCutIn`), so it misses nothing here.
 */
export const markMissed = (
  at: TalkTarget,
  after: string,
  id: string,
  name: string,
  word: number,
): Result.Result<ReadonlyArray<string>, SourceRefused> =>
  Result.gen(function* () {
    yield* sectionObject(at, yield* talkObject(at, after), id);
    return Result.match(talkIn(at, after), {
      onFailure: (): ReadonlyArray<string> => [],
      onSuccess: (talk) => {
        const marks = talk.sections.find((s) => s.id === id)?.marks ?? {};
        if (marks[name] === word) return [];
        return [`the talk read back has no mark ${name} on word ${word} of ${id}`];
      },
    });
  });

/** A talk as it plays: its edit, its takes and its cut. */
interface TalkPlayed {
  readonly talk: Talk;
  readonly takes: Readonly<Record<string, TalkTake>>;
  readonly cut: TalkCut;
}

/**
 * The talk `source` writes, cut on its takes as the footage library keeps
 * them now (the lock and the transcripts it names, read, never written):
 * refused, in the cut's own words, when it does not play (a section struck
 * silent, a mark on a word it does not play, a take not heard).
 */
export const talkCutIn = Effect.fn('talk.cutIn')(function* (at: TalkTarget, source: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const store = yield* ContentStore;
  const no = (reason: string) => SourceRefused.make({ file: at.file, target: at.target, reason });
  const talk = yield* Effect.fromResult(talkIn(at, source));
  const dir = yield* Effect.fromOption((yield* FilmFolder).footage).pipe(
    Effect.mapError(() => no('it plays footage, but the app keeps no footage library')),
  );
  const lock = yield* store
    .read(footageLockManifest(dir))
    .pipe(Effect.mapError((e) => no(`the footage library's lock does not read: ${e.message}`)));
  const transcripts = new Map(
    yield* Effect.forEach(talkTranscripts(talk, lock), (file) =>
      fs.readFileString(path.join(dir, 'transcripts', file)).pipe(
        Effect.flatMap(Schema.decodeEffect(FootageTranscriptJson)),
        Effect.map((words) => [file, words] as const),
        Effect.mapError((e) => no(`its transcript ${file} does not read: ${e.message}`)),
      ),
    ),
  );
  const takes = yield* Effect.fromResult(talkTakes(talk, lock, transcripts)).pipe(
    Effect.mapError((e) => no(e.message)),
  );
  const cut = yield* Effect.fromResult(talkCut(talk, takes)).pipe(
    Effect.mapError((e) => no(e.message)),
  );
  const played: TalkPlayed = { talk, takes, cut };
  return played;
});

/**
 * A talk's words as the Transcript view reads them: each section in play
 * order, every word from its first to its last (spelt as the captions spell
 * it), struck or played, a played word with when it is heard in the section.
 */
export const talkWords = (file: string, played: TalkPlayed): TalkWords => ({
  file,
  sections: played.cut.sections.flatMap((cut) =>
    Option.toArray(
      Option.map(
        Arr.findFirst(played.talk.sections, (s) => s.id === cut.id),
        (section) => {
          const take = played.takes[section.take];
          const fixes = played.talk.fixes?.[section.take] ?? {};
          const voiced = heard(cut.voice.words);
          const heardAt = new Map(cut.kept.map((index, k) => [index, voiced[k]] as const));
          return {
            id: section.id,
            take: section.take,
            words: Arr.makeBy(section.to - section.from + 1, (k) => section.from + k).map(
              (index): TalkWord => {
                const text = fixes[String(index)] ?? take?.words[index]?.text ?? '';
                return Option.match(Option.fromUndefinedOr(heardAt.get(index)), {
                  onNone: () => ({ index, text, struck: true }),
                  onSome: (at) => ({ index, text, struck: false, heard: [at.start, at.end] }),
                });
              },
            ),
            marks: section.marks ?? {},
          };
        },
      ),
    ),
  ),
});
