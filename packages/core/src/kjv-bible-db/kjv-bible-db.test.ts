/**
 * Tests for KJV Bible Database
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
import { Effect, Layer, Option } from 'effect';

import { KjvBibleDatabase } from './kjv-bible-db.js';
import type { KjvAssetFile, StrongsLexiconRaw, StrongsVerseRow } from './kjv-bible-db.js';
import * as KjvDbBun from './kjv-bible-db-bun.js';

const tempFiles: string[] = [];

const getTempDbPath = (): string => {
  const path = join(tmpdir(), `kjv-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
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

const runTest = <A, E>(effect: Effect.Effect<A, E, KjvBibleDatabase>): Promise<A> => {
  const dbPath = getTempDbPath();
  const TestLayer = Layer.fresh(KjvDbBun.layerBun(dbPath)).pipe(Layer.provide(BunServices.layer));
  return Effect.runPromise(Effect.scoped(effect.pipe(Effect.provide(TestLayer))));
};

const mockKjv: KjvAssetFile = {
  verses: [
    { book_name: 'Genesis', book: 1, chapter: 1, verse: 1, text: 'In the beginning' },
    { book_name: 'Genesis', book: 1, chapter: 1, verse: 2, text: 'And the earth' },
    { book_name: 'Genesis', book: 1, chapter: 2, verse: 1, text: 'Thus the heavens' },
    { book_name: 'Revelation', book: 66, chapter: 22, verse: 21, text: 'The grace' },
  ],
};

const mockStrongs: readonly StrongsVerseRow[] = [
  {
    book: 1,
    chapter: 1,
    verse: 1,
    words: [{ text: 'In', strongs: ['H7225'] }, { text: 'beginning' }],
  },
  // verse 2 intentionally absent — exercises the nullable Strong's column
];

const mockLex: Record<string, StrongsLexiconRaw> = {
  H7225: { lemma: 'רֵאשִׁית', xlit: "re'shiyth", def: 'first, beginning' },
  G1: { lemma: 'ἄλφα', xlit: 'alpha', def: 'first letter' },
  // X9999 with a non-H/G prefix must be skipped during import
  X9999: { lemma: 'bogus', xlit: 'bogus', def: 'should be skipped' },
};

describe('KjvBibleDatabase', () => {
  test('importKjv reports verses + withStrongs counts', () =>
    runTest(
      Effect.gen(function* () {
        const db = yield* KjvBibleDatabase;
        const result = yield* db.importKjv(mockKjv, mockStrongs);
        expect(result.verses).toBe(4);
        expect(result.withStrongs).toBe(1);
      }),
    ));

  test('importStrongsLexicon skips non-H/G prefixes', () =>
    runTest(
      Effect.gen(function* () {
        const db = yield* KjvBibleDatabase;
        const result = yield* db.importStrongsLexicon(mockLex);
        expect(result.imported).toBe(2);
        expect(result.skipped).toBe(1);
      }),
    ));

  test('importKjv is idempotent (re-import does not duplicate)', () =>
    runTest(
      Effect.gen(function* () {
        const db = yield* KjvBibleDatabase;
        yield* db.importKjv(mockKjv, mockStrongs);
        yield* db.importKjv(mockKjv, mockStrongs);
        const chapter = yield* db.getChapter(1, 1);
        expect(Option.isSome(chapter)).toBe(true);
        if (Option.isSome(chapter)) {
          expect(chapter.value.verses.length).toBe(2);
        }
      }),
    ));

  test('getChapter returns chapter payload sorted by verse', () =>
    runTest(
      Effect.gen(function* () {
        const db = yield* KjvBibleDatabase;
        yield* db.importKjv(mockKjv, mockStrongs);
        const chapter = yield* db.getChapter(1, 1);
        expect(Option.isSome(chapter)).toBe(true);
        if (Option.isSome(chapter)) {
          expect(chapter.value.book).toBe(1);
          expect(chapter.value.chapter).toBe(1);
          expect(chapter.value.book_name).toBe('Genesis');
          expect(chapter.value.verses.map((v) => v.verse)).toEqual([1, 2]);
          expect(chapter.value.verses[0]?.text).toBe('In the beginning');
        }
      }),
    ));

  test('getChapter Option.none() for invalid book/chapter', () =>
    runTest(
      Effect.gen(function* () {
        const db = yield* KjvBibleDatabase;
        yield* db.importKjv(mockKjv, mockStrongs);
        const invalid = yield* db.getChapter(99, 99);
        expect(Option.isNone(invalid)).toBe(true);
      }),
    ));

  test('getChapterStrongs returns only verses with Strong words', () =>
    runTest(
      Effect.gen(function* () {
        const db = yield* KjvBibleDatabase;
        yield* db.importKjv(mockKjv, mockStrongs);
        const chapter = yield* db.getChapterStrongs(1, 1);
        expect(Option.isSome(chapter)).toBe(true);
        if (Option.isSome(chapter)) {
          expect(chapter.value.verses.length).toBe(1);
          expect(chapter.value.verses[0]?.verse).toBe(1);
          expect(chapter.value.verses[0]?.words.length).toBe(2);
          expect(chapter.value.verses[0]?.words[0]?.strongs).toEqual(['H7225']);
        }
      }),
    ));

  test('getChapterStrongs Option.none() when no verses tagged', () =>
    runTest(
      Effect.gen(function* () {
        const db = yield* KjvBibleDatabase;
        yield* db.importKjv(mockKjv, mockStrongs);
        const chapter = yield* db.getChapterStrongs(1, 2);
        expect(Option.isNone(chapter)).toBe(true);
      }),
    ));

  test('strongsLookup classifies H/G correctly', () =>
    runTest(
      Effect.gen(function* () {
        const db = yield* KjvBibleDatabase;
        yield* db.importStrongsLexicon(mockLex);
        const h = yield* db.strongsLookup('H7225');
        expect(Option.isSome(h)).toBe(true);
        if (Option.isSome(h)) {
          expect(h.value.language).toBe('hebrew');
          expect(h.value.lemma).toBe('רֵאשִׁית');
        }
        const g = yield* db.strongsLookup('G1');
        expect(Option.isSome(g)).toBe(true);
        if (Option.isSome(g)) expect(g.value.language).toBe('greek');
      }),
    ));

  test('strongsLookup Option.none() for missing code', () =>
    runTest(
      Effect.gen(function* () {
        const db = yield* KjvBibleDatabase;
        yield* db.importStrongsLexicon(mockLex);
        const missing = yield* db.strongsLookup('Z99999');
        expect(Option.isNone(missing)).toBe(true);
      }),
    ));

  test('isImported reports partial KJV imports as not-imported', () =>
    runTest(
      Effect.gen(function* () {
        const db = yield* KjvBibleDatabase;
        expect(yield* db.isImported()).toBe(false);
        yield* db.importKjv(mockKjv, mockStrongs);
        yield* db.importStrongsLexicon(mockLex);
        // Mock fixture has 4 verses, far below the canonical 31102.
        // `isImported` treats anything below threshold as not-imported
        // so a crashed transaction recovers automatically on the next
        // launch instead of wedging the renderer with empty chapters.
        expect(yield* db.isImported()).toBe(false);
      }),
    ));
});
