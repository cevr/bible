/** The semantic verifiers of the SQLite File Corpora, under Bun (§3.5).
 *
 *  What a candidate Bible or Topics database must hold before the lifecycle in
 *  `file-artifact.ts` will activate it. SQLite is opened through `bun:sqlite`;
 *  the Topics *rules* stay single-definition in core (`verifyTopicsArtifact` is
 *  imported, not restated), so only statement execution lives here.
 */

import type { Database } from 'bun:sqlite';

import {
  verifyTopicsArtifact,
  type TopicsArtifactReader,
} from '../corpus-supply/topics-verifier.js';
import { Effect, Option, Schema } from 'effect';

import {
  closeDatabase,
  countRows,
  integrityCheck,
  openDatabase,
  storeError,
} from './file-artifact.js';

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
const bunTopicsReader = (database: Database): TopicsArtifactReader => ({
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
