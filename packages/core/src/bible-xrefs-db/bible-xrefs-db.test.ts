/**
 * Tests for Bible Cross-Reference Database
 *
 * Uses unique temp files for database isolation between tests. Imports a
 * small synthetic fixture rather than the full bundled JSON — the integration
 * with the bundled assets is exercised by the desktop app at launch.
 */

import { existsSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BunServices } from '@effect/platform-bun';
import { afterAll, describe, expect, test } from 'bun:test';
import { Effect, Layer } from 'effect';

import { BibleXrefsDatabase } from './bible-xrefs-db.js';
import type { XrefCatalog } from './bible-xrefs-db.js';
import * as XrefsDbBun from './bible-xrefs-db-bun.js';

const tempFiles: string[] = [];

const getTempDbPath = (): string => {
  const path = join(tmpdir(), `xrefs-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  tempFiles.push(path);
  return path;
};

afterAll(() => {
  for (const file of tempFiles) {
    try {
      if (existsSync(file)) unlinkSync(file);
      if (existsSync(`${file}-wal`)) unlinkSync(`${file}-wal`);
      if (existsSync(`${file}-shm`)) unlinkSync(`${file}-shm`);
    } catch {
      // ignore cleanup errors
    }
  }
});

const runTest = <A, E>(effect: Effect.Effect<A, E, BibleXrefsDatabase>): Promise<A> => {
  const dbPath = getTempDbPath();
  const TestLayer = Layer.fresh(XrefsDbBun.layerBun(dbPath)).pipe(Layer.provide(BunServices.layer));
  return Effect.runPromise(Effect.scoped(effect.pipe(Effect.provide(TestLayer))));
};

const openbibleCatalog: XrefCatalog = {
  '1.1.1': {
    refs: [
      { book: 43, chapter: 1, verse: 1, verseEnd: 3 },
      { book: 19, chapter: 33, verse: 6 },
    ],
  },
  '40.5.3': {
    refs: [{ book: 23, chapter: 61, verse: 1 }],
  },
  // Intentionally malformed key — should be skipped without aborting import.
  'bogus.key': {
    refs: [{ book: 1, chapter: 1, verse: 1 }],
  },
};

const tskeCatalog: XrefCatalog = {
  '1.1.1': {
    refs: [{ book: 43, chapter: 1, verse: 1, verseEnd: 3 }],
  },
};

describe('BibleXrefsDatabase', () => {
  test('importCatalog reports counts and skips malformed keys', () =>
    runTest(
      Effect.gen(function* () {
        const db = yield* BibleXrefsDatabase;
        const result = yield* db.importCatalog('openbible', openbibleCatalog);
        // 2 refs for 1.1.1 + 1 ref for 40.5.3 = 3 imported; 'bogus.key' skipped
        expect(result.imported).toBe(3);
        expect(result.skipped).toBe(1);
      }),
    ));

  test('getCrossRefs returns refs for a verse, sorted, with source attribution', () =>
    runTest(
      Effect.gen(function* () {
        const db = yield* BibleXrefsDatabase;
        yield* db.importCatalog('openbible', openbibleCatalog);
        yield* db.importCatalog('tske', tskeCatalog);
        const rows = yield* db.getCrossRefs(1, 1, 1);
        // openbible first (alpha order), then tske
        expect(rows.length).toBe(3);
        expect(rows.map((r) => r.source)).toEqual(['openbible', 'openbible', 'tske']);
        // openbible rows are sorted by (target_book, target_chapter, target_verse)
        expect(rows[0]?.targetBook).toBe(19);
        expect(rows[1]?.targetBook).toBe(43);
        expect(rows[1]?.targetVerseEnd).toBe(3);
      }),
    ));

  test('getCrossRefs returns empty array for verse with no refs', () =>
    runTest(
      Effect.gen(function* () {
        const db = yield* BibleXrefsDatabase;
        yield* db.importCatalog('openbible', openbibleCatalog);
        const rows = yield* db.getCrossRefs(99, 99, 99);
        expect(rows.length).toBe(0);
      }),
    ));

  test('importCatalog is idempotent (re-import does not duplicate)', () =>
    runTest(
      Effect.gen(function* () {
        const db = yield* BibleXrefsDatabase;
        yield* db.importCatalog('openbible', openbibleCatalog);
        yield* db.importCatalog('openbible', openbibleCatalog);
        const rows = yield* db.getCrossRefs(1, 1, 1);
        expect(rows.length).toBe(2);
      }),
    ));

  test('isImported flips after first row exists', () =>
    runTest(
      Effect.gen(function* () {
        const db = yield* BibleXrefsDatabase;
        expect(yield* db.isImported()).toBe(false);
        yield* db.importCatalog('openbible', openbibleCatalog);
        expect(yield* db.isImported()).toBe(true);
      }),
    ));

  test('verseEnd is null when target ref is a single verse', () =>
    runTest(
      Effect.gen(function* () {
        const db = yield* BibleXrefsDatabase;
        yield* db.importCatalog('openbible', openbibleCatalog);
        const rows = yield* db.getCrossRefs(40, 5, 3);
        expect(rows.length).toBe(1);
        expect(rows[0]?.targetVerseEnd).toBeNull();
      }),
    ));

  test('versesWithCrossRefs returns sorted distinct verses for (book, chapter)', () =>
    runTest(
      Effect.gen(function* () {
        const db = yield* BibleXrefsDatabase;
        // Seed multiple verses across two chapters in book 1, plus one verse
        // with refs from both catalogs (verse 1.1.1) to verify the DISTINCT
        // collapses cross-catalog duplicates.
        yield* db.importCatalog('openbible', {
          '1.1.1': { refs: [{ book: 43, chapter: 1, verse: 1 }] },
          '1.1.3': { refs: [{ book: 19, chapter: 33, verse: 6 }] },
          '1.1.7': { refs: [{ book: 23, chapter: 61, verse: 1 }] },
          // different chapter — should not appear in the (1, 1) result.
          '1.2.4': { refs: [{ book: 40, chapter: 5, verse: 3 }] },
        });
        yield* db.importCatalog('tske', {
          // duplicate verse 1.1.1 → still one row in the distinct verse list.
          '1.1.1': { refs: [{ book: 44, chapter: 2, verse: 4 }] },
        });
        const verses = yield* db.versesWithCrossRefs(1, 1);
        expect(verses).toEqual([1, 3, 7]);
      }),
    ));

  test('versesWithCrossRefs returns [] for a chapter with no refs', () =>
    runTest(
      Effect.gen(function* () {
        const db = yield* BibleXrefsDatabase;
        yield* db.importCatalog('openbible', openbibleCatalog);
        const verses = yield* db.versesWithCrossRefs(66, 22);
        expect(verses).toEqual([]);
      }),
    ));
});
