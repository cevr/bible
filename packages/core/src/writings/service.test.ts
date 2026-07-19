import { describe, expect, test } from 'bun:test';
import { Effect, Layer, Option } from 'effect';

import { EGWParagraphDatabase } from '../egw-db/book-database.js';
import type { BookRow } from '../egw-db/book-database.js';
import type { Paragraph as StoredParagraph } from '../egw/schemas.js';
import { WritingsInvalidSearchError, WritingsPageNotFoundError } from './errors.js';
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

const run = <A, E>(effect: Effect.Effect<A, E, WritingsService>): Promise<A> =>
  Effect.runPromise(effect.pipe(Effect.provide(TestLayer)));

describe('WritingsService', () => {
  test('catalog defaults to every installed author and filters only when explicit', async () => {
    const all = await run(Effect.flatMap(WritingsService, (writings) => writings.catalog()));
    const filtered = await run(
      Effect.flatMap(WritingsService, (writings) => writings.catalog('Ellen G. White')),
    );

    expect(all.map((publication) => String(publication.code))).toEqual(['PP', 'OTHER']);
    expect(filtered.map((publication) => String(publication.code))).toEqual(['PP']);
  });

  test('rejects ambiguous publication-code aliases instead of guessing identity', async () => {
    const ambiguousLayer = WritingsService.Live.pipe(
      Layer.provide(
        EGWParagraphDatabase.Test({
          books: [books[0]!, { ...books[1]!, book_code: 'PP' }],
          paragraphs,
        }),
      ),
    );
    const result = await Effect.runPromise(
      Effect.flatMap(WritingsService, (writings) =>
        Effect.result(writings.publicationByCode('PP')),
      ).pipe(Effect.provide(ambiguousLayer)),
    );

    expect(result._tag).toBe('Failure');
    if (result._tag === 'Failure') {
      expect(result.failure._tag).toBe('WritingsAmbiguousPublicationCodeError');
    }
  });

  test('page navigation follows stored printed pages rather than arithmetic adjacency', async () => {
    const first = await run(
      Effect.flatMap(WritingsService, (writings) => writings.page(Reference.page(127, 100))),
    );
    const second = await run(
      Effect.flatMap(WritingsService, (writings) => writings.page(Reference.page(127, 102))),
    );

    expect(Option.isNone(first.previous)).toBe(true);
    expect(Option.getOrThrow(first.next)).toEqual(Reference.page(127, 102));
    expect(Option.getOrThrow(second.previous)).toEqual(Reference.page(127, 100));
    expect(Option.isNone(second.next)).toBe(true);
    expect(second.paragraphs.map((paragraph) => Number(paragraph.order))).toEqual([2, 3]);
    expect(Option.getOrThrow(second.heading)).toBe('Content for PP 102.1');
  });

  test('missing pages fail in Writings language', async () => {
    const result = await run(
      Effect.flatMap(WritingsService, (writings) =>
        Effect.result(writings.page(Reference.page(127, 101))),
      ),
    );

    expect(result._tag).toBe('Failure');
    if (result._tag === 'Failure') expect(result.failure).toBeInstanceOf(WritingsPageNotFoundError);
  });

  test('normalizes nullable paragraph metadata to Option once', async () => {
    const page = await run(
      Effect.flatMap(WritingsService, (writings) => writings.page(Reference.page(127, 100))),
    );
    const paragraph = page.paragraphs[0];

    expect(String(paragraph?.reference.paragraphId)).toBe('PP-1');
    expect(paragraph && Option.isNone(paragraph.elementSubtype)).toBe(true);
    expect(paragraph && Number(Option.getOrThrow(paragraph.page))).toBe(100);
    expect(paragraph && Option.getOrThrow(paragraph.number)).toBe(1);
  });

  test('rejects routeable corpus paragraphs without stable identifiers', async () => {
    const brokenLayer = WritingsService.Live.pipe(
      Layer.provide(
        EGWParagraphDatabase.Test({
          books,
          paragraphs: [{ ...storedParagraph('PP', 1, 'PP 100.1'), para_id: Option.none() }],
        }),
      ),
    );
    const result = await Effect.runPromise(
      Effect.flatMap(WritingsService, (writings) =>
        Effect.result(writings.page(Reference.page(127, 100))),
      ).pipe(Effect.provide(brokenLayer)),
    );

    expect(result._tag).toBe('Failure');
  });

  test('validates search before reaching persistence and returns nested domain models', async () => {
    const invalid = await run(
      Effect.flatMap(WritingsService, (writings) => Effect.result(writings.search(''))),
    );
    const hits = await run(
      Effect.flatMap(WritingsService, (writings) =>
        writings.search('content', {
          publication: Reference.publication(127),
          limit: 2,
        }),
      ),
    );

    expect(invalid._tag).toBe('Failure');
    if (invalid._tag === 'Failure') {
      expect(invalid.failure).toBeInstanceOf(WritingsInvalidSearchError);
    }
    expect(hits).toHaveLength(2);
    expect(hits.every((hit) => hit.publication.code === 'PP')).toBe(true);
  });
});
