import {
  type CanonicalGeneration,
  type CanonicalGenerationAdapter,
  ClientId,
  CopyOnMigrateError,
  type LegacyMigrationReceipt,
  type SyncStore,
} from '@bible/core/local-first';
import { Effect, Option, Schema } from 'effect';
import * as SQLite from 'wa-sqlite';

import type { GenerationMarkerStore } from './generation-marker.js';
import {
  makeSqliteDatabase,
  type SqliteDatabase,
  type WorkerSqliteApi,
} from './sqlite-database.js';
import { makeBrowserSyncStore, makeBrowserUserDatabase } from './user-state-database.js';

const GENERATED_NAME = /^user-state-v1-[a-f0-9]{12}$/u;

export interface BrowserSqliteVfs {
  readonly jAccess: (name: string, flags: number, output: DataView) => number | Promise<number>;
  readonly jDelete: (name: string, syncDirectory: number) => number | Promise<number>;
}

export interface WebCanonicalGenerationOptions {
  readonly sqlite3: WorkerSqliteApi;
  readonly vfsName: string;
  readonly vfs: BrowserSqliteVfs;
  readonly marker: GenerationMarkerStore;
  readonly migrationSql: string;
  readonly targetGeneration: string;
  readonly log: (line: string) => void;
}

export interface CanonicalGenerationOperations {
  readonly marker: GenerationMarkerStore;
  readonly targetGeneration: string;
  readonly discardTarget: () => Effect.Effect<void, CopyOnMigrateError>;
  readonly create: (generation: string) => Effect.Effect<CanonicalGeneration, CopyOnMigrateError>;
  readonly open: (generation: string) => Effect.Effect<CanonicalGeneration, CopyOnMigrateError>;
  readonly verify: (
    generation: CanonicalGeneration,
    receipts: ReadonlyArray<LegacyMigrationReceipt>,
  ) => Effect.Effect<void, CopyOnMigrateError>;
  readonly log: (line: string) => void;
}

const failure = (operation: string, message: string, cause?: unknown): CopyOnMigrateError =>
  new CopyOnMigrateError({ operation, message, cause });

export const generationDatabaseName = (generation: string): string => {
  const canonical = Option.liftPredicate(generation, (name) => GENERATED_NAME.test(name));
  return `${Option.getOrThrowWith(canonical, () => failure('generation-name', 'refused a non-canonical generated database name'))}.db`;
};

export const vfsFileExists = (
  vfs: BrowserSqliteVfs,
  filename: string,
): Effect.Effect<boolean, CopyOnMigrateError> =>
  Effect.gen(function* () {
    const output = new DataView(new ArrayBuffer(4));
    const pending = yield* Effect.try({
      try: () => vfs.jAccess(filename, 0, output),
      catch: (cause) => failure('vfs-access', `could not inspect ${filename}`, cause),
    });
    let result: number;
    if (typeof pending === 'number') result = pending;
    else {
      result = yield* Effect.tryPromise({
        try: () => pending,
        catch: (cause) => failure('vfs-access', `could not inspect ${filename}`, cause),
      });
    }
    if (result !== SQLite.SQLITE_OK) {
      return yield* Effect.fail(failure('vfs-access', `could not inspect ${filename}`));
    }
    return output.getInt32(0, true) === 1;
  });

export const deleteKnownGeneratedFile = (
  vfs: BrowserSqliteVfs,
  generation: string,
): Effect.Effect<void, CopyOnMigrateError> => {
  const filename = generationDatabaseName(generation);
  const knownFiles = [filename, `${filename}-journal`, `${filename}-wal`, `${filename}-shm`];
  return Effect.forEach(
    knownFiles,
    (knownFile) =>
      vfsFileExists(vfs, knownFile).pipe(
        Effect.flatMap((exists) => {
          if (!exists) return Effect.void;
          const pending = Effect.try({
            try: () => vfs.jDelete(knownFile, 1),
            catch: (cause) =>
              failure(
                'vfs-delete',
                `could not delete inactive generation file ${knownFile}`,
                cause,
              ),
          });
          return pending.pipe(
            Effect.flatMap((result) => {
              if (typeof result === 'number') return Effect.succeed(result);
              return Effect.tryPromise({
                try: () => result,
                catch: (cause) =>
                  failure(
                    'vfs-delete',
                    `could not delete inactive generation file ${knownFile}`,
                    cause,
                  ),
              });
            }),
            Effect.filterOrFail(
              (result) => result === SQLite.SQLITE_OK,
              () => failure('vfs-delete', `could not delete inactive generation file ${knownFile}`),
            ),
            Effect.asVoid,
          );
        }),
      ),
    { concurrency: 1, discard: true },
  );
};

const countQueries = {
  reading_positions: 'SELECT COUNT(*) FROM reading_positions WHERE deleted_at IS NULL',
  reading_history: 'SELECT COUNT(*) FROM reading_history WHERE deleted_at IS NULL',
  preferences: 'SELECT COUNT(*) FROM preferences WHERE deleted_at IS NULL',
  bookmarks: 'SELECT COUNT(*) FROM bookmarks WHERE deleted_at IS NULL',
  notes: 'SELECT COUNT(*) FROM notes WHERE deleted_at IS NULL',
  markers: 'SELECT COUNT(*) FROM markers WHERE deleted_at IS NULL',
  user_cross_references: 'SELECT COUNT(*) FROM user_cross_references WHERE deleted_at IS NULL',
  collections: 'SELECT COUNT(*) FROM collections WHERE deleted_at IS NULL',
  collection_members: 'SELECT COUNT(*) FROM collection_members WHERE deleted_at IS NULL',
  reading_plans: 'SELECT COUNT(*) FROM reading_plans WHERE deleted_at IS NULL',
  reading_plan_progress: 'SELECT COUNT(*) FROM reading_plan_progress WHERE deleted_at IS NULL',
  memory_verses: 'SELECT COUNT(*) FROM memory_verses WHERE deleted_at IS NULL',
  practice_history: 'SELECT COUNT(*) FROM practice_history WHERE deleted_at IS NULL',
} as const;
const countTables: ReadonlyArray<keyof typeof countQueries> = [
  'reading_positions',
  'reading_history',
  'preferences',
  'bookmarks',
  'notes',
  'markers',
  'user_cross_references',
  'collections',
  'collection_members',
  'reading_plans',
  'reading_plan_progress',
  'memory_verses',
  'practice_history',
];

const countRows = (
  database: SqliteDatabase,
  table: keyof typeof countQueries,
): Effect.Effect<number, CopyOnMigrateError> =>
  database.values(countQueries[table]).pipe(
    Effect.mapError((cause) =>
      failure('verify-count', `could not count canonical ${table}`, cause),
    ),
    Effect.flatMap((rows) => {
      const value = rows[0]?.[0];
      if (typeof value === 'number') return Effect.succeed(value);
      return Effect.fail(failure('verify-count', `canonical ${table} count did not decode`));
    }),
  );

const expectedCounts = (
  receipts: ReadonlyArray<LegacyMigrationReceipt>,
): ReadonlyMap<string, number> => {
  const counts = new Map<string, number>();
  for (const receipt of receipts) {
    for (const entry of receipt.semanticCounts) {
      counts.set(entry.entity, (counts.get(entry.entity) ?? 0) + entry.count);
    }
  }
  return counts;
};

const verifyPublicDecodes = (store: SyncStore): Effect.Effect<void, CopyOnMigrateError> =>
  Effect.all([
    store.readingPreferences,
    store.collections,
    store.readingPlans,
    store.memoryPractice,
    store.latestReading,
  ]).pipe(
    Effect.asVoid,
    Effect.mapError((cause) =>
      failure('verify-public-decodes', 'canonical public reads failed', cause),
    ),
  );

export const makeCanonicalGenerationAdapter = (
  operations: CanonicalGenerationOperations,
): CanonicalGenerationAdapter => ({
  activeGeneration: operations.marker
    .read()
    .pipe(
      Effect.mapError((cause) =>
        failure('read-activation', 'could not read active generation', cause),
      ),
    ),
  discardInactive: (activeGeneration) => {
    if (activeGeneration === operations.targetGeneration) return Effect.void;
    return operations.discardTarget().pipe(
      Effect.mapError((cause) =>
        failure('discard-inactive', 'could not discard inactive generation', cause),
      ),
      Effect.tap(() =>
        Effect.sync(() =>
          operations.log(
            `[migration] inactive-discarded generation=${operations.targetGeneration}`,
          ),
        ),
      ),
    );
  },
  create: operations.create,
  open: operations.open,
  verify: operations.verify,
  activate: (generation) =>
    operations.marker.write(generation).pipe(
      Effect.mapError((cause) =>
        failure('activate', `could not activate generation ${generation}`, cause),
      ),
      Effect.tap(() =>
        Effect.sync(() => operations.log(`[migration] activated generation=${generation}`)),
      ),
    ),
});

export const makeWebCanonicalGenerationAdapter = (
  options: WebCanonicalGenerationOptions,
): CanonicalGenerationAdapter => {
  const databaseByStore = new WeakMap<object, SqliteDatabase>();
  const localClientId = Schema.decodeSync(ClientId)('web-local');
  const open = (
    generation: string,
    create: boolean,
  ): Effect.Effect<CanonicalGeneration, CopyOnMigrateError> => {
    const filename = generationDatabaseName(generation);
    const database = makeSqliteDatabase(options.sqlite3, filename, options.vfsName);
    return Effect.gen(function* () {
      let flags = SQLite.SQLITE_OPEN_READWRITE;
      if (create) flags |= SQLite.SQLITE_OPEN_CREATE;
      yield* database.open(flags);
      const userDatabase = makeBrowserUserDatabase({ database });
      if (create) yield* userDatabase.migrate(options.migrationSql);
      const store = makeBrowserSyncStore(userDatabase, localClientId);
      databaseByStore.set(store, database);
      return {
        store,
        close: database
          .close()
          .pipe(
            Effect.mapError((cause) =>
              failure('close', `could not close generation ${generation}`, cause),
            ),
          ),
      };
    }).pipe(
      Effect.onError(() => database.close().pipe(Effect.ignore)),
      Effect.mapError((cause) => failure('open', `could not open generation ${generation}`, cause)),
    );
  };

  return makeCanonicalGenerationAdapter({
    marker: options.marker,
    targetGeneration: options.targetGeneration,
    discardTarget: () => deleteKnownGeneratedFile(options.vfs, options.targetGeneration),
    log: options.log,
    create: (generation) => open(generation, true),
    open: (generation) => open(generation, false),
    verify: (generation, receipts) => {
      const database = databaseByStore.get(generation.store);
      if (database === undefined) {
        return Effect.fail(
          failure('verify', 'canonical generation database handle is unavailable'),
        );
      }
      const wanted = expectedCounts(receipts);
      return Effect.forEach(countTables, (table) =>
        countRows(database, table).pipe(
          Effect.flatMap((actual) => {
            const expected = wanted.get(table) ?? 0;
            if (actual === expected) return Effect.void;
            return Effect.fail(
              failure(
                'verify-semantic-counts',
                `canonical ${table} count mismatch expected=${String(expected)} actual=${String(actual)}`,
              ),
            );
          }),
        ),
      ).pipe(Effect.andThen(verifyPublicDecodes(generation.store)), Effect.asVoid);
    },
  });
};
