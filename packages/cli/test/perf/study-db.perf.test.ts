import * as BunServices from '@effect/platform-bun/BunServices';
import { BibleDatabase } from '@bible/core/bible-db';
import * as BibleDbBun from '@bible/core/bible-db/bun';
import { describe, expect, it } from 'effect-bun-test';
import { Array, Clock, Duration, Effect, FileSystem, Layer, Option } from 'effect';

const DB_PATH = `${import.meta.dir}/../../../core/data/bible.db`;
const BibleServicesLayer = Layer.mergeAll(BibleDbBun.layerBun(DB_PATH), BunServices.layer);

const timed = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const start = yield* Clock.currentTimeNanos;
    const value = yield* effect;
    const end = yield* Clock.currentTimeNanos;
    return [value, Duration.toMillis(Duration.nanos(end - start))] as const;
  });

const whenDatabaseExists = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    if (!(yield* fs.exists(DB_PATH))) {
      yield* Effect.logWarning(`Skipping Bible performance assertion: missing ${DB_PATH}`);
      return Option.none<A>();
    }
    return Option.some(yield* effect);
  });

describe('Bible Database Performance', () => {
  const test = it.scopedLive.layer(BibleServicesLayer);

  test('getCrossRefs should complete in < 10ms', () =>
    whenDatabaseExists(
      Effect.gen(function* () {
        const db = yield* BibleDatabase;
        const [refs, elapsed] = yield* timed(db.getCrossRefs(43, 3, 16));
        yield* Effect.logInfo(
          `perf.getCrossRefs elapsedMs=${elapsed.toFixed(2)} refs=${refs.length}`,
        );
        expect(refs.length).toBeGreaterThan(0);
        expect(elapsed).toBeLessThan(10);
      }),
    ));

  test('getStrongsEntry should complete in < 5ms', () =>
    whenDatabaseExists(
      Effect.gen(function* () {
        const db = yield* BibleDatabase;
        const [entry, elapsed] = yield* timed(db.getStrongsEntry('H430'));
        yield* Effect.logInfo(`perf.getStrongsEntry elapsedMs=${elapsed.toFixed(2)}`);
        expect(Option.isSome(entry)).toBe(true);
        if (Option.isSome(entry)) {
          expect(entry.value.definition).toBeDefined();
        }
        expect(elapsed).toBeLessThan(5);
      }),
    ));

  test('getVersesWithStrongs should complete in < 50ms (using index)', () =>
    whenDatabaseExists(
      Effect.gen(function* () {
        const db = yield* BibleDatabase;
        const [results, elapsed] = yield* timed(db.getVersesWithStrongs('H430'));
        yield* Effect.logInfo(
          `perf.getVersesWithStrongs strongs=H430 elapsedMs=${elapsed.toFixed(2)} verses=${results.length}`,
        );
        expect(results.length).toBeGreaterThan(100);
        expect(elapsed).toBeLessThan(50);
      }),
    ));

  test('getVersesWithStrongs should complete in < 50ms for Greek words', () =>
    whenDatabaseExists(
      Effect.gen(function* () {
        const db = yield* BibleDatabase;
        const [results, elapsed] = yield* timed(db.getVersesWithStrongs('G26'));
        yield* Effect.logInfo(
          `perf.getVersesWithStrongs strongs=G26 elapsedMs=${elapsed.toFixed(2)} verses=${results.length}`,
        );
        expect(results.length).toBeGreaterThan(10);
        expect(elapsed).toBeLessThan(50);
      }),
    ));

  test('searchStrongs should complete in < 20ms', () =>
    whenDatabaseExists(
      Effect.gen(function* () {
        const db = yield* BibleDatabase;
        const [results, elapsed] = yield* timed(db.searchStrongs('love'));
        yield* Effect.logInfo(
          `perf.searchStrongs elapsedMs=${elapsed.toFixed(2)} entries=${results.length}`,
        );
        expect(results.length).toBeGreaterThan(0);
        expect(elapsed).toBeLessThan(20);
      }),
    ));

  test('getMarginNotes should complete in < 10ms', () =>
    whenDatabaseExists(
      Effect.gen(function* () {
        const db = yield* BibleDatabase;
        const [notes, elapsed] = yield* timed(db.getMarginNotes(1, 1, 1));
        yield* Effect.logInfo(
          `perf.getMarginNotes elapsedMs=${elapsed.toFixed(2)} notes=${notes.length}`,
        );
        expect(notes.length).toBeGreaterThanOrEqual(0);
        expect(elapsed).toBeLessThan(10);
      }),
    ));

  test('getVerseWords should complete in < 5ms', () =>
    whenDatabaseExists(
      Effect.gen(function* () {
        const db = yield* BibleDatabase;
        const [words, elapsed] = yield* timed(db.getVerseWords(1, 1, 1));
        yield* Effect.logInfo(
          `perf.getVerseWords elapsedMs=${elapsed.toFixed(2)} words=${words.length}`,
        );
        expect(words.length).toBeGreaterThan(0);
        expect(elapsed).toBeLessThan(5);
      }),
    ));

  test('batch getCrossRefs for 50 verses should complete in < 200ms', () =>
    whenDatabaseExists(
      Effect.gen(function* () {
        const db = yield* BibleDatabase;
        const verses = Array.range(0, 49).map((index) => ({
          book: 1,
          chapter: 1,
          verse: index + 1,
        }));
        const [allRefs, elapsed] = yield* timed(
          Effect.forEach(verses, (verse) =>
            db.getCrossRefs(verse.book, verse.chapter, verse.verse),
          ),
        );
        const totalRefs = allRefs.reduce((total, refs) => total + refs.length, 0);
        yield* Effect.logInfo(
          `perf.getCrossRefs.batch count=50 elapsedMs=${elapsed.toFixed(2)} refs=${totalRefs}`,
        );
        expect(elapsed).toBeLessThan(200);
      }),
    ));
});
