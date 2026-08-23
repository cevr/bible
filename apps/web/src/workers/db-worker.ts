/** Effect-native orchestration for the browser database worker. */
import { CorpusSupply, corpusStorageIdentity, Target } from '@bible/core/corpus-supply';
import { LibraryEntityId } from '@bible/core/library-state';
import { failureCategory } from '@bible/core/observability';
import { ClientId, makeSimulatedTransport, MutationId, Timestamp } from '@bible/core/local-first';
import { CommitId, RuntimeGeneration } from '@bible/core/procedure';
import { Effect, Layer, Option, Schema } from 'effect';
import * as SQLite from 'wa-sqlite';
import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite-async.mjs';
import { IDBBatchAtomicVFS } from 'wa-sqlite/src/examples/IDBBatchAtomicVFS.js';
import { OPFSAdaptiveVFS } from 'wa-sqlite/src/examples/OPFSAdaptiveVFS.js';

import userStateMigrationSql from '../../../../packages/core/src/local-first/migrations/0001_user_state.sql?raw';

import {
  makeBlobGenerationStore,
  makeOpfsBlobFileStore,
  type BlobFileStore,
} from './blob-generation-store.js';
import {
  layerBrowserBibleArtifacts,
  layerBrowserTopicsArtifacts,
} from './corpus-artifact-database.js';
import { makeCorpusGenerationStore } from './corpus-generation-store.js';
import { layerBrowserVectorsArtifacts } from './vectors-artifact-browser.js';
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

class DatabaseWorkerHostError extends Schema.TaggedError<DatabaseWorkerHostError>()(
  'DatabaseWorkerHostError',
  { cause: Schema.Unknown },
) {}

const hostPromise = <A>(evaluate: () => Promise<A>): Effect.Effect<A, DatabaseWorkerHostError> =>
  Effect.tryPromise({ try: evaluate, catch: (cause) => DatabaseWorkerHostError.make({ cause }) });

const vfsOperation = (
  evaluate: () => number | Promise<number>,
): Effect.Effect<number, DatabaseWorkerHostError> =>
  // The VFS call may complete synchronously or return a Promise; Promise.resolve flattens both.
  // oxlint-disable-next-line effect/noNewPromise -- wa-sqlite VFS calls return number | Promise<number>; Promise.resolve flattens both
  hostPromise(() => Promise.resolve(evaluate()));

const discardCorpusGeneration = (
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
              () => probe.close.pipe(Effect.ignore),
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
    const bibleStorage = corpusStorageIdentity('bible');
    const bibleArtifacts = layerBrowserBibleArtifacts({
      generations: makeCorpusGenerationStore({
        identity: bibleStorage,
        databases: bibleDatabases,
        registry: makeIndexedDbGenerationRegistryStore({
          databaseName: bibleStorage.metadataDatabaseName,
          key: bibleStorage.activeGenerationKey,
        }),
        discard: (filename) => discardCorpusGeneration(vfs, filename),
      }),
      downloader,
      onProgress: (progress) =>
        host.log(`[web.bible] install-progress progress=${String(progress)}`),
    });
    // A second generation store, keyed entirely off the topics storage
    // identity: its own OPFS filename prefix, its own IndexedDB registry, its
    // own active-generation key. Nothing is shared with Bible's store, so a
    // failed topics candidate can never retire a Bible generation.
    const topicsDatabases = makeSqliteDatabaseFamily(sqlite3, vfsName);
    const topicsStorage = corpusStorageIdentity('topics');
    const topicsArtifacts = layerBrowserTopicsArtifacts({
      generations: makeCorpusGenerationStore({
        identity: topicsStorage,
        databases: topicsDatabases,
        registry: makeIndexedDbGenerationRegistryStore({
          databaseName: topicsStorage.metadataDatabaseName,
          key: topicsStorage.activeGenerationKey,
        }),
        discard: (filename) => discardCorpusGeneration(vfs, filename),
      }),
      downloader,
      onProgress: (progress) =>
        host.log(`[web.topics] install-progress progress=${String(progress)}`),
    });
    // §9.2's index, through the flat-artifact half of the same lifecycle: its
    // own OPFS filenames, its own IndexedDB registry, its own active-generation
    // key. `blobFiles` is the OPFS seam the store reads and retires through.
    const vectorsStorage = corpusStorageIdentity('vectors');
    const blobFiles: BlobFileStore = makeOpfsBlobFileStore();
    const vectorGenerations = makeBlobGenerationStore({
      identity: vectorsStorage,
      files: blobFiles,
      registry: makeIndexedDbGenerationRegistryStore({
        databaseName: vectorsStorage.metadataDatabaseName,
        key: vectorsStorage.activeGenerationKey,
      }),
    });
    const vectorsArtifacts = layerBrowserVectorsArtifacts({
      generations: vectorGenerations,
      files: blobFiles,
      downloader,
      onProgress: (progress) =>
        host.log(`[web.vectors] install-progress progress=${String(progress)}`),
    });
    const corpusSupply = CorpusSupply.layer.pipe(
      Layer.provide(Layer.mergeAll(bibleArtifacts, topicsArtifacts, vectorsArtifacts)),
    );
    yield* Effect.gen(function* () {
      const supply = yield* CorpusSupply;
      // Bible stays fail-closed: the app cannot read without it.
      yield* supply.ensure();
      // Topics is writings-style catch-and-warn (§3.5). Both installers keep
      // the active generation on any failure, so the only states reachable
      // here are current, stale-but-verified, or absent — and absent means
      // catalog pages, not a broken app.
      yield* supply
        .ensure({ target: Target.topics() })
        .pipe(
          Effect.catch((cause) =>
            Effect.sync(() =>
              host.warn(`[web.topics] unavailable category=${failureCategory(cause)}`),
            ),
          ),
        );
      // Vectors is the most optional artifact in the pipeline: its absence is a
      // fully working lexical-only search, reported as §9.6's typed value. Same
      // catch-and-warn posture as topics, one step further along.
      yield* supply
        .ensure({ target: Target.vectors() })
        .pipe(
          Effect.catch((cause) =>
            Effect.sync(() =>
              host.warn(`[web.vectors] unavailable category=${failureCategory(cause)}`),
            ),
          ),
        );
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
    const localClientId = yield* Schema.decodeEffect(ClientId)('web-local').pipe(Effect.orDie);
    const generation = yield* Schema.decodeEffect(RuntimeGeneration)(host.randomUuid()).pipe(
      Effect.orDie,
    );
    host.log('[web.runtime] persistence-ready state=ready');
    return {
      bibleDatabase: bibleDatabases.active,
      writingsDatabase: writingsSqlite,
      // The topics artifact's active generation, or `None` when `ensure` caught
      // and warned above. `WikiService` reads either one — an absent artifact
      // is catalog-only pages, not a broken worker (§3.5).
      topicsDatabase: Option.map(topicsDatabases.activeFilename, () => topicsDatabases.active),
      writingsFetch: host.fetch,
      // §9.2's index, from whichever generation `CorpusSupply` verified and
      // activated. `None` when none is installed, which is the ordinary state
      // until the release pin is filled in — and which reaches the reader as
      // §9.6's typed absence rather than as a quiet drop in result quality.
      //
      // Read once here rather than per query: the store loaded the active
      // generation's bytes at activation, and this is the handoff. The bytes
      // never come from OPFS behind `CorpusSupply`'s back, so a generation that
      // failed the parser gate cannot be picked up off disk.
      vectorIndex: yield* vectorGenerations.activeBytes,
      runtime: {
        clientId: localClientId,
        store: userState.store,
        transport: makeSimulatedTransport(),
        generation,
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
