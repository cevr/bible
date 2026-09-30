import * as BunServices from '@effect/platform-bun/BunServices';
import { BibleDatabase } from '@bible/core/bible-db';
import * as BibleDbBun from '@bible/core/bible-db/bun';
import { describe, expect, it } from 'effect-bun-test';
import { Database, type SQLQueryBindings } from 'bun:sqlite';
import { Array, Effect, FileSystem, Layer, Option, Schema } from 'effect';
import * as Statement from 'effect/sql/Statement';

const DB_PATH = `${import.meta.dir}/../../../core/data/bible.db`;
const BibleServicesLayer = Layer.mergeAll(BibleDbBun.layerBun(DB_PATH), BunServices.layer);

/**
 * A budget guards the query plan (an index against a scan is orders of
 * magnitude), so the test reads the plan rather than a stopwatch: every
 * statement a call runs is captured as it is compiled and handed to SQLite's
 * `EXPLAIN QUERY PLAN`, and each step that reads a table must `SEARCH` it (by
 * an index or the rowid). A count of full scans does not move when the
 * machine is busy, where a wall-clock budget failed a fast query on a loaded
 * box.
 */
const planned = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const statements: Array<readonly [string, ReadonlyArray<unknown>]> = [];
    const record: Statement.Transformer = (self) =>
      Effect.sync(() => {
        statements.push(self.compile());
        return self;
      });
    const value = yield* Effect.provideService(effect, Statement.CurrentTransformer, record);
    const raw = yield* Effect.acquireRelease(
      Effect.sync(() => new Database(DB_PATH, { readonly: true })),
      (db) => Effect.sync(() => db.close()),
    );
    const steps = statements
      .filter(([text]) => /^\s*SELECT/i.test(text))
      .map(([text, params]) => ({
        text,
        details: raw
          .query<{ detail: string }, Array<SQLQueryBindings>>(`EXPLAIN QUERY PLAN ${text}`)
          .all(...bindings(params))
          .map((row) => row.detail),
      }));
    return { value, steps } as const;
  });

/** A statement's parameters as SQLite binds them: the queries here bind strings and numbers. */
const Bindings = Schema.Array(Schema.Union([Schema.String, Schema.Finite]));
const bindings = Schema.decodeUnknownSync(Bindings);

/** The plan steps that read a whole table rather than searching it. */
const scans = (steps: ReadonlyArray<{ readonly details: ReadonlyArray<string> }>) =>
  steps.flatMap((s) => s.details.filter((d) => d.startsWith('SCAN ')));

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

  test('getCrossRefs searches its index', () =>
    whenDatabaseExists(
      Effect.gen(function* () {
        const db = yield* BibleDatabase;
        const { value: refs, steps } = yield* planned(db.getCrossRefs(43, 3, 16));
        yield* Effect.logInfo(`perf.getCrossRefs statements=${steps.length} refs=${refs.length}`);
        expect(refs.length).toBeGreaterThan(0);
        expect(steps.length).toBe(1);
        expect(scans(steps)).toEqual([]);
      }),
    ));

  test('getStrongsEntry searches its key', () =>
    whenDatabaseExists(
      Effect.gen(function* () {
        const db = yield* BibleDatabase;
        const { value: entry, steps } = yield* planned(db.getStrongsEntry('H430'));
        yield* Effect.logInfo(`perf.getStrongsEntry statements=${steps.length}`);
        expect(Option.isSome(entry)).toBe(true);
        if (Option.isSome(entry)) {
          expect(entry.value.definition).toBeDefined();
        }
        expect(steps.length).toBe(1);
        expect(scans(steps)).toEqual([]);
      }),
    ));

  test('getVersesWithStrongs searches every table it joins (Hebrew)', () =>
    whenDatabaseExists(
      Effect.gen(function* () {
        const db = yield* BibleDatabase;
        const { value: results, steps } = yield* planned(db.getVersesWithStrongs('H430'));
        yield* Effect.logInfo(
          `perf.getVersesWithStrongs strongs=H430 statements=${steps.length} verses=${results.length}`,
        );
        expect(results.length).toBeGreaterThan(100);
        expect(scans(steps)).toEqual([]);
      }),
    ));

  test('getVersesWithStrongs searches every table it joins (Greek)', () =>
    whenDatabaseExists(
      Effect.gen(function* () {
        const db = yield* BibleDatabase;
        const { value: results, steps } = yield* planned(db.getVersesWithStrongs('G26'));
        yield* Effect.logInfo(
          `perf.getVersesWithStrongs strongs=G26 statements=${steps.length} verses=${results.length}`,
        );
        expect(results.length).toBeGreaterThan(10);
        expect(scans(steps)).toEqual([]);
      }),
    ));

  test('searchStrongs reads the lexicon once, joining nothing', () =>
    whenDatabaseExists(
      Effect.gen(function* () {
        const db = yield* BibleDatabase;
        const { value: results, steps } = yield* planned(db.searchStrongs('love'));
        yield* Effect.logInfo(
          `perf.searchStrongs statements=${steps.length} entries=${results.length}`,
        );
        expect(results.length).toBeGreaterThan(0);
        // A word search reads every lemma (a LIKE has no index to use): one
        // pass over the lexicon, one statement, and no other table.
        expect(steps.length).toBe(1);
        expect(steps.flatMap((s) => s.details)).toHaveLength(1);
        expect(scans(steps).every((d) => d.startsWith('SCAN strongs'))).toBe(true);
      }),
    ));

  test('getMarginNotes searches its index', () =>
    whenDatabaseExists(
      Effect.gen(function* () {
        const db = yield* BibleDatabase;
        const { value: notes, steps } = yield* planned(db.getMarginNotes(1, 1, 1));
        yield* Effect.logInfo(
          `perf.getMarginNotes statements=${steps.length} notes=${notes.length}`,
        );
        expect(notes.length).toBeGreaterThanOrEqual(0);
        expect(steps.length).toBe(1);
        expect(scans(steps)).toEqual([]);
      }),
    ));

  test('getVerseWords searches its index', () =>
    whenDatabaseExists(
      Effect.gen(function* () {
        const db = yield* BibleDatabase;
        const { value: words, steps } = yield* planned(db.getVerseWords(1, 1, 1));
        yield* Effect.logInfo(
          `perf.getVerseWords statements=${steps.length} words=${words.length}`,
        );
        expect(words.length).toBeGreaterThan(0);
        expect(steps.length).toBe(1);
        expect(scans(steps)).toEqual([]);
      }),
    ));

  test('batch getCrossRefs for 50 verses is 50 index searches', () =>
    whenDatabaseExists(
      Effect.gen(function* () {
        const db = yield* BibleDatabase;
        const verses = Array.range(0, 49).map((index) => ({
          book: 1,
          chapter: 1,
          verse: index + 1,
        }));
        const { value: allRefs, steps } = yield* planned(
          Effect.forEach(verses, (verse) =>
            db.getCrossRefs(verse.book, verse.chapter, verse.verse),
          ),
        );
        const totalRefs = allRefs.reduce((total, refs) => total + refs.length, 0);
        yield* Effect.logInfo(
          `perf.getCrossRefs.batch count=50 statements=${steps.length} refs=${totalRefs}`,
        );
        expect(steps.length).toBe(50);
        expect(scans(steps)).toEqual([]);
      }),
    ));
});
