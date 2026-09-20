/* oxlint-disable effect/noNullish -- these fixtures stand in for rows read out
   of SQLite, where the three classification columns are nullable TEXT and a
   `SELECT` predating them omits the field entirely. `BookRow` models both with
   `Schema.optional(Schema.NullOr(...))`, and the unclassified case below is
   precisely what `bookMatchesFilter` has to get right, so the fixtures have to
   be able to spell it. */

import { describe, expect, it } from 'effect-bun-test';
import { Effect } from 'effect';

import { bookMatchesFilter, type BookRow } from './book-database.js';
import { NO_FILTER, NO_SELECTION } from '../writings/corpus-class.js';

const book = (
  code: string,
  classification: {
    readonly book_type?: string | null;
    readonly book_subtype?: string | null;
    readonly section?: string | null;
  } = {},
): BookRow => ({
  book_id: 1,
  book_code: code,
  book_title: code,
  book_author: 'Ellen Gould White',
  paragraph_count: 10,
  created_at: '2026-01-01T00:00:00Z',
  ...classification,
});

/** `bookMatchesFilter` is what the vector leg resolves its `allow` set with, so
 *  these are the cases that decide which ranges of the index get scanned at
 *  all — not just which rows survive afterwards. */
describe('bookMatchesFilter', () => {
  const test = it.effect;

  test('admits an ordinary book under the empty filter', () =>
    Effect.sync(() => {
      expect(bookMatchesFilter(book('DA', { book_type: 'book' }), NO_FILTER)).toBe(true);
    }));

  /** The corpus-level rule, which holds even with no filter: a paraphrase must
   *  never be quotable as Ellen White's own sentence. */
  test('refuses a ModernEnglish paraphrase under every filter', () =>
    Effect.sync(() => {
      const paraphrase = book('BOE', { book_type: 'book', book_subtype: 'ModernEnglish' });
      expect(bookMatchesFilter(paraphrase, NO_FILTER)).toBe(false);
      expect(bookMatchesFilter(paraphrase, undefined)).toBe(false);
    }));

  /** The apparatus toggle is what the search app forces on, and it is the bulk
   *  of the dead weight the vector scan used to pay for. */
  test('refuses the lookup apparatus when the toggle is set', () =>
    Effect.sync(() => {
      const filter = { ...NO_FILTER, excludeApparatus: true };
      for (const type of ['dictionary', 'topicalindex', 'scriptindex']) {
        expect(bookMatchesFilter(book('X', { book_type: type }), filter)).toBe(false);
      }
      expect(bookMatchesFilter(book('DA', { book_type: 'book' }), filter)).toBe(true);
    }));

  /** An unclassified book is not *known* to be the thing the reader removed, so
   *  an exclusion lets it through — the asymmetry the SQL side spells with its
   *  `IS NULL` disjunctions. */
  test('lets an unclassified book through an exclusion but not an inclusion', () =>
    Effect.sync(() => {
      const unclassified = book('???');
      expect(
        bookMatchesFilter(unclassified, {
          ...NO_FILTER,
          subtype: { include: [], exclude: ['devotional'] },
        }),
      ).toBe(true);
      expect(
        bookMatchesFilter(unclassified, {
          ...NO_FILTER,
          type: { include: ['book'], exclude: [] },
        }),
      ).toBe(false);
    }));

  test('applies an inclusion and an exclusion on the same axis', () =>
    Effect.sync(() => {
      const devotional = book('MYP', { book_type: 'book', book_subtype: 'devotional' });
      expect(
        bookMatchesFilter(devotional, {
          ...NO_FILTER,
          subtype: { include: [], exclude: ['devotional'] },
        }),
      ).toBe(false);
      expect(
        bookMatchesFilter(devotional, {
          ...NO_FILTER,
          subtype: { include: ['devotional'], exclude: [] },
        }),
      ).toBe(true);
    }));

  test('filters on section the same way', () =>
    Effect.sync(() => {
      const pioneer = book('DAR', { book_type: 'book', section: 'pioneer-library' });
      expect(
        bookMatchesFilter(pioneer, {
          ...NO_FILTER,
          section: { include: [], exclude: ['pioneer-library'] },
        }),
      ).toBe(false);
      expect(bookMatchesFilter(pioneer, { ...NO_FILTER, section: NO_SELECTION })).toBe(true);
    }));
});
