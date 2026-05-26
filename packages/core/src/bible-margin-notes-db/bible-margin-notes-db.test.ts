/**
 * Tests for Bible Margin Notes Database
 *
 * Uses unique temp files for database isolation between tests. Imports a
 * small synthetic fixture rather than the full bundled JSON — the integration
 * with the bundled asset is exercised by the desktop app at launch.
 */

import { existsSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BunServices } from '@effect/platform-bun';
import { afterAll, describe, expect, test } from 'bun:test';
import { Effect, Layer } from 'effect';

import { BibleMarginNotesDatabase } from './bible-margin-notes-db.js';
import type { MarginNotesCatalog } from './bible-margin-notes-db.js';
import * as MarginNotesDbBun from './bible-margin-notes-db-bun.js';

const tempFiles: string[] = [];

const getTempDbPath = (): string => {
  const path = join(
    tmpdir(),
    `margin-notes-test-${String(Date.now())}-${Math.random().toString(36).slice(2)}.db`,
  );
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

const runTest = <A, E>(effect: Effect.Effect<A, E, BibleMarginNotesDatabase>): Promise<A> => {
  const dbPath = getTempDbPath();
  const TestLayer = Layer.fresh(MarginNotesDbBun.layerBun(dbPath)).pipe(
    Layer.provide(BunServices.layer),
  );
  return Effect.runPromise(Effect.scoped(effect.pipe(Effect.provide(TestLayer))));
};

const catalog: MarginNotesCatalog = {
  '1.1.4': [
    {
      type: 'hebrew',
      phrase: 'divided the light from the darkness',
      text: 'Heb. between the light and between the darkness',
    },
  ],
  '1.1.5': [
    { type: 'hebrew', phrase: 'And the evening', text: 'Heb. And the evening was, and …' },
    { type: 'alternate', phrase: 'first day', text: 'Or, day one' },
  ],
  '40.1.21': [{ type: 'name', phrase: 'JESUS', text: 'Heb. Yeshua, meaning "Yahweh saves"' }],
  // Intentionally malformed key — should be skipped without aborting import.
  'bogus.key': [{ type: 'other', phrase: 'x', text: 'y' }],
};

describe('BibleMarginNotesDatabase', () => {
  test('importCatalog reports counts and skips malformed keys', () =>
    runTest(
      Effect.gen(function* () {
        const db = yield* BibleMarginNotesDatabase;
        const result = yield* db.importCatalog(catalog);
        // 1 + 2 + 1 = 4 imported; 'bogus.key' contributes 1 skipped.
        expect(result.imported).toBe(4);
        expect(result.skipped).toBe(1);
      }),
    ));

  test('getMarginNotes returns notes in their original asset order', () =>
    runTest(
      Effect.gen(function* () {
        const db = yield* BibleMarginNotesDatabase;
        yield* db.importCatalog(catalog);
        const rows = yield* db.getMarginNotes(1, 1, 5);
        expect(rows.length).toBe(2);
        expect(rows[0]?.idx).toBe(0);
        expect(rows[0]?.type).toBe('hebrew');
        expect(rows[1]?.idx).toBe(1);
        expect(rows[1]?.type).toBe('alternate');
        expect(rows[1]?.phrase).toBe('first day');
      }),
    ));

  test('getMarginNotes returns [] for a verse with no notes', () =>
    runTest(
      Effect.gen(function* () {
        const db = yield* BibleMarginNotesDatabase;
        yield* db.importCatalog(catalog);
        const rows = yield* db.getMarginNotes(99, 99, 99);
        expect(rows.length).toBe(0);
      }),
    ));

  test('versesWithNotes returns the distinct annotated verses for a chapter', () =>
    runTest(
      Effect.gen(function* () {
        const db = yield* BibleMarginNotesDatabase;
        yield* db.importCatalog(catalog);
        const set = yield* db.versesWithNotes(1, 1);
        // Verse 4 has 1 note, verse 5 has 2 notes — DISTINCT collapses to {4,5}.
        expect([...set].sort((a, b) => a - b)).toEqual([4, 5]);
      }),
    ));

  test('versesWithNotes returns an empty set for a chapter with no notes', () =>
    runTest(
      Effect.gen(function* () {
        const db = yield* BibleMarginNotesDatabase;
        yield* db.importCatalog(catalog);
        const set = yield* db.versesWithNotes(99, 99);
        expect(set.size).toBe(0);
      }),
    ));

  test('importCatalog is idempotent (re-import preserves row counts)', () =>
    runTest(
      Effect.gen(function* () {
        const db = yield* BibleMarginNotesDatabase;
        yield* db.importCatalog(catalog);
        yield* db.importCatalog(catalog);
        const rows = yield* db.getMarginNotes(1, 1, 5);
        expect(rows.length).toBe(2);
      }),
    ));

  test('isImported flips after first row exists', () =>
    runTest(
      Effect.gen(function* () {
        const db = yield* BibleMarginNotesDatabase;
        expect(yield* db.isImported()).toBe(false);
        yield* db.importCatalog(catalog);
        expect(yield* db.isImported()).toBe(true);
      }),
    ));
});
