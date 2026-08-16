import { BunFileSystem } from '@effect/platform-bun';
import { Database } from 'bun:sqlite';
import { Effect, FileSystem, Option, Schema, type Scope } from 'effect';
import { describe, expect, it as itBase } from 'effect-bun-test';

import { TopicsArtifact } from '../corpus-supply/file-artifact.js';
import type { CorpusProvenance } from '../corpus-supply/model.js';
import { TOPICS_VERIFIER_CASES } from '../corpus-supply/topics-verifier-contract.js';
import {
  verifyTopicsArtifact,
  type TopicsArtifactReader,
} from '../corpus-supply/topics-verifier.js';
import {
  layerNativeTopicsArtifacts,
  type NativeFileArtifactProvenanceStore,
} from './bible-artifact.js';

/** A `bun:sqlite` `TopicsArtifactReader` — the *driver* half only.
 *
 *  The shipped native reader is written against `better-sqlite3`, which is what
 *  Electron loads, and whose NAPI binding hard-crashes the Bun canary this repo
 *  tests under (reproducible with a two-line script, and the reason the
 *  pre-existing `bible-artifact.test.ts` injects its `verify` instead of using
 *  the real one). That crash is a property of the driver, not of the verifier —
 *  so only the driver is substituted here. The rules under test are
 *  `verifyTopicsArtifact`, the same production function `verifyTopicsDatabase`
 *  runs and the browser adapter runs, applied to the same shared case matrix. */
class ReadError extends Schema.TaggedError<ReadError>()('ReadError', {
  message: Schema.String,
}) {}

const IntegrityRow = Schema.Struct({ integrity_check: Schema.String });
const CountRow = Schema.Struct({ count: Schema.Finite });
const ValueRow = Schema.Struct({ value: Schema.String });

const decodeIntegrity = Schema.decodeUnknownOption(IntegrityRow);
const decodeCount = Schema.decodeUnknownOption(CountRow);
const decodeValue = Schema.decodeUnknownOption(ValueRow);

const readFailure = (message: string): Effect.Effect<never, ReadError> =>
  ReadError.make({ message });

const bunTopicsReader = (database: Database): TopicsArtifactReader => ({
  integrity: Effect.suspend(() =>
    Option.match(decodeIntegrity(database.query('PRAGMA integrity_check').get()), {
      onNone: () => readFailure('integrity_check returned no row'),
      onSome: (row) => Effect.succeed(row.integrity_check),
    }),
  ).pipe(Effect.catchDefect((cause) => readFailure(String(cause)))),
  meta: (key) =>
    Effect.suspend(() =>
      Effect.succeed(
        Option.map(
          decodeValue(database.query('SELECT value FROM meta WHERE key = ?').get(key)),
          (row) => row.value,
        ),
      ),
    ).pipe(Effect.catchDefect((cause) => readFailure(String(cause)))),
  // A missing table makes the query itself throw; that is a read failure the
  // verifier turns into a refusal, not a defect.
  count: (table) =>
    Effect.suspend(() =>
      Option.match(decodeCount(database.query(`SELECT COUNT(*) AS count FROM ${table}`).get()), {
        onNone: () => readFailure(`Cannot count ${table}`),
        onSome: (row) => Effect.succeed(row.count),
      }),
    ).pipe(Effect.catchDefect((cause) => readFailure(String(cause)))),
});

/** `verifyTopicsDatabase`'s shape, with only the driver swapped: open the file,
 *  run the production verifier, close. */
const verifyTopicsFile = (filename: string): Effect.Effect<number, unknown> =>
  Effect.acquireUseRelease(
    Effect.sync(() => new Database(filename, { readonly: true })),
    (database) => verifyTopicsArtifact(bunTopicsReader(database)),
    (database) => Effect.sync(() => database.close()),
  );

/** Writes a topics artifact with the §2.2 tables at `file`. `schemaMajor` is a
 *  string because `meta.value` is a TEXT column: a corrupt version field is a
 *  string the artifact can really hold, and the verifier's strict parse only
 *  has a defect to catch if the fixture can write one. */
const writeArtifact = (
  file: string,
  input: { readonly schemaMajor: string; readonly topics: number; readonly aliases: number },
): void => {
  const database = new Database(file, { create: true });
  database.exec(`
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE topics (slug TEXT PRIMARY KEY, title TEXT NOT NULL, thesis_ast TEXT NOT NULL, body_ast TEXT NOT NULL, position INTEGER NOT NULL);
    CREATE TABLE topic_aliases (alias TEXT PRIMARY KEY, display TEXT NOT NULL, slug TEXT NOT NULL, canonical INTEGER NOT NULL);
    CREATE TABLE topic_edges (from_slug TEXT NOT NULL, to_slug TEXT NOT NULL, kind TEXT NOT NULL, position INTEGER NOT NULL, PRIMARY KEY (from_slug, to_slug, kind));
    CREATE TABLE topic_catalog_keys (slug TEXT PRIMARY KEY, catalog_id TEXT NOT NULL, matched_by TEXT NOT NULL);
  `);
  database
    .prepare('INSERT INTO meta (key, value) VALUES (?, ?)')
    .run('schema_major', input.schemaMajor);
  const insertTopic = database.prepare(
    'INSERT INTO topics (slug, title, thesis_ast, body_ast, position) VALUES (?, ?, ?, ?, ?)',
  );
  for (let index = 0; index < input.topics; index += 1) {
    insertTopic.run(`slug-${String(index)}`, `Title ${String(index)}`, '[]', '[]', index);
  }
  const insertAlias = database.prepare(
    'INSERT INTO topic_aliases (alias, display, slug, canonical) VALUES (?, ?, ?, ?)',
  );
  for (let index = 0; index < input.aliases; index += 1) {
    insertAlias.run(`alias-${String(index)}`, `Alias ${String(index)}`, 'slug-0', 1);
  }
  database.close();
};

const makeProvenanceStore = (): NativeFileArtifactProvenanceStore => {
  let current = Option.none<CorpusProvenance>();
  return {
    read: () => {
      if (Option.isNone(current)) return Effect.fail('provenance is unavailable');
      return Effect.succeed(current.value);
    },
    write: (_filename, provenance) =>
      Effect.sync(() => {
        current = Option.some(provenance);
      }),
  };
};

/** A fresh directory per test, removed when the test's scope closes. Fixed
 *  paths under `/tmp` would survive a run and collide with the next one. */
const scratch = (): Effect.Effect<string, never, FileSystem.FileSystem | Scope.Scope> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return yield* fs.makeTempDirectoryScoped({ prefix: 'bible-topics-native-' }).pipe(Effect.orDie);
  });

describe('native Topics artifact', () => {
  const it = itBase.scopedLive.layer(BunFileSystem.layer);

  it('atomically swaps a verified artifact into the destination', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* scratch();
      const incoming = `${dir}/incoming.db`;
      const destination = `${dir}/topics.db`;
      writeArtifact(incoming, { schemaMajor: '1', topics: 3, aliases: 5 });

      const receipt = yield* Effect.gen(function* () {
        const recipe = yield* TopicsArtifact.Recipe;
        const installer = yield* TopicsArtifact.Installer;
        const source = Option.fromNullishOr(recipe.sources[0]);
        if (Option.isNone(source)) return yield* Effect.fail('no source');
        return yield* source.value.acquire.pipe(Effect.flatMap(installer.install));
      }).pipe(
        Effect.provide(
          layerNativeTopicsArtifacts({
            destination,
            sources: [{ kind: 'workspace', path: incoming, label: 'workspace' }],
            provenanceStore: makeProvenanceStore(),
            verify: verifyTopicsFile,
          }),
        ),
      );

      expect(receipt.installed).toBe(3);
      expect(yield* fs.exists(destination)).toBe(true);
      // The staging file is gone: the swap is a rename, not a copy left behind.
      expect(yield* fs.exists(`${destination}.building`)).toBe(false);
    }));

  it('leaves the active artifact in place when the candidate fails verification', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* scratch();
      const destination = `${dir}/topics.db`;
      // An artifact already active, and a candidate from an unreadable future.
      writeArtifact(destination, { schemaMajor: '1', topics: 2, aliases: 2 });
      const before = yield* fs.readFile(destination);
      const bad = `${dir}/bad.db`;
      writeArtifact(bad, { schemaMajor: '99', topics: 1, aliases: 1 });

      const exit = yield* Effect.gen(function* () {
        const recipe = yield* TopicsArtifact.Recipe;
        const installer = yield* TopicsArtifact.Installer;
        const source = Option.fromNullishOr(recipe.sources[0]);
        if (Option.isNone(source)) return yield* Effect.fail('no source');
        return yield* source.value.acquire.pipe(Effect.flatMap(installer.install));
      }).pipe(
        Effect.provide(
          layerNativeTopicsArtifacts({
            destination,
            sources: [{ kind: 'workspace', path: bad, label: 'workspace' }],
            provenanceStore: makeProvenanceStore(),
            verify: verifyTopicsFile,
          }),
        ),
        Effect.exit,
      );

      expect(exit._tag).toBe('Failure');
      expect(yield* fs.readFile(destination)).toEqual(before);
      expect(yield* fs.exists(`${destination}.building`)).toBe(false);
    }));
});

/** The shared contract matrix, run against the production verifier through a
 *  real on-disk artifact. `apps/web`'s suite runs the identical matrix through
 *  its own reader, so the two gates cannot drift: a case is either satisfied on
 *  both sides or it fails on one. */
describe('Topics semantic verifier — native adapter', () => {
  const it = itBase.scopedLive.layer(BunFileSystem.layer);

  for (const testCase of TOPICS_VERIFIER_CASES) {
    it(testCase.name, () =>
      Effect.gen(function* () {
        const file = `${yield* scratch()}/topics.db`;
        writeArtifact(file, testCase.fixture);
        if (testCase.outcome.kind === 'accepted') {
          expect(yield* verifyTopicsFile(file)).toBe(testCase.outcome.installed);
          return;
        }
        expect(yield* Effect.flip(verifyTopicsFile(file))).toBe(testCase.outcome.message);
      }),
    );
  }

  /** Not in the shared matrix: a browser generation is an OPFS file the store
   *  reserved, so "the tables were never created" is a state only the native
   *  adapter can be handed. The rule it proves is shared — a read that fails is
   *  a refusal, not a defect — but the fixture is not portable. */
  it('rejects a file missing the artifact tables', () =>
    Effect.gen(function* () {
      const file = `${yield* scratch()}/topics.db`;
      const database = new Database(file, { create: true });
      database.exec('CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
      database.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run('schema_major', '1');
      database.close();
      const exit = yield* Effect.exit(verifyTopicsFile(file));
      expect(exit._tag).toBe('Failure');
    }));
});
