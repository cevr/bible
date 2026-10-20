/**
 * The layout property: every row is held to its 1985 page in its layout, not
 * only its words. A row can sing the right words in the wrong shape (a line
 * dropped, two lines swapped, a stanza moved, the refrain left out), and the
 * census's shape check (`outlineEntryProblems`, which `problemsOf` runs for
 * every entry) must print a `<n> shape (` line for each.
 *
 * The fixtures are `data/layout-mutants.json`: recipes, never text, each
 * applied in memory to the hymn's committed printed source and written back
 * as the hymn's row and base row with its fix dropped (a row wrong since
 * before the census, which no fix touches).
 */

import { Effect, Result } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import {
  type Census,
  decidingOf,
  NO_PAGE,
  outlineEntryProblems,
  problemsOf,
  readCensusOnce,
  type Sources,
  type Verses,
} from '../scripts/census.js';
import { applyRecipe, layoutMutants, printedSourceOf, rowOfSource } from '../scripts/layout.js';

const fixtures = layoutMutants();

/** Hymn `n`'s row and base row both `row`, its fix dropped. */
const withBase = (sources: Sources, n: number, row: Verses): Sources => ({
  ...sources,
  rows: new Map([...sources.rows, [n, row]]),
  base: new Map([...sources.base, [n, row]]),
  fixes: new Map([...sources.fixes].filter(([one]) => one !== n)),
});

/** The layout lines the census's per-hymn shape check prints for hymn `n`. */
const layoutLines = (census: Census, sources: Sources, n: number) => {
  const entry = census.hymns.find((one) => one.number === n);
  if (entry === undefined) return [`${n} has no entry`];
  return outlineEntryProblems(
    entry,
    decidingOf(sources.inventory).get(n) ?? NO_PAGE,
    sources,
  ).filter((line) => line.startsWith(`${n} shape (`));
};

/** Hymn `n`'s printed source as committed, and the recipe's mutant of it (or why it does not apply). */
const mutantOf = (sources: Sources, n: number, mode: string) => {
  const source = printedSourceOf(sources.rows.get(n) ?? [], sources.fixes.get(n));
  return { source, mutant: applyRecipe(source, mode) };
};

describe('layout', () => {
  describe("r6 M1's mutants (data/layout-mutants.json)", () => {
    it.effect(
      'are the 115 of the review: 25 hymns, 68 dropline, 45 swaplines, 1 swap, 1 norefrain',
      () =>
        Effect.sync(() => {
          expect(fixtures).toHaveLength(115);
          expect(fixtures.every((one) => one.from === 'r6 M1')).toBe(true);
          expect(new Set(fixtures.map((one) => `${one.number} ${one.mode}`)).size).toBe(115);
          expect([...new Set(fixtures.map((one) => one.number))]).toEqual([
            3, 14, 24, 59, 61, 122, 125, 178, 189, 259, 311, 317, 356, 377, 426, 476, 492, 503, 506,
            512, 558, 575, 580, 627, 631,
          ]);
          const kinds = new Map<string, number>();
          for (const one of fixtures) {
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

    for (const { number: n, mode } of fixtures)
      it.effect(`${n} ${mode}: the shape check prints a layout line`, () =>
        Effect.gen(function* () {
          const { census, sources } = yield* readCensusOnce;
          const { source, mutant } = mutantOf(sources, n, mode);
          // The recipe applies to the source as committed: a changed source fails here.
          expect(Result.isFailure(mutant) ? mutant.failure : 'applies').toBe('applies');
          if (Result.isFailure(mutant)) return;
          expect(layoutLines(census, withBase(sources, n, rowOfSource(source)), n)).toEqual([]);
          expect(
            layoutLines(census, withBase(sources, n, rowOfSource(mutant.success)), n),
          ).not.toEqual([]);
        }),
      );

    it.effect('512 norefrain: problemsOf prints a layout line', () =>
      Effect.gen(function* () {
        const { census, sources } = yield* readCensusOnce;
        const { mutant } = mutantOf(sources, 512, 'norefrain');
        if (Result.isFailure(mutant)) return expect(mutant.failure).toBe('applies');
        const lines = problemsOf(
          census,
          withBase(sources, 512, rowOfSource(mutant.success)),
        ).filter((line) => line.startsWith('512 shape ('));
        expect(lines).not.toEqual([]);
      }),
    );
  });
});
