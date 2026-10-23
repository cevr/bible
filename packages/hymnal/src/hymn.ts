/**
 * A compiled hymn, as the app reads it: each stanza and the refrain (stored
 * once, with where it is sung; `sung` gives the lines in sung order) as lines
 * of sung syllables, a chord placed on the syllable where the harmony
 * changes, at two levels (`full`, the four parts' harmony, and `guitar`).
 * Chords are degrees above the hymn's key, so transposing changes the key
 * alone.
 *
 * Each part says how far to trust its placement: `Sung` at `syllable` (a
 * chord over each syllable), `Sung` at `line` (the chords of each line,
 * their syllables less sure), or `Plain` (the words alone, no chords). A
 * `Plain` part carries no syllables and no chords.
 *
 * The topics (`Topics`) are the hymnal's sections as its pages print them at
 * the foot, each a range of hymn numbers; `topicOf` gives a hymn's.
 *
 * This module imports only `effect` and `./chord.js`, so React Native reads
 * it without Bun, Node or the pronouncing dictionary.
 */

import { Option, Schema } from 'effect';

import * as Chord from './chord.js';

const Count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const Beats = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0));

/** The levels a part is shown at, from the surest: chords on syllables, chords per line, words alone. */
export const Level = Schema.Literals(['syllable', 'line', 'text']);
export type Level = typeof Level.Type;

/**
 * Why a part is shown below `syllable`, or what it was laid on: `held` (the
 * hymn is held back), `notes` (the tune's notes and the words' syllables
 * disagree in number), `shared` (a syllable shares a note across words),
 * `cost` (the placement is unlikely), `melismas` (many notes per syllable),
 * `inexact` (the verses were split by ear, not by an exact repeat), `reused`
 * (the file plays fewer verses than the text has; laid on its last).
 */
export const Reason = Schema.Literals([
  'held',
  'notes',
  'shared',
  'cost',
  'melismas',
  'inexact',
  'reused',
]);
export type Reason = typeof Reason.Type;

/** A chord and when it comes: quarter-note beats after its syllable starts. */
const Placed = Schema.Struct({ chord: Chord.Chord, at: Beats });

const Syllable = Schema.Struct({
  /** As printed under the note, punctuation kept: "Al", "might", "y,". */
  text: Schema.String,
  /** The word's place in its line; a word's syllables share it. */
  word: Count,
  /** Melody notes sung on it: 0 shares the note before, 2 or more a melisma. */
  notes: Count,
  /** Quarter-note beats from its first note's start to its last note's end. */
  beats: Beats,
  full: Schema.optionalKey(Schema.NonEmptyArray(Placed)),
  guitar: Schema.optionalKey(Schema.NonEmptyArray(Placed)),
});
export type Syllable = typeof Syllable.Type;

/** How the words fit the tune: notes, syllables, notes held over, syllables sharing a note, and the cost. */
const Fit = Schema.Struct({
  notes: Schema.Int,
  syllables: Schema.Int,
  melismas: Schema.Int,
  shared: Schema.Struct({ inWord: Schema.Int, acrossWords: Schema.Int }),
  cost: Schema.Finite,
});
export type Fit = typeof Fit.Type;

const Sung = Schema.TaggedStruct('Sung', {
  level: Schema.Literals(['syllable', 'line']),
  lines: Schema.NonEmptyArray(Schema.NonEmptyArray(Syllable)),
  fit: Fit,
  why: Schema.Array(Reason),
});
export type Sung = typeof Sung.Type;

/** The words alone: a `full` or `guitar` key beside them is refused, never dropped. */
const Plain = Schema.TaggedStruct('Plain', {
  lines: Schema.NonEmptyArray(Schema.String),
  fit: Schema.optionalKey(Fit),
  why: Schema.NonEmptyArray(Reason),
  full: Schema.optionalKey(Schema.Never),
  guitar: Schema.optionalKey(Schema.Never),
});
export type Plain = typeof Plain.Type;

const Part = Schema.Union([Sung, Plain]);
export type Part = typeof Part.Type;

/**
 * Where the hymnal sings the refrain, as its page prints it: `after-each`
 * stanza (its usual print, 1 R 2 R 3 R); `first-and-after-each`, printed
 * above stanza 1 and returned to (D.C. al Fine), so sung first and then after
 * every stanza (R 1 R 2 R 3 R); `before-each`, printed above the stanzas with
 * no return, so sung before each stanza (R 1 R 2 R 3, 349); `first-and-last`,
 * sung before stanza 1 and after the last stanza only (R 1 2 3 4 R, 172's
 * Alleluias); `after-last`, the stanzas under one repeat and the refrain
 * printed once after them (1 2 R, 262).
 */
export const Order = Schema.Literals([
  'after-each',
  'first-and-after-each',
  'before-each',
  'first-and-last',
  'after-last',
]);
export type Order = typeof Order.Type;

/** The refrain, stored once, and where it is sung. */
const Refrain = Schema.Struct({ order: Order, part: Part });

/** Every time in `Timing` is a whole count of this part of a quarter beat. */
export const PER_BEAT = 96;

const Time = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

/**
 * One sung line's times: `start` and `until` (the next sung line's start, or
 * the timeline's end), and each syllable's start (none for a `Plain` line).
 * `played` is false for a line the file does not play (a stanza past its
 * verses, laid after its end; a refrain sung first, laid in the intro);
 * `even` is true when its times are even shares, not its notes'.
 */
const LineTime = Schema.Struct({
  start: Time,
  until: Time,
  syllables: Schema.Array(Time),
  played: Schema.Boolean,
  even: Schema.Boolean,
});
export type LineTime = typeof LineTime.Type;

/**
 * When each sung line and syllable comes, read from the file the
 * recordings are rendered from: its tempo map (from each beat on, a quarter
 * lasts so many microseconds), the first played sung note (`intro`), the
 * file's end, and one entry per line of `sung(hymn)`, in that order. Times
 * are in 1/`PER_BEAT` quarter beats; `secondsAt` (`timing.ts`) turns them
 * into seconds.
 */
export const Timing = Schema.Struct({
  perBeat: Schema.Literal(PER_BEAT),
  tempos: Schema.Array(Schema.Tuple([Time, Schema.Int.check(Schema.isGreaterThan(0))])),
  intro: Time,
  end: Time,
  lines: Schema.Array(LineTime),
});
export type Timing = typeof Timing.Type;

export const Hymn = Schema.Struct({
  version: Schema.Literal(1),
  book: Schema.Literals(['sdah-1985']),
  number: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  title: Schema.String,
  key: Chord.Key,
  /** The time signature the tune opens in. */
  meter: Schema.Struct({ numerator: Schema.Int, denominator: Schema.Int }),
  /** Stanzas in the text, verses the file plays, and whether those were split by an exact repeat. */
  verses: Schema.Struct({ text: Schema.Int, midi: Schema.Int, exact: Schema.Boolean }),
  /** In order: stanza n is `stanzas[n - 1]`. */
  stanzas: Schema.NonEmptyArray(Part),
  refrain: Schema.optionalKey(Refrain),
  timing: Schema.optionalKey(Timing),
});
export type Hymn = typeof Hymn.Type;

/** One line as it is sung. */
interface Line {
  /** Stanza n (from 1), or the refrain. */
  readonly verse: number | 'refrain';
  /** The part it belongs to, and its place there: `part.lines[line]`. */
  readonly part: Part;
  readonly line: number;
  /** Its words: a sung line's syllables joined within a word and spaced between words; a plain line as printed. */
  readonly text: string;
}

const linesOf = (part: Part, verse: Line['verse']): Line[] =>
  part._tag === 'Plain'
    ? part.lines.map((text, line) => ({ verse, part, line, text }))
    : part.lines.map((syllables, line) => ({
        verse,
        part,
        line,
        text: syllables
          .map((s, k) => `${k === 0 ? '' : syllables[k - 1]?.word === s.word ? '' : ' '}${s.text}`)
          .join(''),
      }));

/**
 * The hymn's lines in the order they are sung: each stanza, and the refrain
 * where its order places it (after each stanza; first and after each
 * stanza; before each stanza; first and after the last stanza; or after the
 * last stanza alone).
 */
export const sung = (hymn: Hymn): Line[] => {
  const stanzas = hymn.stanzas.map((part, n) => linesOf(part, n + 1));
  const all = stanzas.flat();
  const refrain = hymn.refrain;
  if (refrain === undefined) return all;
  const chorus = linesOf(refrain.part, 'refrain');
  const each = stanzas.flatMap((lines) => [...lines, ...chorus]);
  switch (refrain.order) {
    case 'after-each':
      return each;
    case 'first-and-after-each':
      return [...chorus, ...each];
    case 'before-each':
      return stanzas.flatMap((lines) => [...chorus, ...lines]);
    case 'first-and-last':
      return [...chorus, ...all, ...chorus];
    case 'after-last':
      return [...all, ...chorus];
  }
};

export const Index = Schema.Struct({
  version: Schema.Literal(1),
  book: Schema.Literals(['sdah-1985']),
  /** Each hymn by number, with its lowest part's level. */
  hymns: Schema.Array(Schema.Struct({ number: Schema.Int, title: Schema.String, level: Level })),
});
export type Index = typeof Index.Type;

/** The last hymn the compiled set carries: the readings after it are not compiled. */
const LAST_HYMN = 695;

/** A section of the hymnal, as its pages print it at the foot: its id in hymnal.db, its name and its hymns. */
export const Topic = Schema.Struct({
  id: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  name: Schema.String.check(Schema.isNonEmpty(), Schema.isTrimmed()),
  first: Schema.Int,
  last: Schema.Int,
});
export type Topic = typeof Topic.Type;

/** Why a table is not a partition of 1–695: the first fault found, by topic index. */
const partitionFault = (topics: readonly Topic[]): string | undefined => {
  if (topics.length === 0) return 'no topics';
  const ids = new Set<number>();
  for (const [i, topic] of topics.entries()) {
    if (ids.has(topic.id)) return `topic ${i}: id ${topic.id} repeats`;
    ids.add(topic.id);
    if (topic.first > topic.last)
      return `topic ${i}: first ${topic.first} after last ${topic.last}`;
    const start = i === 0 ? 1 : (topics[i - 1]?.last ?? 0) + 1;
    if (topic.first !== start) return `topic ${i}: starts at ${topic.first}, not ${start}`;
  }
  const end = topics[topics.length - 1]?.last;
  return end === LAST_HYMN ? undefined : `the last topic ends at ${end}, not ${LAST_HYMN}`;
};

/**
 * The topics of the compiled hymnal, ordered by `first`: a partition of
 * 1–695, so every hymn has exactly one. A table with a gap, an overlap, a
 * range out of order or reversed, an end other than 1 and 695, or an id
 * twice is refused.
 */
export const Topics = Schema.Struct({
  version: Schema.Literal(1),
  book: Schema.Literals(['sdah-1985']),
  topics: Schema.Array(Topic),
}).check(
  Schema.makeFilter((table) => partitionFault(table.topics) ?? true, {
    expected: 'topics that partition hymns 1-695 in order',
  }),
);
export type Topics = typeof Topics.Type;

/** The topic whose range holds hymn `number`; none for a number in no range. */
export const topicOf = (topics: Topics, number: number): Option.Option<Topic> =>
  Option.fromUndefinedOr(
    topics.topics.find(
      (topic) => topic.first <= number && number <= topic.last && Number.isInteger(number),
    ),
  );
