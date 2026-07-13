import { describe, expect, test } from 'bun:test';
import { Effect, Layer, Option } from 'effect';

import { Reference } from '../bible/model.js';
import { EGWParagraphDatabase, type BibleRefRow, type BookRow } from '../egw-db/book-database.js';
import type { Paragraph } from '../egw/schemas.js';
import { EGWCommentaryService } from './service.js';

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
  id_prev: null,
  id_next: null,
  refcode_1: null,
  refcode_2: null,
  refcode_3: null,
  refcode_4: null,
  refcode_short: Option.some('1BC 24.1'),
  refcode_long: null,
  element_type: 'p',
  element_subtype: null,
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

const run = <A, E>(effect: Effect.Effect<A, E, EGWCommentaryService>): Promise<A> =>
  Effect.runPromise(effect.pipe(Effect.provide(TestLayer)));

describe('EGWCommentaryService', () => {
  test('looks up commentary through the canonical Bible reference interface', async () => {
    const reference = Reference.verse(1, 3, 15);
    const result = await run(
      EGWCommentaryService.use((commentary) => commentary.getCommentary(reference)),
    );

    expect(result.verse).toBe(reference);
    expect(result.entries).toEqual([
      {
        refcode: '1BC 24.1',
        bookCode: '1BC',
        bookTitle: 'Bible Commentary Volume 1',
        content: 'Commentary on the promised Seed.',
        puborder: 24,
      },
    ]);
  });

  test('returns no entries when no paragraph is indexed for the verse', async () => {
    const result = await run(
      EGWCommentaryService.use((commentary) => commentary.getCommentary(Reference.verse(1, 3, 16))),
    );

    expect(result.entries).toEqual([]);
  });
});
