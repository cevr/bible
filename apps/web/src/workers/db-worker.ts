/** Effect-native orchestration for the browser database worker. */
import { CorpusSupply } from '@bible/core/corpus-supply';
import { LibraryEntityId } from '@bible/core/library-state';
import { ClientId, makeSimulatedTransport, MutationId, Timestamp } from '@bible/core/local-first';
import { CommitId, RuntimeGeneration } from '@bible/core/procedure';
import { Effect, Layer, Schema } from 'effect';
import * as SQLite from 'wa-sqlite';
import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite-async.mjs';
import { IDBBatchAtomicVFS } from 'wa-sqlite/src/examples/IDBBatchAtomicVFS.js';
import { OPFSAdaptiveVFS } from 'wa-sqlite/src/examples/OPFSAdaptiveVFS.js';

import userStateMigrationSql from '../../../../packages/core/src/local-first/migrations/0001_user_state.sql?raw';

import { layerBrowserBibleArtifacts } from './bible-database.js';
import { makeBibleGenerationStore } from './bible-generation-store.js';
import {
  makeDatabaseFileDownloader,
  makeIndexedDbDatabaseFileDownloader,
  type DatabaseFileDownloader,
  type IndexedDbImportVfs,
} from './database-file-downloader.js';
import {
  makeIndexedDbGenerationMarkerStore,
  makeIndexedDbGenerationRegistryStore,
} from './generation-marker.js';
import { initializeWritingsDatabase } from './initialize-writings-database.js';
import { layerProcedureServer, type ProcedureServerInput } from './procedure-server.js';
import { makeSqliteDatabase, makeSqliteDatabaseFamily } from './sqlite-database.js';
import type { BrowserSqliteVfs } from './user-state-generation.js';
import { migrateWebUserState } from './web-state-migration.js';

const OPFS_VFS_NAME = 'opfs-adaptive';
const IDB_VFS_NAME = 'idb-batch-atomic';

interface DatabaseWorkerHost {
  readonly fetch: ProcedureServerInput['writingsFetch'];
  readonly randomUuid: () => string;
  readonly nowIso: () => string;
  readonly supportsUnsafeAccessHandles: boolean;
  readonly log: (line: string) => void;
  readonly warn: (line: string) => void;
}

interface InitializedSqlite {
  readonly sqlite3: ReturnType<typeof SQLite.Factory>;
  readonly vfsName: string;
  readonly vfs: BrowserSqliteVfs;
  readonly downloader: DatabaseFileDownloader;
}

export interface DatabaseWorkerRuntime {
  readonly initialize: Effect.Effect<Omit<ProcedureServerInput, 'port'>, unknown>;
  readonly launch: (
    server: Omit<ProcedureServerInput, 'port'>,
    port: ProcedureServerInput['port'],
  ) => Effect.Effect<never, unknown>;
}

const hostPromise = <A>(evaluate: () => Promise<A>): Effect.Effect<A, unknown> =>
  Effect.tryPromise({ try: evaluate, catch: (cause) => cause });

const vfsOperation = (evaluate: () => number | Promise<number>): Effect.Effect<number, unknown> =>
  Effect.try({ try: evaluate, catch: (cause) => cause }).pipe(
    Effect.flatMap((result) => {
      if (typeof result === 'number') return Effect.succeed(result);
      return hostPromise(() => result);
    }),
  );

const discardBibleGeneration = (
  vfs: BrowserSqliteVfs,
  filename: string,
): Effect.Effect<void, unknown> =>
  Effect.forEach(
    [filename, `${filename}-journal`, `${filename}-wal`, `${filename}-shm`],
    (candidate) =>
      Effect.gen(function* () {
        const exists = new DataView(new ArrayBuffer(4));
        const access = yield* vfsOperation(() => vfs.jAccess(candidate, 0, exists));
        if (access !== SQLite.SQLITE_OK)
          return yield* Effect.fail(`Could not inspect ${candidate}`);
        if (exists.getInt32(0, true) !== 1) return;
        const deleted = yield* vfsOperation(() => vfs.jDelete(candidate, 1));
        if (deleted !== SQLite.SQLITE_OK)
          return yield* Effect.fail(`Could not delete ${candidate}`);
      }),
    { concurrency: 'unbounded', discard: true },
  );

const normalizeCategory = (value: string): string => {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (normalized.length > 0) return normalized;
  return 'unknown';
};

const failureCategory = (cause: unknown): string => {
  if (typeof cause !== 'object' || cause === null) return 'unknown';
  if ('_tag' in cause && typeof cause._tag === 'string') return normalizeCategory(cause._tag);
  if ('code' in cause && typeof cause.code === 'string') return normalizeCategory(cause.code);
  if ('name' in cause && typeof cause.name === 'string') return normalizeCategory(cause.name);
  return 'unknown';
};

const initializeSqlite = (host: DatabaseWorkerHost): Effect.Effect<InitializedSqlite, unknown> =>
  Effect.gen(function* () {
    const module = yield* hostPromise(SQLiteESMFactory);
    const sqlite3 = SQLite.Factory(module);
    const opfs = yield* Effect.gen(function* () {
      if (!host.supportsUnsafeAccessHandles) {
        return yield* Effect.fail('readwrite-unsafe OPFS access handles are unavailable');
      }
      const vfs = yield* hostPromise(() => OPFSAdaptiveVFS.create(OPFS_VFS_NAME, module));
      return yield* Effect.acquireUseRelease(
        Effect.succeed(vfs),
        (registered) =>
          Effect.gen(function* () {
            sqlite3.vfs_register(registered as unknown as SQLiteVFS, false);
            const probe = makeSqliteDatabase(sqlite3, 'capability-probe.db', OPFS_VFS_NAME);
            yield* Effect.acquireUseRelease(
              probe.open(SQLite.SQLITE_OPEN_READWRITE | SQLite.SQLITE_OPEN_CREATE),
              () => probe.exec('PRAGMA user_version'),
              () => probe.close().pipe(Effect.ignore),
            );
            return registered;
          }),
        (registered, exit) => {
          if (exit._tag === 'Success') return Effect.void;
          return hostPromise(() => registered.close()).pipe(Effect.ignore);
        },
      );
    }).pipe(Effect.option);
    if (opfs._tag === 'Some') {
      host.log('[web.runtime] sqlite-vfs-ready kind=opfs');
      return {
        sqlite3,
        vfsName: OPFS_VFS_NAME,
        vfs: opfs.value,
        downloader: makeDatabaseFileDownloader(),
      };
    }
    host.log('[web.runtime] sqlite-vfs-fallback from=opfs to=indexeddb category=unavailable');
    const idb = yield* hostPromise(() => IDBBatchAtomicVFS.create(IDB_VFS_NAME, module));
    sqlite3.vfs_register(idb as unknown as SQLiteVFS, false);
    host.log('[web.runtime] sqlite-vfs-ready kind=indexeddb');
    return {
      sqlite3,
      vfsName: IDB_VFS_NAME,
      vfs: idb,
      downloader: makeIndexedDbDatabaseFileDownloader(idb as unknown as IndexedDbImportVfs),
    };
  });

const initializeDatabases = (
  host: DatabaseWorkerHost,
): Effect.Effect<Omit<ProcedureServerInput, 'port'>, unknown> =>
  Effect.gen(function* () {
    host.log('[web.runtime] sqlite-loading state=started');
    const { sqlite3, vfsName, vfs, downloader } = yield* initializeSqlite(host);
    const writingsSqlite = makeSqliteDatabase(sqlite3, 'egw-paragraphs.db', vfsName);
    const bibleDatabases = makeSqliteDatabaseFamily(sqlite3, vfsName);
    const bibleArtifacts = layerBrowserBibleArtifacts({
      generations: makeBibleGenerationStore({
        databases: bibleDatabases,
        registry: makeIndexedDbGenerationRegistryStore({
          databaseName: 'bible-corpus-metadata',
          key: 'active-bible-generation',
        }),
        discard: (filename) => discardBibleGeneration(vfs, filename),
      }),
      downloader,
      onProgress: (progress) =>
        host.log(`[web.bible] install-progress progress=${String(progress)}`),
    });
    const corpusSupply = CorpusSupply.layer.pipe(Layer.provide(bibleArtifacts));
    yield* Effect.gen(function* () {
      yield* (yield* CorpusSupply).ensure();
    }).pipe(Effect.provide(corpusSupply));
    yield* initializeWritingsDatabase(writingsSqlite).pipe(
      Effect.catch((cause) =>
        Effect.sync(() =>
          host.warn(`[web.writings] unavailable category=${failureCategory(cause)}`),
        ),
      ),
    );
    const userState = yield* migrateWebUserState({
      sqlite3,
      vfsName,
      vfs,
      marker: makeIndexedDbGenerationMarkerStore(),
      writingsDatabase: writingsSqlite,
      migrationSql: userStateMigrationSql,
      log: host.log,
    });
    const localClientId = Schema.decodeSync(ClientId)('web-local');
    host.log('[web.runtime] persistence-ready state=ready');
    return {
      bibleDatabase: bibleDatabases.active,
      writingsDatabase: writingsSqlite,
      writingsFetch: host.fetch,
      runtime: {
        clientId: localClientId,
        store: userState.store,
        transport: makeSimulatedTransport(),
        generation: Schema.decodeSync(RuntimeGeneration)(host.randomUuid()),
        capabilities: ['external-links'],
        nextMutationId: () => Schema.decodeSync(MutationId)(host.randomUuid()),
        nextHistoryId: () => Schema.decodeSync(LibraryEntityId)(host.randomUuid()),
        nextCommitId: () => Schema.decodeSync(CommitId)(host.randomUuid()),
        now: () => Schema.decodeSync(Timestamp)(host.nowIso()),
      },
    };
  });

export const makeDatabaseWorkerRuntime = (
  host: DatabaseWorkerHost,
): Effect.Effect<DatabaseWorkerRuntime> =>
  Effect.cached(initializeDatabases(host)).pipe(
    Effect.map((initialize) => ({
      initialize,
      launch: (server, port) => Layer.launch(layerProcedureServer({ ...server, port })),
    })),
  );
