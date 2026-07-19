import {
  type CanonicalGeneration,
  type CanonicalGenerationAdapter,
  ClientId,
  CopyOnMigrateError,
  type LegacyMigrationReceipt,
  type SyncStore,
} from '@bible/core/local-first';
import { Effect, Schema } from 'effect';
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
  readonly jAccess: (name: string, flags: number, output: DataView) => Promise<number>;
  readonly jDelete: (name: string, syncDirectory: number) => Promise<number>;
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
  readonly discardTarget: () => Promise<void>;
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
  if (!GENERATED_NAME.test(generation)) {
    throw failure('generation-name', 'refused a non-canonical generated database name');
  }
  return `${generation}.db`;
};

export const vfsFileExists = (vfs: BrowserSqliteVfs, filename: string): Promise<boolean> => {
  const bytes = new ArrayBuffer(4);
  const output = new DataView(bytes);
  return vfs.jAccess(filename, 0, output).then((result) => {
    if (result !== SQLite.SQLITE_OK) {
      throw failure('vfs-access', `could not inspect ${filename}`);
    }
    return output.getInt32(0, true) === 1;
  });
};

export const deleteKnownGeneratedFile = (
  vfs: BrowserSqliteVfs,
  generation: string,
): Promise<void> => {
  const filename = generationDatabaseName(generation);
  const knownFiles = [filename, `${filename}-journal`, `${filename}-wal`, `${filename}-shm`];
  return knownFiles.reduce(
    (pending, knownFile) =>
      pending.then(() =>
        vfsFileExists(vfs, knownFile).then((exists) => {
          if (!exists) return;
          return vfs.jDelete(knownFile, 1).then((result) => {
            if (result !== SQLite.SQLITE_OK) {
              throw failure('vfs-delete', `could not delete inactive generation file ${knownFile}`);
            }
          });
        }),
      ),
    Promise.resolve(),
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

const countRows = (database: SqliteDatabase, table: keyof typeof countQueries): Promise<number> =>
  database.values(countQueries[table]).then((rows) => {
    const value = rows[0]?.[0];
    if (typeof value === 'number') return value;
    throw failure('verify-count', `canonical ${table} count did not decode`);
  });

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
  activeGeneration: Effect.tryPromise({
    try: operations.marker.read,
    catch: (cause) => failure('read-activation', 'could not read active generation', cause),
  }),
  discardInactive: (activeGeneration) => {
    if (activeGeneration === operations.targetGeneration) return Effect.void;
    return Effect.tryPromise({
      try: operations.discardTarget,
      catch: (cause) => failure('discard-inactive', 'could not discard inactive generation', cause),
    }).pipe(
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
    Effect.tryPromise({
      try: () => operations.marker.write(generation),
      catch: (cause) => failure('activate', `could not activate generation ${generation}`, cause),
    }).pipe(
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
  ): Effect.Effect<CanonicalGeneration, CopyOnMigrateError> =>
    Effect.tryPromise({
      try: () => {
        const filename = generationDatabaseName(generation);
        const database = makeSqliteDatabase(options.sqlite3, filename, options.vfsName);
        let flags = SQLite.SQLITE_OPEN_READWRITE;
        if (create) flags |= SQLite.SQLITE_OPEN_CREATE;
        return database
          .open(flags)
          .then(() => {
            const userDatabase = makeBrowserUserDatabase({ database });
            const migrate = create
              ? Effect.runPromise(userDatabase.migrate(options.migrationSql))
              : Promise.resolve();
            return migrate.then(() => {
              const store = makeBrowserSyncStore(userDatabase, localClientId);
              databaseByStore.set(store, database);
              return {
                store,
                close: Effect.tryPromise({
                  try: () => database.close(),
                  catch: (cause) =>
                    failure('close', `could not close generation ${generation}`, cause),
                }),
              };
            });
          })
          .catch((cause: unknown) => database.close().then(() => Promise.reject(cause)));
      },
      catch: (cause) => failure('open', `could not open generation ${generation}`, cause),
    });

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
        Effect.tryPromise({
          try: () => countRows(database, table),
          catch: (cause) => failure('verify-count', `could not count canonical ${table}`, cause),
        }).pipe(
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
