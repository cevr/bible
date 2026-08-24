/** The Bun host's SQLite drivers for the File Corpus lifecycle.
 *
 *  `platform-node/bible-artifact.ts` defaults its semantic verifiers and its
 *  SQLite provenance store to `better-sqlite3` — what Electron loads. Under
 *  the Bun the CLI compiles against, that NAPI binding hard-crashes the
 *  process the moment a database is opened (`bible topics status` panicked
 *  inside `Error::New napi_get_last_error_info`), and Bun already ships a
 *  SQLite driver of its own.
 *
 *  This module is the same three capabilities over `bun:sqlite`, and nothing
 *  else. The *rules* stay single-definition in core — `verifyTopicsArtifact`
 *  is imported, not restated; the Bible checks assert the same counts with
 *  the same messages; the provenance rows go through the same
 *  `StoredProvenance` codec — so the gate a candidate must pass cannot drift
 *  between hosts. Only the statement execution differs, which is the exact
 *  seam `TopicsArtifactReader` and the layers' `verify` / `provenanceStore`
 *  inputs were built for (the browser's `wa-sqlite` adapter is the third
 *  driver on the same seam).
 */

import { Database } from 'bun:sqlite';
import { Effect, Option, Schema } from 'effect';

import {
  verifyTopicsArtifact,
  type TopicsArtifactReader,
} from '../corpus-supply/topics-verifier.js';
import {
  provenanceFrom,
  StoredProvenance,
  storedGeneration,
  type NativeFileArtifactProvenanceStore,
} from '../platform-node/bible-artifact.js';

class BunArtifactStoreError extends Schema.TaggedError<BunArtifactStoreError>()(
  'BunArtifactStoreError',
  { operation: Schema.String, cause: Schema.Unknown },
) {}

const storeError = (operation: string) => (cause: unknown) =>
  BunArtifactStoreError.make({ operation, cause });

const openDatabase = (filename: string, readonly: boolean) =>
  Effect.try({
    // `create: false` is bun:sqlite's `fileMustExist`: a candidate that is not
    // there is a verification failure, never an empty database sprung into
    // being by the check itself.
    try: () => new Database(filename, { readonly, create: false }),
    catch: storeError('open-database'),
  });

const closeDatabase = (database: Database) =>
  Effect.try({
    try: () => database.close(),
    catch: storeError('close-database'),
  });

const countRows = (database: Database, table: string, where = '') =>
  Effect.try({
    try: () => database.query(`SELECT COUNT(*) AS count FROM ${table} ${where}`).get(),
    catch: storeError('count-rows'),
  }).pipe(
    Effect.flatMap((raw) =>
      Schema.decodeUnknownEffect(Schema.Struct({ count: Schema.Finite }))(raw).pipe(
        Effect.mapError(storeError('count-rows')),
      ),
    ),
    Effect.map((row) => row.count),
  );

const integrityCheck = (database: Database) =>
  Effect.try({
    try: () => database.query('PRAGMA integrity_check').get(),
    catch: storeError('integrity-check'),
  }).pipe(
    Effect.flatMap((raw) =>
      Schema.decodeUnknownEffect(Schema.Struct({ integrity_check: Schema.String }))(raw).pipe(
        Effect.mapError(storeError('integrity-check')),
      ),
    ),
    Effect.map((row) => row.integrity_check),
  );

/** The §3.5 Bible gate, asserting exactly what the native verifier asserts. */
export const verifyBibleDatabase = (filename: string): Effect.Effect<number, unknown> =>
  Effect.acquireUseRelease(
    openDatabase(filename, true),
    (database) =>
      Effect.gen(function* () {
        const integrity = yield* integrityCheck(database);
        if (integrity !== 'ok') {
          return yield* Effect.fail(`SQLite integrity check failed: ${integrity}`);
        }
        const books = yield* countRows(database, 'books');
        if (books !== 66) {
          return yield* Effect.fail('Bible Artifact does not contain the 66-book Canon');
        }
        const verses = yield* countRows(database, 'verses', "WHERE version_code = 'KJV'");
        if (verses !== 31_102) {
          return yield* Effect.fail(`Bible Artifact contains ${String(verses)} KJV Verses`);
        }
        if ((yield* countRows(database, 'strongs')) === 0) {
          return yield* Effect.fail("Bible Artifact has no Strong's lexicon");
        }
        if ((yield* countRows(database, 'cross_refs', "WHERE source = 'openbible'")) === 0) {
          return yield* Effect.fail('Bible Artifact has no OpenBible Cross References');
        }
        if ((yield* countRows(database, 'cross_refs', "WHERE source = 'tske'")) === 0) {
          return yield* Effect.fail('Bible Artifact has no TSKe Cross References');
        }
        if ((yield* countRows(database, 'margin_notes')) === 0) {
          return yield* Effect.fail('Bible Artifact has no Margin Notes');
        }
        if ((yield* countRows(database, 'topics')) === 0) {
          return yield* Effect.fail('Bible Artifact has no Topics');
        }
        return verses;
      }),
    closeDatabase,
  );

/** The three reads `verifyTopicsArtifact` makes, over one open connection. */
export const bunTopicsReader = (database: Database): TopicsArtifactReader => ({
  integrity: integrityCheck(database),
  meta: (key) =>
    Effect.try({
      try: () => database.query('SELECT value FROM meta WHERE key = ?').get(key),
      catch: storeError('read-meta'),
    }).pipe(
      Effect.flatMap((raw) =>
        Option.match(Option.fromNullishOr(raw), {
          onNone: () => Effect.succeedNone,
          onSome: (row) =>
            Schema.decodeUnknownEffect(Schema.Struct({ value: Schema.String }))(row).pipe(
              Effect.map((decoded) => Option.some(decoded.value)),
              Effect.mapError(storeError('read-meta')),
            ),
        }),
      ),
    ),
  count: (table) => countRows(database, table),
});

/** The Topics gate: open, apply the shared rules, close. */
export const verifyTopicsDatabase = (filename: string): Effect.Effect<number, unknown> =>
  Effect.acquireUseRelease(
    openDatabase(filename, true),
    (database) => verifyTopicsArtifact(bunTopicsReader(database)),
    closeDatabase,
  );

/** The SQLite provenance store over `bun:sqlite`: the same `meta` rows through
 *  the same `StoredProvenance` codec the native store writes and reads. */
export const sqliteProvenanceStore: NativeFileArtifactProvenanceStore = {
  read: (filename) =>
    Effect.acquireUseRelease(
      openDatabase(filename, true),
      (database) =>
        Effect.gen(function* () {
          const row = Schema.Struct({ value: Schema.String });
          const value = (key: string) =>
            Effect.try({
              try: () => database.query('SELECT value FROM meta WHERE key = ?').get(key),
              catch: storeError('read-provenance'),
            }).pipe(
              Effect.flatMap((raw) =>
                Schema.decodeUnknownEffect(row)(raw).pipe(
                  Effect.mapError(storeError('read-provenance')),
                ),
              ),
              Effect.map((decoded) => decoded.value),
            );
          const optionalValue = (key: string) =>
            Effect.try({
              try: () => database.query('SELECT value FROM meta WHERE key = ?').get(key),
              catch: storeError('read-provenance'),
            }).pipe(
              Effect.map((raw) =>
                Option.fromNullishOr(raw).pipe(
                  Option.flatMap((found) =>
                    Schema.decodeUnknownOption(row)(found).pipe(
                      Option.map((decoded) => decoded.value),
                    ),
                  ),
                ),
              ),
            );
          const stored = yield* Schema.decodeEffect(StoredProvenance)({
            source: yield* value('corpus_source'),
            revision: yield* value('corpus_revision'),
            digest: yield* value('corpus_digest'),
            ...storedGeneration(yield* optionalValue('corpus_generation')),
          }).pipe(Effect.mapError(storeError('read-provenance')));
          return provenanceFrom(stored);
        }),
      closeDatabase,
    ),
  write: (filename, provenance) =>
    Effect.acquireUseRelease(
      openDatabase(filename, false),
      (database) =>
        Effect.try({
          try: () => {
            database.exec(
              'CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
            );
            const upsert = database.query(
              'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
            );
            database.transaction(() => {
              upsert.run('corpus_source', provenance.source);
              upsert.run('corpus_revision', provenance.revision);
              upsert.run('corpus_digest', Option.getOrThrow(provenance.digest));
              Option.match(provenance.generation, {
                onNone: () => {
                  database.query('DELETE FROM meta WHERE key = ?').run('corpus_generation');
                },
                onSome: (generation) => {
                  upsert.run('corpus_generation', String(generation));
                },
              });
            })();
          },
          catch: storeError('write-provenance'),
        }),
      closeDatabase,
    ),
};
