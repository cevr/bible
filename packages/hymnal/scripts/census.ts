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
import { ConfigProvider, Effect, FileSystem, Layer, Option, Schema } from 'effect';
import { createHash } from 'node:crypto';
import path from 'node:path';

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
 *   which the row sings where it does;
 * - `unreadable`: the crop does not show the words clearly enough to say.
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
  'unreadable',
]);

/**
 * One crop a ruling read: the page image it was cut from, its file, its box
 * on that image, the first 16 hex digits of its bytes' sha256, and the words
 * the judge saw it print at the place (`printed` is every crop's words in
 * order).
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
 * The base units with every ruling's sung words put in at its sites, where
 * each ruling's words stand in them, and each ruling whose site does not
 * hold its row words in the base. Sites apply from the last to the first in
 * each unit; trailing units left empty are dropped.
 */
export const applyRulings = (
  base: ReadonlyArray<readonly string[]>,
  rulings: readonly Ruling[],
) => {
  const edits = rulings
    .filter((ruling) => ruling.kind !== 'unreadable')
    .flatMap((ruling) =>
      ruling.sites.map((site) => ({
        ...site,
        ruling,
        row: ruling.row.split(' ').filter(Boolean),
        sung: wordsOf(ruling.sung),
      })),
    );
  const misplaced: string[] = [];
  const count = Math.max(base.length, ...edits.map((edit) => edit.unit));
  const units = Array.from({ length: count }, (_, u) => [...(base[u] ?? [])]);
  for (const edit of edits) {
    const unit = base[edit.unit - 1] ?? [];
    if (!same(unit.slice(edit.at, edit.at + edit.row.length), edit.row))
      misplaced.push(`unit ${edit.unit} at ${edit.at} holds no ${quoted(edit.row)}`);
  }
  if (misplaced.length > 0) return { units, spans: [] as Span[], misplaced };
  for (const edit of edits.toSorted((a, b) => b.unit - a.unit || b.at - a.at))
    units[edit.unit - 1]?.splice(edit.at, edit.row.length, ...edit.sung);
  // An edit's words move by what every earlier edit of its unit adds or takes away.
  const spans = edits.map((edit): Span => {
    const shift = edits
      .filter((other) => other.unit === edit.unit && other.at < edit.at)
      .reduce((sum, other) => sum + other.sung.length - other.row.length, 0);
    return {
      ruling: edit.ruling,
      unit: edit.unit,
      start: edit.at + shift,
      length: edit.sung.length,
    };
  });
  while (units.length > 0 && units[units.length - 1]?.length === 0) units.pop();
  return { units, spans, misplaced };
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

/**
 * Each hymn's deciding page: its photos, when they show it whole; else its
 * scan pages, when every one is shown; else its engravings, unless revised
 * after 1985; else none. A photo that shows part of a hymn decided by a scan
 * or an engraving stands beside that page.
 */
export const decidingOf = (inventory: Inventory): ReadonlyMap<number, Deciding> => {
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
}

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
  readonly units: ReadonlyArray<readonly string[]>;
  readonly changes: number;
}

/** Whether every crop a ruling read was cut from a page of the 1985 book: a photo or a scan page. */
const on1985 = (ruling: Ruling) =>
  ruling.crops.length > 0 &&
  ruling.crops.every((crop) => sourceOfImage(crop.image) !== 'sdahimages');

/**
 * A hymn's state from its rulings alone: `unsettled` when a ruling could not
 * read its crops or a ruling that changes words rests on an engraving's
 * crop, `fixed` when rulings on crops of the 1985 book change words, else
 * `matches`. A `nopage` entry is its own claim: the readings run holds it.
 */
export const derive = (
  base: ReadonlyArray<readonly string[]>,
  rulings: readonly Ruling[],
): Derived & { readonly misplaced: readonly string[]; readonly spans: readonly Span[] } => {
  const applied = applyRulings(base, rulings);
  const changing = rulings.filter(changes);
  const unreadable = rulings.some((ruling) => ruling.kind === 'unreadable');
  const row: Entry['row'] =
    unreadable || changing.some((ruling) => !on1985(ruling))
      ? 'unsettled'
      : changing.length > 0
        ? 'fixed'
        : 'matches';
  return {
    row,
    units: row === 'fixed' ? applied.units : base.map((unit) => [...unit]),
    changes: changing.length,
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
    return [
      ...(ruling.crops.length === 0 ? [`${what} names no crop`] : []),
      ...ruling.crops.flatMap((one) => cropProblems(what, n, deciding, one, crops)),
      ...(same(
        wordsOf(ruling.printed),
        ruling.crops.flatMap((one) => wordsOf(one.shows)),
      )
        ? []
        : [`${what} prints "${ruling.printed}", not the words its crops show`]),
      ...named
        .filter((image) => !crops.has(`${pad(n)}/${image}`))
        .map((image) => `${what} reads ${image}, which is no committed crop`),
      ...(ruling.sites.length === 0 ? [`${what} has no site`] : []),
      ...(ruling.readings.length === 0 ? [`${what} names no reading`] : []),
      ...(ruling.judge === '' ? [`${what} names no judge`] : []),
      ...(ruling.kind === 'words' && !same(wordsOf(ruling.sung), wordsOf(ruling.printed))
        ? [`${what} sings "${ruling.sung}", not the words it prints`]
        : []),
      ...((ruling.kind === 'echo' || ruling.kind === 'layout') &&
      !same(wordsOf(ruling.sung), wordsOf(ruling.row))
        ? [`${what} is ${ruling.kind === 'echo' ? 'an echo' : 'a layout'} but changes the row`]
        : []),
      ...applyRulings(base, [ruling]).misplaced.map((why) => `${what} ${why}`),
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
 * `fixed` entry and names in every line's `from` a deciding image of the
 * hymn, a system and a row; origin/main's prior fixes carry none.
 */
const fixFileProblems = (
  entry: Entry,
  deciding: Deciding,
  fix: Fix | undefined,
  row: Verses,
): string[] => {
  const n = entry.number;
  if (fix === undefined)
    return entry.row === 'fixed' ? [`${n} says fixed but has no fix file`] : [];
  const sings = unitDiff(
    fixUnitLinesOf(fix).map((lines) => wordsOf(lines.map((line) => line.text).join('\n'))),
    unitsOf(row),
  );
  const own = sings === undefined ? [] : [`${n} fix file and row differ: ${sings}`];
  if (fix.replaces === undefined)
    return PRIOR_FIXES.has(n) ? own : [...own, `${n} fix file carries no replaces`];
  return [
    ...own,
    ...(entry.row === 'fixed' ? [] : [`${n} has a fix file of its own but says ${entry.row}`]),
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
    ...fixFileProblems(entry, deciding, fix, row),
    ...(fix?.replaces === undefined ? [] : spanProblems(n, fix, rulings, derived.spans)),
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
    ...[...sources.rulings.keys()]
      .filter((n) => !census.hymns.some((entry) => entry.number === n))
      .map((n) => `${n} has rulings but no entry`),
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
 * against it: the base row is never what the census's builder wrote.
 */
export const baseProblems = (sources: Sources): string[] => {
  const problems: string[] = [];
  for (let n = FIRST; n <= LAST; n++) {
    const want = sources.base.get(n);
    if (want === undefined) {
      problems.push(`${n} has no row at the base commit`);
      continue;
    }
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
 * no ruling covers, a census fix that writes no varying refrain where a
 * reading prints one, and each count the entry claims that the readings do
 * not give. Only blind readings count: a record shown the row finds nothing
 * here.
 */
export const readingProblems = (
  entry: Entry,
  deciding: Deciding,
  baseRow: Verses,
  rulings: readonly Ruling[],
  readings: readonly Reading[],
  fix?: Fix,
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
  if (fix?.replaces !== undefined && read.some(readsVarying) && !fixVaries(fix))
    problems.push(`${n} readings print a refrain that varies by stanza, its fix writes none`);
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
  const sources: Sources = { inventory, rows, base, fixes, rulings, crops, photos };
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

/** Every entry against the blind readings under `root`: the readings run. */
const readingsRun = (census: Census, sources: Sources, root: string) =>
  Effect.gen(function* () {
    const deciding = decidingOf(sources.inventory);
    const readings = lentReadings(sources.inventory, deciding, yield* loadReadings(root));
    return census.hymns.flatMap((entry) =>
      readingProblems(
        entry,
        deciding.get(entry.number) ?? NO_PAGE,
        baseOf(sources, entry.number),
        sources.rulings.get(entry.number) ?? [],
        readings,
        sources.fixes.get(entry.number),
      ),
    );
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
    }).pipe(Effect.provide(censusLayer)),
  );
}
