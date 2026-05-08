/**
 * Tests for EGW Paragraph Database
 *
 * Uses unique temp files for database isolation between tests.
 */

import { existsSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BunServices } from '@effect/platform-bun';
import { afterAll, describe, expect, test } from 'bun:test';
import { ConfigProvider, Effect, Layer, Option } from 'effect';

import type { Book, Paragraph } from '../egw/schemas.js';
import { EGWParagraphDatabase } from './book-database.js';

// Track temp files for cleanup
const tempFiles: string[] = [];

// Helper to get a unique temp db path
const getTempDbPath = (): string => {
  const path = join(tmpdir(), `egw-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  tempFiles.push(path);
  return path;
};

// Cleanup temp files after all tests
afterAll(() => {
  for (const file of tempFiles) {
    try {
      if (existsSync(file)) unlinkSync(file);
      // Also try to remove WAL and SHM files
      if (existsSync(`${file}-wal`)) unlinkSync(`${file}-wal`);
      if (existsSync(`${file}-shm`)) unlinkSync(`${file}-shm`);
    } catch {
      // Ignore cleanup errors
    }
  }
});

// Helper to run scoped effects in tests with fresh database
const runTest = <A, E>(effect: Effect.Effect<A, E, EGWParagraphDatabase>): Promise<A> => {
  const dbPath = getTempDbPath();

  const provider = ConfigProvider.make((path) =>
    Effect.succeed(
      path.join('_') === 'EGW_PARAGRAPH_DB' ? ConfigProvider.makeValue(dbPath) : undefined,
    ),
  );

  const TestLayer = Layer.fresh(EGWParagraphDatabase.Default).pipe(
    Layer.provide(BunServices.layer),
    Layer.provide(ConfigProvider.layer(provider)),
  );
  return Effect.runPromise(Effect.scoped(effect.pipe(Effect.provide(TestLayer))));
};

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
  para_id: `para-${puborder}`,
  id_prev: null,
  id_next: null,
  refcode_1: null,
  refcode_2: null,
  refcode_3: null,
  refcode_4: null,
  refcode_short: refcodeShort,
  refcode_long: `Long ${refcodeShort}`,
  element_type: 'paragraph',
  element_subtype: null,
  content: `<p>Content for ${refcodeShort}</p>`,
  puborder,
});

describe('EGWParagraphDatabase', () => {
  describe('chapter heading detection', () => {
    test('detects h1-h6 elements as chapter headings', async () => {
      await runTest(
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
      );
    });
  });

  describe('sync status', () => {
    test('sets and gets sync status for a book', async () => {
      await runTest(
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
      );
    });

    test('sets error message on failed status', async () => {
      await runTest(
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
      );
    });

    test('gets books by status', async () => {
      await runTest(
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
      );
    });

    test('gets all sync statuses', async () => {
      await runTest(
        Effect.gen(function* () {
          const db = yield* EGWParagraphDatabase;

          yield* db.setSyncStatus(20, 'AA', 'success', 100);
          yield* db.setSyncStatus(21, 'BB', 'failed', 0, 'Error');
          yield* db.setSyncStatus(22, 'CC', 'pending', 0);

          const all = yield* db.getAllSyncStatus();
          expect(all.length).toBe(3);
        }),
      );
    });

    test('needsSync returns true for non-success books', async () => {
      await runTest(
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
      );
    });
  });

  describe('batch operations', () => {
    test('stores paragraphs in batch', async () => {
      await runTest(
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
      );
    });

    test('stores Bible refs in batch', async () => {
      await runTest(
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
      );
    });
  });

  describe('book operations', () => {
    test('stores and retrieves books by code', async () => {
      await runTest(
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
      );
    });

    test('retrieves books by ID', async () => {
      await runTest(
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
      );
    });
  });
});
