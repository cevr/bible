/**
 * The census of the hymn rows: every hymn 1-695 held against its printed
 * page, one entry each in `data/census.json`.
 *
 *   bun run census                         # the census against its committed inputs and the base commit
 *   bun run census --readings <dir>        # and every blind reading's runs against the rulings
 *   bun run census --scans <dir>           # and the inventory's scan pages against the fetched scans
 *   bun run census --witness <csycms>      # the rows against the witness transcription
 *
 * A word of a row changes only on a viewed crop, and the census reads only
 * what its builder does not write:
 *
 * - **The page inventory** (`data/pages.json`): every page image of the 1985
 *   book that shows each hymn, read off the pages. The owner's photos
 *   (`data/photos/sdah-1985/`), the hymnary.org scan of the 1985 book (its
 *   shown pages and the pages it withholds) and the SDAHImages engravings
 *   at the pinned commit. A hymn's deciding page is its highest: its photo;
 *   else its scan, when hymnary.org shows every scan page of it; else its
 *   engraving, unless the engraving's credit dates a words revision after
 *   1985 (`revised`): a 1985 book cannot print that text. A photo that shows
 *   only part of a hymn (`partial`) is read and rules the places it shows.
 *   `inventoryProblems` holds the inventory to itself.
 * - **The rulings** (`data/crops/NNN/rulings.json`): for each place where a
 *   reading of the deciding page differs from the base row, the words a
 *   judge (a fresh model that never saw the reading that found the place)
 *   saw printed on the crops it names (`data/crops/NNN/*.jpg`, cut at 1:1),
 *   crop by crop, and what the row writes there.
 * - **The base row**: the row the hymn had before this census changed it,
 *   read from git: `data/census.json`'s `base.commit`'s hymnal.db. A run
 *   that cannot read that commit fails.
 * - **The readings** (`--readings`, not committed: they hold the hymns'
 *   texts): each blind transcription of a deciding page, never shown the
 *   row. A model reader's (`by: "reader"`), or the page's machine OCR
 *   (`by: "ocr"`, Apple Vision, rows matched to the base row's parts only to
 *   order them). A reader that would not transcribe a page reads nothing.
 *
 * Every hymn is sung as units: each stanza (hymnal.db's ids 0 and up) with
 * the refrain (its negative id) after it, so a refrain written once or
 * inline, or varying by stanza, reads alike. A reading's run is a maximal run
 * of words where it differs from the base row in one unit (letters only;
 * `heart ache` against `heartache` is no run). Each run must be covered by a
 * ruling at its place. Applying every ruling's words to the base row gives
 * what the row must be. An entry is:
 *
 * - `matches`: no ruling changes a word; the row is the base row.
 * - `fixed`: rulings on crops of a photo or a scan change words; the row is
 *   the base row with every ruling applied, written from
 *   `data/fixes/NNN.json`.
 * - `unsettled`: a ruling could not read its crops, or a ruling that changes
 *   words rests on an engraving's crop (SDAHImages, a later re-engraving,
 *   never fixes a row); the row stays the base row and the hymn waits on
 *   the owner's photo.
 * - `nopage`: no blind reading of the deciding page could be made, or the
 *   hymn has no deciding page (`note` says why); the row stays the base row
 *   and the hymn waits on the owner's photo.
 *
 * The plain run trusts each entry's reading counts (only `--readings` holds
 * them to the readings) and reads everything else itself. It prints
 * `problem <what>` for each disagreement, the `unsettled` and `nopage`
 * entries, and ends with
 * `census hymns=<n> entries=<n> problems=<p> matches=<m> fixed=<f> unsettled=<u> nopage=<o> rulings=<r>`.
 * Each run exits 1 on a problem.
 */

import { HymnalService, HymnId } from '@bible/core/hymnal';
import { layerHymnalBun } from '@bible/core/hymnal/bun';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Database } from 'bun:sqlite';
import {
  ConfigProvider,
  Effect,
  FileSystem,
  Layer,
  Option,
  Predicate,
  Schema,
  Struct,
} from 'effect';
import { createHash } from 'node:crypto';
import path from 'node:path';

import { Order } from '../src/hymn.js';
import { counts } from '../src/syllables.js';
import { decodeOrders } from './sources.js';

const DATA = path.resolve(import.meta.dir, '../data');
export const FIRST = 1;
export const LAST = 695;

/**
 * The fix files origin/main held before this census (read off SDAHImages by
 * an earlier unit): their rows are the base rows, so they carry no
 * `replaces`. Every other fix file is the census's own and carries the base
 * row it replaces.
 */
export const PRIOR_FIXES: ReadonlySet<number> = new Set([138, 203, 220, 438, 593, 620, 628]);

const pad = (n: number) => String(n).padStart(3, '0');

// ----------------------------------------------------------------------------
// Words, units and runs
// ----------------------------------------------------------------------------

/** A text's words as compared: lower case, apostrophes dropped, split on all but letters and digits. */
export const wordsOf = (text: string) =>
  text
    .toLowerCase()
    .replace(/['’`ʼ]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== '');

/**
 * The words a ruling's crops print, crop after crop. A word the page breaks
 * over a line end (`re-` on one system, `member` on the next) is one word:
 * a crop's words that end in a hyphen join the next crop's first word.
 */
export const printedOf = (crops: ReadonlyArray<{ readonly shows: string }>) =>
  crops
    .map((one) => one.shows.trim())
    .filter((shows) => shows !== '')
    .join(' ')
    .replace(/-\s+/g, '');

const same = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((word, i) => word === b[i]);

/** hymnal.db's verses: an id (0 and up a stanza, negative the refrain) and its text. */
export type Verses = ReadonlyArray<{ readonly id: number; readonly text: string }>;

/** The lines of each unit a row sings: each stanza by id, the refrain's lines after it. */
export const unitLinesOf = (verses: Verses): string[][] => {
  const lines = (text: string) =>
    text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '');
  const refrain = verses.filter((verse) => verse.id < 0).flatMap((verse) => lines(verse.text));
  return verses
    .filter((verse) => verse.id >= 0)
    .toSorted((a, b) => a.id - b.id)
    .map((verse) => [...lines(verse.text), ...refrain]);
};

/** The words of each unit a row sings. */
export const unitsOf = (verses: Verses): string[][] =>
  unitLinesOf(verses).map((lines) => wordsOf(lines.join('\n')));

/** A short digest of a row's sung words, unit by unit. */
export const baseDigestOf = (units: ReadonlyArray<readonly string[]>) =>
  createHash('sha256').update(JSON.stringify(units)).digest('hex').slice(0, 16);

/** A blind transcription of one hymn's page, as the reader's brief asks for it. */
export interface Reading {
  readonly number: number;
  readonly images: readonly string[];
  readonly stanzas: readonly string[];
  readonly refrain?: string | null | undefined;
  readonly refrainRows?: readonly string[] | null | undefined;
  readonly odd?: string | null | undefined;
  /** Who transcribed it: a model reader shown the page alone (the default), or the page's machine OCR. */
  readonly by?: 'reader' | 'ocr' | undefined;
}

/**
 * The words of each unit a reading sings: stanza i with the refrain after
 * it. Where the reader wrote the refrain's varying rows (`refrainRows`, the
 * first row also inside `refrain`), stanza i sings the refrain with its own
 * row in place of the first.
 */
export const readingUnitsOf = (reading: Reading): string[][] => {
  const refrain = wordsOf(reading.refrain ?? '');
  const rows = (reading.refrainRows ?? []).map(wordsOf);
  const first = rows[0] ?? [];
  const at = first.length === 0 ? -1 : indexOfRun(refrain, first);
  return reading.stanzas.map((stanza, i) => {
    const own = rows[i];
    const sung =
      own === undefined
        ? refrain
        : at >= 0
          ? [...refrain.slice(0, at), ...own, ...refrain.slice(at + first.length)]
          : [...refrain, ...own];
    return [...wordsOf(stanza), ...sung];
  });
};

const indexOfRun = (words: readonly string[], run: readonly string[]) => {
  for (let i = 0; i + run.length <= words.length; i++)
    if (run.every((word, k) => words[i + k] === word)) return i;
  return -1;
};

/** The LCS lengths of every suffix pair, read through `at` (0 past either end). */
const lcsTable = (a: readonly string[], b: readonly string[]) => {
  const rows = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  const at = (i: number, j: number) => rows[i]?.[j] ?? 0;
  for (let i = a.length - 1; i >= 0; i--) {
    const row = rows[i] ?? [];
    for (let j = b.length - 1; j >= 0; j--)
      row[j] = a[i] === b[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
  }
  return at;
};

/** The maximal runs where a word-level LCS diff of `a` and `b` does not match, each at its index in `a`. */
const diffRuns = (a: readonly string[], b: readonly string[]) => {
  const at = lcsTable(a, b);
  const runs: Array<{ at: number; row: string[]; page: string[] }> = [];
  let open: { at: number; row: string[]; page: string[] } | undefined;
  let [i, j] = [0, 0];
  const take = (side: 'row' | 'page', word: string) => {
    open ??= { at: i, row: [], page: [] };
    open[side].push(word);
  };
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      if (open !== undefined) runs.push(open);
      open = undefined;
      i++;
      j++;
    } else if (j >= b.length || (i < a.length && at(i + 1, j) >= at(i, j + 1))) {
      take('row', a[i] ?? '');
      i++;
    } else take('page', b[j++] ?? '');
  }
  if (open !== undefined) runs.push(open);
  return runs;
};

/** One run: in unit `unit` (1-based), at word `at` of the base unit, the base's words and the other's. */
export interface Run {
  readonly unit: number;
  readonly at: number;
  readonly row: readonly string[];
  readonly page: readonly string[];
}

/**
 * The runs where `other` differs from `base`, unit by unit (a unit only one
 * side has is one run). A run whose words join to the same letters is a
 * split, not a difference, and is left out.
 */
export const runsBetween = (
  base: ReadonlyArray<readonly string[]>,
  other: ReadonlyArray<readonly string[]>,
): Run[] => {
  const runs: Run[] = [];
  for (let u = 0; u < Math.max(base.length, other.length); u++)
    for (const run of diffRuns(base[u] ?? [], other[u] ?? []))
      if (run.row.join('') !== run.page.join('')) runs.push({ unit: u + 1, ...run });
  return runs;
};

const quoted = (words: readonly string[]) => `"${words.join(' ')}"`;

// ----------------------------------------------------------------------------
// The rulings
// ----------------------------------------------------------------------------

/**
 * What a judge ruled the crop prints at a place:
 * - `words`: the words printed there (`printed`), which the row sings as printed;
 * - `misprint`: a non-word printed there, which the row sings as the word it plainly means;
 * - `echo`: an echo row (small words answering the main row) printed there;
 * - `repeat`: words the music sings again, printed once (or twice) there;
 * - `shared`: a line printed once under bars every stanza sings;
 * - `layout`: the row's words printed at another place of the hymn (a refrain
 *   printed before the first stanza, a stanza's lines in another system),
 *   which the row sings where it does; or the page's words in the row's
 *   order, which the row divides into lines otherwise than the page's
 *   capitals do (a poem line written as two lines, two written as one, a
 *   stanza a line longer than its siblings): the row keeps its own division.
 *   A reach ruling (`unreachable`, `gaps`) is a `layout` ruling too: it
 *   rules on the mutants of the row's layout, not on a site;
 * - `slip`: the page prints there what the row sings, and a shape reader
 *   miscounted, missed a capital or placed a row elsewhere (a ruling that
 *   settles shape lines only, with no site); a reader who read the page
 *   right is no slip: where the row divides its lines otherwise, the ruling
 *   is `layout`, and where the check's own assumption fails (a metre the
 *   header names and the music does not keep), its `why` says which;
 * - `disputed`: the page lays the row's words out otherwise than the row, in
 *   no way a row's own convention explains (a poem line opened at another
 *   word, in no whole split or join of the row's lines; a block sung where
 *   the page does not sing it), or a judge found a shape line's place
 *   printing a word otherwise than the row (an Amen the row leaves out): the
 *   row keeps its words and layout and waits on the owner, the hymn
 *   `unsettled` (a ruling that settles shape lines only, with no site). It
 *   may rest on one judge: the owner decides it;
 * - `unreadable`: the crop does not show the words clearly enough to say;
 * - `owner`: words a judge saw the crop print but would not transcribe
 *   (copyright), copied by the owner from his own book at that place: read
 *   like `words`, on the crop that shows them.
 * `sung` is what the row writes there under Decided 5: the printed words
 * for `words`, the meant word for a misprint, the line in every stanza that
 * sings it, the repeat where it is sung, an echo row noted, not written, a layout as the row has it.
 */
const Kind = Schema.Literals([
  'words',
  'misprint',
  'echo',
  'repeat',
  'shared',
  'layout',
  'slip',
  'disputed',
  'unreadable',
  'owner',
]);

/**
 * One crop a ruling read: the page image it was cut from, its file, its box
 * on that image, the first 16 hex digits of its bytes' sha256, and the words
 * the judge saw it print at the place (`printed` is every crop's words in
 * order, `printedOf`).
 */
const RulingCrop = Schema.Struct({
  image: Schema.String,
  crop: Schema.String,
  box: Schema.Tuple([Schema.Int, Schema.Int, Schema.Int, Schema.Int]),
  sha: Schema.String,
  shows: Schema.String,
});

const Ruling = Schema.Struct({
  sites: Schema.Array(Schema.Struct({ unit: Schema.Int, at: Schema.Int })),
  row: Schema.String,
  readings: Schema.Array(Schema.String),
  printed: Schema.String,
  sung: Schema.String,
  kind: Kind,
  crops: Schema.Array(RulingCrop),
  judge: Schema.String,
  why: Schema.String,
  /**
   * The layout lines (`layoutLinesOf`, `formatProblems`) this ruling quiets,
   * each read on its crops: the judge found the printed source right there
   * (a shape reader's slip, or a part, such as an echo, the row rightly
   * leaves out), or the division is the row's own (`layout`), or the row is
   * disputed (`disputed`: the line waits on the owner, its hymn
   * `unsettled`). A ruling that settles a difference may have no site.
   */
  settles: Schema.optionalKey(Schema.Array(Schema.String)),
  /**
   * The layout mutants of the hymn (`layout.ts`'s names, `repeatstanza:4`)
   * its page cannot tell apart from the row, as the crops show (a stanza the
   * page prints twice, two lines it prints alike): the generated property's
   * committed unreachable list.
   */
  unreachable: Schema.optionalKey(Schema.Array(Schema.String)),
  /**
   * The layout mutants of the hymn its page tells apart from the row, as the
   * crops show (a word printed lower case where the mutant opens a line), but
   * no check of the shape readings does, or that a judge could not tell from
   * the crops: the generated property's committed list of the check's gaps.
   */
  gaps: Schema.optionalKey(Schema.Array(Schema.String)),
  /**
   * The printed text a ruling's `unreachable` and `gaps` were ruled on, as
   * `layout.ts`'s `fingerprintOf`: a mutant is named by its place, so a row
   * that changes after the ruling leaves it naming other mutations (stale).
   */
  layout: Schema.optionalKey(Schema.String),
});
export type Ruling = typeof Ruling.Type;

const RulingsFile = Schema.Struct({ number: Schema.Int, rulings: Schema.Array(Ruling) });
const decodeRulings = Schema.decodeEffect(Schema.fromJsonString(RulingsFile));

/** Whether a ruling changes the row: it reads its crop, and the row sings other words than the base. */
const changes = (ruling: Ruling) =>
  ruling.kind !== 'unreadable' &&
  !same(wordsOf(ruling.sung), ruling.row.split(' ').filter(Boolean));

/** Where one ruling's sung words stand in the units it gives: unit (1-based), first word, word count. */
export interface Span {
  readonly ruling: Ruling;
  readonly unit: number;
  readonly start: number;
  readonly length: number;
}

/**
 * What can be wrong with a hymn's rulings taken together:
 * - `site`: a ruling's site does not hold its row words in the base;
 * - `nesting`: a ruling inside a wider one sings other words at its own place in the wider one;
 * - `twice`: two rulings of one stretch, neither inside the other, sing it differently;
 * - `judges`: two rulings of one stretch, neither inside the other, come from two judges.
 */
export type RulingConflict =
  | {
      readonly kind: 'site';
      readonly unit: number;
      readonly at: number;
      readonly row: readonly string[];
    }
  | {
      readonly kind: 'nesting';
      readonly unit: number;
      readonly at: number;
      readonly sung: readonly string[];
      readonly inner: number;
      readonly innerSung: readonly string[];
    }
  | { readonly kind: 'twice'; readonly unit: number; readonly at: number; readonly other: number }
  | { readonly kind: 'judges'; readonly unit: number; readonly at: number; readonly other: number };

/**
 * One line for each kind of conflict: a record over the whole union, so a
 * kind added to `RulingConflict` fails the typecheck until it is said here.
 */
const conflictLine = {
  site: (c) => `unit ${c.unit} at ${c.at} holds no ${quoted(c.row)}`,
  nesting: (c) =>
    `unit ${c.unit} at ${c.at} is ruled ${quoted(c.sung)}, and a ruling inside it at ${c.inner} ${quoted(c.innerSung)}`,
  twice: (c) =>
    `unit ${c.unit} at ${c.at} and at ${c.other} are ruled twice, and the rulings disagree`,
  judges: (c) => `unit ${c.unit} at ${c.at} and at ${c.other} rule one stretch, by two judges`,
} satisfies {
  readonly [K in RulingConflict['kind']]: (
    conflict: Extract<RulingConflict, { kind: K }>,
  ) => string;
};

/** A conflict as the census prints it. */
export const lineOfConflict = (conflict: RulingConflict): string =>
  (conflictLine[conflict.kind] as (c: RulingConflict) => string)(conflict);

/**
 * The base units with every ruling's sung words put in at its sites, where
 * each ruling's words stand in them, and each conflict among the rulings
 * (`RulingConflict`). Sites apply from the last to the first in each unit;
 * trailing units left empty are dropped. Rulings in conflict apply none:
 * the units are the base's, and the conflicts say why.
 *
 * Two readings can find runs of different extent at one place (`our` and
 * `out our unexpressed o`), each ruled. A ruling whose words lie inside a
 * wider ruling's is not applied again, and must agree with it at its own
 * place: the wider ruling's sung words that stand where its row words stood
 * (by the wider ruling's word alignment) are its sung words. Rulings of one
 * stretch with neither inside the other (words that overlap, or an insertion
 * at the edge of another's words) come from one judge, so they read the page
 * one way (two that keep their words read it alike, whoever judged them);
 * two of overlapping words disagree, and so do two of the same words that
 * sing them differently.
 */
export const applyRulings = (
  base: ReadonlyArray<readonly string[]>,
  rulings: readonly Ruling[],
) => {
  const edits = editsOf(rulings);
  const count = Math.max(base.length, ...edits.map((edit) => edit.unit));
  const units = Array.from({ length: count }, (_, u) => [...(base[u] ?? [])]);
  const misplaced = siteProblems(base, edits);
  const none = { units, spans: [] as Span[], applied: [] as Ruling[] };
  if (misplaced.length > 0) return { ...none, misplaced };
  const covered = coveredOf(edits);
  const disagree = [...nestingProblems(edits), ...stretchProblems(edits)];
  if (disagree.length > 0) return { ...none, misplaced: disagree };
  const applied = appliedOf(edits, covered);
  for (const edit of applied.toSorted((a, b) => b.unit - a.unit || b.at - a.at))
    units[edit.unit - 1]?.splice(edit.at, edit.row.length, ...edit.sung);
  const spans = edits.map((edit) => spanIn(applied, covered, edit));
  while (units.length > 0 && units[units.length - 1]?.length === 0) units.pop();
  return { units, spans, misplaced, applied: rulings.filter((r) => r.kind !== 'unreadable') };
};

/** One site of a ruling, with its row words and its sung words. */
interface Edit {
  readonly unit: number;
  readonly at: number;
  readonly ruling: Ruling;
  readonly row: readonly string[];
  readonly sung: readonly string[];
}

const editsOf = (rulings: readonly Ruling[]): Edit[] =>
  rulings
    .filter((ruling) => ruling.kind !== 'unreadable')
    .flatMap((ruling) =>
      ruling.sites.map((site) => ({
        ...site,
        ruling,
        row: ruling.row.split(' ').filter(Boolean),
        sung: wordsOf(ruling.sung),
      })),
    );

/** Each site that does not hold its ruling's row words in the base. */
const siteProblems = (
  base: ReadonlyArray<readonly string[]>,
  edits: readonly Edit[],
): RulingConflict[] =>
  edits
    .filter((edit) => {
      const unit = base[edit.unit - 1] ?? [];
      return !same(unit.slice(edit.at, edit.at + edit.row.length), edit.row);
    })
    .map((edit) => ({ kind: 'site', unit: edit.unit, at: edit.at, row: edit.row }));

const endOf = (edit: Edit) => edit.at + edit.row.length;

/** `inner` lies inside `outer`: its words within outer's, an insertion strictly inside. */
const inside = (inner: Edit, outer: Edit) =>
  inner !== outer &&
  inner.unit === outer.unit &&
  outer.row.length > inner.row.length &&
  (inner.row.length === 0
    ? outer.at < inner.at && inner.at < endOf(outer)
    : outer.at <= inner.at && endOf(inner) <= endOf(outer));

/** An insertion stands at or inside the words of `edit`. */
const insertedAt = (insertion: Edit, edit: Edit) =>
  edit.at <= insertion.at && insertion.at <= endOf(edit);

/** Two rulings of one stretch: their words overlap, or an insertion stands at or inside the other's words. */
const touch = (a: Edit, b: Edit) => {
  if (a.unit !== b.unit) return false;
  if (a.row.length === 0) return insertedAt(a, b);
  if (b.row.length === 0) return insertedAt(b, a);
  return a.at < endOf(b) && b.at < endOf(a);
};

/** The edits that lie inside a wider one, and are applied through it. */
const coveredOf = (edits: readonly Edit[]) =>
  new Set(edits.filter((one) => edits.some((outer) => inside(one, outer))));

/** Each word of `a` matched to a word of `b` by a word-level LCS (the first match taken), as [i, j] pairs. */
const alignmentOf = (a: readonly string[], b: readonly string[]) => {
  const at = lcsTable(a, b);
  const pairs: Array<readonly [number, number]> = [];
  let [i, j] = [0, 0];
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) pairs.push([i++, j++]);
    else if (at(i + 1, j) >= at(i, j + 1)) i++;
    else j++;
  }
  return pairs;
};

/**
 * The wider ruling's sung words that stand where its row words `from` to
 * `to` (exclusive, counted in its row) stood: those between the last row
 * word before `from` and the first row word at or after `to` that the
 * alignment keeps.
 */
const sungAt = (outer: Edit, from: number, to: number) => {
  const pairs = alignmentOf(outer.row, outer.sung);
  const before = pairs.filter(([i]) => i < from).at(-1);
  const after = pairs.find(([i]) => i >= to);
  return outer.sung.slice(
    before === undefined ? 0 : before[1] + 1,
    after === undefined ? outer.sung.length : after[1],
  );
};

/** An inner ruling agrees when the wider ruling sings its sung words at its own place. */
const agrees = (one: Edit, outer: Edit) => {
  const from = one.at - outer.at;
  return same(sungAt(outer, from, from + one.row.length), one.sung);
};

const nestingProblems = (edits: readonly Edit[]): RulingConflict[] =>
  edits.flatMap((outer) =>
    edits
      .filter((one) => inside(one, outer) && !agrees(one, outer))
      .map((one) => ({
        kind: 'nesting' as const,
        unit: outer.unit,
        at: outer.at,
        sung: outer.sung,
        inner: one.at,
        innerSung: one.sung,
      })),
  );

const keeps = (edit: Edit) => same(edit.row, edit.sung);

/** What two rulings of one stretch, neither inside the other, say wrong together, if anything. */
const pairProblem = (a: Edit, b: Edit): RulingConflict | undefined => {
  const place = { unit: a.unit, at: a.at, other: b.at };
  if (same(a.row, b.row) && a.at === b.at)
    return same(a.sung, b.sung) ? undefined : { kind: 'twice', ...place };
  if (a.ruling.judge !== b.ruling.judge && !(keeps(a) && keeps(b)))
    return { kind: 'judges', ...place };
  return a.row.length > 0 && b.row.length > 0 ? { kind: 'twice', ...place } : undefined;
};

const stretchProblems = (edits: readonly Edit[]): RulingConflict[] =>
  edits.flatMap((a, i) =>
    edits
      .slice(i + 1)
      .filter((b) => touch(a, b) && !inside(a, b) && !inside(b, a))
      .flatMap((b) => pairProblem(a, b) ?? []),
  );

const sameSite = (a: Edit, b: Edit) => a.unit === b.unit && a.at === b.at && same(a.row, b.row);

/** One ruling stands for each stretch: the widest; those inside it, and a second ruling of the same words, apply once. */
const appliedOf = (edits: readonly Edit[], covered: ReadonlySet<Edit>) =>
  edits.filter(
    (edit, i) => !covered.has(edit) && !edits.slice(0, i).some((other) => sameSite(other, edit)),
  );

/** An applied edit's words move by what every earlier applied edit of its unit adds or takes away. */
const spanOf = (applied: readonly Edit[], edit: Edit): Omit<Span, 'ruling'> => {
  const shift = applied
    .filter((other) => other.unit === edit.unit && other.at < edit.at)
    .reduce((sum, other) => sum + other.sung.length - other.row.length, 0);
  return { unit: edit.unit, start: edit.at + shift, length: edit.sung.length };
};

/**
 * A ruling applied through a wider one stands at its own words within the wider one's: where its
 * sung words stand in the wider one's sung words nearest its own place (none, for words taken away).
 */
const within = (applied: readonly Edit[], edit: Edit, outer: Edit): Omit<Span, 'ruling'> => {
  const span = spanOf(applied, outer);
  const near = edit.at - outer.at;
  if (edit.sung.length === 0)
    return { unit: span.unit, start: span.start + Math.min(near, outer.sung.length), length: 0 };
  const offsets = outer.sung
    .map((_, i) => i)
    .filter((i) => same(outer.sung.slice(i, i + edit.sung.length), edit.sung));
  const offset = offsets.toSorted((a, b) => Math.abs(a - near) - Math.abs(b - near))[0] ?? 0;
  return { unit: span.unit, start: span.start + offset, length: edit.sung.length };
};

/** Where an edit's words stand in the units: its own, its wider ruling's, or its twin's. */
const spanIn = (applied: readonly Edit[], covered: ReadonlySet<Edit>, edit: Edit): Span => {
  if (covered.has(edit)) {
    const outer = applied.find((one) => inside(edit, one));
    return {
      ruling: edit.ruling,
      ...(outer === undefined ? spanOf(applied, edit) : within(applied, edit, outer)),
    };
  }
  const twin = applied.includes(edit) ? edit : applied.find((one) => sameSite(one, edit));
  return { ruling: edit.ruling, ...spanOf(applied, twin ?? edit) };
};

// ----------------------------------------------------------------------------
// The page inventory
// ----------------------------------------------------------------------------

const Images = Schema.Array(
  Schema.Struct({ file: Schema.String, hymns: Schema.Array(Schema.Int) }),
);

const Inventory = Schema.Struct({
  print: Schema.String,
  scan: Schema.Struct({
    url: Schema.String,
    pages: Schema.Int,
    /** The pages hymnary.org does not show. */
    withheld: Schema.Array(Schema.Int),
    /** The pages hymnary.org serves another page's scan for: their own print is not shown either. */
    copies: Schema.Array(Schema.Struct({ page: Schema.Int, of: Schema.Int })),
  }),
  sdahimages: Schema.Struct({ repo: Schema.String, commit: Schema.String, dir: Schema.String }),
  /** Each scan page (shown or withheld) and the hymns printed on it, in book order. */
  scans: Schema.Array(Schema.Struct({ page: Schema.Int, hymns: Schema.Array(Schema.Int) })),
  photos: Images,
  /**
   * The hymns the photos show only part of (a page cut off, a second page
   * not photographed): their photos do not decide them, and `missing` says
   * what the photos leave out.
   */
  partial: Schema.Array(Schema.Struct({ hymn: Schema.Int, missing: Schema.String })),
  /**
   * The hymns whose page prints some stanzas and sends the singer to another
   * hymn for the rest (`from`, as the page names it; `why` quotes the page):
   * the lender's page decides those stanzas, and its readings read them.
   */
  lent: Schema.Array(Schema.Struct({ hymn: Schema.Int, from: Schema.Int, why: Schema.String })),
  /**
   * The engravings, each with the hymns it shows; `revised` quotes its
   * credit line where that line dates a words revision after 1985, so the
   * engraving prints a later text than the 1985 book and never decides.
   */
  engravings: Schema.Array(
    Schema.Struct({
      file: Schema.String,
      hymns: Schema.Array(Schema.Int),
      revised: Schema.optionalKey(Schema.String),
    }),
  ),
});
export type Inventory = typeof Inventory.Type;
export const decodeInventory = Schema.decodeEffect(Schema.fromJsonString(Inventory));

/** A scan page's image name, as a reading or a ruling names it. */
export const scanImage = (page: number) => `p${pad(page)}.jpg`;

/**
 * The page image a reading's image was cut from: a scan half `pNNN-a.jpg` is
 * `pNNN.jpg`, a photo half `<stem>.top.jpg` is `<stem>.jpg`.
 */
export const pageOfImage = (image: string) =>
  path
    .basename(image)
    .replace(/^(p\d{3})-[ab]\.jpg$/, '$1.jpg')
    .replace(/^([\w-]+)\.(?:top|bottom)\.jpg$/, '$1.jpg');

export type Source = 'photo' | 'scan' | 'sdahimages' | 'none';

/** The source a page image belongs to, by its name: a scan page `pNNN.jpg`, an engraving `.png`, else a photo. */
export const sourceOfImage = (image: string): Exclude<Source, 'none'> =>
  /^p\d{3}\.jpg$/.test(image) ? 'scan' : image.endsWith('.png') ? 'sdahimages' : 'photo';

/** A hymn's deciding source and its page images. */
export interface Deciding {
  readonly source: Source;
  /**
   * The images that decide it: its deciding pages, and the photos that show
   * part of it (`Inventory.partial`), which rule the places they show.
   */
  readonly images: readonly string[];
  /** The images a reading of the deciding page may name: its images, and a copy page's scan that shows one of them again. */
  readonly readable: readonly string[];
}

/** The deciding page with no image: a hymn no page of the 1985 text shows. */
export const NO_PAGE: Deciding = { source: 'none', images: [], readable: [] };

/** Each inventory's deciding pages, worked out once: a check of one hymn asks for them again. */
const decided = new WeakMap<Inventory, ReadonlyMap<number, Deciding>>();

/**
 * Each hymn's deciding page: its photos, when they show it whole; else its
 * scan pages, when every one is shown; else its engravings, unless revised
 * after 1985; else none. A photo that shows part of a hymn decided by a scan
 * or an engraving stands beside that page.
 */
export const decidingOf = (inventory: Inventory): ReadonlyMap<number, Deciding> => {
  const known = decided.get(inventory);
  if (known !== undefined) return known;
  const deciding = decideAll(inventory);
  decided.set(inventory, deciding);
  return deciding;
};

const decideAll = (inventory: Inventory): ReadonlyMap<number, Deciding> => {
  const withheld = new Set([
    ...inventory.scan.withheld,
    ...inventory.scan.copies.map((copy) => copy.page),
  ]);
  const of = (images: ReadonlyArray<{ file: string; hymns: readonly number[] }>, n: number) =>
    images.filter((image) => image.hymns.includes(n)).map((image) => image.file);
  const partial = new Set(inventory.partial.map((part) => part.hymn));
  const unrevised = inventory.engravings.filter((engraving) => engraving.revised === undefined);
  const deciding = new Map<number, Deciding>();
  for (let n = FIRST; n <= LAST; n++) {
    const photos = of(inventory.photos, n);
    const scans = inventory.scans.filter((scan) => scan.hymns.includes(n)).map((s) => s.page);
    const engravings = of(unrevised, n);
    const page: Deciding =
      photos.length > 0 && !partial.has(n)
        ? { source: 'photo', images: photos, readable: photos }
        : scans.length > 0 && scans.every((p) => !withheld.has(p))
          ? {
              source: 'scan',
              images: scans.map(scanImage),
              readable: [
                ...scans.map(scanImage),
                ...inventory.scan.copies
                  .filter((copy) => scans.includes(copy.of))
                  .map((copy) => scanImage(copy.page)),
              ],
            }
          : engravings.length > 0
            ? { source: 'sdahimages', images: engravings, readable: engravings }
            : NO_PAGE;
    deciding.set(
      n,
      page.source === 'photo' || page.source === 'none' || photos.length === 0
        ? page
        : {
            source: page.source,
            images: [...photos, ...page.images],
            readable: [...photos, ...page.readable],
          },
    );
  }
  // A borrower's deciding page holds the lender's too: the stanzas it sends the singer to.
  for (const lent of inventory.lent) {
    const own = deciding.get(lent.hymn);
    const lender = deciding.get(lent.from);
    if (own === undefined || lender === undefined || own.source === 'none') continue;
    deciding.set(lent.hymn, {
      source: own.source,
      images: [...own.images, ...lender.images],
      readable: [...own.readable, ...lender.readable],
    });
  }
  return deciding;
};

/**
 * The readings of a hymn whose page lends its other stanzas from another
 * (`Inventory.lent`): each reading of its own page with the stanzas it did
 * not print taken from each reading of the lender's page, one reading for
 * each pair. Every other hymn's readings are its own.
 */
export const lentReadings = <R extends Reading>(
  inventory: Inventory,
  deciding: ReadonlyMap<number, Deciding>,
  readings: readonly R[],
): R[] => {
  const lent = inventory.lent.flatMap((one) => {
    const lender = deciding.get(one.from);
    if (lender === undefined) return [];
    const theirs = readings.filter(
      (r) => r.number === one.from && !isRefusal(r) && ofPage(r.images, lender),
    );
    return readings
      .filter((r) => r.number === one.hymn && !isRefusal(r))
      .flatMap((own) =>
        theirs.map((their) => ({
          ...own,
          images: [...own.images, ...their.images],
          stanzas: [...own.stanzas, ...their.stanzas.slice(own.stanzas.length)],
        })),
      );
  });
  const borrowers = new Set(inventory.lent.map((one) => one.hymn));
  return [...readings.filter((r) => !borrowers.has(r.number)), ...lent];
};

/**
 * Every way the inventory disagrees with itself and the photos: every hymn
 * 1-695 is printed on one or more consecutive scan pages; the hymns run in
 * book order (a hymn starts on or after the page the one before it starts
 * on, no later than the page after the one before it ends on, and ends on or
 * after it); every scan page up to the last hymn's is listed and holds a
 * hymn (a copy page may hold none: its own print is not shown); the withheld
 * and copy lists name scan pages; each photo is a committed file whose name
 * starts with a hymn it shows; each engraving names a hymn.
 */
export const inventoryProblems = (
  inventory: Inventory,
  photoFiles: ReadonlySet<string>,
): string[] => [
  ...scanListProblems(inventory),
  ...bookOrderProblems(inventory),
  ...imageListProblems(inventory, photoFiles),
];

/** The scan pages listed in order, every one up to the last, each holding a hymn unless a copy; the unshown pages scan pages. */
const scanListProblems = (inventory: Inventory): string[] => {
  const problems: string[] = [];
  const copies = new Set(inventory.scan.copies.map((copy) => copy.page));
  let last = 0;
  for (const scan of inventory.scans) {
    if (scan.page <= last) problems.push(`scan page ${scan.page} out of order`);
    last = scan.page;
    if (scan.hymns.length === 0 && !copies.has(scan.page))
      problems.push(`scan page ${scan.page} holds no hymn`);
  }
  const pages = inventory.scans.map((scan) => scan.page);
  const top = Math.max(...pages);
  for (let p = 1; p <= top; p++) if (!pages.includes(p)) problems.push(`scan page ${p} not listed`);
  for (const p of [...inventory.scan.withheld, ...copies])
    if (p < 1 || p > inventory.scan.pages) problems.push(`unshown page ${p} is no scan page`);
  for (const copy of inventory.scan.copies)
    if (inventory.scan.withheld.includes(copy.page) || inventory.scan.withheld.includes(copy.of))
      problems.push(`copy page ${copy.page} of ${copy.of} names a withheld page`);
  return problems;
};

/** Every hymn on consecutive scan pages, the hymns in book order, and no page naming a hymn outside the book. */
const bookOrderProblems = (inventory: Inventory): string[] => {
  const problems: string[] = [];
  const copies = new Set(inventory.scan.copies.map((copy) => copy.page));
  const pagesOf = new Map<number, number[]>();
  for (const scan of inventory.scans)
    for (const n of scan.hymns) pagesOf.set(n, [...(pagesOf.get(n) ?? []), scan.page]);
  let [start, end] = [0, 0];
  for (let n = FIRST; n <= LAST; n++) {
    const all = pagesOf.get(n) ?? [];
    if (all.length === 0) {
      problems.push(`${n} is on no scan page`);
      continue;
    }
    const first = all[0] ?? 0;
    const final = all[all.length - 1] ?? 0;
    if (all.some((p, i) => i > 0 && p !== (all[i - 1] ?? 0) + 1))
      problems.push(`${n} scan pages ${all.join(',')} are not consecutive`);
    // Pages between the two hold no hymn only when each is a copy page.
    const skipped = Array.from({ length: Math.max(0, first - end - 1) }, (_, i) => end + 1 + i);
    if (n > FIRST && (first < start || final < end || skipped.some((p) => !copies.has(p))))
      problems.push(`${n} on scan pages ${first}-${final}, but ${n - 1} on ${start}-${end}`);
    [start, end] = [first, final];
  }
  for (const n of pagesOf.keys())
    if (n < FIRST || n > LAST) problems.push(`scan pages name ${n}, no hymn of the book`);
  return problems;
};

/** Each photo a committed file named for a hymn it shows, every committed photo listed, each partial hymn on a photo, each engraving naming a hymn. */
const imageListProblems = (inventory: Inventory, photoFiles: ReadonlySet<string>): string[] => {
  const problems: string[] = [];
  for (const photo of inventory.photos) {
    if (!photoFiles.has(photo.file)) problems.push(`photo ${photo.file} is not committed`);
    if (!photo.hymns.includes(Number.parseInt(photo.file, 10)))
      problems.push(`photo ${photo.file} does not show the hymn it is named for`);
  }
  for (const file of photoFiles)
    if (!inventory.photos.some((photo) => photo.file === file))
      problems.push(`photo ${file} is not in the inventory`);
  for (const part of inventory.partial)
    if (!inventory.photos.some((photo) => photo.hymns.includes(part.hymn)))
      problems.push(`partial ${part.hymn} is on no photo`);
  for (const engraving of inventory.engravings)
    if (engraving.hymns.length === 0) problems.push(`engraving ${engraving.file} names no hymn`);
  return problems;
};

/** Each listed scan page whose status the fetched scans contradict: `pNNN.jpg` shown, `pNNN.withheld` withheld. */
export const scanStatusProblems = (inventory: Inventory, fetched: readonly string[]): string[] => {
  const withheld = new Set(inventory.scan.withheld);
  const problems: string[] = [];
  for (let p = 1; p <= inventory.scan.pages; p++) {
    const shown = fetched.includes(`p${pad(p)}.jpg`);
    const held = fetched.includes(`p${pad(p)}.withheld`);
    if (shown === held) problems.push(`scan page ${p} was not fetched`);
    else if (shown && withheld.has(p))
      problems.push(`scan page ${p} is shown, but listed withheld`);
    else if (held && !withheld.has(p))
      problems.push(`scan page ${p} is withheld, but listed shown`);
  }
  return problems;
};

// ----------------------------------------------------------------------------
// The census file and its sources
// ----------------------------------------------------------------------------

const Witness = Schema.Union([
  Schema.Struct({ hunks: Schema.Int, digest: Schema.String }),
  Schema.Literal('absent'),
]);

const Entry = Schema.Struct({
  number: Schema.Int,
  row: Schema.Literals(['matches', 'fixed', 'unsettled', 'nopage']),
  /** The deciding source and its page images, as the inventory gives them. */
  source: Schema.Literals(['photo', 'scan', 'sdahimages', 'none']),
  pages: Schema.Array(Schema.String),
  /** How many blind readings of the deciding page there are: by model readers, and by machine OCR. */
  readings: Schema.Struct({ reader: Schema.Int, ocr: Schema.Int }),
  /** How many rulings decided a place, and how many of them change the row. */
  rulings: Schema.Struct({ all: Schema.Int, changes: Schema.Int }),
  /** The printed source's stanza count and whether it has a refrain. */
  stanzas: Schema.Int,
  refrain: Schema.Boolean,
  /**
   * The digest of the base row's sung words (`baseDigestOf`): a row word
   * changed with no fix file changes it; the plain run reads the base row from git.
   */
  base: Schema.String,
  witness: Witness,
  note: Schema.optionalKey(Schema.String),
});
export type Entry = typeof Entry.Type;

const Repo = Schema.Struct({ repo: Schema.String, commit: Schema.String });

const Census = Schema.Struct({
  print: Schema.String,
  base: Repo,
  witness: Repo,
  hymns: Schema.Array(Entry),
});
export type Census = typeof Census.Type;

export const decodeCensus = Schema.decodeEffect(Schema.fromJsonString(Census));

/** The census as committed: two-space JSON with a final newline, so a rewrite is byte-stable. */
export const encodeCensus = (census: Census) =>
  `${JSON.stringify(Schema.encodeSync(Census)(census), null, 2)}\n`;

const Line = Schema.Struct({ text: Schema.String, from: Schema.String });
const Fix = Schema.Struct({
  number: Schema.Int,
  stanzas: Schema.Array(Schema.Array(Line)),
  refrain: Schema.optionalKey(
    Schema.Struct({
      lines: Schema.Array(
        Schema.Union([
          Line,
          Schema.Struct({
            varies: Schema.Array(
              Schema.Struct({ after: Schema.Array(Schema.Int), lines: Schema.Array(Line) }),
            ),
          }),
        ]),
      ),
    }),
  ),
  /** The base row this fix replaces, as hymnal.db held it (absent on origin/main's prior fixes). */
  replaces: Schema.optionalKey(
    Schema.Array(Schema.Struct({ id: Schema.Int, text: Schema.String })),
  ),
});
export type Fix = typeof Fix.Type;
export const decodeFix = Schema.decodeEffect(Schema.fromJsonString(Fix));

/** Every line of a fix, each with where it was read. */
const fixLines = (fix: Fix) => [
  ...fix.stanzas.flat(),
  ...(fix.refrain?.lines ?? []).flatMap((item) =>
    'varies' in item ? item.varies.flatMap((part) => part.lines) : [item],
  ),
];

/** Whether a fix's refrain has a part that varies by stanza. */
export const fixVaries = (fix: Fix) => (fix.refrain?.lines ?? []).some((item) => 'varies' in item);

/**
 * The lines of each unit a fix sings: stanza i with the refrain after it,
 * its varying part the one written for stanza i (as `hymnal-fixes.ts`
 * writes the row). A stanza no varying part follows sings none.
 */
export const fixUnitLinesOf = (fix: Fix): Array<Array<typeof Line.Type>> =>
  fix.stanzas.map((stanza, i) => [
    ...stanza,
    ...(fix.refrain?.lines ?? []).flatMap((item) =>
      'varies' in item
        ? (item.varies.find((part) => part.after.includes(i + 1))?.lines ?? [])
        : [item],
    ),
  ]);

// ----------------------------------------------------------------------------
// The shape of the page
// ----------------------------------------------------------------------------

/**
 * One lyric row as a shape reader saw it: its system, the strip it read it
 * on, how many words it sings (syllables joined, a word broken over a system
 * counted in the row it starts in), its first two words, the two that start
 * at word ⌊words/2⌋ + 1, its last two, and the places (1 = its first word)
 * of the words it prints with a capital letter.
 */
const OutlineRow = Schema.Struct({
  system: Schema.Int,
  strip: Schema.String,
  words: Schema.Int,
  first: Schema.String,
  mid: Schema.String,
  last: Schema.String,
  capitals: Schema.Array(Schema.Int),
});
type OutlineRow = typeof OutlineRow.Type;

/**
 * A shape reading of one hymn's page (`data/shapes.json`): the metre the
 * page prints (`null` when none); which stanzas the page prints and the
 * lyric rows of each, in printed order; the refrain, if any, where it is
 * printed, where the page has it sung (`order`, as `refrains.json` names
 * it), and its rows (a row printed once for some stanzas names them in
 * `stanzas`: a refrain that varies by stanza); other rows (`extra`: echoes,
 * descants); and the reader's doubts (`odd`). A fresh model reader wrote it
 * off 1:1 strips of the deciding page, never shown the row (`reader` names
 * its task): counts, positions and two-word anchors, never the lyrics.
 */
const Outline = Schema.Struct({
  number: Schema.Int,
  reader: Schema.String,
  images: Schema.Array(Schema.String),
  systems: Schema.Int,
  metre: Schema.NullOr(Schema.String),
  stanzas: Schema.Array(
    Schema.Struct({ number: Schema.NullOr(Schema.Int), rows: Schema.Array(OutlineRow) }),
  ),
  refrain: Schema.NullOr(
    Schema.Struct({
      label: Schema.NullOr(Schema.String),
      at: Schema.Literals(['after', 'before', 'inside']),
      order: Order,
      rows: Schema.Array(
        Schema.Struct({ ...OutlineRow.fields, stanzas: Schema.Array(Schema.Int) }),
      ),
    }),
  ),
  extra: Schema.Array(Schema.Struct({ ...OutlineRow.fields, why: Schema.String })),
  odd: Schema.String,
});
export type Outline = typeof Outline.Type;

/** A shape reading as its reader reports it: the reading without its reader's name. */
const OutlineReport = Schema.Struct(Struct.omit(Outline.fields, ['reader']));
type OutlineReport = typeof OutlineReport.Type;
const ReportFile = Schema.Struct({ hymns: Schema.Array(OutlineReport) });

const OutlinesFile = Schema.Struct({ print: Schema.String, hymns: Schema.Array(Outline) });
export const decodeOutlines = Schema.decodeEffect(Schema.fromJsonString(OutlinesFile));

/** Hymns under copyright: a reader's notes on them quote none of their words. */
const UNDER_COPYRIGHT: ReadonlySet<number> = new Set([86, 584]);

/**
 * A reader's note (`why`, `odd`) of hymn `n` with every quoted span cut to
 * its first two words (to none for a hymn under copyright): the notes keep
 * the anchors' rule, two words and no more. Syllables a page prints apart
 * (`Al - might - y`) are one word.
 */
const trimNote = (text: string, n: number) =>
  text.replace(
    /(?<![\p{L}\p{N}])(['‘"“])([^'’"”]*?)(['’"”])(?![\p{L}\p{N}])/gu,
    (whole, open: string, inner: string, close: string) => {
      const words = inner
        .trim()
        .replace(/\s*-\s*/g, '-')
        .split(/\s+/);
      if (UNDER_COPYRIGHT.has(n)) return `${open}…${close}`;
      return words.length <= 2 ? whole : `${open}${words.slice(0, 2).join(' ')} …${close}`;
    },
  );

/**
 * A shape reader's report as the census keeps it: decoded, with the reader
 * named, its notes trimmed (`trimNote`). The report is all it reads: the type
 * takes no row, so the shape cannot follow one.
 */
export const outlineOfReport = (report: OutlineReport, reader: string): Outline =>
  Schema.decodeSync(Outline)({
    ...report,
    reader,
    odd: trimNote(report.odd, report.number),
    extra: report.extra.map((row) => ({ ...row, why: trimNote(row.why, report.number) })),
  });

/**
 * The refrain rows a shape reading prints for some stanzas only, grouped by
 * the stanzas each group follows (sorted): empty when the refrain is the same
 * after every stanza. A row marked for every stanza is a shared row.
 */
export const outlineVaries = (outline: Outline): number[][] => {
  const all = outline.stanzas.length;
  const groups = new Map<string, number[]>();
  for (const row of outline.refrain?.rows ?? []) {
    const after = [...new Set(row.stanzas)].toSorted((a, b) => a - b);
    if (after.length === 0 || after.length >= all) continue;
    groups.set(after.join(','), after);
  }
  return [...groups.values()].toSorted((a, b) => (a[0] ?? 0) - (b[0] ?? 0));
};

/**
 * One printed line: its words as compared, for each word whether the source
 * opens a sentence on it (`linesOf`), and whether its text opens with
 * whitespace (an indent).
 */
export interface PrintedLine {
  readonly words: readonly string[];
  readonly sentences: readonly boolean[];
  readonly indent: boolean;
}

/** A refrain item: a line every stanza sings, or a part that varies by stanza (the lines sung after the stanzas it names). */
export type RefrainItem =
  | PrintedLine
  | {
      readonly varies: ReadonlyArray<{
        readonly after: readonly number[];
        readonly lines: readonly PrintedLine[];
      }>;
    };

/**
 * The printed source as the layout check reads it: each stanza's lines, the
 * refrain's items (`undefined` when it has none), and where `refrains.json`
 * has the refrain sung.
 */
export interface PrintedLayout {
  readonly stanzas: ReadonlyArray<readonly PrintedLine[]>;
  readonly refrain: readonly RefrainItem[] | undefined;
  readonly order: Order | undefined;
}

/** A token that ends a sentence: `.`, `!` or `?`, and any closing quote or bracket after it. */
const SENTENCE_END = /[.!?]["”’)]*$/u;
/** A token that opens a quote or a bracket. */
const QUOTE_OPEN = /^["“‘(]/u;

/**
 * The lines of one text block as printed (a stanza, a refrain's run), each
 * word marked where the source opens a sentence on it (the block's first
 * word, a word after one that ends `.`, `!` or `?`, and a word that opens a
 * quote: the page capitalises such a word wherever it falls in a row).
 */
export const linesOf = (texts: readonly string[]): PrintedLine[] => {
  let open = true;
  return texts.map((text) => {
    const read = lineRead(text, open);
    open = read.open;
    return read.line;
  });
};

/** Each line read so far, by whether a sentence is open as it starts and its text. */
const lineReads = new Map<string, { readonly line: PrintedLine; readonly open: boolean }>();

/** One line of a block (`linesOf`), read with a sentence open or not as it starts: its marks, and whether one is open as it ends. */
const lineRead = (text: string, opening: boolean) => {
  const key = `${opening ? 1 : 0}${text}`;
  const known = lineReads.get(key);
  if (known !== undefined) return known;
  let open = opening;
  const [words, sentences]: [string[], boolean[]] = [[], []];
  for (const token of text.split(/\s+/u)) {
    if (token === '') continue;
    const these = wordsOf(token);
    for (const [k, word] of these.entries()) {
      words.push(word);
      sentences.push(k === 0 && (open || QUOTE_OPEN.test(token)));
    }
    if (these.length > 0 || SENTENCE_END.test(token)) open = SENTENCE_END.test(token);
  }
  const read = { line: { words, sentences, indent: /^\s/u.test(text) }, open };
  lineReads.set(key, read);
  return read;
};

/**
 * Whether a token of a line is written with a capital inside it: not first
 * in its line, after a token that ends no sentence, clause or quote (`.`,
 * `!`, `?`, `:`, `;`, a quote mark), opening no quote itself.
 */
const midCapital = (token: string, before: string | undefined) =>
  before !== undefined &&
  !/[.!?:;"“]$/u.test(before) &&
  !QUOTE_OPEN.test(token) &&
  /^\p{Lu}/u.test(token.replace(/^['’]/u, ''));

/** A row's text as its lines, its blank lines left out. */
const textLines = (text: string) => text.split('\n').filter((line) => line.trim() !== '');

/** A refrain item as text: a line every stanza sings, or a part that varies by stanza (the lines sung after the stanzas it names). */
export type RefrainText =
  | string
  | {
      readonly varies: ReadonlyArray<{
        readonly after: readonly number[];
        readonly lines: readonly string[];
      }>;
    };

/**
 * The printed source as text, before the census reads it (`readText`): each
 * stanza's lines, the refrain's items (`undefined` when it has none), and
 * where `refrains.json` has the refrain sung. The layout mutations change
 * this text, and the census reads each mutant from it as it reads a row.
 */
export interface PrintedText {
  readonly stanzas: ReadonlyArray<readonly string[]>;
  readonly refrain: readonly RefrainText[] | undefined;
  readonly order: Order | undefined;
}

/**
 * The printed source the fidelity oracle reads, as text: the fix file when
 * there is one, else the row (its stanzas by id, its refrain verses in id
 * order, -1 first); `order` is where `refrains.json` has its refrain sung.
 */
export const printedTextOf = (
  row: Verses,
  fix: Fix | undefined,
  order: Order | undefined,
): PrintedText => {
  if (fix !== undefined)
    return {
      stanzas: fix.stanzas.map((lines) => lines.map((line) => line.text)),
      refrain:
        fix.refrain === undefined
          ? undefined
          : fix.refrain.lines.map((item) =>
              'varies' in item
                ? {
                    varies: item.varies.map((part) => ({
                      after: part.after,
                      lines: part.lines.map((line) => line.text),
                    })),
                  }
                : item.text,
            ),
      order,
    };
  const refrain = row
    .filter((verse) => verse.id < 0)
    .toSorted((a, b) => b.id - a.id)
    .flatMap((verse) => textLines(verse.text));
  return {
    stanzas: row
      .filter((verse) => verse.id >= 0)
      .toSorted((a, b) => a.id - b.id)
      .map((verse) => textLines(verse.text)),
    refrain: refrain.length > 0 ? refrain : undefined,
    order,
  };
};

/** Each block of text read so far (`linesOf`), by the array's identity: a mutant keeps the blocks it leaves alone. */
const blocks = new WeakMap<readonly string[], readonly PrintedLine[]>();

const blockOf = (texts: readonly string[]): readonly PrintedLine[] => {
  const known = blocks.get(texts);
  if (known !== undefined) return known;
  const lines = linesOf(texts);
  blocks.set(texts, lines);
  return lines;
};

/** Each refrain read so far, by its items' identity. */
const refrains = new WeakMap<readonly RefrainText[], readonly RefrainItem[]>();

/** A refrain's items as printed: its shared lines one block, each varying part its own. */
const refrainItemsOf = (items: readonly RefrainText[]): readonly RefrainItem[] => {
  const known = refrains.get(items);
  if (known !== undefined) return known;
  const shared = linesOf(items.flatMap((item) => (Predicate.isString(item) ? [item] : [])));
  let k = 0;
  const read = items.map((item): RefrainItem => {
    if (!Predicate.isString(item))
      return {
        varies: item.varies.map((part) => ({ after: part.after, lines: blockOf(part.lines) })),
      };
    k += 1;
    return shared[k - 1] ?? { words: [], sentences: [], indent: false };
  });
  refrains.set(items, read);
  return read;
};

/**
 * The printed source as the layout check reads it: each stanza one block of
 * lines, the refrain's shared lines one block and each varying part its own
 * (`linesOf` marks a sentence's opening across the lines of one block). The
 * census reads every row through this, and the layout mutations read every
 * mutant through it, so a mutant's marks are the ones its text gives.
 */
export const readText = (text: PrintedText): PrintedLayout => ({
  stanzas: text.stanzas.map(blockOf),
  refrain: text.refrain === undefined ? undefined : refrainItemsOf(text.refrain),
  order: text.order,
});

/**
 * The printed source the fidelity oracle reads, as lines (`readText` of
 * `printedTextOf`).
 */
export const layoutOf = (
  row: Verses,
  fix: Fix | undefined,
  order: Order | undefined,
): PrintedLayout => {
  const made = layouts.get(row) ?? [];
  layouts.set(row, made);
  const found = made.find((one) => one.fix === fix && one.order === order);
  if (found !== undefined) return found.layout;
  const layout = readText(printedTextOf(row, fix, order));
  made.push({ fix, order, layout });
  return layout;
};

/** Each row's printed layouts made so far, by the fix and order they were made with (the same objects give the same layout). */
const layouts = new WeakMap<
  Verses,
  Array<{
    readonly fix: Fix | undefined;
    readonly order: Order | undefined;
    readonly layout: PrintedLayout;
  }>
>();

/** The refrain lines sung after stanza `i` (1-based): every shared line, and the varying part written for it. */
export const refrainAfter = (layout: PrintedLayout, i: number): readonly PrintedLine[] =>
  (layout.refrain ?? []).flatMap((item) =>
    'varies' in item ? (item.varies.find((part) => part.after.includes(i))?.lines ?? []) : [item],
  );

/** The stanza groups each varying part of the refrain follows, each sorted. */
const variesOf = (layout: PrintedLayout) =>
  (layout.refrain ?? []).flatMap((item) =>
    'varies' in item ? item.varies.map((part) => [...part.after].toSorted((a, b) => a - b)) : [],
  );

/** Where the printed source sings its refrain: `refrains.json`'s order, else after each stanza (a fix that writes it with each), else none. */
const sourceOrderOf = (layout: PrintedLayout): Order | undefined =>
  layout.refrain === undefined ? undefined : (layout.order ?? 'after-each');

/** Whether two words are at most one edit apart: one letter changed, added or left out. */
const oneEdit = (a: string, b: string) => {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (long.length - short.length > 1) return false;
  let i = 0;
  while (i < short.length && short[i] === long[i]) i++;
  // Past the first difference the rest agree: after one change, or one letter of the longer skipped.
  return short.length === long.length
    ? short.slice(i + 1) === long.slice(i + 1)
    : short.slice(i) === long.slice(i + 1);
};

/**
 * Where an anchor (a row's first or last words) stands in `words` at or after
 * `from`: the words there spell it letter for letter, or one letter off when
 * it has four letters or more (a reader's slip on one letter is the word
 * census's business, not the shape's), over as many words or one more or
 * fewer (`heart ache` against `heartache`), or the tail of the first word or
 * the head of the last (`stead of` against `instead of`: a word split alone
 * is no difference, as in the word runs); the exact spelling a word on wins
 * over a near one.
 */
const spellsAt = (text: Text, anchor: Anchor, at: number, near: boolean): number | undefined => {
  const n = anchor.words.length;
  for (const length of [n, n + 1, n - 1])
    if (
      length >= 1 &&
      at >= 0 &&
      at + length <= text.words.length &&
      spellsOver(text, anchor, at, length, near)
    )
      return length;
  return undefined;
};

/** Whether the `length` words at `at` spell the anchor (`spellsAt`). */
const spellsOver = (text: Text, anchor: Anchor, at: number, length: number, near: boolean) => {
  const { words, joined, off } = text;
  const want = anchor.joined;
  const [head, tail] = [words[at]?.length ?? 0, words[at + length - 1]?.length ?? 0];
  // Letters to spare: none for an exact spelling, one for a near one, less
  // than the first or last word's for a split one.
  const spare = (off[at + length] ?? 0) - (off[at] ?? 0) - want.length;
  if (spare < -1 || (spare > 1 && spare >= head && spare >= tail)) return false;
  const [from, to] = [off[at] ?? 0, off[at + length] ?? 0];
  if (spare >= 0 && spellsWhole(joined, want, from, to, spare < head, spare < tail)) return true;
  return near && want.length >= 4 && spare <= 1 && oneEdit(joined.slice(from, to), want);
};

/**
 * Whether the run `from`..`to` of `joined` spells `want` exactly, or holds
 * it as a word split alone (`in stead` against `instead`): the anchor the
 * tail of the run's first word (`head`, its letters to spare fewer than
 * that word's) or the head of its last (`tail`). Read in place, with no copy
 * of the run.
 */
const spellsWhole = (
  joined: string,
  want: string,
  from: number,
  to: number,
  head: boolean,
  tail: boolean,
) =>
  (to - from === want.length && joined.startsWith(want, from)) ||
  (head && joined.startsWith(want, to - want.length)) ||
  (tail && joined.startsWith(want, from));

/** Words as the anchors are sought in them: the words, run together, and where each word starts in the run (and one past the last). */
interface Text {
  readonly words: readonly string[];
  readonly joined: string;
  readonly off: readonly number[];
}

export const textOf = (words: readonly string[]): Text => {
  const off = [0];
  for (const word of words) off.push((off.at(-1) ?? 0) + word.length);
  return { words, joined: words.join(''), off };
};

/** An anchor's words, and run together. */
interface Anchor {
  readonly words: readonly string[];
  readonly joined: string;
}

const anchorOf = (text: string): Anchor => {
  const words = wordsOf(text);
  return { words, joined: words.join('') };
};

const anchors = new WeakMap<OutlineRow, { first: Anchor; mid: Anchor; last: Anchor }>();

/** A row's three anchors, read once. */
const anchorsOf = (row: OutlineRow) => {
  const known = anchors.get(row);
  if (known !== undefined) return known;
  const found = { first: anchorOf(row.first), mid: anchorOf(row.mid), last: anchorOf(row.last) };
  anchors.set(row, found);
  return found;
};

/**
 * How far a row's place may stand from where the counts put it: a blind
 * count can be one off where the page elides or splits a word (`heav'n`,
 * `in stead`). A line may hold one word (20 of the committed stanza lines,
 * in 13 hymns): a one-word line dropped, repeated or put in moves a row's
 * anchors a word, within the slack, so the property lists each such mutant
 * the page cannot tell apart (`unreachable`) or the check misses (`gaps`).
 */
const SLACK = 1;

/**
 * Each place in `lo`..`hi` where an anchor stands: its first word's place,
 * or, `end`, one past its last word's. Exact spellings, else near ones.
 */
const placesOf = (text: Text, anchor: Anchor, lo: number, hi: number, end: boolean): number[] => {
  const n = anchor.words.length;
  if (n === 0) return [];
  for (const near of [false, true]) {
    const found: number[] = [];
    for (let at = Math.max(0, end ? lo - n - 1 : lo); at <= hi && at < text.words.length; at++) {
      const length = spellsAt(text, anchor, at, near);
      if (length === undefined) continue;
      const place = end ? at + length : at;
      if (place >= lo && place <= hi && !found.includes(place)) found.push(place);
    }
    if (found.length > 0) return found;
  }
  return [];
};

/** No place: the anchor stands nowhere in reach. */
const NONE = -1;
/** Two places: the anchor stands at more than one in reach, none where the counts put it. */
const TWO = -2;

/** The one place an anchor stands at: where the counts put it when it stands there, else its only place; else `NONE` or `TWO`. */
const oneOf = (places: readonly number[], want: number): number =>
  places.includes(want)
    ? want
    : places.length === 1
      ? (places[0] ?? want)
      : places.length === 0
        ? NONE
        : TWO;

/**
 * Where an anchor stands about `want`: within `SLACK` of it, else anywhere
 * in `lo`..`hi` (a slip of the reader's moves only its own row); never
 * before `lo` (a row never opens inside the row before it).
 */
const seek = (
  text: Text,
  anchor: Anchor,
  want: number,
  [lo, hi]: readonly [number, number],
  end: boolean,
  slack = SLACK,
) => {
  const near = oneOf(placesOf(text, anchor, Math.max(lo, want - slack), want + slack, end), want);
  return near === NONE ? oneOf(placesOf(text, anchor, lo, hi, end), want) : near;
};

/** The problem with an anchor sought at `want` and found at `place` (`''` when it stands within `slack` of it). */
const anchorLine = (what: string, anchor: Anchor, want: number, place: number, slack = SLACK) =>
  place >= 0 && Math.abs(place - want) <= slack
    ? ''
    : place >= 0
      ? `${what} ${quoted(anchor.words)} at word ${place + 1}, its count gives word ${want + 1}`
      : `${what} ${quoted(anchor.words)} at ${place === TWO ? 'two places' : 'no place'} its count gives`;

/**
 * Where one row stands in the words sung: its first word and one past its
 * last; `anchored` when its first and last words stand at their places;
 * `sure` when they stand where its count puts them too; `held` when its last
 * words stand at its end (the row after it opens there, no word between);
 * `middle` the word of its count its middle words open on, `middleAt` the
 * place they stand at (`NONE` when they stand at none, or at two).
 */
interface Placed {
  readonly start: number;
  readonly end: number;
  readonly anchored: boolean;
  readonly sure: boolean;
  readonly held: boolean;
  readonly middle: number;
  readonly middleAt: number;
}

/**
 * How far word `c` of an anchored row may stand from where its first word
 * puts it: none when the row is sure; when its count is one off where the
 * page elides or splits a word, none before the slip and the row's whole
 * slip after it. Its first word opens where its first words were found (its
 * last word may open one before its last words end: a word the page breaks
 * over two systems, `For-` `get`, is one word of the row and two sung); its
 * middle words, found at their place, say on which side of them the slip
 * lies: a word on the other side stands off by one amount.
 */
const offsetsOf = (one: Placed, count: number, c: number): readonly number[] => {
  const slip = one.end - one.start - count;
  if (c === 1) return [0];
  const atMiddle = one.middleAt - (one.start + one.middle - 1);
  const known = one.middleAt >= 0 && (atMiddle === 0 || atMiddle === slip);
  if (!known) return [...new Set([0, slip])];
  if (c >= one.middle && c <= one.middle + 1) return [atMiddle];
  return c < one.middle ? [...new Set([0, atMiddle])] : [...new Set([atMiddle, slip])];
};

/**
 * Where word `c` of an anchored row stands in the words sung (`offsetsOf`):
 * one place when the row is sure, or the slip's side is known; else two, the
 * place its first word counts and the place its last word counts, each
 * inside the row.
 */
const wordPlaces = (one: Placed, count: number, c: number): readonly number[] =>
  offsetsOf(one, count, c)
    .map((off) => one.start + c - 1 + off)
    .filter((at) => one.start <= at && at < one.end);

/** The word numbers of an anchored row that may stand at `at` (`wordPlaces`). */
const wordsAt = (one: Placed, count: number, at: number): readonly number[] => {
  const slip = one.end - one.start - count;
  const atMiddle = one.middleAt >= 0 ? one.middleAt - (one.start + one.middle - 1) : 0;
  return [...new Set([0, slip, atMiddle].map((off) => at - one.start + 1 - off))].filter(
    (c) => c >= 1 && c <= count && wordPlaces(one, count, c).includes(at),
  );
};

/**
 * One row placed from `pos`: its span, and its anchors' problems. After a
 * row whose last words were found (`held`), it opens at `pos` itself: a word
 * between the two is in no row.
 */
const placeRow = (text: Text, row: OutlineRow, pos: number, held: boolean) => {
  const count = Math.max(1, row.words);
  const { first, last, mid } = anchorsOf(row);
  // Its first words, where the row before ends.
  const slack = held ? 0 : SLACK;
  const near = seek(text, first, pos, [pos, pos + count], false, slack);
  const start = near >= 0 ? near : pos;
  const opens = anchorLine('opens', first, pos, near, slack);
  // Its last words, its count later.
  const want = start + count;
  const to = seek(text, last, want, [start + 1, want + count], true);
  const end = to >= 0 ? to : want;
  const ends = anchorLine('ends', last, want, to);
  // Its middle words, half its count in.
  const middle = start + Math.floor(count / 2);
  const holds = oneOf(placesOf(text, mid, middle - SLACK, middle + SLACK, false), middle);
  const centre = holds >= 0 ? '' : anchorLine('holds its middle', mid, middle, holds);
  const anchored = opens === '' && ends === '';
  const placed: Placed = {
    start,
    end,
    anchored,
    sure: anchored && end - start === count,
    held: to >= 0,
    middle: Math.floor(count / 2) + 1,
    middleAt: holds >= 0 ? holds : NONE,
  };
  // One past the last word any search above may read: each `placesOf` reads
  // from its `lo` to its `hi` and an anchor's words (one more for a split
  // spelling) after it, whichever search it took.
  const reads =
    Math.max(
      pos + count + first.words.length,
      want + count + last.words.length,
      middle + SLACK + mid.words.length,
    ) + 2;
  return { placed, problems: [opens, centre, ends].filter((line) => line !== ''), reads };
};

/**
 * The page's rows placed in the words a stanza sings, in order, each span
 * fixed by its count: a row opens where the row before ends, ends its count
 * of words later, and holds its middle words at its middle place, each
 * within `SLACK`. An anchor not at its place is a problem line, and so is
 * one that stands at two places in reach, neither of them the place its
 * count gives (unresolved): an anchor that stands at its counted place is
 * found there, wherever else it stands (`oneOf`), since a phrase the hymn
 * repeats in reach would else leave a right row unplaced. A row
 * whose anchor is not at its place is placed by the one place of the anchor
 * within its count of words (a reader's slip moves only its own row), else
 * by its count, and the rows after it are placed and checked as before.
 *
 * A row's place reads only the words before its `reads` and the row before
 * it, so `kept` (a placement of the same rows in words that agree up to
 * where they first differ) gives the rows it placed with no search: each row
 * before the first one whose reads reach past the words that agree. Each
 * row's lines come as it is placed, so a caller that needs only the first
 * new one stops there.
 */
const placeRows = function* (
  what: string,
  text: Text,
  rows: ReadonlyArray<{ readonly label: string; readonly row: OutlineRow }>,
  kept: readonly RowPlaced[],
): Generator<string, RowPlaced[]> {
  const done: RowPlaced[] = [];
  for (const one of kept) {
    done.push(one);
    yield* one.lines;
  }
  for (let k = done.length; k < rows.length; k++) {
    const { label, row } = rows[k] ?? { label: '', row: undefined };
    if (row === undefined) break;
    const before = done[k - 1];
    const one = placeRow(text, row, before?.placed.end ?? 0, before?.placed.held ?? true);
    const lines = one.problems.map((line) => `${what}: ${label} ${line}`);
    const above = rows[k - 1];
    const [a, b] = [spanOff(before?.placed, above?.row), spanOff(one.placed, row)];
    if (above !== undefined && a !== 0 && b !== 0 && Math.sign(a) !== Math.sign(b))
      lines.push(
        `${what}: ${above.label} and ${label} span ${a > 0 ? '+' : ''}${a} and ${b > 0 ? '+' : ''}${b} words against their counts`,
      );
    done.push({ placed: one.placed, lines, reads: one.reads });
    yield* lines;
  }
  return done;
};

/** One row placed (`placeRows`): its span, its lines, and one past the last word its place reads. */
interface RowPlaced {
  readonly placed: Placed;
  readonly lines: readonly string[];
  readonly reads: number;
}

/**
 * How many words more (or fewer) a placed row spans than its count. One row
 * off is count noise (a compound the page splits); two neighbours off the
 * opposite ways are a word moved over the boundary between them.
 */
const spanOff = (placed: Placed | undefined, row: OutlineRow | undefined) =>
  placed === undefined || row === undefined
    ? 0
    : placed.end - placed.start - Math.max(1, row.words);

/**
 * The words stanza `i` (1-based) sings, the refrain after it, the place each
 * of its lines opens at, and for each word whether a sentence opens on it.
 */
const sungOf = (layout: PrintedLayout, i: number) => {
  const lines = [...(layout.stanzas[i - 1] ?? []), ...refrainAfter(layout, i)];
  const [words, opens, sentences]: [string[], number[], boolean[]] = [[], [], []];
  for (const line of lines) {
    opens.push(words.length);
    words.push(...line.words);
    sentences.push(...line.sentences);
  }
  return { words, opens, sentences, own: layout.stanzas[i - 1]?.length ?? 0 };
};

/**
 * The refrain rows the page prints for stanza `i` (those every stanza sings,
 * and those marked for it), and whether the page sings them before the
 * stanza's words or after them. A source that writes its refrain apart sings
 * it after each stanza here, as `sungOf` does (where it is sung is held
 * apart, order against order); a source that writes it inside its stanzas
 * sings it where the page's order has it: after each stanza, after the last
 * (`last`, the source's last stanza), before each, or before the first and
 * after each or after the last.
 */
const refrainRowsFor = (outline: Outline, i: number, apart: boolean, last: number) => {
  const rows = (outline.refrain?.rows ?? []).filter(
    (one) =>
      one.stanzas.length === 0 ||
      one.stanzas.length >= outline.stanzas.length ||
      one.stanzas.includes(i),
  );
  const order = apart ? 'after-each' : (outline.refrain?.order ?? 'after-each');
  const after =
    order === 'after-each' ||
    order === 'first-and-after-each' ||
    (i === last && (order === 'after-last' || order === 'first-and-last'));
  const before =
    order === 'before-each' ||
    (i === 1 && (order === 'first-and-after-each' || order === 'first-and-last'));
  return { before: before ? rows : [], after: after ? rows : [] };
};

/**
 * Stanza `i` against the page: its rows, then the refrain rows the page
 * prints for it, placed in what the source sings for it (`placeRows`); no
 * word sung after the last row; each line of the source opening on a word
 * the page prints with a capital (a poetic line opens on one: a line break
 * the page does not print is a word moved over a break, or a line split);
 * and a stanza printed as text below the music written in its printed lines.
 * `count` is how many of the source's lines open inside the stanza's own
 * rows (a refrain or an Amen the source writes inside the stanza left out).
 */
export interface StanzaCheck {
  readonly lines: readonly string[];
  readonly count: number;
}

/** Stanza `i`'s rows placed in the words it sings (`placeRows`): it reads the words alone, never where the lines break. */
export interface Placement {
  readonly rows: ReadonlyArray<{ readonly label: string; readonly row: OutlineRow }>;
  readonly placed: readonly Placed[];
  readonly lines: readonly string[];
  /** Where the stanza's own rows stand among `rows`. */
  readonly ownAt: readonly number[];
  /** The words placed in, and each row as `placeRows` placed it. */
  readonly words: readonly string[];
  readonly each: readonly RowPlaced[];
}

/** Whether two placements place the same rows: each the same reading's row under the same label. */
const sameRows = (a: Placement['rows'], b: Placement['rows']) =>
  a.length === b.length && a.every((one, k) => one.row === b[k]?.row && one.label === b[k]?.label);

/** Where two runs of words first differ (the shorter's length when one opens the other). */
const firstDiffering = (a: readonly string[], b: readonly string[]) => {
  const n = Math.min(a.length, b.length);
  for (let k = 0; k < n; k++) if (a[k] !== b[k]) return k;
  return n;
};

/** Stanza `i`'s placement (`placing`), all of it. */
export const placementOf = (
  what: string,
  outline: Outline,
  layout: PrintedLayout,
  i: number,
  known?: Placement,
): Placement => {
  const run = placing(what, outline, layout, i, known);
  for (let one = run.next(); ; one = run.next()) if (one.done === true) return one.value;
};

/**
 * Stanza `i`'s rows placed in the words it sings, each line as it is found,
 * the placement at the end. `known`, a placement of the same rows in other
 * words (the hymn as committed, where a mutant changes one stanza), gives
 * the rows its words agree on (`placeRows`), and the whole of it when the
 * words are the same (a line break moved moves no word).
 */
export const placing = function* (
  what: string,
  outline: Outline,
  layout: PrintedLayout,
  i: number,
  known?: Placement,
): Generator<string, Placement> {
  const { words } = sungOf(layout, i);
  const stanzaRows = outline.stanzas[i - 1]?.rows ?? [];
  const refrain = refrainRowsFor(outline, i, layout.refrain !== undefined, layout.stanzas.length);
  const own = stanzaRows.map((row, r) => ({ label: `stanza ${i} row ${r + 1}`, row }));
  const after = refrain.after.map((row, r) => ({
    label: `the refrain after stanza ${i}: row ${r + 1}`,
    row,
  }));
  // A refrain the page prints inside the stanza's run of systems, and the
  // source writes inside each stanza, is sung where its systems stand.
  const inside = outline.refrain?.at === 'inside' && layout.refrain === undefined;
  const rows = [
    ...refrain.before.map((row, r) => ({
      label: `the refrain before stanza ${i}: row ${r + 1}`,
      row,
    })),
    ...(inside
      ? [...own, ...after].toSorted((a, b) => a.row.system - b.row.system)
      : [...own, ...after]),
  ];
  const text = textOf(words);
  const kept = keptOf(known, rows, words);
  const each = yield* placeRows(what, text, rows, kept);
  const lines = each.flatMap((one) => one.lines);
  const end = each.at(-1)?.placed.end ?? 0;
  // A word sung after the last row is in no row, unless an extra row of the
  // page (an Amen printed apart, sung after the last stanza) stands there.
  const tail = words.length - end;
  if (
    tail > 0 &&
    !(
      i === layout.stanzas.length &&
      outline.extra.some((extra) =>
        spansOf(text, extra).some((span) => span.start === end && span.end === words.length),
      )
    )
  ) {
    const line = `${what}: stanza ${i} sings ${tail} words from ${quoted(words.slice(end, end + 2))} on, in no row the page prints`;
    lines.push(line);
    yield line;
  }
  const labels = new Set(own.map((one) => one.label));
  const ownAt = rows.flatMap((one, k) => (labels.has(one.label) ? [k] : []));
  return { rows, placed: each.map((one) => one.placed), lines, ownAt, words, each };
};

/**
 * The rows of `known` a placement in `words` keeps (`placeRows`): every
 * row when the words are the same, else each row before the first whose
 * reads reach the first word that differs; none for other rows.
 */
const keptOf = (
  known: Placement | undefined,
  rows: Placement['rows'],
  words: readonly string[],
): readonly RowPlaced[] => {
  if (known === undefined || !sameRows(known.rows, rows)) return [];
  const differs = firstDiffering(known.words, words);
  if (differs === words.length && differs === known.words.length) return known.each;
  const stop = known.each.findIndex((one) => one.reads > differs);
  return stop < 0 ? known.each : known.each.slice(0, stop);
};

/** The named metres the 1985 book prints, as syllables a line. */
const NAMED_METRES = new Map<string, readonly number[]>([
  ['CM', [8, 6, 8, 6]],
  ['LM', [8, 8, 8, 8]],
  ['SM', [6, 6, 8, 6]],
]);

/**
 * The syllables each line of a stanza sings by the metre the page prints
 * (`8.7.8.7.D.`, `C.M.`, a `Ref.` or Alleluias after it left out): its
 * numbers, twice over for a `D.`; `undefined` for none, or one with no numbers
 * (`Irregular`).
 */
export const metreOf = (printed: string | null): readonly number[] | undefined => {
  if (printed === null) return undefined;
  const text = printed
    .replace(/\s+/g, '')
    .replace(/(withRefrain|Refrain|Ref\.?|Alleluias?|Amens?)$/i, '');
  const double = /\.?D\.?$/.test(text);
  const body = (double ? text.replace(/\.?D\.?$/, '') : text).replace(/\.$/, '');
  const named = NAMED_METRES.get(body.replace(/\./g, ''));
  const base = named ?? (/^\d+(\.\d+)*$/.test(body) ? body.split('.').map(Number) : undefined);
  return base === undefined ? undefined : double ? [...base, ...base] : base;
};

const syllableMemo = new Map<string, readonly [number, number]>();

/** The fewest and the most syllables a word may be sung in. */
const syllablesOf = (word: string): readonly [number, number] => {
  const known = syllableMemo.get(word);
  if (known !== undefined) return known;
  const all = counts(word);
  const found =
    all.length === 0 ? ([0, 0] as const) : ([Math.min(...all), Math.max(...all)] as const);
  syllableMemo.set(word, found);
  return found;
};

/**
 * The syllables each of `k` lines sings by the metre the page prints: its
 * groups when the lines are as many, twice over when twice as many (a line a
 * group), two groups a line when half as many; `undefined` when they are
 * otherwise many.
 */
const metreFor = (k: number, metre: readonly number[]): readonly number[] | undefined =>
  k === metre.length
    ? metre
    : k === metre.length * 2
      ? [...metre, ...metre]
      : k * 2 === metre.length
        ? Array.from({ length: k }, (_, j) => (metre[2 * j] ?? 0) + (metre[2 * j + 1] ?? 0))
        : undefined;

/** The fewest and the most syllables a line may be sung in. */
const lineSyllables = (line: PrintedLine): readonly [number, number] => {
  let [lo, hi] = [0, 0];
  for (const word of line.words) {
    const [fewest, most] = syllablesOf(word);
    lo += fewest;
    hi += most;
  }
  return [lo, hi];
};

/**
 * A stanza's lines against the metre the page prints (`metreFor`): each
 * line's syllables, fewest to most, hold its group's number or miss it by so
 * many. A word moved over a line break leaves two neighbouring lines missing
 * it the opposite ways; each such pair is a line. A line that misses alone
 * (a syllable the counts read otherwise, an elision) is none.
 */
const metreLines = (
  what: string,
  i: number,
  lines: readonly PrintedLine[],
  metre: readonly number[],
) => {
  const want = metreFor(lines.length, metre);
  if (want === undefined) return [];
  const miss = lines.map(lineSyllables).map(([lo, hi], j) => {
    const m = want[j] ?? 0;
    return m < lo ? lo - m : m > hi ? hi - m : 0;
  });
  const found: string[] = [];
  for (let j = 0; j + 1 < lines.length; j++) {
    const [a, b] = [miss[j] ?? 0, miss[j + 1] ?? 0];
    if (a !== 0 && b !== 0 && Math.sign(a) !== Math.sign(b))
      found.push(
        `${what}: stanza ${i} lines ${j + 1} and ${j + 2} sing ${a > 0 ? '+' : ''}${a} and ${b > 0 ? '+' : ''}${b} syllables against the metre the page prints`,
      );
  }
  return found;
};

/**
 * Each stanza whose count of lines the metre the page prints fits in no way
 * (`metreFor`), where another stanza's fits: a line joined to the next, or
 * one split in two.
 */
const metreCountLines = (what: string, outline: Outline, layout: PrintedLayout) => {
  const metre = metreOf(outline.metre);
  if (metre === undefined) return [];
  const fits = layout.stanzas.map((lines) => metreFor(lines.length, metre) !== undefined);
  const fitting = fits.indexOf(true);
  if (fitting < 0) return [];
  return fits.flatMap((fit, k) =>
    fit
      ? []
      : [
          `${what}: stanza ${k + 1} has ${layout.stanzas[k]?.length ?? 0} lines, which the metre the page prints fits in no way, where stanza ${fitting + 1}'s ${layout.stanzas[fitting]?.length ?? 0} fit it`,
        ],
  );
};

/**
 * Stanza `i`'s check, its rows placed by `placement` (given when the words
 * it sings are the ones already placed: a line break moved moves no word).
 */
export const stanzaCheckOf = (
  what: string,
  outline: Outline,
  layout: PrintedLayout,
  i: number,
  book: ReadonlySet<string>,
  placement: Placement = placementOf(what, outline, layout, i),
): StanzaCheck => {
  const sung = sungOf(layout, i);
  const { opens, own } = sung;
  const { rows, placed } = placement;
  const stanzaRows = outline.stanzas[i - 1]?.rows ?? [];
  const lines = [...placement.lines];
  for (const [k, open] of opens.entries()) {
    const r = placed.findIndex((one) => one.anchored && one.start <= open && open < one.end);
    const [row, one] = [rows[r]?.row, placed[r]];
    if (row === undefined || one === undefined) continue;
    const places = wordsAt(one, Math.max(1, row.words), open);
    if (places.length > 0 && places.every((place) => !row.capitals.includes(place)))
      lines.push(
        `${what}: stanza ${i} line ${k + 1} opens on word ${places[0] ?? 0} of ${rows[r]?.label ?? ''}, which the page prints with no capital`,
      );
  }
  lines.push(...unopenedCapitals(what, i, placement, sung, book));
  const ownRows = placement.ownAt.flatMap((k) => placed[k] ?? []);
  const inside = opens.filter((open) => ownRows.some((one) => one.start <= open && open < one.end));
  if (stanzaRows.length > 0 && stanzaRows.every((row) => row.system === 0)) {
    const starts = new Set(ownRows.map((one) => one.start));
    if (own !== stanzaRows.length || inside.some((open) => !starts.has(open)))
      lines.push(
        `${what}: stanza ${i} is printed as ${stanzaRows.length} lines of text, the printed source writes ${own} other lines`,
      );
  }
  const metre = metreOf(outline.metre);
  if (metre !== undefined) lines.push(...metreLines(what, i, layout.stanzas[i - 1] ?? [], metre));
  return { lines, count: inside.length };
};

/**
 * Each capital the page prints inside an anchored row where the source opens
 * no line and no sentence, on a word the page does not capitalise wherever
 * it falls (`book`, `capitalsOf`), at every place the word may stand
 * (`wordPlaces`): the page opens a line there that the source runs on. A
 * source that writes the word with a capital there excuses nothing: two
 * lines joined keep the second's capital, so a row that writes two poem
 * lines as one is a line here, settled by a `layout` ruling on crops.
 */
const unopenedCapitals = (
  what: string,
  i: number,
  placement: Placement,
  sung: {
    readonly words: readonly string[];
    readonly opens: readonly number[];
    readonly sentences: readonly boolean[];
  },
  book: ReadonlySet<string>,
) => {
  const opens = new Set(sung.opens);
  return placement.placed.flatMap((one, r) => {
    const row = placement.rows[r];
    if (!one.anchored || row === undefined) return [];
    const opened = (at: number) =>
      opens.has(at) || sung.sentences[at] === true || book.has(sung.words[at] ?? '');
    return row.row.capitals.flatMap((c) => {
      const places = wordPlaces(one, Math.max(1, row.row.words), c);
      return places.length === 0 || places.some(opened)
        ? []
        : [
            `${what}: ${row.label} prints word ${c} with a capital inside a line of stanza ${i}, where no line or sentence opens`,
          ];
    });
  });
};

/** Two stanzas the page prints under the same systems (no text stanza among them) open as many lines in their own rows. */
const sameSystemsLines = (what: string, outline: Outline, checks: readonly StanzaCheck[]) => {
  const systemsOf = (k: number) =>
    (outline.stanzas[k]?.rows ?? []).map((row) => row.system).join(',');
  const first = checks[0]?.count ?? 0;
  if (systemsOf(0).split(',').includes('0')) return [];
  return checks.flatMap((check, k) =>
    k > 0 && systemsOf(k) === systemsOf(0) && check.count !== first
      ? [
          `${what}: stanza ${k + 1} has ${check.count} lines, stanza 1 ${first}, under the same systems`,
        ]
      : [],
  );
};

/** The refrain against the page's: printed when the source has one, sung where the page has it, its varying rows a source's varies parts. */
const refrainLines = (what: string, outline: Outline, layout: PrintedLayout) => {
  const lines: string[] = [];
  const order = sourceOrderOf(layout);
  if (outline.refrain === null && order !== undefined)
    lines.push(`${what}: the page prints no refrain, the printed source has one`);
  if (outline.refrain !== null && order !== undefined && outline.refrain.order !== order)
    lines.push(
      `${what}: the page sings its refrain ${outline.refrain.order}, the printed source ${order}`,
    );
  const key = (group: readonly number[]) => group.join(', ');
  const parts = new Set(variesOf(layout).map(key));
  const unvaried = outlineVaries(outline).filter((group) => !parts.has(key(group)));
  if (unvaried.length > 0)
    lines.push(
      `${what}: the page prints refrain rows for stanzas ${unvaried.map((group) => `[${key(group)}]`).join(' and ')} only, and the printed source sings no varies part after them`,
    );
  return lines;
};

/** Each other row of the page, but an echo or a descant, sung somewhere in the source. */
const extraLines = (what: string, outline: Outline, layout: PrintedLayout) => {
  const rows = outline.extra.filter((extra) => !isEcho(extra));
  if (rows.length === 0) return [];
  const sung = Array.from({ length: layout.stanzas.length }, (_, k) => sungOf(layout, k + 1).words);
  return rows
    .filter((extra) => !sung.some((words) => spansOf(words, extra).length > 0))
    .map(
      (extra) =>
        `${what}: a row ${quoted(wordsOf(extra.first))} (${extra.why}) is in no part of the printed source`,
    );
};

/**
 * One shape reading against the printed source (its layout), on what is
 * sung: each stanza's words, then the refrain sung after it (a refrain the
 * row writes inside each stanza sings the same). The page prints as many
 * stanzas (a hymn that lends the rest of its stanzas from another prints no
 * more); each stanza against its rows (`stanzaShapeProblems`); two stanzas
 * the page prints under the same systems have as many lines; a refrain the
 * source writes apart is one the page prints, sung where the page has it
 * sung (`refrains.json`'s order); each group of refrain rows the page prints
 * for some stanzas only is a `varies` part of the source after those
 * stanzas (a part the page prints as each stanza's own rows sings the same,
 * and is checked as sung); and no other row the source lacks but an echo or
 * a descant. `known` gives a stanza already checked against this same
 * reading, these same stanza words and this refrain (a stanza's check
 * reads only them), taken as given, not checked again; `undefined` checks it.
 * The lines come one at a time, so a caller that needs only the first new
 * one stops there. A hymn under copyright has its quoted words cut from
 * every line (`"…"`): its anchors stay in `shapes.json`.
 */
export const layoutLinesIn = function* (
  ...args: Parameters<typeof layoutLinesRead>
): Generator<string> {
  const [n] = args;
  if (!UNDER_COPYRIGHT.has(n)) return yield* layoutLinesRead(...args);
  for (const line of layoutLinesRead(...args)) yield layoutLineAs(n, line);
};

/** A layout line of hymn `n` as the census prints it: its quoted words cut (`"…"`) for a hymn under copyright. */
export const layoutLineAs = (n: number, line: string) =>
  UNDER_COPYRIGHT.has(n) ? line.replace(/"[^"]*"/g, '"…"') : line;

const layoutLinesRead = function* (
  n: number,
  reading: Outline,
  layout: PrintedLayout,
  borrower: boolean,
  book: ReadonlySet<string>,
  known: (i: number) => StanzaCheck | undefined = () => undefined,
): Generator<string> {
  const outline = readAs(reading, layout);
  const what = `${n} shape (${outline.reader})`;
  const [page, source] = [outline.stanzas.length, layout.stanzas.length];
  if (borrower ? page > source : page !== source)
    yield `${what}: the page prints ${page} stanzas, the printed source ${source}`;
  const checks: StanzaCheck[] = [];
  for (let i = 1; i <= Math.min(page, source); i++) {
    const check = known(i) ?? stanzaCheckOf(what, outline, layout, i, book);
    checks.push(check);
    yield* check.lines;
  }
  yield* sameSystemsLines(what, outline, checks);
  yield* metreCountLines(what, outline, layout);
  yield* refrainLines(what, outline, layout);
  yield* extraLines(what, outline, layout);
};

/** Every line `layoutLinesIn` finds, in its order. */
export const layoutLinesOf = (...args: Parameters<typeof layoutLinesIn>): string[] => [
  ...layoutLinesIn(...args),
];

const asRefrain = new WeakMap<Outline, Outline>();

/**
 * A reading as the census holds it to a layout. A page that prints its
 * refrain first, numbered as stanza 1, and returns to it (D.C. al Fine) is
 * read with no refrain and one stanza more than the source; where the source
 * sings its refrain `first-and-after-each` and prints one stanza fewer, the
 * page's stanza 1 is that refrain, printed before the stanzas. Any other
 * reading is held as read. (The same reading gives the same object.)
 */
export const readAs = (outline: Outline, layout: PrintedLayout): Outline => {
  if (
    outline.refrain !== null ||
    sourceOrderOf(layout) !== 'first-and-after-each' ||
    outline.stanzas.length !== layout.stanzas.length + 1
  )
    return outline;
  const known = asRefrain.get(outline);
  if (known !== undefined) return known;
  const [first, ...rest] = outline.stanzas;
  const read: Outline = {
    ...outline,
    stanzas: rest,
    refrain: {
      label: null,
      at: 'before',
      order: 'first-and-after-each',
      rows: (first?.rows ?? []).map((row) => ({ ...row, stanzas: [] })),
    },
  };
  asRefrain.set(outline, read);
  return read;
};

/** Whether an extra row is an echo or a descant: words sung again over the main row, which the source may leave out. */
export const isEcho = (extra: Outline['extra'][number]) =>
  /echo|descant|parenthes/i.test(extra.why);

/**
 * Each place a row stands in `words`, as its first word and one past its
 * last: its first words there, its last words its count later, its middle
 * words half its count in, each within `SLACK`.
 */
export const spansOf = (sung: readonly string[] | Text, row: OutlineRow) => {
  const words = 'joined' in sung ? sung : textOf(sung);
  const count = Math.max(1, row.words);
  const { first, mid, last } = anchorsOf(row);
  const middle = Math.floor(count / 2);
  return placesOf(words, first, 0, words.words.length, false).flatMap((start) => {
    const end = placesOf(words, last, start + count - SLACK, start + count + SLACK, true)[0];
    return end !== undefined &&
      placesOf(words, mid, start + middle - SLACK, start + middle + SLACK, false).length > 0
      ? [{ start, end }]
      : [];
  });
};

/** Each shape reading's lines, by the row they were held to, with the rest of what they read. */
const heldLines = new WeakMap<
  Outline,
  WeakMap<
    Verses,
    Array<{
      readonly n: number;
      readonly fix: Fix | undefined;
      readonly borrower: boolean;
      readonly order: Order | undefined;
      readonly book: ReadonlySet<string>;
      readonly lines: readonly string[];
    }>
  >
>();

/**
 * One shape reading against a hymn's row and fix: `layoutLinesOf` over its
 * printed layout. The same reading held to the same row, fix, order and
 * book (the same objects) gives the lines found before: a census run with
 * one hymn changed checks that hymn again, and no other.
 */
export const outlineProblems = (
  n: number,
  outline: Outline,
  row: Verses,
  fix: Fix | undefined,
  borrower: boolean,
  order: Order | undefined,
  book: ReadonlySet<string>,
): string[] => {
  const byRow = heldLines.get(outline) ?? new WeakMap();
  heldLines.set(outline, byRow);
  const held = byRow.get(row) ?? [];
  byRow.set(row, held);
  const found = held.find(
    (one) =>
      one.n === n &&
      one.fix === fix &&
      one.borrower === borrower &&
      one.order === order &&
      one.book === book,
  );
  if (found !== undefined) return [...found.lines];
  const lines = layoutLinesOf(n, outline, layoutOf(row, fix, order), borrower, book);
  held.push({ n, fix, borrower, order, book, lines });
  return [...lines];
};

/** Each line of the printed source that opens with whitespace: the row format holds no indent. */
export const formatProblems = (n: number, layout: PrintedLayout): string[] => [
  ...layout.stanzas.flatMap((lines, s) =>
    lines.flatMap((line, k) =>
      line.indent ? [`${n} lines: stanza ${s + 1} line ${k + 1} opens with whitespace`] : [],
    ),
  ),
  ...(layout.refrain ?? []).flatMap((item, k) =>
    ('varies' in item ? item.varies.flatMap((part) => part.lines) : [item]).some(
      (line) => line.indent,
    )
      ? [`${n} lines: refrain item ${k + 1} opens with whitespace`]
      : [],
  ),
];

/** Whether a census line is a layout line of hymn `n`: its shape check's or its line format's. */
export const isLayoutLine = (n: number, line: string) =>
  line.startsWith(`${n} shape (`) || line.startsWith(`${n} lines: `);

/** What the checks read: all committed, and the base rows read from git. */
export interface Sources {
  readonly inventory: Inventory;
  /** Each hymn's hymnal.db row as committed. */
  readonly rows: ReadonlyMap<number, Verses>;
  /** Each hymn's row at the census's base commit, read from git. */
  readonly base: ReadonlyMap<number, Verses>;
  readonly fixes: ReadonlyMap<number, Fix>;
  readonly rulings: ReadonlyMap<number, readonly Ruling[]>;
  /** Each crop's frame size and digest (`RulingCrop.sha`), by `NNN/<file>`. */
  readonly crops: ReadonlyMap<
    string,
    { readonly width: number; readonly height: number; readonly sha: string }
  >;
  readonly photos: ReadonlyMap<string, Uint8Array>;
  /** Each hymn's shape readings (`data/shapes.json`). */
  readonly outlines: ReadonlyMap<number, readonly Outline[]>;
  /** Where each refrain hymn's row has its refrain sung (`data/fixes/refrains.json`). */
  readonly orders: ReadonlyMap<number, Order>;
  /** The hymns with a fix file at the census's base commit, read from git. */
  readonly baseFixes: readonly number[];
  /** Each hymn's words the page capitalises wherever they fall (`capitalsOf`). */
  readonly capitals: ReadonlyMap<number, ReadonlySet<string>>;
}

/** Counts each word of a row line by its places inside the line: capitalised, then not (`midCapital`). */
const tallyLine = (counts: Map<string, [number, number]>, line: string) => {
  let before: string | undefined;
  for (const token of line.split(/\s+/u)) {
    if (token === '') continue;
    const inside = before !== undefined && !/[.!?:;"“]$/u.test(before) && !QUOTE_OPEN.test(token);
    if (inside)
      for (const word of wordsOf(token)) {
        const count = counts.get(word) ?? [0, 0];
        count[midCapital(token, before) ? 0 : 1] += 1;
        counts.set(word, count);
      }
    before = token;
  }
};

/**
 * Each hymn's words the page capitalises wherever they fall, so that such a
 * capital inside a row opens no line: a word the committed rows write with a
 * capital in at least half of their places inside a line (a name of God,
 * `I`, `O`, `Thee`), and a word the hymn's own row writes so in at least half
 * of its places inside a line (`You` addressed to God in a hymn that always
 * capitalises it). A place inside a line is one `midCapital` reads: not first
 * in its line, after no `.`, `!`, `?`, `:`, `;` or quote mark, opening no
 * quote. A word capitalised in fewer of its places (`To` where a row writes
 * two poem lines as one) is no such word: its capital opens a line.
 */
export const capitalsOf = (
  rows: ReadonlyMap<number, Verses>,
): ReadonlyMap<number, ReadonlySet<string>> => {
  const tally = (counts: Map<string, [number, number]>, row: Verses) => {
    for (const verse of row) for (const line of verse.text.split('\n')) tallyLine(counts, line);
    return counts;
  };
  const mostly = (counts: Map<string, [number, number]>) =>
    [...counts].flatMap(([word, [capital, lower]]) => (capital >= lower ? [word] : []));
  const book = mostly([...rows.values()].reduce(tally, new Map()));
  return new Map(
    [...rows].map(([n, row]) => [n, new Set([...book, ...mostly(tally(new Map(), row))])]),
  );
};

/** A hymn's words the page capitalises wherever they fall (`capitalsOf`). */
export const bookOf = (sources: Sources, n: number): ReadonlySet<string> =>
  sources.capitals.get(n) ?? new Set();

/** The base row of a hymn: its row at the base commit, read from git. */
export const baseOf = (sources: Sources, n: number): Verses => sources.base.get(n) ?? [];

// ----------------------------------------------------------------------------
// The photos and the crops
// ----------------------------------------------------------------------------

/** The orientation tags (0x0112) of an EXIF segment's first IFD, its TIFF header at `tiff`. */
const orientationsAt = (view: DataView, tiff: number): number[] => {
  const little = view.getUint8(tiff) === 0x49;
  const ifd = tiff + view.getUint32(tiff + 4, little);
  const count = view.getUint16(ifd, little);
  const found: number[] = [];
  for (let k = 0; k < count; k++) {
    const entry = ifd + 2 + k * 12;
    if (view.getUint16(entry, little) === 0x0112) found.push(view.getUint16(entry + 8, little));
  }
  return found;
};

/** A start-of-frame marker: C0-CF but DHT (C4), JPG (C8) and DAC (CC). */
const isFrame = (marker: number) =>
  marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);

/** A JPEG's frame size and EXIF orientations, read segment by segment up to the scan. */
export const jpegHeader = (bytes: Uint8Array) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let frame: { readonly width: number; readonly height: number } | undefined;
  const orientations: number[] = [];
  let at = 2;
  while (at + 4 <= bytes.length && bytes[at] === 0xff) {
    const marker = bytes[at + 1] ?? 0;
    if (marker === 0xd9 || marker === 0xda) break;
    const body = at + 4;
    if (isFrame(marker))
      frame = { height: view.getUint16(body + 1), width: view.getUint16(body + 3) };
    if (marker === 0xe1 && String.fromCharCode(...bytes.subarray(body, body + 4)) === 'Exif')
      orientations.push(...orientationsAt(view, body + 6));
    at = body + view.getUint16(at + 2) - 2;
  }
  return { frame, orientations };
};

/**
 * Why a photo cannot stand as an upright page, or undefined: it is a JPEG
 * whose frame (its SOF segment) is taller than wide, and whose EXIF carries
 * no orientation but 1, so no viewer turns it.
 */
export const photoProblem = (bytes: Uint8Array): string | undefined => {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return 'not a JPEG';
  const { frame, orientations } = jpegHeader(bytes);
  if (frame === undefined) return 'no frame';
  if (frame.height <= frame.width) return `stored sideways (${frame.width}x${frame.height})`;
  const turned = orientations.find((o) => o !== 1);
  return turned === undefined ? undefined : `EXIF orientation ${turned}`;
};

/** Each committed photo that would not show upright, or whose long side is not 3024. */
const photoProblems = (photos: ReadonlyMap<string, Uint8Array>): string[] =>
  [...photos].flatMap(([name, bytes]) => {
    const frame = jpegHeader(bytes).frame;
    const why =
      photoProblem(bytes) ??
      (frame !== undefined && Math.max(frame.width, frame.height) !== 3024
        ? `long side ${Math.max(frame.width, frame.height)}, not 3024`
        : undefined);
    return why === undefined ? [] : [`photo ${name} ${why}`];
  });

// ----------------------------------------------------------------------------
// The checks
// ----------------------------------------------------------------------------

/** What the rulings make of a hymn: its state, and the row its rulings give. */
export interface Derived {
  readonly row: Entry['row'];
  /** The state its words alone give: `row`, but for a `disputed` ruling, which leaves the words as they are. */
  readonly words: Entry['row'];
  readonly units: ReadonlyArray<readonly string[]>;
  readonly changes: number;
}

/** Whether every crop a ruling read was cut from a page of the 1985 book: a photo or a scan page. */
const on1985 = (ruling: Ruling) =>
  ruling.crops.length > 0 &&
  ruling.crops.every((crop) => sourceOfImage(crop.image) !== 'sdahimages');

/**
 * A hymn's state from its rulings alone: `unsettled` when a ruling could not
 * read its crops, a ruling that changes words rests on an engraving's crop,
 * or a judge found the page lays the row out otherwise (`disputed`),
 * `fixed` when rulings on crops of the 1985 book change words,
 * else `matches`. Its words are the base row's, or with every ruling applied
 * when they are `fixed` (a `disputed` ruling changes no word). Only rulings that apply
 * count: rulings in conflict (`misplaced`) apply none, and the census prints
 * each conflict. A `nopage` entry is its own claim: the readings run holds it.
 */
export const derive = (
  base: ReadonlyArray<readonly string[]>,
  rulings: readonly Ruling[],
): Derived & {
  readonly misplaced: readonly RulingConflict[];
  readonly spans: readonly Span[];
} => {
  const applied = applyRulings(base, rulings);
  const changing = applied.applied.filter(changes);
  const unreadable = rulings.some((ruling) => ruling.kind === 'unreadable');
  const words: Entry['row'] =
    unreadable || changing.some((ruling) => !on1985(ruling))
      ? 'unsettled'
      : changing.length > 0
        ? 'fixed'
        : 'matches';
  return {
    row: rulings.some((ruling) => ruling.kind === 'disputed') ? 'unsettled' : words,
    words,
    units: words === 'fixed' ? applied.units : base.map((unit) => [...unit]),
    changes: rulings.filter(changes).length,
    misplaced: applied.misplaced,
    spans: applied.spans,
  };
};

const unitDiff = (
  want: ReadonlyArray<readonly string[]>,
  have: ReadonlyArray<readonly string[]>,
): string | undefined => {
  const run = runsBetween(want, have)[0];
  return run === undefined
    ? undefined
    : `unit ${run.unit} at ${run.at}: wants ${quoted(run.row)}, the row has ${quoted(run.page)}`;
};

/** A fix line's `from` names its page image, its system and its lyric row. */
const FROM = /\b(p\d{3}\.jpg|[\w-]+\.(?:jpg|png))\b.*\bsystems? \d+.*\b(row|refrain)\b/i;

/** An image file named in free text: a page image or a crop. */
const IMAGE = /[\w-]+\.(?:jpg|png)\b/g;

/** The page image and the system a fix line's `from` names (its first image and its first system). */
const placeOf = (from: string) => ({
  image: /\b(p\d{3}\.jpg|[\w-]+\.(?:jpg|png))\b/.exec(from)?.[1] ?? '',
  system: /\bsystems? (\d+)/i.exec(from)?.[1] ?? '',
});

/** One crop of a ruling against the deciding page and the committed crops. */
const cropProblems = (
  what: string,
  n: number,
  deciding: Deciding,
  one: Ruling['crops'][number],
  crops: Sources['crops'],
): string[] => {
  const crop = crops.get(`${pad(n)}/${one.crop}`);
  const [, , width, height] = one.box;
  return [
    ...(deciding.images.includes(one.image)
      ? []
      : [`${what} reads ${one.image}, not the deciding page (${deciding.images.join(', ')})`]),
    ...(crop === undefined
      ? [`${what} crop ${one.crop} is not committed`]
      : [
          ...(crop.width === width && crop.height === height
            ? []
            : [
                `${what} crop ${one.crop} is ${crop.width}x${crop.height}, its box ${width}x${height}`,
              ]),
          ...(crop.sha === one.sha ? [] : [`${what} crop ${one.crop} is not the crop it read`]),
        ]),
  ];
};

/**
 * One hymn's rulings against its deciding page, its crops and its base row.
 * Every word a ruling decides lies on a crop it names: its crops' words, in
 * order, are its printed words, and its `why` names no image but a
 * committed crop of the hymn.
 */
const rulingProblems = (
  n: number,
  deciding: Deciding,
  base: ReadonlyArray<readonly string[]>,
  rulings: readonly Ruling[],
  crops: Sources['crops'],
): string[] =>
  rulings.flatMap((ruling, i) => {
    const what = `${n} ruling ${i + 1}`;
    const named = [...ruling.why.matchAll(IMAGE)].map((match) => match[0]);
    // What a ruling may hold in place of a site: lines it settles, mutants it lists.
    const held = [ruling.settles, ruling.unreachable, ruling.gaps].flatMap((list) => list ?? []);
    return [
      ...(ruling.crops.length === 0 ? [`${what} names no crop`] : []),
      ...ruling.crops.flatMap((one) => cropProblems(what, n, deciding, one, crops)),
      ...(same(wordsOf(ruling.printed), wordsOf(printedOf(ruling.crops)))
        ? []
        : [`${what} prints "${ruling.printed}", not the words its crops show`]),
      ...named
        .filter((image) => !crops.has(`${pad(n)}/${image}`))
        .map((image) => `${what} reads ${image}, which is no committed crop`),
      ...(ruling.sites.length === 0 && held.length === 0 ? [`${what} has no site`] : []),
      ...(ruling.readings.length === 0 ? [`${what} names no reading`] : []),
      ...(ruling.judge === '' ? [`${what} names no judge`] : []),
      ...((ruling.kind === 'words' || ruling.kind === 'owner') &&
      !same(wordsOf(ruling.sung), wordsOf(ruling.printed))
        ? [`${what} sings "${ruling.sung}", not the words it prints`]
        : []),
      ...((ruling.kind === 'echo' || ruling.kind === 'layout' || ruling.kind === 'disputed') &&
      !same(wordsOf(ruling.sung), wordsOf(ruling.row))
        ? [
            `${what} is ${ruling.kind === 'echo' ? 'an echo' : `a ${ruling.kind}`} but changes the row`,
          ]
        : []),
      ...(ruling.kind === 'disputed' && (ruling.settles ?? []).length === 0
        ? [`${what} is disputed but settles no line`]
        : []),
      ...applyRulings(base, [ruling]).misplaced.map((one) => `${what} ${lineOfConflict(one)}`),
    ];
  });

/**
 * An entry's state against what its rulings derive. A `nopage` entry is its
 * own claim, and every other entry counts a blind reading of its page (the
 * readings run holds the count).
 */
const stateProblems = (
  entry: Entry,
  deciding: Deciding,
  rulings: readonly Ruling[],
  derived: Derived,
): string[] => {
  const n = entry.number;
  const read = entry.readings.reader + entry.readings.ocr;
  const noted = (entry.note ?? '') !== '';
  if (entry.row === 'nopage')
    return [
      ...(rulings.length > 0 ? [`${n} says nopage, but has rulings`] : []),
      ...(read > 0 ? [`${n} says nopage, but counts a reading of its page`] : []),
      ...(noted ? [] : [`${n} says nopage with no note`]),
    ];
  return [
    ...(deciding.source === 'none' ? [`${n} says ${entry.row}, but no page decides it`] : []),
    ...(entry.row === derived.row
      ? []
      : [`${n} says ${entry.row}, its rulings make it ${derived.row}`]),
    ...(read === 0 ? [`${n} says ${entry.row}, but counts no blind reading of its page`] : []),
    ...(entry.row === 'unsettled' && !noted ? [`${n} says unsettled with no note`] : []),
  ];
};

/**
 * An entry's fix file: it sings what the row sings, unit by unit and variant
 * by variant. A census fix keeps its base row as `replaces`, belongs to a
 * `fixed` entry (or to a `matches` entry whose page prints a refrain that
 * varies by stanza: it changes no word, only writes the refrain as varying)
 * and names in every line's `from` a deciding image of the
 * hymn, a system and a row; origin/main's prior fixes carry none.
 */
const fixFileProblems = (
  entry: Entry,
  deciding: Deciding,
  fix: Fix | undefined,
  row: Verses,
  words: Entry['row'],
): string[] => {
  const n = entry.number;
  // A row whose words are fixed and whose layout waits on the owner (`disputed`) keeps its fix file.
  const fixed = entry.row === 'fixed' || (entry.row === 'unsettled' && words === 'fixed');
  if (fix === undefined) return fixed ? [`${n} says ${entry.row} but has no fix file`] : [];
  const sings = unitDiff(
    fixUnitLinesOf(fix).map((lines) => wordsOf(lines.map((line) => line.text).join('\n'))),
    unitsOf(row),
  );
  const own = sings === undefined ? [] : [`${n} fix file and row differ: ${sings}`];
  if (fix.replaces === undefined)
    return PRIOR_FIXES.has(n) ? own : [...own, `${n} fix file carries no replaces`];
  return [
    ...own,
    ...(fixed || (entry.row === 'matches' && fixVaries(fix) && sings === undefined)
      ? []
      : [`${n} has a fix file of its own but says ${entry.row}`]),
    ...fixLines(fix)
      .filter((line) => !FROM.test(line.from))
      .map((line) => `${n} fix line "${line.text}" from "${line.from}"`),
    ...fixLines(fix)
      .filter((line) => FROM.test(line.from) && !deciding.images.includes(placeOf(line.from).image))
      .map(
        (line) =>
          `${n} fix line "${line.text}" is read off ${placeOf(line.from).image}, no deciding page`,
      ),
  ];
};

/**
 * The fix lines each ruling writes, against the crops it read: a line read
 * off an image none of its crops was cut from, or more systems than it has
 * crops, writes words no crop of the ruling shows.
 */
const spanProblems = (n: number, fix: Fix, rulings: readonly Ruling[], spans: readonly Span[]) => {
  const units = fixUnitLinesOf(fix).map((lines) =>
    lines.flatMap((line) => wordsOf(line.text).map(() => line.from)),
  );
  return rulings.flatMap((ruling, i) => {
    if (!changes(ruling)) return [];
    const places = spans
      .filter((span) => span.ruling === ruling)
      .flatMap((span) => {
        const froms = units[span.unit - 1] ?? [];
        // Words taken away leave no span: the line they stood in is the one before.
        const at = span.length > 0 ? span.start : Math.max(0, span.start - 1);
        return froms.slice(at, at + Math.max(1, span.length)).map(placeOf);
      });
    const images = new Set(ruling.crops.map((crop) => crop.image));
    const systems = new Set(places.map((place) => `${place.image} ${place.system}`));
    return [
      ...[...new Set(places.map((place) => place.image))]
        .filter((image) => !images.has(image))
        .map(
          (image) =>
            `${n} ruling ${i + 1} writes a line read off ${image}, which none of its crops shows`,
        ),
      ...(systems.size > ruling.crops.length
        ? [
            `${n} ruling ${i + 1} writes lines of ${systems.size} systems off ${ruling.crops.length} crops`,
          ]
        : []),
    ];
  });
};

/** One entry against the inventory, its rulings, its fix and its row. */
const entryProblems = (entry: Entry, deciding: Deciding, sources: Sources): string[] => {
  const n = entry.number;
  const row = sources.rows.get(n);
  if (row === undefined) return [`${n} has no row`];
  const fix = sources.fixes.get(n);
  const rulings = sources.rulings.get(n) ?? [];
  const base = unitsOf(baseOf(sources, n));
  const derived = derive(base, rulings);
  const differs = unitDiff(entry.row === 'nopage' ? base : derived.units, unitsOf(row));
  const stanzas = fix?.stanzas.length ?? row.filter((verse) => verse.id >= 0).length;
  const refrain = row.some((verse) => verse.id < 0) || fix?.refrain !== undefined;
  return [
    ...(entry.source === deciding.source && same(entry.pages, deciding.images)
      ? []
      : [
          `${n} says ${entry.source} ${entry.pages.join(', ')}, the inventory ${deciding.source} ${deciding.images.join(', ')}`,
        ]),
    ...(entry.base === baseDigestOf(base) ? [] : [`${n} base row is not the one the census read`]),
    ...rulingProblems(n, deciding, base, rulings, sources.crops),
    ...derived.misplaced.map((one) => `${n} rulings: ${lineOfConflict(one)}`),
    ...stateProblems(entry, deciding, rulings, derived),
    ...(differs === undefined ? [] : [`${n} row: ${differs}`]),
    ...(entry.rulings.all === rulings.length && entry.rulings.changes === derived.changes
      ? []
      : [
          `${n} counts ${entry.rulings.all} rulings (${entry.rulings.changes} changing), the folder ${rulings.length} (${derived.changes})`,
        ]),
    ...(entry.stanzas === stanzas && entry.refrain === refrain
      ? []
      : [`${n} claims ${entry.stanzas} stanzas, refrain ${entry.refrain}`]),
    ...fixFileProblems(entry, deciding, fix, row, derived.words),
    ...(fix?.replaces === undefined ? [] : spanProblems(n, fix, rulings, derived.spans)),
    ...outlineEntryProblems(entry, deciding, sources),
  ];
};

/** The refrain rows a lender's page sings after its stanza `i`, read as that stanza's own rows. */
const lentRefrain = (their: Outline, i: number) =>
  their.refrain === null || their.refrain.order !== 'after-each'
    ? []
    : their.refrain.rows.filter((row) => row.stanzas.length === 0 || row.stanzas.includes(i));

/** The shape readings a hymn is held to, and whether it borrows stanzas no reading of its lender prints (`outlinesOf`). */
export interface HeldTo {
  readonly outlines: readonly Outline[];
  readonly borrower: boolean;
}

/**
 * The shape readings a hymn is held to: its own, and for a hymn whose page
 * lends its other stanzas from another (`Inventory.lent`), each of its own
 * with the stanzas it does not print taken from each reading of the
 * lender's page (and the refrain it sings after them), as `lentReadings`
 * does for word readings. A borrower whose
 * lender has no shape reading is held to its own, which prints no more
 * stanzas than the source (`borrower`).
 */
export const outlinesOf = (sources: Sources, n: number): HeldTo => {
  const byOutlines = heldTo.get(sources.inventory) ?? new WeakMap();
  heldTo.set(sources.inventory, byOutlines);
  const byHymn = byOutlines.get(sources.outlines) ?? new Map<number, HeldTo>();
  byOutlines.set(sources.outlines, byHymn);
  const found = byHymn.get(n) ?? readingsHeld(sources, n);
  byHymn.set(n, found);
  return found;
};

/** `outlinesOf` by the inventory and the readings it was given (the same objects give the same readings). */
const heldTo = new WeakMap<
  Inventory,
  WeakMap<ReadonlyMap<number, readonly Outline[]>, Map<number, HeldTo>>
>();

const readingsHeld = (sources: Sources, n: number): HeldTo => {
  const own = sources.outlines.get(n) ?? [];
  const lent = sources.inventory.lent.find((one) => one.hymn === n);
  const theirs = lent === undefined ? [] : (sources.outlines.get(lent.from) ?? []);
  if (theirs.length === 0) return { outlines: own, borrower: lent !== undefined };
  return {
    outlines: own.flatMap((outline) =>
      theirs.map((their) => ({
        ...outline,
        images: [...outline.images, ...their.images],
        stanzas: [
          ...outline.stanzas,
          ...their.stanzas.slice(outline.stanzas.length).map((stanza, k) => ({
            ...stanza,
            rows: [...stanza.rows, ...lentRefrain(their, outline.stanzas.length + k + 1)],
          })),
        ],
      })),
    ),
    borrower: false,
  };
};

/**
 * An entry against its shape readings: every hymn with a deciding page has
 * a shape reading of it; each shape reading is of that page, and agrees
 * with the printed source (`layoutLinesOf`, `formatProblems`) but for the
 * lines a ruling settles, and a ruling settles only a line the census finds.
 */
export const outlineEntryProblems = (
  entry: Entry,
  deciding: Deciding,
  sources: Sources,
): string[] => {
  const n = entry.number;
  const { outlines, borrower } = outlinesOf(sources, n);
  const found = outlines.flatMap((outline) =>
    outlineProblems(
      n,
      outline,
      sources.rows.get(n) ?? [],
      sources.fixes.get(n),
      borrower,
      sources.orders.get(n),
      bookOf(sources, n),
    ),
  );
  const settled = new Set((sources.rulings.get(n) ?? []).flatMap((ruling) => ruling.settles ?? []));
  return [
    ...(entry.row !== 'nopage' && outlines.length === 0
      ? [`${n} says ${entry.row} with no shape reading of its page`]
      : []),
    ...formatProblems(n, layoutOf(sources.rows.get(n) ?? [], sources.fixes.get(n), undefined)),
    ...outlines
      .filter((outline) => !ofPage(outline.images, deciding))
      .map(
        (outline) =>
          `${n} shape (${outline.reader}) reads ${outline.images.join(', ')}, not the deciding page`,
      ),
    ...found.filter((line) => !settled.has(line)),
    ...[...settled]
      .filter((line) => !found.includes(line))
      .map(
        (line) => `${n} a ruling settles "${line}", a shape difference the census does not find`,
      ),
  ];
};

/**
 * The entries' numbers against FIRST..LAST in order: each one missing, and
 * each entry that is not above the one before it (a repeat or a step back).
 */
const orderProblems = (numbers: readonly number[]): string[] => {
  const want = Array.from({ length: LAST - FIRST + 1 }, (_, i) => FIRST + i);
  const seen = new Set(numbers);
  return [
    ...want.filter((n) => !seen.has(n)).map((n) => `${n} no entry`),
    ...numbers.filter((n) => n < FIRST || n > LAST).map((n) => `${n} is no hymn of the book`),
    ...numbers.flatMap((n, i) =>
      i > 0 && n <= (numbers[i - 1] ?? 0) ? [`${n} entry out of place (position ${i + 1})`] : [],
    ),
  ];
};

/** Every way the census disagrees with its committed inputs and the base commit, one line each. */
export const problemsOf = (census: Census, sources: Sources): string[] => {
  const deciding = decidingOf(sources.inventory);
  return [
    ...inventoryProblems(sources.inventory, new Set(sources.photos.keys())),
    ...orderProblems(census.hymns.map((entry) => entry.number)),
    ...baseProblems(sources),
    ...census.hymns.flatMap((entry) =>
      entryProblems(entry, deciding.get(entry.number) ?? NO_PAGE, sources),
    ),
    ...[...sources.rulings.keys(), ...sources.outlines.keys()]
      .filter((n) => !census.hymns.some((entry) => entry.number === n))
      .map((n) => `${n} has rulings or a shape but no entry`),
    ...[...sources.crops.keys()]
      .filter((key) => {
        const [dir = '', file = ''] = key.split('/');
        return !(sources.rulings.get(Number(dir)) ?? []).some((ruling) =>
          ruling.crops.some((crop) => crop.crop === file),
        );
      })
      .map((key) => `crop ${key} is named by no ruling`),
    ...photoProblems(sources.photos),
  ];
};

/**
 * Each hymn's base row read from git, and each census fix's `replaces`
 * against it: the base row is never what the census's builder wrote. Every
 * fix file the base commit holds is still held: a printed source read off a
 * page is never dropped (it may be written again, never lost).
 */
export const baseProblems = (sources: Sources): string[] => {
  const problems: string[] = [];
  for (let n = FIRST; n <= LAST; n++) {
    const want = sources.base.get(n);
    if (want === undefined) {
      problems.push(`${n} has no row at the base commit`);
      continue;
    }
    if (sources.baseFixes.includes(n) && !sources.fixes.has(n))
      problems.push(`${n} fix file at the base commit is gone`);
    const replaces = sources.fixes.get(n)?.replaces;
    if (replaces !== undefined && JSON.stringify(want) !== JSON.stringify(replaces))
      problems.push(`${n} fix replaces a row that is not the base commit's`);
  }
  return problems;
};

// ----------------------------------------------------------------------------
// The readings
// ----------------------------------------------------------------------------

/** A blind reading that transcribed nothing: the reader would not or could not read the page. */
export const isRefusal = (reading: Reading) => reading.stanzas.length === 0;

/** Whether a reading prints a refrain row that differs from stanza to stanza. */
const readsVarying = (reading: Reading) =>
  new Set((reading.refrainRows ?? []).map((row) => wordsOf(row).join(' '))).size > 1;

/** Each run no ruling covers: a ruling covers a run at one of its sites, with its row words and the run's page words among its readings. */
export const unruledOf = (runs: readonly Run[], rulings: readonly Ruling[]) =>
  runs.filter(
    (run) =>
      !rulings.some(
        (ruling) =>
          ruling.row === run.row.join(' ') &&
          ruling.readings.includes(run.page.join(' ')) &&
          ruling.sites.some((site) => site.unit === run.unit && site.at === run.at),
      ),
  );

/** A reading or a proof whose every image is cut from one of the deciding images. */
const ofPage = (images: readonly string[], deciding: Deciding) =>
  images.length > 0 && images.every((image) => deciding.readable.includes(pageOfImage(image)));

/**
 * One hymn against its blind readings: `unread` when it is not `nopage` and
 * no blind reading transcribed its deciding page (a refusal transcribes
 * nothing), `read` when it is `nopage` and one did, each run of each reading
 * no ruling covers, a reading that prints a refrain varying by stanza where
 * no shape reading of the page says how it varies (the shape decides, in the
 * plain run), and each count the entry claims that the readings do
 * not give. Only blind readings count: a record shown the row finds nothing
 * here.
 */
export const readingProblems = (
  entry: Entry,
  deciding: Deciding,
  baseRow: Verses,
  rulings: readonly Ruling[],
  readings: readonly Reading[],
  outlines: readonly Outline[] = [],
): string[] => {
  const n = entry.number;
  const read = readings.filter(
    (r) => r.number === n && ofPage(r.images, deciding) && !isRefusal(r),
  );
  const reader = read.filter((r) => (r.by ?? 'reader') === 'reader').length;
  const ocr = read.length - reader;
  const problems: string[] = [];
  if (entry.readings.reader !== reader || entry.readings.ocr !== ocr)
    problems.push(
      `${n} counts ${entry.readings.reader} reader and ${entry.readings.ocr} OCR readings, the folder ${reader} and ${ocr}`,
    );
  if (entry.row === 'nopage') {
    if (read.length > 0) problems.push(`${n} says nopage, but its page was read`);
    return problems;
  }
  if (read.length === 0) return [...problems, `${n} unread on ${deciding.source}`];
  const base = unitsOf(baseRow);
  const runs = read.flatMap((reading) => runsBetween(base, readingUnitsOf(reading)));
  for (const run of unruledOf(runs, rulings))
    problems.push(
      `${n} unruled unit ${run.unit} at ${run.at} row=${quoted(run.row)} page=${quoted(run.page)}`,
    );
  if (read.some(readsVarying) && outlines.length === 0)
    problems.push(
      `${n} readings print a refrain that varies by stanza, and no shape reading of its page says how`,
    );
  if (
    read.some(readsVarying) &&
    outlines.length > 0 &&
    outlines.every((outline) => outlineVaries(outline).length === 0) &&
    !rulings.some((ruling) => ruling.kind === 'repeat' || ruling.kind === 'echo')
  )
    problems.push(
      `${n} a reading prints a refrain that varies by stanza, its shape reading none, and no ruling says why`,
    );
  return problems;
};

// ----------------------------------------------------------------------------
// The witness
// ----------------------------------------------------------------------------

/** A witness hymn: its stanzas' and its refrain blocks' text, in the order it prints them. */
export interface WitnessHymn {
  readonly stanzas: readonly string[];
  readonly refrains: readonly string[];
}

/** One csycms `docs.md`: its number (from `## NNN.`) and its words, or undefined when it holds no hymn. */
export const parseWitness = (
  markdown: string,
): { readonly number: number; readonly hymn: WitnessHymn } | undefined => {
  const head = /^## (\d+)\. /m.exec(markdown);
  const body = /^```txt\n([\s\S]*?)^```/m.exec(markdown);
  if (head === null || body === null) return undefined;
  const stanzas: string[] = [];
  const refrains: string[] = [];
  let into: string[] = stanzas;
  let block: string[] = [];
  const flush = () => {
    if (block.length > 0) into.push(block.join('\n'));
    block = [];
  };
  for (const line of (body[1] ?? '').split('\n').map((one) => one.trim())) {
    if (/^\d+\.$/.test(line)) {
      flush();
      into = stanzas;
    } else if (/^(refrain|chorus):?$/i.test(line)) {
      flush();
      into = refrains;
    } else if (line !== '') block.push(line);
  }
  flush();
  return { number: Number(head[1]), hymn: { stanzas, refrains } };
};

/** One run of differing words between a row and the witness: the unit, the row's words and the witness's. */
export type Hunk = readonly [unit: number, row: readonly string[], witness: readonly string[]];

/**
 * The hunks between a row's units and the witness's (each stanza with its
 * first refrain block after it), then, for each later refrain block that
 * differs from the first, its hunks against the row's refrain (unit `-k`
 * for the k-th block; a row whose refrain is written inside its stanzas
 * holds none of its own, so the whole block is one hunk).
 */
export const hunksOf = (row: Verses, witness: WitnessHymn): Hunk[] => {
  const refrain = wordsOf(witness.refrains[0] ?? '');
  const theirs = witness.stanzas.map((stanza) => [...wordsOf(stanza), ...refrain]);
  const own = wordsOf(
    row
      .filter((verse) => verse.id < 0)
      .map((verse) => verse.text)
      .join('\n'),
  );
  return [
    ...runsBetween(unitsOf(row), theirs).map((run) => [run.unit, run.row, run.page] as const),
    ...witness.refrains.slice(1).flatMap((block, k) => {
      const words = wordsOf(block);
      return same(words, refrain)
        ? []
        : runsBetween([own], [words]).map((run) => [-(k + 2), run.row, run.page] as const);
    }),
  ];
};

/** The first 16 hex digits of the sha256 of the hunks' canonical JSON. */
export const digestOf = (hunks: readonly Hunk[]) =>
  createHash('sha256').update(JSON.stringify(hunks)).digest('hex').slice(0, 16);

// ----------------------------------------------------------------------------
// Loading
// ----------------------------------------------------------------------------

/** Every file under `dir` whose name ends with `ext`, by its path under `dir`, sorted. */
const filesUnder = (dir: string, ext: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    if (!(yield* fs.exists(dir))) return [] as string[];
    return (yield* fs.readDirectory(dir, { recursive: true }))
      .filter((file) => file.endsWith(ext))
      .toSorted();
  });

/** The first 16 hex digits of the sha256 of a file's bytes: a crop's `sha`. */
export const shaOf = (bytes: Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex').slice(0, 16);

/** Each hymn's row in a hymnal.db's bytes, read read-only. */
const rowsOfDb = (bytes: Uint8Array): ReadonlyMap<number, Verses> => {
  const db = Database.deserialize(bytes, true);
  const rows = new Map<number, Verses>();
  for (const { id, verses } of db.query('SELECT id, verses FROM hymns').all() as Array<{
    id: number;
    verses: string;
  }>)
    if (id >= FIRST && id <= LAST) rows.set(id, JSON.parse(verses) as Verses);
  db.close();
  return rows;
};

/** The repository's hymnal.db at `commit`, read from git; a commit git cannot give is a defect. */
export const baseRowsAt = (commit: string) =>
  Effect.gen(function* () {
    const shown = Bun.spawnSync(['git', 'show', `${commit}:packages/core/data/hymnal.db`], {
      cwd: DATA,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    if (shown.exitCode !== 0)
      return yield* Effect.die(
        `census: git cannot read hymnal.db at the base commit ${commit}: ${shown.stderr.toString().trim()}`,
      );
    return rowsOfDb(shown.stdout);
  });

/** The hymns with a fix file in the repository at `commit`, read from git; a commit git cannot give is a defect. */
export const baseFixesAt = (commit: string) =>
  Effect.gen(function* () {
    const listed = Bun.spawnSync(
      ['git', 'ls-tree', '--full-tree', '--name-only', `${commit}:packages/hymnal/data/fixes`],
      { cwd: DATA, stdout: 'pipe', stderr: 'pipe' },
    );
    if (listed.exitCode !== 0)
      return yield* Effect.die(
        `census: git cannot list the fix files at the base commit ${commit}: ${listed.stderr.toString().trim()}`,
      );
    return listed.stdout
      .toString()
      .split('\n')
      .filter((name) => /^\d{3}\.json$/.test(name))
      .map((name) => Number.parseInt(name, 10));
  });

/**
 * Reads the inventory, every hymn's row, its row at the census's base commit
 * (from git), the fixes, the rulings, the crops' sizes and digests, and the
 * photos.
 */
export const loadSources = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const hymnal = yield* HymnalService;
  const inventory = yield* decodeInventory(yield* fs.readFileString(path.join(DATA, 'pages.json')));
  const census = yield* decodeCensus(yield* fs.readFileString(path.join(DATA, 'census.json')));
  const base = yield* baseRowsAt(census.base.commit);
  const rows = new Map<number, Verses>();
  const fixes = new Map<number, Fix>();
  const rulings = new Map<number, readonly Ruling[]>();
  for (let n = FIRST; n <= LAST; n++) {
    rows.set(n, (yield* hymnal.getHymn(HymnId.make(n))).verses);
    const fix = path.join(DATA, 'fixes', `${pad(n)}.json`);
    if (yield* fs.exists(fix)) fixes.set(n, yield* decodeFix(yield* fs.readFileString(fix)));
  }
  const crops = new Map<string, { width: number; height: number; sha: string }>();
  const cropDir = path.join(DATA, 'crops');
  for (const file of yield* filesUnder(cropDir, '.json')) {
    const decoded = yield* decodeRulings(yield* fs.readFileString(path.join(cropDir, file)));
    rulings.set(decoded.number, decoded.rulings);
  }
  for (const file of yield* filesUnder(cropDir, '.jpg')) {
    const bytes = yield* fs.readFile(path.join(cropDir, file));
    const { frame } = jpegHeader(bytes);
    if (frame !== undefined) crops.set(file, { ...frame, sha: shaOf(bytes) });
  }
  const photoDir = path.join(DATA, 'photos/sdah-1985');
  const photos = new Map<string, Uint8Array>();
  for (const name of yield* filesUnder(photoDir, '.jpg'))
    photos.set(name, yield* fs.readFile(path.join(photoDir, name)));
  const outlines = new Map<number, Outline[]>();
  for (const outline of (yield* decodeOutlines(
    yield* fs.readFileString(path.join(DATA, 'shapes.json')),
  )).hymns)
    outlines.set(outline.number, [...(outlines.get(outline.number) ?? []), outline]);
  const baseFixes = yield* baseFixesAt(census.base.commit);
  const orders = yield* decodeOrders(
    yield* fs.readFileString(path.join(DATA, 'fixes/refrains.json')),
  );
  const sources: Sources = {
    inventory,
    rows,
    base,
    fixes,
    rulings,
    crops,
    photos,
    outlines,
    orders,
    baseFixes,
    capitals: capitalsOf(rows),
  };
  return sources;
});

/** The witness's hymns under `dir`, by number; two files that give one number must agree. */
const loadWitness = (dir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const hymns = new Map<number, WitnessHymn>();
    for (const file of (yield* filesUnder(dir, 'docs.md')).toSorted()) {
      const parsed = parseWitness(yield* fs.readFileString(path.join(dir, file)));
      if (parsed === undefined) continue;
      const known = hymns.get(parsed.number);
      if (known === undefined) hymns.set(parsed.number, parsed.hymn);
      else if (JSON.stringify(known) !== JSON.stringify(parsed.hymn))
        return yield* Effect.die(`witness ${parsed.number}: two files give different words`);
    }
    return hymns;
  });

const ReaderHymn = Schema.Struct({
  number: Schema.Int,
  images: Schema.Array(Schema.String),
  stanzas: Schema.Array(Schema.String),
  refrain: Schema.optionalKey(Schema.NullOr(Schema.String)),
  refrainRows: Schema.optionalKey(Schema.NullOr(Schema.Array(Schema.String))),
  odd: Schema.optionalKey(Schema.NullOr(Schema.String)),
  by: Schema.optionalKey(Schema.Literals(['reader', 'ocr'])),
});
const ReaderRecord = Schema.Struct({ hymns: Schema.Array(ReaderHymn) });

/** The blind readings under `root` (`read/**.json`): a model reader's or the machine OCR's records. */
const loadReadings = (root: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const readings: Reading[] = [];
    for (const file of yield* filesUnder(path.join(root, 'read'), '.json')) {
      const record = Schema.decodeUnknownOption(ReaderRecord)(
        JSON.parse(yield* fs.readFileString(path.join(root, 'read', file))),
      );
      if (Option.isNone(record)) return yield* Effect.die(`read/${file} is not a reader's record`);
      readings.push(...record.value.hymns);
    }
    return readings;
  });

// ----------------------------------------------------------------------------
// The script
// ----------------------------------------------------------------------------

/**
 * The shape readers' reports in `dir` (`*.json`, each `{ hymns: [...] }`),
 * each named by its file (`shape2-NN`).
 */
const loadOutlineReports = (dir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const outlines: Outline[] = [];
    for (const file of yield* filesUnder(dir, '.json')) {
      const record = yield* Schema.decodeEffect(Schema.fromJsonString(ReportFile))(
        yield* fs.readFileString(path.join(dir, file)),
      );
      outlines.push(
        ...record.hymns.map((one) => outlineOfReport(one, path.basename(file, '.json'))),
      );
    }
    return outlines;
  });

/** Each committed shape reading that no shape reader's report gives as it is, and each report not committed. */
export const outlineReportProblems = (sources: Sources, reports: readonly Outline[]): string[] => {
  const key = (outline: Outline) => JSON.stringify(outline);
  const given = new Set(reports.map(key));
  const committed = [...sources.outlines.values()].flat();
  const kept = new Set(committed.map(key));
  return [
    ...committed
      .filter((outline) => !given.has(key(outline)))
      .map((outline) => `${outline.number} shape (${outline.reader}) is no shape reader's report`),
    ...reports
      .filter((outline) => !kept.has(key(outline)))
      .map(
        (outline) => `${outline.number} shape (${outline.reader}) is reported but not committed`,
      ),
  ];
};

/** Every entry against the blind readings under `root`: the readings run. */
const readingsRun = (census: Census, sources: Sources, root: string) =>
  Effect.gen(function* () {
    const deciding = decidingOf(sources.inventory);
    const readings = lentReadings(sources.inventory, deciding, yield* loadReadings(root));
    return [
      ...census.hymns.flatMap((entry) =>
        readingProblems(
          entry,
          deciding.get(entry.number) ?? NO_PAGE,
          baseOf(sources, entry.number),
          sources.rulings.get(entry.number) ?? [],
          readings,
          sources.outlines.get(entry.number) ?? [],
        ),
      ),
    ];
  });

/** Each entry's witness digest against the hunks between its row and the witness under `root`, each hunk printed. */
const witnessRun = (census: Census, sources: Sources, root: string) =>
  Effect.gen(function* () {
    const witness = yield* loadWitness(root);
    const problems: string[] = [];
    let [hymns, hunks] = [0, 0];
    for (const entry of census.hymns) {
      const theirs = witness.get(entry.number);
      const found =
        theirs === undefined ? undefined : hunksOf(sources.rows.get(entry.number) ?? [], theirs);
      if (found !== undefined) {
        hymns += 1;
        hunks += found.length;
        for (const [unit, mine, other] of found)
          console.log(`hunk ${entry.number} ${unit} row=${quoted(mine)} witness=${quoted(other)}`);
      }
      const fresh =
        found === undefined ? 'absent' : { hunks: found.length, digest: digestOf(found) };
      if (JSON.stringify(entry.witness) !== JSON.stringify(fresh))
        problems.push(`${entry.number} witness stale`);
    }
    console.log(`witness hymns=${hymns} absent=${LAST - FIRST + 1 - hymns} hunks=${hunks}`);
    return problems;
  });

const run = (flags: {
  readonly readings?: string | undefined;
  readonly scans?: string | undefined;
  readonly witness?: string | undefined;
  readonly reports?: string | undefined;
}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const census = yield* decodeCensus(yield* fs.readFileString(path.join(DATA, 'census.json')));
    const sources = yield* loadSources;
    const problems = problemsOf(census, sources);
    if (flags.scans !== undefined)
      problems.push(
        ...scanStatusProblems(
          sources.inventory,
          yield* fs.readDirectory(path.resolve(flags.scans)),
        ),
      );
    if (flags.readings !== undefined)
      problems.push(...(yield* readingsRun(census, sources, path.resolve(flags.readings))));
    if (flags.reports !== undefined || flags.readings !== undefined)
      problems.push(
        ...outlineReportProblems(
          sources,
          yield* loadOutlineReports(
            path.resolve(flags.reports ?? path.join(flags.readings ?? '', 'shape')),
          ),
        ),
      );
    if (flags.witness !== undefined)
      problems.push(...(yield* witnessRun(census, sources, path.resolve(flags.witness))));
    for (const problem of problems) console.log(`problem ${problem}`);
    for (const entry of census.hymns)
      if (entry.row === 'unsettled' || entry.row === 'nopage')
        console.log(`${entry.row} ${entry.number} ${entry.note ?? ''}`);
    const count = (row: Entry['row']) => census.hymns.filter((entry) => entry.row === row).length;
    const rulings = [...sources.rulings.values()].reduce((sum, all) => sum + all.length, 0);
    console.log(
      `census hymns=${LAST - FIRST + 1} entries=${census.hymns.length} problems=${problems.length} matches=${count('matches')} fixed=${count('fixed')} unsettled=${count('unsettled')} nopage=${count('nopage')} rulings=${rulings}`,
    );
    if (problems.length > 0) process.exitCode = 1;
  });

/** The hymnal over the committed hymnal.db, and Bun's services: what `loadSources` reads through. */
export const censusLayer = Layer.merge(
  layerHymnalBun.pipe(
    Layer.provide(BunServices.layer),
    Layer.provide(
      ConfigProvider.layer(
        ConfigProvider.fromEnv({
          env: {
            HOME: process.env['HOME'] ?? '',
            HYMNAL_DB_PATH: path.resolve(DATA, '../../core/data/hymnal.db'),
          },
        }),
      ),
    ),
  ),
  BunServices.layer,
);

/** The census and its sources, read once in a process: the test files share the one read. */
export const readCensusOnce = Effect.runSync(
  Effect.cached(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const census = yield* decodeCensus(yield* fs.readFileString(path.join(DATA, 'census.json')));
      const sources = yield* loadSources;
      return { census, sources };
    }).pipe(Effect.provide(censusLayer)),
  ),
);

if (import.meta.main) {
  const args = process.argv.slice(2);
  const after = (flag: string) => {
    const at = args.indexOf(flag);
    return at < 0 ? undefined : (args[at + 1] ?? '');
  };
  await Effect.runPromise(
    run({
      readings: after('--readings'),
      scans: after('--scans'),
      witness: after('--witness'),
      reports: after('--shapes'),
    }).pipe(Effect.provide(censusLayer)),
  );
}
