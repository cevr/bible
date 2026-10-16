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
// comments stay, each by the key it is about. Whose a comment is, is one
// rule, the formatter's own (`unitsOf`): oxfmt breaks a line or joins one
// and never moves a comment off its owner. So an object is read as units,
// a key's unit its comments above it, the key, its comma and the comments
// after it on its line, and a write moves keys as units: a key taken away
// goes whole, with the comments that are its own (a Restore that empties a
// cut takes the comment about the cut), and a key added goes between two
// units, never inside one (over lines, on a line of its own; on one line,
// after the unit before it). Marks that hold only a comment keep it as their
// own: a mark added goes above it, the marks set over lines when they were
// on one. A cut whose runs hold a comment is not rewritten (the comment would
// stand by no run): that write is refused, and one that empties the cut takes
// it whole. The lab checks each write by the same rule (`commentsMoved`): a
// comment that would leave its owner refuses the write. So a Restore undoes
// a Cut to the byte, in a section written over lines as on one.
//
// One break is the formatter's, not the author's: oxfmt prints a cut of two
// runs or more a run to a line, and its section broken with it, and keeps
// an object broken once while a break follows its `{`; the Restore that
// leaves such a cut one run or none lets go of that one break when no
// comment stands there (`braceBreak`), and the formatter lays the section
// out again: on one line when it fits and nothing in it is over lines. So a
// section its author broke at its brace alone comes back on one line, a
// one-line section a Cut's single run pushes past the print width stays
// broken, and a cut the author wrote elsewhere than after `to`, with its own
// comments, comes back after `to` without them: in each, the two texts
// format the same, and only Undo gives back the author's.

import {
  Array as Arr,
  Effect,
  FileSystem,
  Option,
  Order,
  Path,
  Predicate,
  Record as Rec,
  Result,
  Schema,
} from 'effect';
import {
  parseSync,
  type Expression,
  type ObjectExpression,
  type ObjectProperty,
  type ObjectPropertyKind,
} from 'oxc-parser';
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
 * `satisfies`. None for anything computed. A `__proto__` key is no key, as
 * an import of the module reads it: it sets the object's prototype.
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
      return Option.map(Option.all(entries), (all) =>
        Object.fromEntries(all.filter(([k]) => k !== '__proto__')),
      );
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

/** The indent of the line holding offset `at` of `source`. */
const indentAt = (source: string, at: number) =>
  /^[ \t]*/.exec(source.slice(lineStart(source, at)))?.[0] ?? '';

/** A stretch of a text: `start` up to `end`. */
interface Span {
  readonly start: number;
  readonly end: number;
}

/**
 * The text between two neighbours in an object literal (its `{`, a key, its
 * `}`): only space, a comma and comments stand there. Where its comma is,
 * where its first line break ends (one inside a comment does not count), and
 * its comments.
 */
interface Gap extends Span {
  readonly comma: Option.Option<number>;
  readonly broke: Option.Option<number>;
  readonly comments: ReadonlyArray<Span>;
}

/** The gap `start`–`end` of `source`, read. */
const gapOf = (source: string, start: number, end: number): Gap => {
  const comments: Array<Span> = [];
  const found = { comma: Option.none<number>(), broke: Option.none<number>() };
  const at = { i: start };
  while (at.i < end) {
    const i = at.i;
    if (source.startsWith('//', i)) {
      const eol = source.indexOf('\n', i);
      at.i = end;
      if (eol >= 0 && eol < end) at.i = eol;
      comments.push({ start: i, end: at.i });
    } else if (source.startsWith('/*', i)) {
      at.i = Math.min(end, source.indexOf('*/', i + 2) + 2);
      comments.push({ start: i, end: at.i });
    } else {
      if (source[i] === ',' && Option.isNone(found.comma)) found.comma = Option.some(i);
      if (source[i] === '\n' && Option.isNone(found.broke)) found.broke = Option.some(i + 1);
      at.i = i + 1;
    }
  }
  return { start, end, comments, ...found };
};

/**
 * An object literal as units, by the one rule of whose a comment is. Each
 * key's unit holds the comments above it, the key and its value, its comma
 * and the comments after it on its line; `parts[i]` is where key `i`'s unit
 * starts and `parts[i + 1]` where it ends, so the units tile the object:
 * - in a gap that breaks the line, what stands before the break is the key's
 *   before it, and what stands after, the key's after it (the lines above
 *   it), or the object's own when no key follows (before its `}`);
 * - in a gap on one line between two keys, what stands before the comma is
 *   the key's before it (`to: 5 /* the end *\/,`), and after it, the key's
 *   after it (`, /* why *\/ cut`); after the last key, all of it is the last
 *   key's;
 * - before the first key, all of it is the first key's, and in an object
 *   with no key, the object's own.
 * It is the formatter's own attachment of a comment to its neighbour: oxfmt
 * breaks a line or joins one and never moves a comment off its owner.
 */
interface Units {
  readonly gaps: ReadonlyArray<Gap>;
  readonly parts: ReadonlyArray<number>;
}

const unitsOf = (source: string, obj: ObjectExpression): Units => {
  const keys = obj.properties;
  const gaps = Arr.makeBy(keys.length + 1, (i) =>
    gapOf(source, keys[i - 1]?.end ?? obj.start + 1, keys[i]?.start ?? obj.end - 1),
  );
  const parts = gaps.map((gap, i) => {
    if (i === 0) return gap.start;
    if (i < keys.length)
      return Option.getOrElse(
        Option.orElse(gap.broke, () => gap.comma),
        () => gap.end,
      );
    return Option.getOrElse(gap.broke, () =>
      Arr.last(gap.comments).pipe(
        Option.map((c) => c.end),
        Option.getOrElse(() => gap.start),
      ),
    );
  });
  return { gaps, parts };
};

/** The gaps either side of key `p` of `obj`, and where its unit starts and ends. */
const unitAround = (source: string, obj: ObjectExpression, p: ObjectPropertyKind) => {
  const { gaps, parts } = unitsOf(source, obj);
  const i = obj.properties.indexOf(p);
  const at = (k: number) => Option.getOrThrow(Arr.get(parts, k));
  return {
    first: i === 0,
    before: Option.getOrThrow(Arr.get(gaps, i)),
    after: Option.getOrThrow(Arr.get(gaps, i + 1)),
    start: at(i),
    end: at(i + 1),
  };
};

/** A comment of a talk's literal: its text (its spaces as one), and the path of what it is about. */
interface Owned {
  readonly text: string;
  readonly owner: string;
}

/**
 * Whose comment `c` is, inside `obj` (at `path`) by the units' rule: a key
 * (`sections[0].to`), or the object itself (`sections[0].marks{}`); inside a
 * key's value, that value's own when it is an object (or an object in an
 * array), else the key's.
 */
const ownerIn = (source: string, obj: ObjectExpression, path: string, c: Span): string => {
  const { parts } = unitsOf(source, obj);
  const within = (n: Span) => n.start < c.start && c.end <= n.end;
  const owning = Arr.findFirst(
    obj.properties,
    (_, k) => (parts[k] ?? 0) <= c.start && c.start < (parts[k + 1] ?? 0),
  );
  return Option.match(
    Option.filter(owning, (p): p is ObjectProperty => p.type === 'Property'),
    {
      onNone: () => `${path}{}`,
      onSome: (p) => {
        const key = keyPath(path, p);
        const inner = Option.orElse(
          Option.map(Option.filter(objectOf(p.value), within), (o) => [key, o] as const),
          () =>
            Option.map(
              Arr.findFirst(arrayObjects(p.value), ([, o]) => within(o)),
              ([k, o]) => [`${key}[${k}]`, o] as const,
            ),
        );
        return Option.match(inner, {
          onNone: () => key,
          onSome: ([at, o]) => ownerIn(source, o, at, c),
        });
      },
    },
  );
};

/** Key `p`'s path, inside the object at `path`: `sections[0].to`. */
const keyPath = (path: string, p: ObjectProperty) => {
  const name = Option.getOrElse(keyName(p), () => '[computed]');
  if (path === '') return name;
  return `${path}.${name}`;
};

/** The object literals an array literal `e` holds, each by its index; none when `e` is no array. */
const arrayObjects = (e: Expression): ReadonlyArray<readonly [number, ObjectExpression]> => {
  if (e.type !== 'ArrayExpression') return [];
  return e.elements.flatMap((el, k) => {
    if (!Predicate.isNotNullish(el) || el.type === 'SpreadElement') return [];
    return Option.toArray(Option.map(objectOf(el), (o) => [k, o] as const));
  });
};

/** Every path that names an owner in `obj` (at `path`): its keys and its objects, nested ones too. */
const ownersIn = (obj: ObjectExpression, path: string): ReadonlyArray<string> => [
  `${path}{}`,
  ...obj.properties.flatMap((p) => {
    if (p.type === 'SpreadElement') return [];
    const key = keyPath(path, p);
    const nested = Option.match(objectOf(p.value), {
      onSome: (o) => ownersIn(o, key),
      onNone: () => arrayObjects(p.value).flatMap(([k, o]) => ownersIn(o, `${key}[${k}]`)),
    });
    return [key, ...nested];
  }),
];

/** The comments of `source`'s talk literal, each by its owner, and every owner there is. */
const ownedIn = (at: TalkTarget, source: string) =>
  Result.map(talkObject(at, source), (talk) => ({
    comments: parseSync(at.file, source, { lang: 'ts', sourceType: 'module' })
      .comments.filter((c) => talk.start < c.start && c.end <= talk.end)
      .map((c): Owned => ({
        text: source.slice(c.start, c.end).replace(/\s+/g, ' '),
        owner: ownerIn(source, talk, '', c),
      })),
    owners: new Set(ownersIn(talk, '')),
  }));

/**
 * What of `before`'s comments is not by its owner in `after`, a write's
 * formatted text: each comment whose owner is still there must stand by it,
 * no other, and one whose owner went must have gone with it. So a write that
 * would move an author's comment onto a key it is not about is refused,
 * whatever layout the file is in.
 */
export const commentsMoved = (
  at: TalkTarget,
  after: string,
  before: string,
): Result.Result<ReadonlyArray<string>, SourceRefused> =>
  Result.gen(function* () {
    const was = yield* ownedIn(at, before);
    const now = yield* ownedIn(at, after);
    const left = [...now.comments];
    /** The first comment left in `after` that `found` takes, taken. */
    const take = (found: (n: Owned) => boolean) =>
      Option.map(
        Option.liftPredicate(
          left.findIndex((n) => found(n)),
          (k) => k >= 0,
        ),
        (k) => left.splice(k, 1)[0]?.owner ?? '',
      );
    const missed = was.comments.flatMap((c) => {
      if (Option.isSome(take((n) => n.text === c.text && n.owner === c.owner))) return [];
      const elsewhere = take((n) => n.text === c.text);
      if (!now.owners.has(c.owner))
        return Option.match(elsewhere, {
          onNone: () => [],
          onSome: (by) => [`the comment ${c.text} stays, by ${by}, though ${c.owner} is gone`],
        });
      return Option.match(elsewhere, {
        onNone: () => [`the comment ${c.text} on ${c.owner} is lost`],
        onSome: (by) => [`the comment ${c.text} moves from ${c.owner} to ${by}`],
      });
    });
    return [...missed, ...left.map((n) => `a comment ${n.text} appears on ${n.owner}`)];
  });

/** How far the space and tabs from `at` of `source` reach. */
const pastSpace = (source: string, at: number) =>
  at + (/^[ \t]*/.exec(source.slice(at))?.[0].length ?? 0);

/**
 * The splice that takes key `p` out of `obj` as its whole unit: the comments
 * that are its own go with it, every other comment stays by its own key.
 * Over lines, its lines; on one line, its comma before it (the first key's,
 * its comma after it).
 */
const removal = (source: string, obj: ObjectExpression, p: ObjectProperty): Splice => {
  const unit = unitAround(source, obj, p);
  // Over lines from the break before it; on one line from its comma before it (the first key from its own text).
  const start = Option.getOrElse(unit.before.broke, () => {
    if (unit.first) return pastSpace(source, unit.start);
    return unit.start;
  });
  // A unit with no comma of its own before it takes the one after it, which the next key's would be.
  if (source[start] !== ',' && source[unit.end] === ',')
    return { start, end: pastSpace(source, unit.end + 1), text: '' };
  return { start, end: unit.end, text: '' };
};

/**
 * The splice that adds `text` (a `key: value`) to `obj` as a unit of its own,
 * right after key `after`'s unit and never inside a unit, so each comment
 * stays by its key. Over lines, on a line of its own, indented as `after`'s
 * (and `after` given a comma when it has none); on one line, after `after`'s
 * hugging comments.
 */
const insertionAfter = (
  source: string,
  obj: ObjectExpression,
  after: ObjectPropertyKind,
  text: string,
): ReadonlyArray<Splice> => {
  const unit = unitAround(source, obj, after);
  return Option.match(unit.after.broke, {
    onNone: () => [{ start: unit.end, end: unit.end, text: `, ${text}` }],
    onSome: (line) => {
      const own = {
        start: unit.end,
        end: unit.end,
        text: `${indentAt(source, after.start)}${text},\n`,
      };
      // `after` keeps the comma it has on its line, or is given one.
      if (Option.exists(unit.after.comma, (c) => c < line)) return [own];
      return [{ start: after.end, end: after.end, text: ',' }, own];
    },
  });
};

/**
 * The splice that adds `text` (a `key: value`) to `obj`, an object with no
 * key, whose comments are its own and stay so: none follow a key. In place
 * of it when nothing is in it (`{ text }`). Over lines, on a line of its own
 * after the `{`'s, the comments below it. On one line, the object goes over
 * lines so: no comment on one line follows a key and is not that key's.
 */
const insertionInto = (source: string, obj: ObjectExpression, text: string): Splice => {
  const inner = gapOf(source, obj.start + 1, obj.end - 1);
  const indent = indentAt(source, obj.start);
  if (inner.comments.length === 0) return { start: obj.start, end: obj.end, text: `{ ${text} }` };
  return Option.match(inner.broke, {
    onSome: (line): Splice => ({ start: line, end: line, text: `${indent}  ${text},\n` }),
    onNone: (): Splice => ({
      start: obj.start,
      end: obj.end,
      text: `{\n${indent}  ${text},\n${indent}  ${source.slice(inner.start, inner.end).trim()}\n${indent}}`,
    }),
  });
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
    const strikes: ReadonlyArray<Splice> = yield* Option.match(read.cut, {
      onNone: () => {
        if (now.length === 0) return Result.succeed([]);
        return Result.succeed(
          Option.getOrElse(
            Option.map(
              Option.flatten(Result.getSuccess(propertyOf(at.file, at.target, section, 'to'))),
              (to) => insertionAfter(source, section, to, `cut: ${strikesText(now)}`),
            ),
            () => [],
          ),
        );
      },
      onSome: ({ node }) => {
        if (now.length === 0) return Result.succeed([removal(source, section, node)]);
        const runs = source.slice(node.value.start, node.value.end);
        if (strikesText(now) !== runs && /\/[/*]/.test(runs))
          return refused<ReadonlyArray<Splice>>(
            at,
            `its cut holds a comment among its runs, which a rewrite of them would leave standing by no run: write this one by hand, or put the comment on the cut's own line`,
          );
        return Result.succeed([
          { start: node.value.start, end: node.value.end, text: strikesText(now) },
        ]);
      },
    });
    if (strikes.length === 0) return source;
    // Two runs or more broke the section over lines (oxfmt): one or none lets it back on one.
    const unforced = runsOf(struckIn(read.strikes)).length > 1 && now.length < 2;
    const loosed = Option.filter(
      Option.filter(braceBreak(source, section), () => unforced),
      (brace) => strikes.every((s) => s.start >= brace.end),
    );
    return yield* spliced(at.file, source, [...strikes, ...Option.toArray(loosed)]);
  });

/**
 * The break after `section`'s `{` let go (`{ id: …`), when its first key
 * stands on the next line. oxfmt keeps an object broken once while that
 * break is there, and a cut of two runs or more broke the section it was in;
 * let go by the write that leaves the cut one run or none, the formatter
 * lays the section out again: back on one line when it fits and nothing in
 * it is over lines (a line comment, an object an author broke), as a Restore
 * gives back the line its Cut broke. Only that break goes, so whatever else
 * is over lines stays: a section an author broke at its brace alone comes
 * back on one line (only Undo gives back its lines).
 */
const braceBreak = (source: string, section: ObjectExpression): Option.Option<Splice> =>
  Option.flatMap(Arr.head(unitsOf(source, section).gaps), (gap) =>
    Option.map(
      // Only a bare break: a comment there is the first key's, and stays on its line.
      Option.filter(gap.broke, () => gap.comments.length === 0 && gap.end > gap.start),
      (): Splice => ({ start: gap.start, end: gap.end, text: ' ' }),
    ),
  );

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
    const marked = Rec.get(read.marks, name);
    if (Option.contains(marked, word)) return source;
    if (Option.isSome(marked))
      return yield* refused<string>(
        at,
        `mark "${name}" is on word ${marked.value} of "${id}" already: name this one another way`,
      );
    const splices: ReadonlyArray<Splice> = yield* Option.match(read.marksNode, {
      onSome: ({ node }) =>
        Result.fromOption(
          Option.map(objectOf(node.value), (obj) =>
            Option.match(Arr.last(obj.properties), {
              onNone: () => [insertionInto(source, obj, entry)],
              onSome: (last) => insertionAfter(source, obj, last, entry),
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
            (after) => insertionAfter(source, section, after, `marks: { ${entry} }`),
          ),
          () =>
            SourceRefused.make({
              file: at.file,
              target: at.target,
              reason: 'its section names no last word',
            }),
        ),
    });
    return yield* spliced(at.file, source, splices);
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
        const marked = Option.flatMap(Schema.decodeOption(MarkName)(name), (mark) =>
          Rec.get(marks, mark),
        );
        if (Option.contains(marked, word)) return [];
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
