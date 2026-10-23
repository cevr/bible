/**
 * The census property: `data/census.json` holds one entry for every hymn
 * 1-695, in order, each `matches`, `fixed`, `unsettled` or `nopage`, and each
 * agrees with what the census reads and its builder does not write: the page
 * inventory (`data/pages.json`) for its deciding page, the viewed rulings and
 * their crops (`data/crops/NNN/`) for its state and its row, and the base row
 * read from git at the census's base commit for every word no ruling
 * changes. The checks are `scripts/census.ts`'s. The cases below are the
 * census's mutant suite: each is a defect an earlier round shipped, held as a
 * fixed case the census must refuse, with the problem line it must print.
 */

import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, Exit, FileSystem, Option, Schema } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import {
  bookOf,
  applyRulings,
  baseDigestOf,
  baseOf,
  baseRowsAt,
  type Census,
  censusLayer,
  decidingOf,
  type Entry,
  type Fix,
  hunkLine,
  hunksOf,
  hymnRunsOf,
  linesQuoting,
  censusLines,
  type Inventory,
  inventoryProblems,
  lentReadings,
  photoProblem,
  printedOf,
  problemsOf,
  readCensusOnce,
  readingProblems,
  type Reading,
  type Ruling,
  type Outline,
  outlineOfReport,
  outlineProblems,
  outlineReportProblems,
  outlineVaries,
  type Sources,
  unitsOf,
  type Verses,
  wordsOf,
  wordTag,
} from '../scripts/census.js';

/** The census and its sources, read once for every test file, as this file loads: no case's time limit holds the read. */
// oxlint-disable-next-line effect/noAsyncFunction -- built once as the file loads, so no case's time limit holds its cost
const read = Effect.succeed(await Effect.runPromise(readCensusOnce));

/** The `wordTag` a census line names the words of `text` by. */
const tag = (text: string) => wordTag(text.split(' ').filter((word) => word !== ''));

const withEntry = (census: Census, n: number, change: (entry: Entry) => Entry): Census => ({
  ...census,
  hymns: census.hymns.map((entry) => (entry.number === n ? change(entry) : entry)),
});

const withRow = (sources: Sources, n: number, row: Verses): Sources => ({
  ...sources,
  rows: new Map([...sources.rows, [n, row]]),
});

const withFixFile = (sources: Sources, n: number, fix: Fix): Sources => ({
  ...sources,
  fixes: new Map([...sources.fixes, [n, fix]]),
});

const withRulings = (sources: Sources, n: number, rulings: readonly Ruling[]): Sources => ({
  ...sources,
  rulings: new Map([...sources.rulings, [n, rulings]]),
});

/** The deciding page images of hymn `n`. */
const imagesOf = (sources: Sources, n: number) =>
  decidingOf(sources.inventory).get(n)?.images ?? [];

/**
 * Hymn `n` rewritten to sing `units`, through a fix file that keeps its base
 * row as `replaces` (as the census's own fixes do), each line read off its
 * deciding page.
 */
const withFix = (sources: Sources, n: number, units: ReadonlyArray<readonly string[]>): Sources =>
  withFixFile(withRow(sources, n, rowOfUnits(units)), n, {
    number: n,
    stanzas: units.map((unit) => [
      { text: unit.join(' '), from: `${imagesOf(sources, n)[0]} system 1, row 1` },
    ]),
    replaces: baseOf(sources, n),
  });

/** Hymn `n` with no fix file: its row as committed is its printed source. */
const withoutFix = (sources: Sources, n: number): Sources => ({
  ...sources,
  fixes: new Map([...sources.fixes].filter(([one]) => one !== n)),
});

/** Hymn `n`'s row and base row both `row`: a row wrong since before the census, which no fix touches. */
const withBase = (sources: Sources, n: number, row: Verses): Sources => ({
  ...withoutFix(withRow(sources, n, row), n),
  base: new Map([...sources.base, [n, row]]),
});

const withOutlines = (sources: Sources, n: number, outlines: readonly Outline[]): Sources => ({
  ...sources,
  outlines: new Map([...sources.outlines, [n, outlines]]),
});

/** The one shape reading of hymn `n`. */
const outlineOf = (sources: Sources, n: number) =>
  Option.getOrThrowWith(
    Option.fromNullishOr(sources.outlines.get(n)?.[0]),
    () => `no shape of ${n}`,
  );

/**
 * The review's row mutants (r5 findings, `ocr-mutant.ts`): the refrain
 * dropped, stanzas 2 and 3 swapped, the last stanza dropped, the last line
 * of the stanza at index k dropped.
 */
const mutate = (truth: Verses, mode: string): Verses => {
  const stanzas = truth.filter((v) => v.id >= 0).toSorted((a, b) => a.id - b.id);
  const refrain = truth.filter((v) => v.id < 0);
  if (mode === 'norefrain') return stanzas;
  if (mode === 'swap23')
    return [
      ...stanzas.map((v, i) =>
        i === 1 || i === 2 ? { id: v.id, text: stanzas[3 - i]?.text ?? v.text } : v,
      ),
      ...refrain,
    ];
  if (mode === 'droplast') return [...stanzas.slice(0, -1), ...refrain];
  const k = Number(mode.split(':')[1]);
  return [
    ...stanzas.map((v, i) =>
      i === k ? { id: v.id, text: v.text.split('\n').slice(0, -1).join('\n') } : v,
    ),
    ...refrain,
  ];
};

const withInventory = (sources: Sources, change: (inventory: Inventory) => Inventory): Sources => ({
  ...sources,
  inventory: change(sources.inventory),
});

/** The first entry in a state, with its number. */
const first = (census: Census, row: Entry['row'], also: (entry: Entry) => boolean = () => true) =>
  Option.getOrThrowWith(
    Option.fromNullishOr(census.hymns.find((one) => one.row === row && also(one))),
    () => `no ${row} entry`,
  );

const entryOf = (census: Census, n: number) =>
  Option.getOrThrowWith(
    Option.fromNullishOr(census.hymns.find((one) => one.number === n)),
    () => `no entry ${n}`,
  );

/**
 * A census that holds a `nopage` entry: its own first one, or, when every
 * page was read, its first ruled-on-nothing `matches` entry written as the
 * builder writes a hymn no reading reached (no reading, a note, the base row).
 */
const withNopage = (census: Census) => {
  const own = census.hymns.find((one) => one.row === 'nopage');
  if (own !== undefined) return { census, entry: own };
  const n = first(census, 'matches', (one) => one.rulings.all === 0).number;
  const made = withEntry(census, n, (one) => ({
    ...one,
    row: 'nopage',
    readings: { reader: 0, ocr: 0 },
    note: 'no reading of its page could be made',
  }));
  return { census: made, entry: entryOf(made, n) };
};

/** A row's units written back as a row: each unit a stanza, no refrain. */
const rowOfUnits = (units: ReadonlyArray<readonly string[]>): Verses =>
  units.map((unit, id) => ({ id, text: unit.join(' ') }));

/** A blind reading of hymn `n` that sings `units`, each a stanza. */
const reading = (
  n: number,
  images: readonly string[],
  units: ReadonlyArray<readonly string[]>,
  more: Partial<Reading> = {},
): Reading => ({
  number: n,
  images,
  stanzas: units.map((unit) => unit.join(' ')),
  ...more,
});

/** The problems a mutated census or source prints about hymn `n`. */
const about = (census: Census, sources: Sources, n: number) =>
  problemsOf(census, sources).filter((p) => p.startsWith(`${n} `));

/** What `about` prints for hymn `n`, read with every other entry out of the census (the rest of the book is not read again). */
const aboutOnly = (census: Census, sources: Sources, n: number) =>
  about({ ...census, hymns: census.hymns.filter((entry) => entry.number === n) }, sources, n);

/** The smallest JPEG the photo check reads: an EXIF orientation (when given) and a frame. */
const jpeg = (width: number, height: number, orientation?: number) => {
  const exif =
    orientation === undefined
      ? []
      : [
          ...[0xff, 0xe1, 0x00, 0x22],
          ...[0x45, 0x78, 0x69, 0x66, 0x00, 0x00], // "Exif\0\0"
          ...[0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08], // big-endian TIFF, IFD at 8
          ...[0x00, 0x01], // one entry
          ...[0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00],
          ...[0x00, 0x00, 0x00, 0x00],
        ];
  const frame = [0xff, 0xc0, 0x00, 0x0b, 0x08, height >> 8, height & 255, width >> 8, width & 255];
  return new Uint8Array([0xff, 0xd8, ...exif, ...frame, 0x01, 0x01, 0x11, 0x00, 0xff, 0xd9]);
};

describe('census', () => {
  it.effect(
    'has one entry for every hymn, in one of four states, each agreeing with its sources',
    () =>
      Effect.gen(function* () {
        const { census, sources } = yield* read;
        expect(census.hymns.map((entry) => entry.number)).toEqual(
          Array.from({ length: 695 }, (_, i) => i + 1),
        );
        const states = new Set(census.hymns.map((entry) => entry.row));
        expect(
          [...states].every((state) => ['matches', 'fixed', 'unsettled', 'nopage'].includes(state)),
        ).toBe(true);
        expect(problemsOf(census, sources)).toEqual([]);
      }).pipe(Effect.provide(censusLayer)),
  );

  it.effect('flags a census without hymn 7', () =>
    Effect.gen(function* () {
      const { census, sources } = yield* read;
      const without = { ...census, hymns: census.hymns.filter((entry) => entry.number !== 7) };
      const before = new Set(problemsOf(census, sources));
      expect(
        problemsOf(without, sources).filter((p) => !before.has(p) && !p.startsWith('7 ')),
      ).toEqual([]);
      expect(problemsOf(without, sources)).toContain('7 no entry');
    }),
  );

  describe('relabel', () => {
    for (const [from, to, why] of [
      ['matches', 'unsettled', 'says unsettled, its rulings make it matches'],
      ['matches', 'nopage', 'says nopage, but counts a reading of its page'],
      ['matches', 'fixed', 'says fixed, its rulings make it matches'],
      ['fixed', 'matches', 'says matches, its rulings make it fixed'],
      ['fixed', 'unsettled', 'says unsettled, its rulings make it fixed'],
      ['unsettled', 'matches', 'says matches, its rulings make it unsettled'],
      ['nopage', 'matches', 'says matches, but counts no blind reading of its page'],
    ] as const)
      it.effect(`flags a ${from} entry relabelled ${to}`, () =>
        Effect.gen(function* () {
          const { census: head, sources } = yield* read;
          const { census, entry } =
            from === 'nopage' ? withNopage(head) : { census: head, entry: first(head, from) };
          // The state relabelled from is one the census holds without this problem.
          expect(about(census, sources, entry.number)).not.toContain(`${entry.number} ${why}`);
          const relabelled = withEntry(census, entry.number, (one) => ({
            ...one,
            row: to,
            note: one.note ?? 'relabelled',
          }));
          expect(about(relabelled, sources, entry.number)).toContain(`${entry.number} ${why}`);
        }),
      );
  });

  describe('the page inventory', () => {
    it.effect('flags an emptied page list: a hymn on no scan page', () =>
      Effect.gen(function* () {
        const { census, sources } = yield* read;
        const n = first(census, 'matches').number;
        const emptied = withInventory(sources, (inventory) => ({
          ...inventory,
          scans: inventory.scans.map((scan) => ({
            ...scan,
            hymns: scan.hymns.filter((m) => m !== n),
          })),
        }));
        expect(problemsOf(census, emptied)).toContain(`${n} is on no scan page`);
      }),
    );

    it.effect("flags an entry whose pages are not the inventory's deciding page", () =>
      Effect.gen(function* () {
        const { census, sources } = yield* read;
        const entry = first(census, 'matches', (one) => one.source === 'scan');
        const withdrawn = withInventory(sources, (inventory) => ({
          ...inventory,
          scan: {
            ...inventory.scan,
            withheld: [
              ...inventory.scan.withheld,
              ...inventory.scans.filter((s) => s.hymns.includes(entry.number)).map((s) => s.page),
            ],
          },
        }));
        expect(
          about(census, withdrawn, entry.number).some((p) =>
            p.startsWith(`${entry.number} says scan ${entry.pages.join(', ')}, the inventory `),
          ),
        ).toBe(true);
      }),
    );

    it.effect(
      'decides a hymn by its photo, and a hymn the photos show only part of by its page with the photo beside it',
      () =>
        Effect.gen(function* () {
          const { sources } = yield* read;
          const partial = new Set(sources.inventory.partial.map((part) => part.hymn));
          const photo = sources.inventory.photos.find((one) => !partial.has(one.hymns[0]!))!;
          const n = photo.hymns[0]!;
          expect(decidingOf(sources.inventory).get(n)?.source).toBe('photo');
          const cut = decidingOf({
            ...sources.inventory,
            partial: [...sources.inventory.partial, { hymn: n, missing: 'its second page' }],
          }).get(n)!;
          expect(cut.source).not.toBe('photo');
          // The photo still rules the places it shows (m1).
          expect(cut.images).toContain(photo.file);
        }),
    );

    it.effect(
      "reads a lent hymn's other stanzas off its lender's page, and no lent hymn's off another",
      () =>
        Effect.gen(function* () {
          const { census, sources } = yield* read;
          const [lent] = sources.inventory.lent;
          if (lent === undefined) return yield* Effect.die('no lent hymn');
          const deciding = decidingOf(sources.inventory);
          const own = deciding.get(lent.hymn)!;
          const lender = deciding.get(lent.from)!;
          for (const image of lender.images) expect(own.images).toContain(image);
          // Its own page's one stanza, then the lender's later stanzas.
          const mine = reading(lent.hymn, own.images.slice(0, 1), [['own', 'stanza']]);
          const theirs = reading(lent.from, lender.images, [['first'], ['second'], ['third']]);
          expect(lentReadings(sources.inventory, deciding, [mine, theirs])).toContainEqual({
            ...mine,
            images: [...mine.images, ...theirs.images],
            stanzas: ['own stanza', 'second', 'third'],
          });
          const unlent = withInventory(sources, (inventory) => ({ ...inventory, lent: [] }));
          expect(about(census, unlent, lent.hymn).some((p) => p.includes('the inventory'))).toBe(
            true,
          );
        }),
    );

    it.effect('flags pages out of book order, a photo not committed and one not listed', () =>
      Effect.gen(function* () {
        const { sources } = yield* read;
        const photos = new Set(sources.photos.keys());
        const inventory = sources.inventory;
        const swapped = {
          ...inventory,
          scans: inventory.scans.map((scan) =>
            scan.page === 100
              ? { ...scan, page: 101 }
              : scan.page === 101
                ? { ...scan, page: 100 }
                : scan,
          ),
        };
        expect(inventoryProblems(swapped, photos)).toContain('scan page 100 out of order');
        const named = inventory.photos[0]!.file;
        expect(
          inventoryProblems(inventory, new Set([...photos].filter((f) => f !== named))),
        ).toContain(`photo ${named} is not committed`);
        expect(inventoryProblems(inventory, new Set([...photos, '999.jpg']))).toContain(
          'photo 999.jpg is not in the inventory',
        );
      }),
    );
  });

  describe('the page is the 1985 text (M4)', () => {
    it.effect('records each engraving whose credit dates a words revision after 1985', () =>
      Effect.gen(function* () {
        const { sources } = yield* read;
        const revised = sources.inventory.engravings
          .filter((engraving) => engraving.revised !== undefined)
          .flatMap((engraving) => engraving.hymns);
        for (const n of [147, 182, 288, 400]) expect(revised).toContain(n);
      }),
    );

    it.effect('never decides a hymn on a revised engraving: 147 as matches on it', () =>
      Effect.gen(function* () {
        const { census, sources } = yield* read;
        const deciding = decidingOf(sources.inventory).get(147)!;
        expect(deciding.images).not.toContain('147.png');
        const onEngraving = withEntry(census, 147, (one) => ({
          ...one,
          row: 'matches',
          source: 'sdahimages',
          pages: ['147.png'],
          readings: { reader: 0, ocr: 1 },
          rulings: { all: 0, changes: 0 },
          note: undefined,
        }));
        expect(about(onEngraving, sources, 147)).toContain(
          `147 says sdahimages 147.png, the inventory ${deciding.source} ${deciding.images.join(', ')}`,
        );
        // With every page of it but the revised engraving taken away, no page decides it.
        const bare = withInventory(sources, (inventory) => ({
          ...inventory,
          photos: inventory.photos.filter((photo) => !photo.hymns.includes(147)),
        }));
        if (decidingOf(bare.inventory).get(147)?.source === 'none')
          expect(about(onEngraving, bare, 147)).toContain(
            '147 says matches, but no page decides it',
          );
      }),
    );
  });

  describe('the base row is read from git (M3)', () => {
    it.effect('flags the row, the fix replaces and the digest changed together', () =>
      Effect.gen(function* () {
        const { census, sources } = yield* read;
        const entry = first(
          census,
          'fixed',
          (one) => sources.fixes.get(one.number)?.replaces !== undefined,
        );
        const n = entry.number;
        const fix = sources.fixes.get(n)!;
        // A base word changed in what the builder writes: the fix's replaces, the row, the digest.
        const replaces = fix.replaces!.map((verse, i) =>
          i === 0 ? { ...verse, text: `changed ${verse.text}` } : verse,
        );
        const row = sources.rows
          .get(n)!
          .map((verse, i) => (i === 0 ? { ...verse, text: `changed ${verse.text}` } : verse));
        const mutated = withRow(withFixFile(sources, n, { ...fix, replaces }), n, row);
        const digest = withEntry(census, n, (one) => ({
          ...one,
          base: baseDigestOf(unitsOf(replaces)),
        }));
        const problems = problemsOf(digest, mutated);
        expect(problems).toContain(`${n} fix replaces a row that is not the base commit's`);
        expect(problems).toContain(`${n} base row is not the one the census read`);
      }),
    );

    it.effect('flags a row word changed with no fix file', () =>
      Effect.gen(function* () {
        const { census, sources } = yield* read;
        const n = first(census, 'matches').number;
        const units = unitsOf(sources.rows.get(n)!).map((unit) => [...unit]);
        const was = units[0]![0];
        units[0]![0] = 'unruled';
        const digest = withEntry(census, n, (one) => ({ ...one, base: baseDigestOf(units) }));
        expect(about(digest, withRow(sources, n, rowOfUnits(units)), n)).toContain(
          `${n} row: unit 1 at 0: wants "${was}", the row has "unruled"`,
        );
      }),
    );

    it.effect(
      'flags a hymn with no row at the base commit, and dies on a commit git cannot give',
      () =>
        Effect.gen(function* () {
          const { census, sources } = yield* read;
          const base = new Map(sources.base);
          base.delete(9);
          expect(problemsOf(census, { ...sources, base })).toContain(
            '9 has no row at the base commit',
          );
          const exit = yield* Effect.exit(baseRowsAt('0000000000000000000000000000000000000000'));
          expect(Exit.isFailure(exit)).toBe(true);
        }),
    );
  });

  describe('rows and rulings', () => {
    it.effect(
      'flags a fix run with no ruling: a fix file that writes a word no ruling changed',
      () =>
        Effect.gen(function* () {
          const { census, sources } = yield* read;
          const n = first(census, 'matches').number;
          const units = unitsOf(sources.rows.get(n)!).map((unit) => [...unit]);
          const was = units[0]![0];
          units[0]![0] = 'unruled';
          expect(about(census, withFix(sources, n, units), n)).toContain(
            `${n} row: unit 1 at 0: wants "${was}", the row has "unruled"`,
          );
        }),
    );

    it.effect(
      'flags a fixed row that keeps the readings over the ruling that overturned them',
      () =>
        Effect.gen(function* () {
          const { census, sources } = yield* read;
          // A ruling whose crop prints other words than the readings found.
          const [n, ruling] = [...sources.rulings]
            .flatMap(([m, all]) => all.map((one) => [m, one] as const))
            .find(
              ([, one]) =>
                one.kind === 'words' && !one.readings.includes(wordsOf(one.sung).join(' ')),
            )!;
          const misread: Ruling = { ...ruling, sung: ruling.readings[0] ?? '' };
          const rulings = (sources.rulings.get(n) ?? []).map((one) =>
            one === ruling ? misread : one,
          );
          const { units } = applyRulings(unitsOf(baseOf(sources, n)), rulings);
          expect(
            about(census, withFix(sources, n, units), n).some((p) => p.startsWith(`${n} row: `)),
          ).toBe(true);
        }),
    );

    it.effect(
      'flags a ruling on a crop not committed, not the one it read, or not cut from the deciding page',
      () =>
        Effect.gen(function* () {
          const { census, sources } = yield* read;
          const [n, all] = [...sources.rulings].find(([, one]) => one.length > 0)!;
          const [crop] = all[0]!.crops;
          const moved = withRulings(sources, n, [
            {
              ...all[0]!,
              crops: [
                { ...crop!, crop: 'nowhere.jpg', image: 'p999.jpg' },
                { ...crop!, sha: '0000000000000000', shows: '' },
              ],
            },
            ...all.slice(1),
          ]);
          const problems = about(census, moved, n);
          expect(problems).toContain(`${n} ruling 1 crop nowhere.jpg is not committed`);
          expect(
            problems.some((p) =>
              p.startsWith(`${n} ruling 1 reads p999.jpg, not the deciding page`),
            ),
          ).toBe(true);
          // O1: a crop swapped for another of the same size.
          expect(problems).toContain(`${n} ruling 1 crop ${crop!.crop} is not the crop it read`);
        }),
    );

    it.effect(
      'flags an echo ruling that changes the row, and a words ruling that sings other words',
      () =>
        Effect.gen(function* () {
          const { census, sources } = yield* read;
          const [n, all] = [...sources.rulings].find(([, one]) => one.length > 0)!;
          const one = all[0]!;
          const echo: Ruling = { ...one, kind: 'echo', sung: `${one.row} more` };
          const words: Ruling = {
            ...one,
            kind: 'words',
            printed: one.row,
            crops: one.crops.map((crop, i) => ({ ...crop, shows: i === 0 ? one.row : '' })),
            sung: `${one.row} more`,
          };
          expect(about(census, withRulings(sources, n, [echo]), n)).toContain(
            `${n} ruling 1 is an echo but changes the row`,
          );
          expect(about(census, withRulings(sources, n, [words]), n)).toContain(
            `${n} ruling 1 sings "${one.row} more", not the words it prints`,
          );
        }),
    );

    it.effect(
      'keeps a hymn whose assumption ruling settles a line, and flags one with no line or a site',
      () =>
        Effect.gen(function* () {
          const { census, sources } = yield* read;
          // 30's ruling 0: 'Holy' capitalised as a name of God, which opens no poem line.
          const all = sources.rulings.get(30) ?? [];
          expect(all[0]?.kind).toBe('assumption');
          expect(about(census, sources, 30)).toEqual([]);
          const bare: Ruling = { ...all[0]!, settles: [] };
          expect(about(census, withRulings(sources, 30, [bare, ...all.slice(1)]), 30)).toContain(
            '30 ruling 1 is an assumption but settles no line or has a site',
          );
          const sited: Ruling = { ...all[0]!, sites: [{ unit: 1, at: 0 }] };
          expect(about(census, withRulings(sources, 30, [sited, ...all.slice(1)]), 30)).toContain(
            '30 ruling 1 is an assumption but settles no line or has a site',
          );
        }),
    );

    it.effect(
      'makes a hymn with a disputed ruling unsettled, its words as they are, and flags one that settles nothing',
      () =>
        Effect.gen(function* () {
          const { census, sources } = yield* read;
          const entry = first(
            census,
            'matches',
            (one) => (sources.rulings.get(one.number) ?? []).length > 0,
          );
          const n = entry.number;
          const all = sources.rulings.get(n) ?? [];
          const one = all[0]!;
          const broken: Ruling = { ...one, kind: 'disputed', sung: one.row, settles: [] };
          const lines = about(census, withRulings(sources, n, [...all.slice(1), broken]), n);
          expect(lines).toContain(`${n} says matches, its rulings make it unsettled`);
          expect(lines).toContain(`${n} ruling ${all.length} is disputed but settles no line`);
          // Its words stay the base row's: the row itself is never in question.
          expect(lines.filter((line) => line.startsWith(`${n} row:`))).toEqual([]);
          const waiting = withEntry(census, n, (held) => ({
            ...held,
            row: 'unsettled',
            note: 'waits',
          }));
          expect(
            about(waiting, withRulings(sources, n, [...all.slice(1), broken]), n),
          ).not.toContain(`${n} says unsettled, its rulings make it matches`);
        }),
    );

    describe("the owner's answer to a disputed ruling", () => {
      const answer = (keeps: 'page' | 'source') =>
        ({
          by: 'owner',
          on: '2026-10-22',
          keeps,
          quote: "Let's go with your recommendation.",
        }) as const;
      /** Hymn 58's one disputed ruling, its hymn's other rulings, and its entry relabelled `matches`. */
      const hymn58 = Effect.map(read, ({ census, sources }) => {
        const all = sources.rulings.get(58) ?? [];
        const one = all.find((ruling) => ruling.kind === 'disputed')!;
        return {
          sources,
          all,
          one,
          matches: withEntry(census, 58, (entry) => ({
            ...entry,
            row: 'matches',
            note: 'answered',
          })),
        };
      });
      /** The first `matches` hymn with rulings, its first ruling made a disputed one answered `page` that settles `settles`. */
      const pageAnswered = Effect.map(read, ({ census, sources }) => {
        const n = first(
          census,
          'matches',
          (one) => (sources.rulings.get(one.number) ?? []).length > 0,
        ).number;
        const all = sources.rulings.get(n) ?? [];
        const one = all[0]!;
        const ruled = (settles: readonly string[]): Ruling => ({
          ...one,
          kind: 'disputed',
          sung: one.row,
          settles,
          answer: answer('page'),
        });
        return { census, sources, n, all, ruled };
      });

      it.effect(
        'settles the lines of a disputed ruling answered source, its hymn as its words give, and flags one that settles nothing',
        () =>
          Effect.gen(function* () {
            const { sources, all, one, matches } = yield* hymn58;
            const answered: Ruling = { ...one, answer: answer('source') };
            const rulings = all.map((ruling) => (ruling === one ? answered : ruling));
            expect(aboutOnly(matches, withRulings(sources, 58, rulings), 58)).toEqual([]);
            const bare: Ruling = { ...answered, settles: [] };
            const lines = aboutOnly(
              matches,
              withRulings(
                sources,
                58,
                all.map((ruling) => (ruling === one ? bare : ruling)),
              ),
              58,
            );
            const i = all.indexOf(one) + 1;
            expect(lines).toContain(`58 ruling ${i} is disputed but settles no line`);
          }),
      );

      it.effect(
        'keeps a disputed ruling answered page that settles no line, its hymn as its words give, and flags one that settles a line',
        () =>
          Effect.gen(function* () {
            const { census, sources, n, all, ruled } = yield* pageAnswered;
            const lines = aboutOnly(
              census,
              withRulings(sources, n, [...all.slice(1), ruled([])]),
              n,
            );
            expect(lines).not.toContain(`${n} says matches, its rulings make it unsettled`);
            expect(lines).not.toContain(`${n} ruling ${all.length} has no site`);
            expect(lines).not.toContain(
              `${n} ruling ${all.length} is disputed but settles no line`,
            );
            const settling = aboutOnly(
              census,
              withRulings(sources, n, [...all.slice(1), ruled(['a line'])]),
              n,
            );
            expect(settling).toContain(
              `${n} ruling ${all.length} is answered page but settles a line`,
            );
          }),
      );

      it.effect('flags an answer on a ruling that is not disputed', () =>
        Effect.gen(function* () {
          const { census, sources, n, all } = yield* pageAnswered;
          const words: Ruling = { ...all[0]!, answer: answer('source') };
          expect(aboutOnly(census, withRulings(sources, n, [...all.slice(1), words]), n)).toContain(
            `${n} ruling ${all.length} answers no dispute`,
          );
        }),
      );

      it.effect(
        'lets a matches hymn own a fix that redivides its words only under a page answer, and never one that changes a word',
        () =>
          Effect.gen(function* () {
            const { census, sources, n, all, ruled } = yield* pageAnswered;
            const units = unitsOf(sources.rows.get(n)!);
            // Each stanza one line: the base words, divided otherwise.
            const redivided = withFix(sources, n, units);
            expect(aboutOnly(census, redivided, n)).toContain(
              `${n} has a fix file of its own but says matches`,
            );
            const answered = withRulings(redivided, n, [...all.slice(1), ruled([])]);
            expect(aboutOnly(census, answered, n)).not.toContain(
              `${n} has a fix file of its own but says matches`,
            );
            // The fix sings one word otherwise than its row.
            const fix = answered.fixes.get(n)!;
            const [line] = fix.stanzas[0]!;
            const changed = withFixFile(answered, n, {
              ...fix,
              stanzas: [[{ ...line!, text: `unruled ${line!.text}` }], ...fix.stanzas.slice(1)],
            });
            const lines = aboutOnly(census, changed, n);
            expect(lines.some((p) => p.startsWith(`${n} fix file and row differ: `))).toBe(true);
            expect(lines).toContain(`${n} has a fix file of its own but says matches`);
          }),
      );
    });

    describe('rulings of one stretch read the page one way (M3)', () => {
      /** A ruling of hymn `n`'s unit 1 at `at`: its row words, the words it sings, its crops those of `like`. */
      const ruling = (like: Ruling, at: number, row: string, sung: string): Ruling => ({
        ...like,
        sites: [{ unit: 1, at }],
        row,
        readings: [''],
        printed: sung,
        sung,
        kind: 'words',
        crops: like.crops.map((crop, i) => ({ ...crop, shows: i === 0 ? sung : '' })),
        judge: 'test',
      });
      const other = (one: Ruling): Ruling => ({ ...one, judge: 'another' });
      /** Hymn 23, its base unit 1's words, and its first ruling (the crops every case reads). */
      const hymn23 = Effect.map(read, ({ census, sources }) => ({
        census,
        sources,
        words: unitsOf(baseOf(sources, 23))[0]!,
        like: sources.rulings.get(23)![0]!,
      }));
      const disagree = /ruled twice|inside it|two judges|holds no/;

      it.effect('applies a ruling inside a wider one once, when they agree', () =>
        Effect.gen(function* () {
          const { census, sources, words, like } = yield* hymn23;
          const wide = ruling(
            like,
            0,
            words.slice(0, 4).join(' '),
            ['x', ...words.slice(1, 4)].join(' '),
          );
          const inner = ruling(like, 0, words[0]!, 'x');
          const problems = about(census, withRulings(sources, 23, [wide, inner]), 23);
          expect(problems.filter((p) => disagree.test(p))).toEqual([]);
          const agreed = applyRulings([words], [wide, inner]);
          expect(agreed.units[0]).toEqual(['x', ...words.slice(1)]);
          // The inner ruling stands at its own word, so its crop answers for that word alone.
          expect(agreed.spans.map(({ start, length }) => [start, length])).toEqual([
            [0, 4],
            [0, 1],
          ]);
        }),
      );

      it.effect('flags a ruling inside a wider one that sings other words at its place', () =>
        Effect.gen(function* () {
          const { census, sources, words, like } = yield* hymn23;
          const kept = words.slice(0, 4).join(' ');
          const wide = ruling(like, 0, kept, kept);
          expect(
            about(census, withRulings(sources, 23, [wide, ruling(like, 1, words[1]!, 'and')]), 23),
          ).toContain(
            `23 rulings: unit 1 at 0 is ruled "${kept}", and a ruling inside it at 1 "and"`,
          );
        }),
      );

      it.effect(
        "flags two rulings of overlapping words, and two judges' rulings of one stretch",
        () =>
          Effect.gen(function* () {
            const { census, sources, words, like } = yield* hymn23;
            const [w5, w6, w7] = [words[5]!, words[6]!, words[7]!];
            expect(
              about(
                census,
                withRulings(sources, 23, [
                  ruling(like, 5, `${w5} ${w6}`, `a ${w6}`),
                  ruling(like, 6, `${w6} ${w7}`, `${w6} at`),
                ]),
                23,
              ),
            ).toContain(
              '23 rulings: unit 1 at 5 and at 6 are ruled twice, and the rulings disagree',
            );
            expect(
              about(
                census,
                withRulings(sources, 23, [
                  ruling(like, 1, words[1]!, 'or'),
                  other(ruling(like, 2, '', 'and')),
                ]),
                23,
              ),
            ).toContain('23 rulings: unit 1 at 1 and at 2 rule one stretch, by two judges');
          }),
      );

      it.effect(
        "flags hymn 23's ruling ruled again by a second judge who reads the row's words",
        () =>
          Effect.gen(function* () {
            const { census, sources } = yield* hymn23;
            const rulings = sources.rulings.get(23)!;
            const changing = rulings.find(
              (one) => wordsOf(one.row).join(' ') !== wordsOf(one.sung).join(' '),
            )!;
            const again: Ruling = {
              ...changing,
              judge: `${changing.judge} (second judge)`,
              printed: changing.row,
              sung: changing.row,
              crops: changing.crops.map((crop, i) => ({
                ...crop,
                shows: i === 0 ? changing.row : '',
              })),
            };
            const site = changing.sites[0]!;
            const counted = withEntry(census, 23, (one) => ({
              ...one,
              rulings: { ...one.rulings, all: one.rulings.all + 1 },
            }));
            expect(about(counted, withRulings(sources, 23, [...rulings, again]), 23)).toContain(
              `23 rulings: unit ${site.unit} at ${site.at} and at ${site.at} are ruled twice, and the rulings disagree`,
            );
          }),
      );

      it.effect(
        'flags an inner ruling that sings a word the wider one keeps elsewhere (alpha)',
        () =>
          Effect.gen(function* () {
            const { census, sources, like } = yield* hymn23;
            const words = ['alpha', 'beta', 'gamma', 'alpha'];
            const kept = words.join(' ');
            const mutated = withRulings(withBase(sources, 23, rowOfUnits([words])), 23, [
              ruling(like, 0, kept, kept),
              ruling(like, 1, 'beta', 'alpha'),
            ]);
            expect(about(census, mutated, 23)).toContain(
              `23 rulings: unit 1 at 0 is ruled "${kept}", and a ruling inside it at 1 "alpha"`,
            );
          }),
      );
    });

    it.effect(
      'reads a word the page breaks over two crops as one word, and flags a word given to two crops',
      () =>
        Effect.gen(function* () {
          const { census, sources } = yield* read;
          const [n, all] = [...sources.rulings].find(([, one]) => one.length > 0)!;
          const one = all[0]!;
          const first = one.crops[0]!;
          const split = (top: string, bottom: string): Ruling => ({
            ...one,
            printed: 'revealed',
            crops: [
              { ...first, shows: top },
              {
                ...first,
                box: [first.box[0], first.box[1] + first.box[3], first.box[2], first.box[3]],
                shows: bottom,
              },
            ],
          });
          expect(printedOf(split('re-', 'vealed').crops)).toBe('revealed');
          expect(
            about(census, withRulings(sources, n, [split('re-', 'vealed'), ...all.slice(1)]), n),
          ).not.toContainEqual(expect.stringMatching(/^\d+ ruling 1 prints /));
          expect(
            about(
              census,
              withRulings(sources, n, [split('revealed', 'revealed'), ...all.slice(1)]),
              n,
            ),
          ).toContain(`${n} ruling 1 prints "revealed", not the words its crops show`);
        }),
    );

    it.effect('flags a committed crop no ruling names (m5)', () =>
      Effect.gen(function* () {
        const { census, sources } = yield* read;
        const crops = new Map([
          ...sources.crops,
          ['001/stray.jpg', { width: 1, height: 1, sha: '' }],
        ]);
        expect(problemsOf(census, { ...sources, crops })).toContain(
          'crop 001/stray.jpg is named by no ruling',
        );
      }),
    );

    it.effect("flags a fix line read off an image that is not the hymn's deciding page (m3)", () =>
      Effect.gen(function* () {
        const { census, sources } = yield* read;
        const entry = first(
          census,
          'fixed',
          (one) => sources.fixes.get(one.number)?.replaces !== undefined,
        );
        const n = entry.number;
        const fix = sources.fixes.get(n)!;
        const [line] = fix.stanzas[0]!;
        const moved: Fix = {
          ...fix,
          stanzas: [
            [{ ...line!, from: 'p999.jpg system 0, row nowhere' }, ...fix.stanzas[0]!.slice(1)],
            ...fix.stanzas.slice(1),
          ],
        };
        expect(about(census, withFixFile(sources, n, moved), n)).toContain(
          `${n} fix line "${line!.text}" is read off p999.jpg, no deciding page`,
        );
      }),
    );
  });

  describe('words decided only on crops (M2)', () => {
    // Each ruling as it stood at 9290e532e: one crop, and a `why` that read the words off the page image.
    // 440's run lies in one system, so only its `why` gives it away.
    for (const [n, unit, at, image, systems] of [
      [232, 5, 0, '232.jpg', true],
      [440, 1, 16, 'p427.jpg', false],
      [443, 1, 22, 'p430.jpg', true],
      [443, 2, 24, 'p430.jpg', true],
      [443, 3, 21, 'p430.jpg', true],
    ] as const)
      it.effect(
        `flags ${n} u${unit}@${at} decided off ${image}, on one crop of a run over several systems`,
        () =>
          Effect.gen(function* () {
            const { census, sources } = yield* read;
            const all = sources.rulings.get(n) ?? [];
            const i = all.findIndex((one) =>
              one.sites.some((site) => site.unit === unit && site.at === at),
            );
            expect(i).toBeGreaterThanOrEqual(0);
            const ruling = all[i]!;
            const head: Ruling = {
              ...ruling,
              crops: ruling.crops.slice(0, 1).map((crop) => ({ ...crop, shows: ruling.printed })),
              why: `${ruling.why} The words below the crop were read on ${image}.`,
            };
            const problems = about(
              census,
              withRulings(
                sources,
                n,
                all.map((one) => (one === ruling ? head : one)),
              ),
              n,
            );
            expect(problems).toContain(
              `${n} ruling ${i + 1} reads ${image}, which is no committed crop`,
            );
            if (systems)
              expect(
                problems.some((p) =>
                  new RegExp(
                    `^${n} ruling ${i + 1} writes lines of \\d+ systems off 1 crops$`,
                  ).test(p),
                ),
              ).toBe(true);
          }),
      );
  });

  describe('refrains that vary are written as varying (M5)', () => {
    it.effect('flags one later varies variant of a fix changed', () =>
      Effect.gen(function* () {
        const { census, sources } = yield* read;
        const [n, fix] = [...sources.fixes].find(([, one]) =>
          (one.refrain?.lines ?? []).some((item) => 'varies' in item && item.varies.length > 1),
        )!;
        const lines = fix.refrain!.lines.map((item) =>
          'varies' in item
            ? {
                varies: item.varies.map((part, k) =>
                  k === item.varies.length - 1
                    ? {
                        ...part,
                        lines: part.lines.map((line, j) =>
                          j === part.lines.length - 1
                            ? { ...line, text: `${line.text} changed` }
                            : line,
                        ),
                      }
                    : part,
                ),
              }
            : item,
        );
        const problems = about(census, withFixFile(sources, n, { ...fix, refrain: { lines } }), n);
        expect(problems.some((p) => p.startsWith(`${n} fix file and row differ: unit `))).toBe(
          true,
        );
      }),
    );

    it.effect(
      'flags a blind reading that prints a refrain varying by stanza where no shape reading says how',
      () =>
        Effect.gen(function* () {
          const { census, sources } = yield* read;
          // Every hymn with a deciding page has a shape reading now: the readings are held here with none.
          const entry = first(census, 'matches', () => true);
          const n = entry.number;
          const deciding = decidingOf(sources.inventory).get(n)!;
          const base = baseOf(sources, n);
          const varying = reading(n, deciding.images, unitsOf(base), {
            refrain: 'first row',
            refrainRows: ['first row', 'second row'],
          });
          expect(readingProblems(entry, deciding, base, [], [varying])).toContain(
            `${n} readings print a refrain that varies by stanza, and no shape reading of its page says how`,
          );
          // A shape reading that prints no varying rows, and no ruling of a repeat or an echo that says why.
          const outline = outlineOf(sources, 187);
          expect(
            readingProblems(entry, deciding, base, [], [varying], [{ ...outline, number: n }]),
          ).toContain(
            `${n} a reading prints a refrain that varies by stanza, its shape reading none, and no ruling says why`,
          );
        }),
    );
  });

  describe('the shape is read off the page alone (P1)', () => {
    it.effect('reads every committed shape the same whatever the row holds', () =>
      Effect.gen(function* () {
        const { sources } = yield* read;
        expect(sources.outlines.size).toBeGreaterThanOrEqual(103);
        for (const [n, outlines] of sources.outlines)
          for (const outline of outlines) {
            const { reader, ...report } = outline;
            const before = outlineOfReport(report, reader);
            const changed = withRow(sources, n, mutate(sources.rows.get(n) ?? [], 'swap23'));
            // @ts-expect-error the shape reader is given the report and its name: never a row
            outlineOfReport(report, reader, changed.rows.get(n));
            expect(outlineOfReport(report, reader)).toStrictEqual(before);
            expect(before).toStrictEqual(outline);
          }
      }),
    );

    it.effect(
      "flags a committed shape that is no reader's report, and a report not committed",
      () =>
        Effect.gen(function* () {
          const { sources } = yield* read;
          const outline = outlineOf(sources, 187);
          const reports = [...sources.outlines.values()].flat();
          expect(outlineReportProblems(sources, reports)).toEqual([]);
          const dropped = { ...outline, refrain: null };
          expect(outlineReportProblems(withOutlines(sources, 187, [dropped]), reports)).toEqual([
            `187 shape (${outline.reader}) is no shape reader's report`,
            `187 shape (${outline.reader}) is reported but not committed`,
          ]);
        }),
    );

    const mutants: ReadonlyArray<readonly [number, readonly string[]]> = [
      [187, ['norefrain', 'swap23', 'droplast', 'dropline:3']],
      [121, ['norefrain', 'swap23']],
      [362, ['norefrain', 'swap23']],
      [505, ['norefrain', 'swap23']],
      [31, ['swap23']],
    ];
    for (const [n, modes] of mutants)
      for (const mode of modes)
        it.effect(`flags ${n} with the row's ${mode} mutant made the base row`, () =>
          Effect.gen(function* () {
            const { census, sources } = yield* read;
            const row = sources.rows.get(n)!;
            const outline = outlineOf(sources, n);
            expect(entryOf(census, n).readings.reader).toBe(0);
            const order = sources.orders.get(n);
            expect(
              outlineProblems(
                n,
                outline,
                row,
                sources.fixes.get(n),
                false,
                order,
                bookOf(sources, n),
              ),
            ).toEqual([]);
            const mutant = mutate(row, mode);
            expect(mutant).not.toEqual(row);
            expect(
              outlineProblems(n, outline, mutant, undefined, false, order, bookOf(sources, n)),
            ).not.toEqual([]);
            expect(
              about(census, withBase(sources, n, mutant), n).some((p) =>
                p.startsWith(`${n} shape (${outline.reader}): `),
              ),
            ).toBe(true);
          }),
        );

    it.effect(
      'flags each shape the rule names: refrain, unnumbered row, line order, a line the page lacks',
      () =>
        Effect.gen(function* () {
          const { sources } = yield* read;
          const n = 187;
          const outline = outlineOf(sources, n);
          const row = sources.rows.get(n)!;
          const order = sources.orders.get(n);
          const what = `${n} shape (${outline.reader})`;
          // The page prints no refrain, the row writes one.
          expect(
            outlineProblems(
              n,
              { ...outline, refrain: null },
              row,
              undefined,
              false,
              order,
              bookOf(sources, n),
            ),
          ).toContain(`${what}: the page prints no refrain, the printed source has one`);
          // An unnumbered row the page prints, which the row lacks.
          const unnumbered = {
            system: 1,
            strip: 'x.jpg',
            words: 4,
            first: 'quorum vellum',
            mid: 'vellum zephyr',
            last: 'zephyr quartz',
            capitals: [1],
            why: 'a row with no number',
          };
          expect(
            outlineProblems(
              n,
              { ...outline, extra: [unnumbered] },
              row,
              undefined,
              false,
              order,
              bookOf(sources, n),
            ),
          ).toContain(
            `${what}: a row "quorum vellum" (a row with no number) is in no part of the printed source`,
          );
          // Stanza 1's first and last lines swapped.
          const swapped = row.map((v) => {
            if (v.id !== 0) return v;
            const lines = v.text.split('\n');
            return { ...v, text: [lines.at(-1)!, ...lines.slice(1, -1), lines[0]!].join('\n') };
          });
          expect(
            outlineProblems(n, outline, swapped, undefined, false, order, bookOf(sources, n)).some(
              (p) => p.startsWith(`${what}: stanza 1 `),
            ),
          ).toBe(true);
          // A line the page never prints, at the end of stanza 1 (before the refrain sung after it).
          const added = row.map((v) => {
            if (v.id !== 0) return v;
            const lines = v.text.split('\n');
            return {
              ...v,
              text: [...lines, 'quorum vellum zephyr quartz'].join('\n'),
            };
          });
          // The refrain's rows after it no longer stand where their counts put them, and
          // stanza 1 has a line more than the metre fits: every line is about stanza 1.
          const moved = outlineProblems(
            n,
            outline,
            added,
            undefined,
            false,
            order,
            bookOf(sources, n),
          );
          const about1 = new RegExp(
            `^${what.replace(/[()]/g, '\\$&')}: (the refrain after stanza 1: |stanza 1 has )`,
          );
          expect(moved.some((line) => line.includes('the refrain after stanza 1: '))).toBe(true);
          for (const line of moved) expect(line).toMatch(about1);
          // A line the page never prints at the refrain's end, closing on the
          // last words of stanza 1's last row: that row stops at its stanza's end.
          const closing = outline.stanzas[0]!.rows.at(-1)!.last;
          const tail = row.map((v) =>
            v.id < 0 ? { ...v, text: `${v.text}\nquorum vellum zephyr ${closing}` } : v,
          );
          expect(
            outlineProblems(n, outline, tail, undefined, false, order, bookOf(sources, n)),
          ).toContain(
            `${what}: stanza 1 sings 5 words from "quorum vellum" on, in no row the page prints`,
          );
        }),
    );

    it.effect("flags the refrain's end a page does not print, after the last stanza too", () =>
      Effect.gen(function* () {
        const { sources } = yield* read;
        const n = 187;
        const outline = outlineOf(sources, n);
        const refrain = outline.refrain!;
        const cut = { ...outline, refrain: { ...refrain, rows: refrain.rows.slice(0, -1) } };
        const problems = outlineProblems(
          n,
          cut,
          sources.rows.get(n)!,
          sources.fixes.get(n),
          false,
          sources.orders.get(n),
          bookOf(sources, n),
        );
        for (const i of outline.stanzas.keys())
          expect(
            problems.some((p) =>
              p.startsWith(`${n} shape (${outline.reader}): stanza ${i + 1} sings `),
            ),
          ).toBe(true);
      }),
    );
  });

  describe('a refrain the page varies by stanza is written varying (P5)', () => {
    it.effect(
      'holds every shape reading that varies to a printed source with those varies parts',
      () =>
        Effect.gen(function* () {
          const { census, sources } = yield* read;
          const problems = problemsOf(census, sources);
          const varying = [...sources.outlines].filter(([, outlines]) =>
            outlines.some((outline) => outlineVaries(outline).length > 0),
          );
          expect(varying.map(([n]) => n)).toEqual(expect.arrayContaining([140, 258, 593]));
          // Held: the fix writes varies parts, or the census prints a line for it, open or
          // settled by a judge's ruling on crops (86 prints its stanza 4 twice).
          for (const [n] of varying) {
            const parts = (sources.fixes.get(n)?.refrain?.lines ?? []).some(
              (item) => 'varies' in item,
            );
            const settled = (sources.rulings.get(n) ?? []).some((ruling) =>
              (ruling.settles ?? []).some((line) => line.includes('the page prints refrain rows')),
            );
            expect(parts || settled || problems.some((p) => p.startsWith(`${n} shape (`))).toBe(
              true,
            );
          }
        }),
    );

    for (const n of [140, 258, 593, 326])
      it.effect(`flags ${n} with its fix's varies parts dropped`, () =>
        Effect.gen(function* () {
          const { census, sources } = yield* read;
          const fix = sources.fixes.get(n)!;
          const outline = outlineOf(sources, n);
          expect(outlineVaries(outline)).not.toEqual([]);
          expect(fix.refrain?.lines.some((item) => 'varies' in item)).toBe(true);
          // The row as it stands sings each stanza's own refrain, with no varies part: no fix.
          expect(about(census, withoutFix(sources, n), n)).toContain(
            `${n} shape (${outline.reader}): the page prints refrain rows for stanzas ${outlineVaries(
              outline,
            )
              .map((group) => `[${group.join(', ')}]`)
              .join(' and ')} only, and the printed source sings no varies part after them`,
          );
        }),
      );

    it.effect('flags 220 with its varies parts sung as one refrain after every stanza', () =>
      Effect.gen(function* () {
        const { sources } = yield* read;
        const fix = sources.fixes.get(220)!;
        const lines = fix.refrain!.lines.flatMap((item) =>
          'varies' in item ? item.varies[0]!.lines : [item],
        );
        // Against the hymn's own unflattened lines, settled ones too.
        const outline = outlineOf(sources, 220);
        const linesOf = (fixed: typeof fix) =>
          outlineProblems(
            220,
            outline,
            sources.rows.get(220)!,
            fixed,
            false,
            sources.orders.get(220),
            bookOf(sources, 220),
          );
        const before = new Set(linesOf(fix));
        const after = linesOf({ ...fix, refrain: { lines } }).filter((p) => !before.has(p));
        expect(after).toContain(
          `220 shape (${outline.reader}): the page prints refrain rows for stanzas [1] and [2] and [3] only, and the printed source sings no varies part after them`,
        );
        expect(after.some((p) => p.includes(': the refrain after stanza 2: '))).toBe(true);
      }),
    );
  });

  describe('the fixes before the census stay (M2)', () => {
    it.effect('holds every fix file of the base commit at head', () =>
      Effect.gen(function* () {
        const { census, sources } = yield* read;
        expect(sources.baseFixes).toEqual(
          expect.arrayContaining([138, 203, 220, 438, 593, 620, 628]),
        );
        for (const n of sources.baseFixes) expect(sources.fixes.has(n)).toBe(true);
        expect(about(census, withoutFix(sources, 138), 138)).toContain(
          '138 fix file at the base commit is gone',
        );
      }),
    );
  });

  describe('readings: read means read blind (M1)', () => {
    it.effect('flags a run only the second reading has, with no ruling', () =>
      Effect.gen(function* () {
        const { census, sources } = yield* read;
        const entry = first(census, 'matches', (one) => one.source === 'scan');
        const deciding = decidingOf(sources.inventory).get(entry.number)!;
        const base = baseOf(sources, entry.number);
        const units = unitsOf(base);
        const second = units.map((unit) => [...unit]);
        second[0]![0] = 'misread';
        const readings = [
          reading(entry.number, deciding.images, units),
          reading(entry.number, deciding.images, second),
        ];
        const counted = { ...entry, readings: { reader: 2, ocr: 0 } };
        expect(readingProblems(counted, deciding, base, [], readings)).toEqual([
          `${entry.number} unruled unit 1 at 0 row="${units[0]![0]}" page="misread"`,
        ]);
      }),
    );

    it.effect('flags a matches entry whose page only refusals and proofs reached', () =>
      Effect.gen(function* () {
        const { census, sources } = yield* read;
        const entry = first(census, 'matches', (one) => one.source === 'scan');
        const n = entry.number;
        const deciding = decidingOf(sources.inventory).get(n)!;
        const base = baseOf(sources, n);
        // Two refusals: a reader that would not transcribe the page reads nothing.
        const refusals = [reading(n, deciding.images, []), reading(n, deciding.images, [])];
        // As 9290e532e counted it: the refusals, and two proofs shown the row.
        const proofs = { ...entry, readings: { reader: 2, ocr: 0 } };
        expect(readingProblems(proofs, deciding, base, [], refusals)).toEqual([
          `${n} counts 2 reader and 0 OCR readings, the folder 0 and 0`,
          `${n} unread on ${deciding.source}`,
        ]);
        const counted = withEntry(census, n, (one) => ({
          ...one,
          readings: { reader: 0, ocr: 0 },
        }));
        expect(about(counted, sources, n)).toEqual([
          `${n} says matches, but counts no blind reading of its page`,
        ]);
      }),
    );

    it.effect('flags 584 with the two stanzas its page prints and its row lacks dropped', () =>
      Effect.gen(function* () {
        const { census, sources } = yield* read;
        const entry = entryOf(census, 584);
        const deciding = decidingOf(sources.inventory).get(584)!;
        const base = baseOf(sources, 584);
        const units = unitsOf(base);
        // A blind reading of the page's 7 stanzas; no ruling on the 2 the row lacks.
        const seven = reading(584, deciding.images, [
          ...units,
          ['sixth', 'stanza'],
          ['seventh', 'stanza'],
        ]);
        const rulings = (sources.rulings.get(584) ?? []).filter((one) =>
          one.sites.every((site) => site.unit <= units.length),
        );
        const counted = { ...entry, readings: { reader: 0, ocr: 1 }, row: 'unsettled' as const };
        const problems = readingProblems(counted, deciding, base, rulings, [seven]);
        expect(problems).toContain(
          `584 unruled unit ${units.length + 1} at 0 row="" page="sixth stanza"`,
        );
        expect(problems).toContain(
          `584 unruled unit ${units.length + 2} at 0 row="" page="seventh stanza"`,
        );
      }),
    );

    it.effect(
      'flags a hymn with no reading of its deciding page, and a nopage one whose page was read',
      () =>
        Effect.gen(function* () {
          const { census, sources } = yield* read;
          const entry = first(census, 'matches', (one) => one.source === 'scan');
          const deciding = decidingOf(sources.inventory).get(entry.number)!;
          const base = baseOf(sources, entry.number);
          const none = { ...entry, readings: { reader: 0, ocr: 0 } };
          expect(readingProblems(none, deciding, base, [], [])).toEqual([
            `${entry.number} unread on scan`,
          ]);
          // A reading of another page does not count.
          const elsewhere = reading(entry.number, ['p999.jpg'], unitsOf(base));
          expect(readingProblems(none, deciding, base, [], [elsewhere])).toEqual([
            `${entry.number} unread on scan`,
          ]);
          const nopage = { ...entry, row: 'nopage' as const, readings: { reader: 0, ocr: 1 } };
          expect(
            readingProblems(
              nopage,
              deciding,
              base,
              [],
              [reading(entry.number, deciding.images, unitsOf(base), { by: 'ocr' })],
            ),
          ).toEqual([`${entry.number} says nopage, but its page was read`]);
        }),
    );
  });

  describe('the witness (m6)', () => {
    it.effect('compares every later refrain block that differs from the first', () =>
      Effect.sync(() => {
        const row: Verses = [
          { id: 0, text: 'one stanza' },
          { id: 1, text: 'two stanza' },
          { id: -1, text: 'the refrain' },
        ];
        const same = {
          stanzas: ['one stanza', 'two stanza'],
          refrains: ['the refrain', 'the refrain'],
        };
        expect(hunksOf(row, same)).toEqual([]);
        const later = { ...same, refrains: ['the refrain', 'the other refrain'] };
        expect(hunksOf(row, later)).toEqual([[-2, [], ['other']]]);
      }),
    );

    it.effect(
      'prints each hunk by its places and word tags, no word of the row or the witness',
      () =>
        Effect.sync(() => {
          const row: Verses = [
            { id: 0, text: 'quorum vellum ardent' },
            { id: 1, text: 'tessel marrow quill' },
          ];
          const witness = {
            stanzas: ['quorum wicket ardent', 'tessel marrow plinth'],
            refrains: [],
          };
          const lines = hunksOf(row, witness).map((hunk) => hunkLine(17, hunk));
          expect(lines).toEqual([
            `hunk 17 1 row=${tag('vellum')} witness=${tag('wicket')}`,
            `hunk 17 2 row=${tag('quill')} witness=${tag('plinth')}`,
          ]);
          const words = new Set(
            [...row, ...witness.stanzas.map((text) => ({ id: 0, text }))].flatMap((verse) =>
              wordsOf(verse.text),
            ),
          );
          expect(lines.flatMap(wordsOf).filter((word) => words.has(word))).toEqual([]);
        }),
    );
  });

  describe("the owner's answers (rows the page contradicts)", () => {
    /** The hymns whose committed rulings hold an answer `keeps`, or (`undefined`) an unanswered `disputed` ruling. */
    const answeredBy = (sources: Sources, keeps: 'page' | 'source' | undefined) =>
      [...sources.rulings]
        .filter(([, rulings]) =>
          rulings.some(
            (ruling) =>
              ruling.kind === 'disputed' &&
              (keeps === undefined ? ruling.answer === undefined : ruling.answer?.keeps === keeps),
          ),
        )
        .map(([n]) => n)
        .toSorted((a, b) => a - b);

    it.effect('answers page for six hymns, source for three, and leaves none disputed', () =>
      Effect.gen(function* () {
        const { sources } = yield* read;
        expect(answeredBy(sources, 'page')).toEqual([3, 18, 162, 207, 214, 402]);
        expect(answeredBy(sources, 'source')).toEqual([58, 243, 398]);
        expect(answeredBy(sources, undefined)).toEqual([]);
      }),
    );

    /** A compiled line: its syllables, each with its word's place in the line (0 = first). */
    const CompiledLines = Schema.Array(Schema.Array(Schema.Struct({ word: Schema.Int })));
    /** The parts of a compiled hymn (`data/sdah-1985/NNN.json`) these cases read. */
    const decodeCompiled = Schema.decodeEffect(
      Schema.fromJsonString(
        Schema.Struct({
          stanzas: Schema.Array(Schema.Struct({ lines: CompiledLines })),
          refrain: Schema.optionalKey(
            Schema.Struct({ part: Schema.Struct({ lines: CompiledLines }) }),
          ),
        }),
      ),
    );
    /** Each line's first word by its place in the part (1 = the part's first word), and the part's word count. */
    const startsOf = (lines: typeof CompiledLines.Type) => {
      const starts: number[] = [];
      let at = 1;
      for (const line of lines) {
        starts.push(at);
        at += new Set(line.map((syllable) => syllable.word)).size;
      }
      return { starts, count: at - 1 };
    };
    /** The places in the part of the words its shape rows print with a capital, each row offset by the words of the rows before it. */
    const capitalsOf = (
      rows: ReadonlyArray<{ readonly words: number; readonly capitals: readonly number[] }>,
    ) => {
      const capitals = new Set<number>();
      let before = 0;
      for (const row of rows) {
        for (const place of row.capitals) capitals.add(before + place);
        before += row.words;
      }
      return capitals;
    };
    /** Each part (stanzas in order, then the refrain) of each hymn answered page, as compiled and as its shape reading and fix give it. */
    const pageParts = Effect.gen(function* () {
      const { sources } = yield* read;
      const fs = yield* FileSystem.FileSystem;
      const numbers = answeredBy(sources, 'page');
      return yield* Effect.forEach(numbers, (n) =>
        Effect.gen(function* () {
          const compiled = yield* decodeCompiled(
            yield* fs.readFileString(
              new URL(`../data/sdah-1985/${String(n).padStart(3, '0')}.json`, import.meta.url)
                .pathname,
            ),
          );
          const outline = sources.outlines.get(n)![0]!;
          const fix = sources.fixes.get(n)!;
          const parts = [
            ...compiled.stanzas.map((stanza, k) => ({
              name: `stanza ${k + 1}`,
              lines: stanza.lines,
              rows: outline.stanzas[k]?.rows ?? [],
              fix: fix.stanzas[k] ?? [],
              base: fix.replaces?.find((verse) => verse.id === k)?.text,
            })),
            ...(compiled.refrain === undefined
              ? []
              : [
                  {
                    name: 'refrain',
                    lines: compiled.refrain.part.lines,
                    rows: outline.refrain?.rows ?? [],
                    fix: (fix.refrain?.lines ?? []).flatMap((item) =>
                      'varies' in item ? [] : [item],
                    ),
                    base: fix.replaces?.find((verse) => verse.id === -1)?.text,
                  },
                ]),
          ];
          return { n, stanzas: compiled.stanzas.map((stanza) => stanza.lines.length), parts };
        }),
      );
    }).pipe(Effect.provide(BunServices.layer));

    it.effect('sings each stanza of a hymn answered page in as many lines as its stanza 1', () =>
      Effect.gen(function* () {
        const hymns = yield* pageParts;
        expect(hymns.map(({ n, stanzas }) => [n, stanzas])).toEqual([
          [3, [9, 9, 9]],
          [18, [10, 10, 10, 10]],
          [162, [7, 7, 7]],
          [207, [4, 4, 4]],
          [214, [10, 10]],
          [402, [4, 4, 4, 4]],
        ]);
      }),
    );

    it.effect(
      'opens every line but the first of a hymn answered page on a word the page prints with a capital',
      () =>
        Effect.gen(function* () {
          const hymns = yield* pageParts;
          const skipped: string[] = [];
          const lowercase: string[] = [];
          for (const { n, parts } of hymns)
            for (const part of parts) {
              const { starts, count } = startsOf(part.lines);
              if (part.rows.reduce((sum, row) => sum + row.words, 0) !== count) {
                skipped.push(`${n} ${part.name}`);
                continue;
              }
              const capitals = capitalsOf(part.rows);
              lowercase.push(
                ...starts
                  .map((start, k) => ({ start, k }))
                  .filter(({ start, k }) => k > 0 && !capitals.has(start))
                  .map(({ start, k }) => `${n} ${part.name} line ${k + 1} at word ${start}`),
              );
            }
          // 402's stanza 3 reads 22 words on the page and 21 in the row: count noise the census passes.
          expect(skipped).toEqual(['402 stanza 3']);
          expect(lowercase).toEqual([]);
        }),
    );

    it.effect('changes no word of a hymn answered page: only where its lines break', () =>
      Effect.gen(function* () {
        const hymns = yield* pageParts;
        const single = (text: string) =>
          text
            .split(/\s+/)
            .filter((word) => word !== '')
            .join(' ');
        const changed: string[] = [];
        // 214's fix changes two words by its own rulings: the census's row check holds it.
        for (const { n, parts } of hymns.filter(({ n }) => n !== 214))
          for (const part of parts)
            if (
              part.base === undefined ||
              single(part.fix.map((line) => line.text).join(' ')) !== single(part.base)
            )
              changed.push(`${n} ${part.name}`);
        expect(changed).toEqual([]);
      }),
    );
  });

  describe('the logs (no hymn text)', () => {
    it.effect('a census run prints no run of 3 words of any hymn', () =>
      Effect.gen(function* () {
        const { census, sources } = yield* read;
        const runs = hymnRunsOf(sources.rows);
        // The guard sees a run: three words of a row, printed bare, are found.
        const [first = ''] = runs;
        expect(linesQuoting([`problem 1 ${first}`], runs)).toEqual(['line 1 word 3']);
        // A note that quotes the page (86's engraving) prints its tag.
        expect(
          linesQuoting(censusLines(census, sources, problemsOf(census, sources)), runs),
        ).toEqual([]);
      }),
    );
  });

  describe('photos', () => {
    it.effect('refuses a photo stored sideways or turned by its EXIF', () =>
      Effect.sync(() => {
        expect(photoProblem(jpeg(2268, 3024))).toBeUndefined();
        expect(photoProblem(jpeg(2268, 3024, 1))).toBeUndefined();
        expect(photoProblem(jpeg(3024, 2268))).toBe('stored sideways (3024x2268)');
        expect(photoProblem(jpeg(2268, 3024, 6))).toBe('EXIF orientation 6');
        expect(photoProblem(new Uint8Array([0x89, 0x50]))).toBe('not a JPEG');
      }),
    );
  });
});
