import { describe, expect, test } from 'bun:test';
import { Effect, Layer, Option } from 'effect';

import { EGWParagraphDatabase, type BibleRefRow, type BookRow } from '../egw-db/book-database.js';
import type { Paragraph as StoredParagraph } from '../egw/schemas.js';
import { WritingsArchive } from './archive-service.js';
import { Reference } from './model.js';
import { WritingsService } from './service.js';

const book: BookRow = {
  book_id: 127,
  book_code: 'PP',
  book_title: 'Patriarchs and Prophets',
  book_author: 'Ellen G. White',
  paragraph_count: 2,
  created_at: '2026-01-01',
};

const storedParagraph = (
  order: number,
  refcode: Option.Option<string>,
  paragraphId: Option.Option<string>,
  elementType: string | null,
): StoredParagraph & { bookCode: string } => ({
  bookCode: 'PP',
  para_id: paragraphId,
  id_prev: null,
  id_next: null,
  refcode_1: null,
  refcode_2: null,
  refcode_3: null,
  refcode_4: null,
  refcode_short: refcode,
  refcode_long: null,
  element_type: elementType,
  element_subtype: null,
  nodes: [{ _tag: 'Text', text: `Paragraph ${order}` }],
  puborder: order,
});

const bibleRefs: readonly BibleRefRow[] = [
  {
    para_book_id: 127,
    para_ref_code: 'PP 1.1',
    bible_book: 1,
    bible_chapter: 1,
    bible_verse: 1,
  },
  {
    para_book_id: 127,
    para_ref_code: 'PP 1.2',
    bible_book: 2,
    bible_chapter: 20,
    bible_verse: null,
  },
];

const DatabaseLayer = EGWParagraphDatabase.Test({
  books: [book],
  paragraphs: [
    storedParagraph(1, Option.some('PP 1.1'), Option.some('127.1'), 'h2'),
    storedParagraph(2, Option.none(), Option.none(), 'p'),
  ],
  bibleRefs,
});
const ServiceLayer = WritingsService.Live.pipe(Layer.provide(DatabaseLayer));
const ArchiveLayer = WritingsArchive.Live.pipe(
  Layer.provide(ServiceLayer),
  Layer.provide(DatabaseLayer),
);

const run = <A, E>(effect: Effect.Effect<A, E, WritingsArchive>): Promise<A> =>
  Effect.runPromise(effect.pipe(Effect.provide(ArchiveLayer)));

describe('WritingsArchive', () => {
  test('exports a publication with stable paragraph identities and canonical Scripture references', async () => {
    const archive = await run(
      Effect.flatMap(WritingsArchive, (service) =>
        service.exportPublication(Reference.publication('PP')),
      ),
    );

    expect(String(archive.publication.code)).toBe('PP');
    expect(archive.paragraphs.map((paragraph) => paragraph.refcode)).toEqual(['PP 1.1', '127-2']);
    expect(archive.paragraphs.map((paragraph) => paragraph.isHeading)).toEqual([true, false]);
    expect(archive.bibleReferences.map((reference) => reference.scripture._tag)).toEqual([
      'verse',
      'chapter',
    ]);
    expect(archive.bibleReferences[0]?.scripture).toMatchObject({
      book: 1,
      chapter: 1,
      verse: 1,
    });
    expect(archive.bibleReferences[1]?.scripture).toMatchObject({ book: 2, chapter: 20 });
  });
});
