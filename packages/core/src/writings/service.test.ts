import { describe, expect, it } from 'effect-bun-test';
import { Effect, Layer, Option } from 'effect';

import { EGWParagraphDatabase } from '../egw-db/book-database.js';
import type { BookRow } from '../egw-db/book-database.js';
import type { Paragraph as StoredParagraph } from '../egw/schemas.js';
import {
  WritingsInvalidSearchError,
  WritingsPageNotFoundError,
  WritingsParagraphNotFoundError,
} from './errors.js';
import { Reference } from './model.js';
import { WritingsService } from './service.js';

const books: readonly BookRow[] = [
  {
    book_id: 127,
    book_code: 'PP',
    book_title: 'Patriarchs and Prophets',
    book_author: 'Ellen G. White',
    paragraph_count: 3,
    created_at: '2026-01-01',
  },
  {
    book_id: 128,
    book_code: 'OTHER',
    book_title: 'Another Publication',
    book_author: 'Another Author',
    paragraph_count: 1,
    created_at: '2026-01-01',
  },
];

const storedParagraph = (
  bookCode: string,
  order: number,
  refcode: string,
  elementType: string | null = 'p',
): StoredParagraph & { bookCode: string } => ({
  bookCode,
  para_id: Option.some(`${bookCode}-${String(order)}`),
  id_prev: null,
  id_next: null,
  refcode_1: null,
  refcode_2: null,
  refcode_3: null,
  refcode_4: null,
  refcode_short: Option.some(refcode),
  refcode_long: null,
  element_type: elementType,
  element_subtype: null,
  nodes: [{ _tag: 'Text', text: `Content for ${refcode}` }],
  puborder: order,
});

const paragraphs = [
  storedParagraph('PP', 1, 'PP 100.1'),
  storedParagraph('PP', 2, 'PP 102.1', 'h2'),
  storedParagraph('PP', 3, 'PP 102.2'),
  storedParagraph('OTHER', 1, 'OTHER 1.1'),
];

const TestLayer = WritingsService.Live.pipe(
  Layer.provide(EGWParagraphDatabase.Test({ books, paragraphs })),
);

describe('WritingsService', () => {
  const test = it.effect;

  test('catalog defaults to every installed author and filters only when explicit', () =>
    Effect.gen(function* () {
      const writings = yield* WritingsService;
      const all = yield* writings.catalog();
      const filtered = yield* writings.catalog('Ellen G. White');

      expect(all.map((publication) => String(publication.code))).toEqual(['PP', 'OTHER']);
      expect(filtered.map((publication) => String(publication.code))).toEqual(['PP']);
    }).pipe(Effect.provide(TestLayer)));

  test('rejects ambiguous publication-code aliases instead of guessing identity', () => {
    const ambiguousLayer = WritingsService.Live.pipe(
      Layer.provide(
        EGWParagraphDatabase.Test({
          books: [books[0]!, { ...books[1]!, book_code: 'PP' }],
          paragraphs,
        }),
      ),
    );
    return Effect.gen(function* () {
      const writings = yield* WritingsService;
      const result = yield* Effect.result(writings.publicationByCode('PP'));

      expect(result._tag).toBe('Failure');
      if (result._tag === 'Failure') {
        expect(result.failure._tag).toBe('WritingsAmbiguousPublicationCodeError');
      }
    }).pipe(Effect.provide(ambiguousLayer));
  });

  test('page navigation follows stored printed pages rather than arithmetic adjacency', () =>
    Effect.gen(function* () {
      const writings = yield* WritingsService;
      const first = yield* writings.page(Reference.page(127, 100));
      const second = yield* writings.page(Reference.page(127, 102));

      expect(Option.isNone(first.previous)).toBe(true);
      expect(Option.getOrThrow(first.next)).toEqual(Reference.page(127, 102));
      expect(Option.getOrThrow(second.previous)).toEqual(Reference.page(127, 100));
      expect(Option.isNone(second.next)).toBe(true);
      expect(second.paragraphs.map((paragraph) => Number(paragraph.order))).toEqual([2, 3]);
      expect(Option.getOrThrow(second.heading)).toBe('Content for PP 102.1');
    }).pipe(Effect.provide(TestLayer)));

  test('opens a publication at its first stored page rather than assuming page one', () =>
    Effect.gen(function* () {
      const writings = yield* WritingsService;
      const opening = yield* writings.openingPage(Reference.publication(127));

      expect(Number(opening.reference.page)).toBe(100);
    }).pipe(Effect.provide(TestLayer)));

  test('missing pages fail in Writings language', () =>
    Effect.gen(function* () {
      const writings = yield* WritingsService;
      const result = yield* Effect.result(writings.page(Reference.page(127, 101)));

      expect(result._tag).toBe('Failure');
      if (result._tag === 'Failure') {
        expect(result.failure).toBeInstanceOf(WritingsPageNotFoundError);
      }
    }).pipe(Effect.provide(TestLayer)));

  test('normalizes nullable paragraph metadata to Option once', () =>
    Effect.gen(function* () {
      const writings = yield* WritingsService;
      const page = yield* writings.page(Reference.page(127, 100));
      const paragraph = page.paragraphs[0];

      expect(String(paragraph?.reference.paragraphId)).toBe('PP-1');
      expect(paragraph && Option.isNone(paragraph.elementSubtype)).toBe(true);
      expect(paragraph && Number(Option.getOrThrow(paragraph.page))).toBe(100);
      expect(paragraph && Option.getOrThrow(paragraph.number)).toBe(1);
    }).pipe(Effect.provide(TestLayer)));

  test('resolves canonical stable paragraph identities directly', () =>
    Effect.gen(function* () {
      const writings = yield* WritingsService;
      const paragraph = yield* writings.paragraph(Reference.paragraph(127, 'PP-3'));
      const missing = yield* Effect.result(writings.paragraph(Reference.paragraph(127, 'missing')));

      expect(String(paragraph.reference.paragraphId)).toBe('PP-3');
      expect(missing._tag).toBe('Failure');
      if (missing._tag === 'Failure') {
        expect(missing.failure).toBeInstanceOf(WritingsParagraphNotFoundError);
      }
    }).pipe(Effect.provide(TestLayer)));

  test('rejects routeable corpus paragraphs without stable identifiers', () => {
    const brokenLayer = WritingsService.Live.pipe(
      Layer.provide(
        EGWParagraphDatabase.Test({
          books,
          paragraphs: [{ ...storedParagraph('PP', 1, 'PP 100.1'), para_id: Option.none() }],
        }),
      ),
    );
    return Effect.gen(function* () {
      const writings = yield* WritingsService;
      const result = yield* Effect.result(writings.page(Reference.page(127, 100)));

      expect(result._tag).toBe('Failure');
    }).pipe(Effect.provide(brokenLayer));
  });

  test('validates search before reaching persistence and returns nested domain models', () =>
    Effect.gen(function* () {
      const writings = yield* WritingsService;
      const invalid = yield* Effect.result(writings.search(''));
      const hits = yield* writings.search('content', {
        publication: Reference.publication(127),
        limit: 2,
      });

      expect(invalid._tag).toBe('Failure');
      if (invalid._tag === 'Failure') {
        expect(invalid.failure).toBeInstanceOf(WritingsInvalidSearchError);
      }
      expect(hits).toHaveLength(2);
      expect(hits.every((hit) => hit.publication.code === 'PP')).toBe(true);
    }).pipe(Effect.provide(TestLayer)));
});
