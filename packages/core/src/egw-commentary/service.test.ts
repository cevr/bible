import { describe, expect, it } from 'effect-bun-test';
import { Effect, Layer, Option } from 'effect';

import { Reference } from '../bible/model.js';
import { EGWParagraphDatabase, type BibleRefRow, type BookRow } from '../egw-db/book-database.js';
import type { Paragraph } from '../egw/schemas.js';
import { EGWCommentaryService } from './service.js';

// Wire-shape fields the schema encodes as `null` when absent.
const wireNull = Option.getOrNull(Option.none<never>());

const book: BookRow = {
  book_id: 127,
  book_code: '1BC',
  book_title: 'Bible Commentary Volume 1',
  book_author: 'Ellen G. White',
  paragraph_count: 1,
  created_at: '2026-01-01',
};

const paragraph: Paragraph & { bookCode: string } = {
  bookCode: '1BC',
  para_id: Option.some('127.24'),
  id_prev: wireNull,
  id_next: wireNull,
  refcode_1: wireNull,
  refcode_2: wireNull,
  refcode_3: wireNull,
  refcode_4: wireNull,
  refcode_short: Option.some('1BC 24.1'),
  refcode_long: wireNull,
  element_type: 'p',
  element_subtype: wireNull,
  nodes: [{ _tag: 'Text', text: 'Commentary on the promised Seed.' }],
  puborder: 24,
};

const bibleReference: BibleRefRow = {
  para_book_id: 127,
  para_ref_code: '1BC 24.1',
  bible_book: 1,
  bible_chapter: 3,
  bible_verse: 15,
};

const TestLayer = EGWCommentaryService.Live.pipe(
  Layer.provide(
    EGWParagraphDatabase.Test({
      books: [book],
      paragraphs: [paragraph],
      bibleRefs: [bibleReference],
    }),
  ),
);

describe('EGWCommentaryService', () => {
  const test = it.effect;

  test('looks up commentary through the canonical Bible reference interface', () =>
    Effect.gen(function* () {
      const reference = Reference.verse(1, 3, 15);
      const result = yield* EGWCommentaryService.use((commentary) =>
        commentary.getCommentary(reference),
      );

      expect(result.verse).toBe(reference);
      expect(result.entries).toEqual([
        {
          refcode: '1BC 24.1',
          bookCode: '1BC',
          bookTitle: 'Bible Commentary Volume 1',
          // Carried through from `books.book_author`, which is what lets a
          // caller scope the reverse lookup to the White Estate (§8.4).
          bookAuthor: 'Ellen G. White',
          content: 'Commentary on the promised Seed.',
          puborder: 24,
        },
      ]);
    }).pipe(Effect.provide(TestLayer)));

  test('returns no entries when no paragraph is indexed for the verse', () =>
    Effect.gen(function* () {
      const result = yield* EGWCommentaryService.use((commentary) =>
        commentary.getCommentary(Reference.verse(1, 3, 16)),
      );

      expect(result.entries).toEqual([]);
    }).pipe(Effect.provide(TestLayer)));
});
