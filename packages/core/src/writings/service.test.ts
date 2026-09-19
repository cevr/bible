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

// Wire-shape fields the schema encodes as `null` when absent.
const wireNull = Option.getOrNull(Option.none<never>());

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
  elementType: string = 'p',
): StoredParagraph & { bookCode: string } => ({
  bookCode,
  para_id: Option.some(`${bookCode}-${String(order)}`),
  id_prev: wireNull,
  id_next: wireNull,
  refcode_1: wireNull,
  refcode_2: wireNull,
  refcode_3: wireNull,
  refcode_4: wireNull,
  refcode_short: Option.some(refcode),
  refcode_long: wireNull,
  element_type: elementType,
  element_subtype: wireNull,
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

  /** Reader text reaches FTS5 as terms, not as a query expression.
   *
   *  `bible egw ref "PP 45.3"` parses `ref` as a query word and searched for
   *  `ref PP 45.3`; FTS5 read the `.` as syntax and the whole command died with
   *  `fts5: syntax error near "."`. The CLI, `egw study`, the wiki lookup panel
   *  and the web API's search handler all hand this method raw reader text, so
   *  the sanitizing belongs here rather than at any one of them.
   *
   *  The assertion is that the search *answers*, because the defect was a
   *  failure rather than a wrong ranking: against the unsanitized method every
   *  one of these queries is a crash. */
  test('sanitizes FTS5 punctuation in reader text rather than failing on it', () =>
    Effect.gen(function* () {
      const writings = yield* WritingsService;

      // Succeeding is the whole assertion, and recall is deliberately not:
      // against the unsanitized method each of these died as `fts5: syntax
      // error`, and the terms a reader's punctuation reduces to may legitimately
      // match nothing in a four-paragraph fixture. A hit count here would be a
      // claim about the fixture's text rather than about the defect.
      for (const query of [
        // The exact shape that crashed: a refcode's dot inside a search query.
        'content PP 45.3',
        // The rest are operators a reader produces without meaning to — a quote
        // from a pasted quotation, `NEAR` as an ordinary English word, a dash,
        // a colon.
        '"content"',
        'content NEAR/3',
        'content — PP 45.3',
        'content: PP 45.3',
      ]) {
        const result = yield* Effect.result(writings.search(query));
        expect({ query, tag: result._tag }).toEqual({ query, tag: 'Success' });
      }

      // And the sanitizing did not cost the ordinary query its results: a plain
      // word still matches, so the tokenizer is not silently emptying every
      // query on its way to FTS5.
      const plain = yield* writings.search('content');
      expect(plain.length).toBeGreaterThan(0);
    }).pipe(Effect.provide(TestLayer)));

  /** Punctuation alone names no term, and an empty MATCH is a second syntax
   *  error. It is the same unanswerable request as `""` and reuses that reason
   *  rather than widening an error schema three hosts map over. */
  test('rejects a query that is punctuation only, as an empty query', () =>
    Effect.gen(function* () {
      const writings = yield* WritingsService;
      const result = yield* Effect.result(writings.search('...'));

      expect(result._tag).toBe('Failure');
      if (result._tag === 'Failure') {
        // Not merely "some failure": a crash from SQLite would also be a
        // failure, and the point is that the query never reached FTS5.
        expect(result.failure._tag).toBe('WritingsInvalidSearchError');
        if (result.failure._tag === 'WritingsInvalidSearchError') {
          // The same reason `""` gets: after tokenizing, this query names no
          // term either.
          expect(result.failure.reason).toBe('empty-query');
        }
      }
    }).pipe(Effect.provide(TestLayer)));
});
