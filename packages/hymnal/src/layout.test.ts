/**
 * The layout property: every row is held to its 1985 page in its layout, not
 * only its words. A row can sing the right words in the wrong shape (a line
 * dropped, two lines swapped, a stanza moved, the refrain left out), and the
 * census's shape check (`outlineEntryProblems`, which `problemsOf` runs for
 * every entry) must print a `<n> shape (` line for each that the hymn as
 * committed does not print.
 *
 * The fixtures are `data/layout-mutants.json`: recipes and generated names,
 * never text. A recipe is applied in memory to the hymn's committed printed
 * source; a generated name is found among the mutants of the hymn's printed
 * text, whose fingerprint the fixture holds. Either is written back as the
 * hymn's row and base row with its fix dropped (a row wrong since before the
 * census, which no fix touches).
 */

import { Console, Effect, Predicate, Result } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import {
  type Census,
  decidingOf,
  NO_PAGE,
  type Outline,
  outlineEntryProblems,
  outlinesOf,
  placementOf,
  type PrintedText,
  printedTextOf,
  problemsOf,
  readCensusOnce,
  readText,
  type Sources,
  type Verses,
  hymnRunsOf,
  linesQuoting,
  wordlessLine,
} from '../scripts/census.js';
import {
  applyRecipe,
  domainOf,
  fingerprintOf,
  type LayoutMutant,
  layoutMutants,
  mutantsOf,
  printedSourceOf,
  rowOfSource,
  staleRulings,
} from '../scripts/layout.js';

const fixtures = layoutMutants();
const recipes = fixtures.filter((one) => one.from === 'r6 M1');
const escapes = fixtures.filter((one) => one.from === 'census2 r1 F1');

// oxlint-disable-next-line effect/noAsyncFunction -- built once as the file loads, so no case's time limit holds its cost
const { census, sources } = await Effect.runPromise(readCensusOnce);
// The generated property over the book, built once: its cases read it.
const domain = domainOf(sources);
// Every run of 3 words of every row: a census line prints none of them.
const runs = hymnRunsOf(sources.rows);

/** Hymn `n`'s row and base row both `row`, its fix dropped. */
const withBase = (base: Sources, n: number, row: Verses): Sources => ({
  ...base,
  rows: new Map([...base.rows, [n, row]]),
  base: new Map([...base.base, [n, row]]),
  fixes: new Map([...base.fixes].filter(([one]) => one !== n)),
});

/** The layout lines the census's per-hymn shape check prints for hymn `n`. */
const layoutLines = (one: Sources, n: number, of: Census = census) => {
  const entry = of.hymns.find((hymn) => hymn.number === n);
  if (entry === undefined) return [`${n} has no entry`];
  return outlineEntryProblems(entry, decidingOf(one.inventory).get(n) ?? NO_PAGE, one).filter(
    (line) => line.startsWith(`${n} shape (`),
  );
};

/** The lines of `after` that `before` does not print. */
const newLines = (before: readonly string[], after: readonly string[]) => {
  const seen = new Set(before);
  return after.filter((line) => !seen.has(line));
};

/** Hymn `n`'s printed source as committed, and the recipe's mutant of it (or why it does not apply). */
const mutantOf = (n: number, mode: string) => {
  const source = printedSourceOf(sources.rows.get(n) ?? [], sources.fixes.get(n));
  return { source, mutant: applyRecipe(source, mode) };
};

/** Hymn `n`'s printed text as committed. */
const textOf = (n: number) =>
  printedTextOf(sources.rows.get(n) ?? [], sources.fixes.get(n), sources.orders.get(n));

/** A printed text written back as a row: its stanzas, and the refrain lines every stanza sings. */
const rowOfText = (text: PrintedText): Verses =>
  rowOfSource({
    stanzas: text.stanzas,
    refrain: (text.refrain ?? []).flatMap((item) => (Predicate.isString(item) ? [item] : [])),
  });

/** Hymn `n`'s mutants, by name. */
const mutantsByName = (n: number, text: PrintedText) =>
  new Map<string, LayoutMutant>(
    [...mutantsOf(text, outlinesOf(sources, n).outlines)].map((one) => [one.name, one]),
  );

/** The names the committed reach rulings of hymn `n` list. */
const listedOf = (n: number) =>
  new Set(
    (sources.rulings.get(n) ?? []).flatMap((ruling) => [
      ...(ruling.unreachable ?? []),
      ...(ruling.gaps ?? []),
    ]),
  );

/** A shape reading of one stanza of rows (count, first, middle and last words each), as a test writes one. */
const outlineWith = (
  rows: ReadonlyArray<{ words: number; first: string; mid: string; last: string }>,
): Outline => ({
  number: 9999,
  reader: 'test',
  images: [],
  systems: 1,
  metre: null,
  stanzas: [
    {
      number: 1,
      rows: rows.map((row, k) => ({ ...row, system: k + 1, strip: 'test', capitals: [] })),
    },
  ],
  refrain: null,
  extra: [],
  odd: '',
});

/** A text of stanzas, no refrain. */
const plain = (stanzas: ReadonlyArray<readonly string[]>): PrintedText => ({
  stanzas,
  refrain: undefined,
  order: undefined,
});

describe('layout', () => {
  describe("r6 M1's mutants (data/layout-mutants.json)", () => {
    it.effect(
      'are the 115 of the review: 25 hymns, 68 dropline, 45 swaplines, 1 swap, 1 norefrain',
      () =>
        Effect.sync(() => {
          expect(recipes).toHaveLength(115);
          expect(new Set(recipes.map((one) => `${one.number} ${one.mode}`)).size).toBe(115);
          expect([...new Set(recipes.map((one) => one.number))]).toEqual([
            3, 14, 24, 59, 61, 122, 125, 178, 189, 259, 311, 317, 356, 377, 426, 476, 492, 503, 506,
            512, 558, 575, 580, 627, 631,
          ]);
          const kinds = new Map<string, number>();
          for (const one of recipes) {
            const kind = one.mode.split(':')[0] ?? '';
            kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
          }
          expect(Object.fromEntries(kinds)).toEqual({
            dropline: 68,
            swaplines: 45,
            swap: 1,
            norefrain: 1,
          });
        }),
    );

    for (const { number: n, mode } of recipes)
      it.effect(`${n} ${mode}: the shape check prints a layout line`, () =>
        Effect.sync(() => {
          const { source, mutant } = mutantOf(n, mode);
          // The recipe applies to the source as committed: a changed source fails here.
          expect(Result.isFailure(mutant) ? mutant.failure : 'applies').toBe('applies');
          if (Result.isFailure(mutant)) return;
          // Caught: the mutant prints a layout line the hymn as committed does not.
          const lines = layoutLines(withBase(sources, n, rowOfSource(mutant.success)), n);
          expect(
            newLines(layoutLines(withBase(sources, n, rowOfSource(source)), n), lines),
          ).not.toEqual([]);
          // As the census prints them, by places and word tags: no line prints a hymn's text.
          expect(linesQuoting(lines.map(wordlessLine), runs)).toEqual([]);
        }),
      );

    it.effect('every recipe is a mutant the property generates, by its text', () =>
      Effect.sync(() => {
        for (const n of new Set(recipes.map((one) => one.number))) {
          const generated = mutantsByName(n, textOf(n));
          for (const { mode } of recipes.filter((one) => one.number === n)) {
            const { mutant } = mutantOf(n, mode);
            if (Result.isFailure(mutant)) return expect(mutant.failure).toBe('applies');
            // A recipe's name is the generated one's with its line count (`/<n>`) added.
            const one = generated.get(mode.replace(/\/\d+$/u, ''));
            expect(one === undefined ? `${n} ${mode}: not generated` : 'generated').toBe(
              'generated',
            );
            expect(one?.text.stanzas).toEqual(mutant.success.stanzas);
            expect(rowOfText(one?.text ?? plain([]))).toEqual(rowOfSource(mutant.success));
          }
        }
      }),
    );

    it.effect('512 norefrain: problemsOf prints a layout line its control does not', () =>
      Effect.sync(() => {
        const { source, mutant } = mutantOf(512, 'norefrain');
        if (Result.isFailure(mutant)) return expect(mutant.failure).toBe('applies');
        const linesOf512 = (row: Verses) =>
          problemsOf(census, withBase(sources, 512, row)).filter((line) =>
            line.startsWith('512 shape ('),
          );
        expect(
          newLines(linesOf512(rowOfSource(source)), linesOf512(rowOfSource(mutant.success))),
        ).not.toEqual([]);
      }),
    );
  });

  describe("census2 r1 F1's escapes (data/layout-mutants.json)", () => {
    it.effect(
      'are the 619 line-break mutants of the review: 249 hymns, join 83, movedown 244, moveup 292',
      () =>
        Effect.sync(() => {
          expect(escapes).toHaveLength(619);
          expect(new Set(escapes.map((one) => `${one.number} ${one.mode}`)).size).toBe(619);
          expect(new Set(escapes.map((one) => one.number)).size).toBe(249);
          const kinds = new Map<string, number>();
          for (const one of escapes) {
            const kind = one.mode.split(':')[0] ?? '';
            kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
          }
          expect(Object.fromEntries(kinds)).toEqual({ join: 83, movedown: 244, moveup: 292 });
        }),
    );

    it.effect('each is generated from the text it was found on (its fingerprint)', () =>
      Effect.sync(() => {
        for (const n of new Set(escapes.map((one) => one.number))) {
          const text = textOf(n);
          const generated = mutantsByName(n, text);
          for (const one of escapes.filter((escape) => escape.number === n)) {
            // A changed text fails here: its positions name other mutations.
            expect(`${n} ${one.layout}`).toBe(`${n} ${fingerprintOf(text)}`);
            expect(generated.has(one.mode) ? 'generated' : `${n} ${one.mode}: not generated`).toBe(
              'generated',
            );
          }
        }
      }),
    );

    it.effect('each is reached by the property, or on a committed list', () =>
      Effect.gen(function* () {
        let [reached, listed] = [0, 0];
        for (const { number: n, mode } of escapes) {
          if (!domain.unreached.has(`${n} ${mode}`)) reached += 1;
          else if (listedOf(n).has(mode)) listed += 1;
          else expect(`${n} ${mode}`).toBe('reached or listed');
        }
        yield* Console.log(`layout escapes: reached=${reached} listed=${listed}`);
        expect(reached + listed).toBe(619);
      }),
    );

    // A sample of each kind, the first three of it no ruling lists: the per-hymn
    // shape check, with the committed rows' lexicon (`withBase`), prints a layout
    // line for each that its control does not. Through the census's own entry
    // point, with the lexicon of the mutated rows, some escape (r2 M1, a follow-up).
    const sample = ['join', 'movedown', 'moveup'].flatMap((kind) =>
      escapes
        .filter((one) => one.mode.startsWith(`${kind}:`) && !listedOf(one.number).has(one.mode))
        .slice(0, 3),
    );
    for (const { number: n, mode, layout } of sample)
      it.effect(`${n} ${mode} (${layout}): the shape check prints a layout line`, () =>
        Effect.sync(() => {
          const text = textOf(n);
          expect(fingerprintOf(text)).toBe(layout ?? '');
          const mutant = mutantsByName(n, text).get(mode);
          if (mutant === undefined) return expect(`${n} ${mode}`).toBe('generated');
          expect(
            newLines(
              layoutLines(withBase(sources, n, rowOfText(text)), n),
              layoutLines(withBase(sources, n, rowOfText(mutant.text)), n),
            ),
          ).not.toEqual([]);
        }),
      );
  });

  describe('the generated mutants', () => {
    it.effect('insertline puts each line of every other stanza at every place of each', () =>
      Effect.sync(() => {
        const text = plain([
          ['one two three', 'four five six'],
          ['seven eight nine', 'ten eleven twelve'],
          ['thirteen fourteen', 'fifteen sixteen'],
        ]);
        const inserts = [...mutantsOf(text, [])].filter((one) =>
          one.name.startsWith('insertline:'),
        );
        // 3 stanzas, 3 places each (before line 1, before line 2, at the end), 4 donor lines.
        expect(inserts).toHaveLength(36);
        expect(new Set(inserts.map((one) => one.name)).size).toBe(36);
        const one = inserts.find((m) => m.name === 'insertline:1.3/3.2');
        expect(one?.text.stanzas[0]).toEqual(['one two three', 'four five six', 'fifteen sixteen']);
        expect(one?.touches).toEqual([1]);
        const first = inserts.find((m) => m.name === 'insertline:2.1/1.1');
        expect(first?.text.stanzas[1]).toEqual([
          'one two three',
          'seven eight nine',
          'ten eleven twelve',
        ]);
      }),
    );

    it.effect('dropvaries drops each varying part with its siblings kept, and the item whole', () =>
      Effect.sync(() => {
        const text: PrintedText = {
          stanzas: [['one two'], ['three four']],
          refrain: [
            'five six',
            {
              varies: [
                { after: [1], lines: ['seven eight'] },
                { after: [2], lines: ['nine ten'] },
              ],
            },
          ],
          order: undefined,
        };
        const drops = new Map(
          [...mutantsOf(text, [])]
            .filter((one) => one.name.startsWith('dropvaries:'))
            .map((one) => [one.name, one.text.refrain]),
        );
        expect([...drops.keys()]).toEqual(['dropvaries:2.1', 'dropvaries:2.2', 'dropvaries:2']);
        expect(drops.get('dropvaries:2.1')).toEqual([
          'five six',
          { varies: [{ after: [2], lines: ['nine ten'] }] },
        ]);
        expect(drops.get('dropvaries:2.2')).toEqual([
          'five six',
          { varies: [{ after: [1], lines: ['seven eight'] }] },
        ]);
        expect(drops.get('dropvaries:2')).toEqual(['five six']);
      }),
    );
  });

  describe('the reach rulings', () => {
    it.effect('a listed hymn whose row changes has its reach rulings stale', () =>
      Effect.sync(() => {
        const n = [...sources.rulings.keys()]
          .toSorted((a, b) => a - b)
          .find((one) => listedOf(one).size > 0);
        if (n === undefined) return expect('a listed hymn').toBe('found');
        const rulings = sources.rulings.get(n) ?? [];
        const text = textOf(n);
        expect(staleRulings(n, text, rulings)).toEqual([]);
        // Its first stanza's last line dropped, in memory: the lists name mutants of a text that is gone.
        const first = text.stanzas[0] ?? [];
        const changed = withBase(
          sources,
          n,
          rowOfText({ ...text, stanzas: text.stanzas.toSpliced(0, 1, first.slice(0, -1)) }),
        );
        const after = printedTextOf(
          changed.rows.get(n) ?? [],
          changed.fixes.get(n),
          changed.orders.get(n),
        );
        expect(staleRulings(n, after, rulings)).not.toEqual([]);
      }),
    );
  });

  describe('the anchors (placeRows)', () => {
    it.effect('an anchor at its counted place and one word off is found there: no line', () =>
      Effect.sync(() => {
        const layout = readText(plain([['alpha beta gamma gamma gamma delta']]));
        const outline = outlineWith([
          { words: 6, first: 'alpha beta', mid: 'gamma gamma', last: 'gamma delta' },
        ]);
        expect(placementOf('test', outline, layout, 1).lines).toEqual([]);
      }),
    );

    it.effect('an anchor at two places, neither its counted one, is unresolved', () =>
      Effect.sync(() => {
        const layout = readText(plain([['alpha beta gamma delta gamma delta']]));
        const outline = outlineWith([
          { words: 6, first: 'alpha beta', mid: 'gamma delta', last: 'gamma delta' },
        ]);
        expect(placementOf('test', outline, layout, 1).lines).toEqual([
          'test: stanza 1 row 1 holds its middle "gamma delta" at two places its count gives',
        ]);
      }),
    );
  });

  describe('the generated property', () => {
    it.effect(
      'every mutation of every hymn with a deciding page prints a layout line, but those a ruling lists',
      () =>
        Effect.gen(function* () {
          for (const [property, one] of domain.properties)
            yield* Console.log(
              `layout ${property}: mutants=${one.mutants} unreached=${one.unreached}`,
            );
          yield* Console.log(
            `layout lists: unreachable=${domain.lists.unreachable} gaps=${domain.lists.gaps}`,
          );
          expect(domain.hymns).toBe(691);
          expect(domain.unread).toEqual([]);
          // A mutant no layout line reaches is on a committed list, with its ruling on crops.
          expect(domain.unlisted).toEqual([]);
          // A mutant a list names is one the census cannot reach, on one list only.
          expect(domain.reached).toEqual([]);
          // Every list was ruled on the hymn's text as it stands.
          expect(domain.stale).toEqual([]);
          for (const one of domain.properties.values()) expect(one.mutants).toBeGreaterThan(0);
        }),
    );
  });
});
