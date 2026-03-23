/**
 * Bible Database Performance Tests
 *
 * These tests verify query performance stays within acceptable bounds.
 * Run with: bun test test/perf/
 *
 * Note: These tests require the real bible.db to be populated.
 * Run `bun run sync:bible` from packages/core to initialize the database.
 */

import { existsSync } from 'fs';
import { join } from 'path';

import { BibleDatabase } from '@bible/core/bible-db';
import { BunServices } from '@effect/platform-bun';
import { beforeAll, describe, expect, it } from 'bun:test';
import { Effect, Layer, ManagedRuntime, Option } from 'effect';

// Use the bible.db in packages/core/data
const DB_PATH = join(import.meta.dir, '../../../core/data/bible.db');

// Create combined layer with all dependencies
const BibleServicesLayer = BibleDatabase.Default.pipe(Layer.provideMerge(BunServices.layer));

// Create ManagedRuntime
const runtime = ManagedRuntime.make(BibleServicesLayer);

describe('Bible Database Performance', () => {
  beforeAll(async () => {
    if (!existsSync(DB_PATH)) {
      console.log('Bible database not found at', DB_PATH);
      console.log('Run `bun run sync:bible` in packages/core to initialize it.');
      return;
    }
    // Initialize the runtime
    await runtime.runPromise(
      Effect.gen(function* () {
        const db = yield* BibleDatabase;
        yield* db.getBooks();
      }),
    );
  });

  it('getCrossRefs should complete in < 10ms', async () => {
    if (!existsSync(DB_PATH)) return;

    const start = performance.now();
    const refs = await runtime.runPromise(
      Effect.gen(function* () {
        const db = yield* BibleDatabase;
        return yield* db.getCrossRefs(43, 3, 16); // John 3:16
      }),
    );
    const elapsed = performance.now() - start;

    console.log(`getCrossRefs: ${elapsed.toFixed(2)}ms, ${refs.length} refs`);
    expect(refs.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(10);
  });

  it('getStrongsEntry should complete in < 5ms', async () => {
    if (!existsSync(DB_PATH)) return;

    const start = performance.now();
    const entryOpt = await runtime.runPromise(
      Effect.gen(function* () {
        const db = yield* BibleDatabase;
        return yield* db.getStrongsEntry('H430'); // Elohim
      }),
    );
    const elapsed = performance.now() - start;

    console.log(`getStrongsEntry: ${elapsed.toFixed(2)}ms`);
    expect(Option.isSome(entryOpt)).toBe(true);
    if (Option.isSome(entryOpt)) {
      expect(entryOpt.value.definition).toBeDefined();
    }
    expect(elapsed).toBeLessThan(5);
  });

  it('getVersesWithStrongs should complete in < 50ms (using index)', async () => {
    if (!existsSync(DB_PATH)) return;

    const start = performance.now();
    const results = await runtime.runPromise(
      Effect.gen(function* () {
        const db = yield* BibleDatabase;
        return yield* db.getVersesWithStrongs('H430'); // Common word - Elohim
      }),
    );
    const elapsed = performance.now() - start;

    console.log(`getVersesWithStrongs H430: ${elapsed.toFixed(2)}ms, ${results.length} verses`);
    expect(results.length).toBeGreaterThan(100);
    expect(elapsed).toBeLessThan(50);
  });

  it('getVersesWithStrongs should complete in < 50ms for Greek words', async () => {
    if (!existsSync(DB_PATH)) return;

    const start = performance.now();
    const results = await runtime.runPromise(
      Effect.gen(function* () {
        const db = yield* BibleDatabase;
        return yield* db.getVersesWithStrongs('G26'); // Agape (love)
      }),
    );
    const elapsed = performance.now() - start;

    console.log(`getVersesWithStrongs G26: ${elapsed.toFixed(2)}ms, ${results.length} verses`);
    expect(results.length).toBeGreaterThan(10);
    expect(elapsed).toBeLessThan(50);
  });

  it('searchStrongs should complete in < 20ms (using FTS5)', async () => {
    if (!existsSync(DB_PATH)) return;

    const start = performance.now();
    const results = await runtime.runPromise(
      Effect.gen(function* () {
        const db = yield* BibleDatabase;
        return yield* db.searchStrongs('love');
      }),
    );
    const elapsed = performance.now() - start;

    console.log(`searchStrongs 'love': ${elapsed.toFixed(2)}ms, ${results.length} entries`);
    expect(results.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(20);
  });

  it('getMarginNotes should complete in < 10ms', async () => {
    if (!existsSync(DB_PATH)) return;

    const start = performance.now();
    const notes = await runtime.runPromise(
      Effect.gen(function* () {
        const db = yield* BibleDatabase;
        return yield* db.getMarginNotes(1, 1, 1); // Gen 1:1
      }),
    );
    const elapsed = performance.now() - start;

    console.log(`getMarginNotes: ${elapsed.toFixed(2)}ms, ${notes.length} notes`);
    expect(notes.length).toBeGreaterThanOrEqual(0);
    expect(elapsed).toBeLessThan(10);
  });

  it('getVerseWords should complete in < 5ms', async () => {
    if (!existsSync(DB_PATH)) return;

    const start = performance.now();
    const words = await runtime.runPromise(
      Effect.gen(function* () {
        const db = yield* BibleDatabase;
        return yield* db.getVerseWords(1, 1, 1); // Gen 1:1
      }),
    );
    const elapsed = performance.now() - start;

    console.log(`getVerseWords: ${elapsed.toFixed(2)}ms, ${words.length} words`);
    expect(words.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(5);
  });

  it('batch getCrossRefs for 50 verses should complete in < 200ms', async () => {
    if (!existsSync(DB_PATH)) return;

    const verses = Array.from({ length: 50 }, (_, i) => ({
      book: 1,
      chapter: 1,
      verse: i + 1,
    }));

    const start = performance.now();
    let totalRefs = 0;
    /* eslint-disable no-await-in-loop -- Perf test measures sequential operation timing */
    for (const verse of verses) {
      const refs = await runtime.runPromise(
        Effect.gen(function* () {
          const db = yield* BibleDatabase;
          return yield* db.getCrossRefs(verse.book, verse.chapter, verse.verse);
        }),
      );
      totalRefs += refs.length;
    }
    /* eslint-enable no-await-in-loop */
    const elapsed = performance.now() - start;

    console.log(`batch getCrossRefs (50 verses): ${elapsed.toFixed(2)}ms, ${totalRefs} total refs`);
    expect(elapsed).toBeLessThan(200);
  });
});
