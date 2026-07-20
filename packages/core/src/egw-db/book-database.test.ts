/**
 * Tests for EGW Paragraph Database
 *
 * Uses unique temp files for database isolation between tests.
 */

import { BunServices } from '@effect/platform-bun';
import { Database } from 'bun:sqlite';
import { describe, expect, it } from 'effect-bun-test';
import { ConfigProvider, Effect, FileSystem, Layer, Option, Result, Stream } from 'effect';

import { Reference as BibleReference } from '../bible/model.js';
import {
  assetSourceId,
  corpusDigest,
  corpusRevision,
  CorpusProvenance,
} from '../corpus-supply/model.js';
import type { Book, Paragraph } from '../egw/schemas.js';
import {
  ArchivedBibleReference,
  ArchivedParagraph,
  PublicationArchive,
} from '../writings/archive.js';
import {
  Paragraph as WritingsParagraph,
  Publication,
  Reference as WritingsReference,
  publicationCode,
  publicationId,
  publicationOrder,
} from '../writings/model.js';
import { EGWParagraphDatabase, ParagraphDataIntegrityError } from './book-database.js';
import * as EGWDbBun from './book-database-bun.js';

// Helper to run scoped effects in tests with fresh database
const runTestAt = <A, E, R>(
  dbPath: string,
  effect: Effect.Effect<A, E, EGWParagraphDatabase | R>,
) => {
  const provider = ConfigProvider.make((path) => {
    if (path.join('_') === 'EGW_PARAGRAPH_DB') {
      return Effect.succeed(ConfigProvider.makeValue(dbPath));
    }
    return Effect.succeed(undefined);
  });

  const TestLayer = Layer.fresh(EGWDbBun.Default).pipe(
    Layer.provide(BunServices.layer),
    Layer.provide(ConfigProvider.layer(provider)),
  );
  return effect.pipe(Effect.provide(TestLayer), Effect.scoped);
};

const runTestWithPath = <A, E, R>(
  makeEffect: (dbPath: string) => Effect.Effect<A, E, EGWParagraphDatabase | R>,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'egw-database-' });
    const dbPath = `${directory}/egw.db`;
    return yield* runTestAt(dbPath, makeEffect(dbPath));
  });

const runTest = <A, E, R>(effect: Effect.Effect<A, E, EGWParagraphDatabase | R>) =>
  runTestWithPath(() => effect);

// Helper to create a mock book
const mockBook = (id: number, code: string): Book => ({
  book_id: id,
  code,
  title: `Test Book ${code}`,
  author: 'Ellen Gould White',
  lang: 'en',
  pub_year: '1900',
  type: 'book',
  folder_id: 1,
  cover: {},
  files: {},
  permission_required: 'public',
  sort: 1,
  is_audiobook: false,
  nelements: 100,
  npages: 100,
});

// Helper to create a mock paragraph
const mockParagraph = (puborder: number, refcodeShort: string): Paragraph => ({
  para_id: Option.some(`para-${puborder}`),
  id_prev: null,
  id_next: null,
  refcode_1: null,
  refcode_2: null,
  refcode_3: null,
  refcode_4: null,
  refcode_short: Option.some(refcodeShort),
  refcode_long: `Long ${refcodeShort}`,
  element_type: 'paragraph',
  element_subtype: null,
  nodes: [{ _tag: 'Text', text: `Content for ${refcodeShort}` }],
  puborder,
});

const mockArchive = (refcodes: readonly string[]): PublicationArchive => {
  const id = publicationId(9001);
  const code = publicationCode('TEST');
  const paragraphs = refcodes.map((refcode, index) => {
    const paragraph = new WritingsParagraph({
      reference: WritingsReference.paragraph(id, `paragraph-${String(index + 1)}`),
      publicationCode: code,
      order: publicationOrder(index + 1),
      page: Option.none(),
      number: Option.none(),
      refcode: Option.some(refcode),
      nodes: [{ _tag: 'Text', text: `Content for ${refcode}` }],
      elementType: Option.some('paragraph'),
      elementSubtype: Option.none(),
    });
    return new ArchivedParagraph({ refcode, paragraph, isHeading: false });
  });
  let bibleReferences: readonly ArchivedBibleReference[] = [];
  const firstRefcode = refcodes[0];
  if (firstRefcode !== undefined) {
    bibleReferences = [
      new ArchivedBibleReference({
        paragraphRefcode: firstRefcode,
        scripture: BibleReference.verse(1, 1, 1),
      }),
    ];
  }
  return new PublicationArchive({
    publication: new Publication({
      id,
      code,
      title: 'Test Publication',
      author: 'Test Author',
      paragraphCount: Option.some(refcodes.length),
    }),
    paragraphs,
    bibleReferences,
  });
};

describe('EGWParagraphDatabase', () => {
  const test = it.scopedLive.layer(BunServices.layer);
  describe('canonical publication installation', () => {
    test('persists Provenance atomically and derives readiness from exact identity', () =>
      runTest(
        Effect.gen(function* () {
          const db = yield* EGWParagraphDatabase;
          const provenance = new CorpusProvenance({
            source: assetSourceId('fixture'),
            revision: corpusRevision('2'),
            digest: Option.some(corpusDigest(`sha256:${'a'.repeat(64)}`)),
          });
          yield* db.installPublicationArchive(mockArchive(['TEST 1.1']), provenance);

          const status = Option.getOrThrow(yield* db.getSyncStatus(9001));
          expect(status).toMatchObject({
            source: 'fixture',
            revision: '2',
            digest: `sha256:${'a'.repeat(64)}`,
          });
          expect(yield* db.needsSync(9001, provenance)).toBe(false);
          expect(
            yield* db.needsSync(
              9001,
              new CorpusProvenance({
                source: provenance.source,
                revision: corpusRevision('3'),
                digest: provenance.digest,
              }),
            ),
          ).toBe(true);
        }),
      ));

    test('atomically replaces one publication and activates its verified counts', () =>
      runTest(
        Effect.gen(function* () {
          const db = yield* EGWParagraphDatabase;
          yield* db.installPublicationArchive(mockArchive(['TEST 1.1', 'TEST 1.2']));
          yield* db.installPublicationArchive(mockArchive(['TEST 2.1']));

          const paragraphs = yield* Stream.runCollect(db.getParagraphsByBook(9001));
          const references = yield* db.getBibleRefsByBook(9001);
          const status = yield* db.getSyncStatus(9001);

          expect(paragraphs).toHaveLength(1);
          expect(Option.getOrThrow(paragraphs[0]!.refcode_short)).toBe('TEST 2.1');
          expect(references).toHaveLength(1);
          expect(Option.getOrThrow(status).status).toBe('success');
          expect(Option.getOrThrow(status).paragraph_count).toBe(1);
        }),
      ));

    test('rejects a malformed contribution before replacing the active publication', () =>
      runTest(
        Effect.gen(function* () {
          const db = yield* EGWParagraphDatabase;
          yield* db.installPublicationArchive(mockArchive(['TEST 1.1']));
          const invalid = mockArchive(['TEST 2.1']);
          const result = yield* Effect.result(
            db.installPublicationArchive(
              new PublicationArchive({
                publication: invalid.publication,
                paragraphs: invalid.paragraphs,
                bibleReferences: [
                  new ArchivedBibleReference({
                    paragraphRefcode: 'TEST missing',
                    scripture: BibleReference.chapter(1, 1),
                  }),
                ],
              }),
            ),
          );

          expect(Result.isFailure(result)).toBe(true);
          const paragraphs = yield* Stream.runCollect(db.getParagraphsByBook(9001));
          expect(paragraphs).toHaveLength(1);
          expect(Option.getOrThrow(paragraphs[0]!.refcode_short)).toBe('TEST 1.1');
        }),
      ));
  });

  describe('chapter heading detection', () => {
    test('detects h1-h6 elements as chapter headings', () =>
      runTest(
        Effect.gen(function* () {
          const db = yield* EGWParagraphDatabase;
          const book = mockBook(99998, 'CHAPTEST');

          const paragraphs: Paragraph[] = [
            { ...mockParagraph(1, 'CHAPTEST 1'), element_type: 'h1' },
            { ...mockParagraph(2, 'CHAPTEST 1.1'), element_type: 'p' },
            { ...mockParagraph(3, 'CHAPTEST 2'), element_type: 'h3' },
          ];

          yield* db.storeParagraphsBatch(paragraphs, book);
          const chapters = yield* db.getChapterHeadings(99998);

          expect(chapters.length).toBe(2);
          expect(chapters[0]?.element_type).toBe('h1');
          expect(chapters[1]?.element_type).toBe('h3');
        }),
      ));
  });

  describe('sync status', () => {
    test('sets and gets sync status for a book', () =>
      runTest(
        Effect.gen(function* () {
          const db = yield* EGWParagraphDatabase;

          // Initially no status
          const initial = yield* db.getSyncStatus(1);
          expect(Option.isNone(initial)).toBe(true);

          // Set pending status
          yield* db.setSyncStatus(1, 'PP', 'pending', 0);
          const pending = yield* db.getSyncStatus(1);
          expect(Option.isSome(pending)).toBe(true);
          if (Option.isSome(pending)) {
            expect(pending.value.status).toBe('pending');
          }

          // Update to success
          yield* db.setSyncStatus(1, 'PP', 'success', 100);
          const success = yield* db.getSyncStatus(1);
          expect(Option.isSome(success)).toBe(true);
          if (Option.isSome(success)) {
            expect(success.value.status).toBe('success');
            expect(success.value.paragraph_count).toBe(100);
          }
        }),
      ));

    test('sets error message on failed status', () =>
      runTest(
        Effect.gen(function* () {
          const db = yield* EGWParagraphDatabase;

          yield* db.setSyncStatus(2, 'GC', 'failed', 0, 'API timeout');
          const status = yield* db.getSyncStatus(2);

          expect(Option.isSome(status)).toBe(true);
          if (Option.isSome(status)) {
            expect(status.value.status).toBe('failed');
            expect(status.value.error_message).toBe('API timeout');
          }
        }),
      ));

    test('gets books by status', () =>
      runTest(
        Effect.gen(function* () {
          const db = yield* EGWParagraphDatabase;

          yield* db.setSyncStatus(10, 'DA', 'success', 500);
          yield* db.setSyncStatus(11, 'PP', 'success', 600);
          yield* db.setSyncStatus(12, 'GC', 'failed', 0, 'Error');
          yield* db.setSyncStatus(13, '1BC', 'pending', 0);

          const successful = yield* db.getBooksByStatus('success');
          expect(successful.length).toBe(2);
          expect(successful.map((s) => s.book_code).sort()).toEqual(['DA', 'PP']);

          const failed = yield* db.getBooksByStatus('failed');
          expect(failed.length).toBe(1);
          expect(failed[0]?.book_code).toBe('GC');

          const pending = yield* db.getBooksByStatus('pending');
          expect(pending.length).toBe(1);
          expect(pending[0]?.book_code).toBe('1BC');
        }),
      ));

    test('gets all sync statuses', () =>
      runTest(
        Effect.gen(function* () {
          const db = yield* EGWParagraphDatabase;

          yield* db.setSyncStatus(20, 'AA', 'success', 100);
          yield* db.setSyncStatus(21, 'BB', 'failed', 0, 'Error');
          yield* db.setSyncStatus(22, 'CC', 'pending', 0);

          const all = yield* db.getAllSyncStatus();
          expect(all.length).toBe(3);
        }),
      ));

    test('needsSync returns true for non-success books', () =>
      runTest(
        Effect.gen(function* () {
          const db = yield* EGWParagraphDatabase;

          // Never synced - needs sync
          const needsNew = yield* db.needsSync(999);
          expect(needsNew).toBe(true);

          // Pending - needs sync
          yield* db.setSyncStatus(30, 'TEST1', 'pending', 0);
          const needsPending = yield* db.needsSync(30);
          expect(needsPending).toBe(true);

          // Failed - needs sync
          yield* db.setSyncStatus(31, 'TEST2', 'failed', 0, 'Error');
          const needsFailed = yield* db.needsSync(31);
          expect(needsFailed).toBe(true);

          // Success - does not need sync
          yield* db.setSyncStatus(32, 'TEST3', 'success', 100);
          const needsSuccess = yield* db.needsSync(32);
          expect(needsSuccess).toBe(false);
        }),
      ));
  });

  describe('batch operations', () => {
    test('stores paragraphs in batch', () =>
      runTest(
        Effect.gen(function* () {
          const db = yield* EGWParagraphDatabase;
          const book = mockBook(100, 'BATCH');

          const paragraphs = [
            mockParagraph(1, 'BATCH 1.1'),
            mockParagraph(2, 'BATCH 1.2'),
            mockParagraph(3, 'BATCH 1.3'),
          ];

          const count = yield* db.storeParagraphsBatch(paragraphs, book);
          expect(count).toBe(3);

          // Verify book was created
          const storedBook = yield* db.getBookByCode('BATCH');
          expect(Option.isSome(storedBook)).toBe(true);
          if (Option.isSome(storedBook)) {
            expect(storedBook.value.book_title).toBe('Test Book BATCH');
          }
        }),
      ));

    test('reports corrupt stored paragraph AST as a data-integrity error', () =>
      runTestWithPath((dbPath) =>
        Effect.gen(function* () {
          const db = yield* EGWParagraphDatabase;
          const book = mockBook(102, 'CORRUPT');
          yield* db.storeParagraphsBatch([mockParagraph(1, 'CORRUPT 1.1')], book);
          const raw = yield* Effect.acquireRelease(
            Effect.sync(() => new Database(dbPath)),
            (database) => Effect.sync(() => database.close()),
          );
          yield* Effect.sync(() => {
            raw.run(
              'UPDATE paragraphs SET nodes_json = \'[{"_tag":"Text","text":42}]\' WHERE book_id = 102',
            );
          });

          const result = yield* Effect.result(db.getParagraph(102, 'CORRUPT 1.1'));
          expect(Result.isFailure(result)).toBe(true);
          if (Result.isFailure(result)) {
            expect(result.failure).toBeInstanceOf(ParagraphDataIntegrityError);
          }
        }),
      ));

    test('stores Bible refs in batch', () =>
      runTest(
        Effect.gen(function* () {
          const db = yield* EGWParagraphDatabase;
          const book = mockBook(101, '1BC');

          // First store paragraphs so foreign key constraint is satisfied
          const paragraphs = [mockParagraph(1, '1BC 100.1'), mockParagraph(2, '1BC 100.2')];
          yield* db.storeParagraphsBatch(paragraphs, book);

          // Store Bible refs
          const refs = [
            {
              bookId: 101,
              refCode: '1BC 100.1',
              bibleBook: 1,
              bibleChapter: 1,
              bibleVerse: 1,
            },
            {
              bookId: 101,
              refCode: '1BC 100.1',
              bibleBook: 1,
              bibleChapter: 1,
              bibleVerse: 2,
            },
            {
              bookId: 101,
              refCode: '1BC 100.2',
              bibleBook: 43,
              bibleChapter: 3,
              bibleVerse: 16,
            },
          ];

          const count = yield* db.storeBibleRefsBatch(refs);
          expect(count).toBe(3);

          // Verify we can look up by Bible reference
          const results = yield* db.getParagraphsByBibleRef(43, 3, 16);
          expect(results.length).toBe(1);
          expect(results[0]?.bookCode).toBe('1BC');
        }),
      ));
  });

  describe('book operations', () => {
    test('stores and retrieves books by code', () =>
      runTest(
        Effect.gen(function* () {
          const db = yield* EGWParagraphDatabase;
          const book = mockBook(200, 'TEST');

          yield* db.storeBook(book);

          const retrieved = yield* db.getBookByCode('TEST');
          expect(Option.isSome(retrieved)).toBe(true);
          if (Option.isSome(retrieved)) {
            expect(retrieved.value.book_id).toBe(200);
          }

          // Case insensitive
          const lowerCase = yield* db.getBookByCode('test');
          expect(Option.isSome(lowerCase)).toBe(true);
        }),
      ));

    test('retrieves books by ID', () =>
      runTest(
        Effect.gen(function* () {
          const db = yield* EGWParagraphDatabase;
          const book = mockBook(201, 'BYID');

          yield* db.storeBook(book);

          const retrieved = yield* db.getBookById(201);
          expect(Option.isSome(retrieved)).toBe(true);
          if (Option.isSome(retrieved)) {
            expect(retrieved.value.book_code).toBe('BYID');
          }
        }),
      ));
  });
});
