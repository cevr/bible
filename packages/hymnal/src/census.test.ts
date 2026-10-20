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

import { Effect, Exit, FileSystem, Option } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import {
  applyRulings,
  baseDigestOf,
  baseOf,
  baseRowsAt,
  type Census,
  censusLayer,
  decidingOf,
  decodeCensus,
  type Entry,
  type Fix,
  hunksOf,
  type Inventory,
  inventoryProblems,
  lentReadings,
  loadSources,
  photoProblem,
  printedOf,
  problemsOf,
  readingProblems,
  type Reading,
  type Ruling,
  type Sources,
  unitsOf,
  type Verses,
  wordsOf,
} from '../scripts/census.js';

const data = (file: string) => new URL(`../data/${file}`, import.meta.url).pathname;

/** The census and its sources, read once for this file. */
const read = Effect.runSync(
  Effect.cached(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const census = yield* decodeCensus(yield* fs.readFileString(data('census.json')));
      const sources = yield* loadSources;
      return { census, sources };
    }).pipe(Effect.provide(censusLayer)),
  ),
);

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
      'applies a ruling inside a wider one once, and flags rulings of one stretch that disagree',
      () =>
        Effect.sync(() => {
          const ruling = (at: number, row: string, sung: string): Ruling => ({
            sites: [{ unit: 1, at }],
            row,
            readings: [''],
            printed: sung,
            sung,
            kind: 'words',
            crops: [],
            judge: 'test',
            why: 'test',
          });
          const base = [['out', 'our', 'unexpressed', 'o', 'to', 'the', 'sky', 'to', 'the', 'sky']];
          const wide = ruling(0, 'out our unexpressed o', 'out or unexpressed o');
          const agreed = applyRulings(base, [wide, ruling(1, 'our', 'or')]);
          expect(agreed.misplaced).toEqual([]);
          expect(agreed.units[0]).toEqual([
            'out',
            'or',
            'unexpressed',
            'o',
            'to',
            'the',
            'sky',
            'to',
            'the',
            'sky',
          ]);
          // The inner ruling stands at its own word, so its crop answers for that word alone.
          expect(agreed.spans.map(({ start, length }) => [start, length])).toEqual([
            [0, 4],
            [1, 1],
          ]);
          expect(applyRulings(base, [wide, ruling(1, 'our', 'and')]).misplaced).toEqual([
            'unit 1 at 0 is ruled "out or unexpressed o", and a ruling inside it at 1 "and"',
          ]);
          // 220's refrain: a line ruled printed once, and its echo's words ruled away one by one.
          const once = ruling(4, 'to the sky to the sky', 'to the sky');
          const echo = applyRulings(base, [once, ruling(7, 'to', ''), ruling(9, 'sky', '')]);
          expect(echo.misplaced).toEqual([]);
          expect(echo.units[0]).toEqual(['out', 'our', 'unexpressed', 'o', 'to', 'the', 'sky']);
          expect(
            applyRulings(base, [ruling(5, 'the sky', 'a sky'), ruling(6, 'sky to', 'sky at')])
              .misplaced,
          ).toEqual(['unit 1 at 5 and at 6 are ruled twice, and the rulings disagree']);
          // 122: two judges read "light and life" against "Life and light" two ways; mixed, they write neither.
          const other = (one: Ruling): Ruling => ({ ...one, judge: 'another' });
          expect(
            applyRulings(base, [ruling(1, 'our', 'or'), other(ruling(2, '', 'and'))]).misplaced,
          ).toEqual(['unit 1 at 1 and at 2 rule one stretch, by two judges']);
          // A ruling of an earlier round inside a wider one of this round agrees, whoever judged it.
          expect(applyRulings(base, [once, other(ruling(7, 'to', ''))]).misplaced).toEqual([]);
        }),
    );

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
      'flags a census fix that writes no varies where a blind reading prints a refrain that varies',
      () =>
        Effect.gen(function* () {
          const { census, sources } = yield* read;
          const entry = first(
            census,
            'fixed',
            (one) => sources.fixes.get(one.number)?.replaces !== undefined,
          );
          const n = entry.number;
          const deciding = decidingOf(sources.inventory).get(n)!;
          const base = baseOf(sources, n);
          const flat: Fix = { number: n, stanzas: sources.fixes.get(n)!.stanzas, replaces: base };
          const varying = reading(n, deciding.images, unitsOf(base), {
            refrain: 'first row',
            refrainRows: ['first row', 'second row'],
          });
          expect(
            readingProblems(entry, deciding, base, sources.rulings.get(n) ?? [], [varying], flat),
          ).toContain(`${n} readings print a refrain that varies by stanza, its fix writes none`);
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
