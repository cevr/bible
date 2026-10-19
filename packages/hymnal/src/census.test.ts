/**
 * The census property: `data/census.json` holds one entry for every hymn
 * 1-695, in order, each `matches`, `fixed`, `unsettled` or `nopage`, and each
 * agrees with what the census reads and its builder does not write: the page
 * inventory (`data/pages.json`) for its deciding page, the viewed rulings and
 * their crops (`data/crops/NNN/`) for its state and its row, the base row
 * (a fix file's `replaces`) for every word no ruling changes. The checks are
 * `scripts/census.ts`'s. The cases below are the census's mutant suite: each
 * is a defect an earlier round shipped (a relabelled state, an emptied page
 * list, a fix run with no ruling, a shared misreading a ruling overturned, a
 * changed later refrain variant, a run only the second reading has), held as
 * a fixed case the census must refuse.
 */

import { Effect, FileSystem, Option } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import {
  applyRulings,
  baseOf,
  type Census,
  censusLayer,
  decidingOf,
  decodeCensus,
  type Entry,
  type Inventory,
  inventoryProblems,
  loadSources,
  photoProblem,
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

/**
 * Hymn `n` rewritten to sing `units`, through a fix file that keeps its base
 * row as `replaces` (as the census's own fixes do), each line read off a page.
 */
const withFix = (
  sources: Sources,
  n: number,
  units: ReadonlyArray<readonly string[]>,
): Sources => ({
  ...withRow(sources, n, rowOfUnits(units)),
  fixes: new Map([
    ...sources.fixes,
    [
      n,
      {
        number: n,
        stanzas: units.map((unit) => [{ text: unit.join(' '), from: 'p001.jpg system 1 row 1' }]),
        replaces: baseOf(sources, n),
      },
    ],
  ]),
});

const withInventory = (sources: Sources, change: (inventory: Inventory) => Inventory): Sources => ({
  ...sources,
  inventory: change(sources.inventory),
});

/** The first entry in a state, with its number. */
const first = (census: Census, row: Entry['row']) =>
  Option.getOrThrowWith(
    Option.fromNullishOr(census.hymns.find((one) => one.row === row)),
    () => `no ${row} entry`,
  );

/**
 * A census that holds a `nopage` entry: its own first one, or, when every
 * page was read, its first ruled-on-nothing `matches` entry written as the
 * builder writes a hymn no reading reached (no reading, a note, the base row).
 */
const withNopage = (census: Census) => {
  const own = census.hymns.find((one) => one.row === 'nopage');
  if (own !== undefined) return { census, entry: own };
  const n = census.hymns.find((one) => one.row === 'matches' && one.rulings.all === 0)!.number;
  const made = withEntry(census, n, (one) => ({
    ...one,
    row: 'nopage',
    readings: { blind: 0, proof: 0 },
    note: 'no reading of its page could be made',
  }));
  return { census: made, entry: made.hymns.find((one) => one.number === n)! };
};

/** A row's units written back as a row: each unit a stanza, no refrain. */
const rowOfUnits = (units: ReadonlyArray<readonly string[]>): Verses =>
  units.map((unit, id) => ({ id, text: unit.join(' ') }));

/** A blind reading of hymn `n` that sings `units`, each a stanza. */
const reading = (
  n: number,
  images: readonly string[],
  units: ReadonlyArray<readonly string[]>,
): Reading => ({
  number: n,
  images,
  stanzas: units.map((unit) => unit.join(' ')),
});

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
      }),
  );

  it.effect('flags a census without hymn 7', () =>
    Effect.gen(function* () {
      const { census, sources } = yield* read;
      const without = { ...census, hymns: census.hymns.filter((entry) => entry.number !== 7) };
      expect(problemsOf(without, sources)).toEqual(['7 no entry']);
    }),
  );

  describe('relabel', () => {
    for (const [from, to] of [
      ['matches', 'unsettled'],
      ['matches', 'nopage'],
      ['matches', 'fixed'],
      ['fixed', 'matches'],
      ['fixed', 'unsettled'],
      ['unsettled', 'matches'],
      ['nopage', 'matches'],
    ] as const)
      it.effect(`flags a ${from} entry relabelled ${to}`, () =>
        Effect.gen(function* () {
          const { census: head, sources } = yield* read;
          const { census, entry } =
            from === 'nopage' ? withNopage(head) : { census: head, entry: first(head, from) };
          // The state relabelled from is one the census holds without a problem.
          expect(
            problemsOf(census, sources).filter((p) => p.startsWith(`${entry.number} `)),
          ).toEqual([]);
          const relabelled = withEntry(census, entry.number, (one) => ({
            ...one,
            row: to,
            note: one.note ?? 'relabelled',
          }));
          expect(
            problemsOf(relabelled, sources).filter((p) => p.startsWith(`${entry.number} `)),
          ).not.toEqual([]);
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
        const entry = census.hymns.find((one) => one.source === 'scan')!;
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
          problemsOf(census, withdrawn).some((p) => p.startsWith(`${entry.number} says scan`)),
        ).toBe(true);
      }),
    );

    it.effect('decides a hymn by its photo, but not a hymn the photos show only part of', () =>
      Effect.gen(function* () {
        const { sources } = yield* read;
        const deciding = decidingOf(sources.inventory);
        const photo = sources.inventory.photos[0]!;
        const n = photo.hymns[0]!;
        const whole = sources.inventory.partial.some((part) => part.hymn === n)
          ? undefined
          : deciding.get(n);
        if (whole !== undefined) expect(whole.source).toBe('photo');
        const cut = decidingOf({
          ...sources.inventory,
          partial: [...sources.inventory.partial, { hymn: n, missing: 'its second page' }],
        });
        expect(cut.get(n)?.source).not.toBe('photo');
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
          for (const image of deciding.get(lent.from)!.images) expect(own.images).toContain(image);
          const unlent = withInventory(sources, (inventory) => ({ ...inventory, lent: [] }));
          expect(problemsOf(census, unlent).some((p) => p.startsWith(`${lent.hymn} `))).toBe(true);
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

  describe('rows and rulings', () => {
    it.effect(
      'flags a row word changed with no fix file: the base row is not the one the census read',
      () =>
        Effect.gen(function* () {
          const { census, sources } = yield* read;
          const n = first(census, 'matches').number;
          const units = unitsOf(sources.rows.get(n)!).map((unit) => [...unit]);
          units[0]![0] = 'unruled';
          expect(problemsOf(census, withRow(sources, n, rowOfUnits(units)))).toContain(
            `${n} base row is not the one the census read`,
          );
        }),
    );

    it.effect(
      'flags a fix run with no ruling: a fix file that writes a word no ruling changed',
      () =>
        Effect.gen(function* () {
          const { census, sources } = yield* read;
          const n = first(census, 'matches').number;
          const units = unitsOf(sources.rows.get(n)!).map((unit) => [...unit]);
          units[0]![0] = 'unruled';
          expect(
            problemsOf(census, withFix(sources, n, units)).some((p) =>
              p.startsWith(`${n} row: unit 1 at 0`),
            ),
          ).toBe(true);
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
            problemsOf(census, withFix(sources, n, units)).some((p) => p.startsWith(`${n} row`)),
          ).toBe(true);
        }),
    );

    it.effect('flags a changed later refrain variant', () =>
      Effect.gen(function* () {
        const { census, sources } = yield* read;
        const entry = census.hymns.find(
          (one) => one.refrain && one.stanzas > 2 && one.row !== 'nopage',
        )!;
        const units = unitsOf(sources.rows.get(entry.number)!).map((unit) => [...unit]);
        const last = units[units.length - 1]!;
        last[last.length - 1] = 'changed';
        expect(
          problemsOf(census, withFix(sources, entry.number, units)).some((p) =>
            p.startsWith(`${entry.number} row: unit ${units.length}`),
          ),
        ).toBe(true);
      }),
    );

    it.effect('flags a ruling on a crop not committed, or not cut from the deciding page', () =>
      Effect.gen(function* () {
        const { census, sources } = yield* read;
        const [n, all] = [...sources.rulings].find(([, one]) => one.length > 0)!;
        const moved = new Map([
          ...sources.rulings,
          [n, [{ ...all[0]!, crop: 'nowhere.jpg', image: 'p999.jpg' }, ...all.slice(1)]],
        ]);
        const problems = problemsOf(census, { ...sources, rulings: moved }).filter((p) =>
          p.startsWith(`${n} ruling 1`),
        );
        expect(problems.some((p) => p.includes('crop nowhere.jpg is not committed'))).toBe(true);
        expect(problems.some((p) => p.includes('reads p999.jpg, not the deciding page'))).toBe(
          true,
        );
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
            sung: `${one.row} more`,
          };
          for (const [ruling, why] of [
            [echo, 'is an echo but changes the row'],
            [words, 'not the words it prints'],
          ] as const)
            expect(
              problemsOf(census, {
                ...sources,
                rulings: new Map([...sources.rulings, [n, [ruling]]]),
              }).some((p) => p.startsWith(`${n} ruling 1`) && p.includes(why)),
            ).toBe(true);
        }),
    );
  });

  describe('readings', () => {
    it.effect('flags a run only the second reading has, with no ruling', () =>
      Effect.gen(function* () {
        const { census, sources } = yield* read;
        const entry = census.hymns.find((one) => one.row === 'matches' && one.source === 'scan')!;
        const deciding = decidingOf(sources.inventory).get(entry.number)!;
        const base = sources.rows.get(entry.number)!;
        const units = unitsOf(base);
        const second = units.map((unit) => [...unit]);
        second[0]![0] = 'misread';
        const readings = [
          reading(entry.number, deciding.images, units),
          reading(entry.number, deciding.images, second),
        ];
        const counted = { ...entry, readings: { blind: 2, proof: 0 } };
        expect(readingProblems(counted, deciding, base, [], readings, [])).toEqual([
          `${entry.number} unruled unit 1 at 0 row="${units[0]![0]}" page="misread"`,
        ]);
      }),
    );

    it.effect(
      'flags a hymn with no reading of its deciding page, and a nopage one whose page was read',
      () =>
        Effect.gen(function* () {
          const { census, sources } = yield* read;
          const entry = census.hymns.find((one) => one.row === 'matches' && one.source === 'scan')!;
          const deciding = decidingOf(sources.inventory).get(entry.number)!;
          const base = sources.rows.get(entry.number)!;
          const none = { ...entry, readings: { blind: 0, proof: 0 } };
          expect(readingProblems(none, deciding, base, [], [], [])).toEqual([
            `${entry.number} unread on scan`,
          ]);
          // A reading of another page does not count.
          const elsewhere = reading(entry.number, ['p999.jpg'], unitsOf(base));
          expect(readingProblems(none, deciding, base, [], [elsewhere], [])).toEqual([
            `${entry.number} unread on scan`,
          ]);
          const nopage = { ...entry, row: 'nopage' as const, readings: { blind: 1, proof: 0 } };
          expect(
            readingProblems(
              nopage,
              deciding,
              base,
              [],
              [reading(entry.number, deciding.images, unitsOf(base))],
              [],
            ),
          ).toEqual([`${entry.number} says nopage, but its page was read`]);
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
