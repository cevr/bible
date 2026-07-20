/** One worker owns browser SQLite, the Effect runtime, and the procedure server. */
import { LibraryEntityId } from '@bible/core/library-state';
import { ClientId, makeSimulatedTransport, MutationId, Timestamp } from '@bible/core/local-first';
import { CommitId, RuntimeGeneration } from '@bible/core/procedure';
import { Effect, Layer, Schema } from 'effect';
import * as SQLite from 'wa-sqlite';
import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite-async.mjs';
import { IDBBatchAtomicVFS } from 'wa-sqlite/src/examples/IDBBatchAtomicVFS.js';
import { OPFSAdaptiveVFS } from 'wa-sqlite/src/examples/OPFSAdaptiveVFS.js';

import userStateMigrationSql from '../../../../packages/core/src/local-first/migrations/0001_user_state.sql?raw';

import { makeWorkerBibleDatabase } from './bible-database.js';
import {
  makeDatabaseFileDownloader,
  makeIndexedDbDatabaseFileDownloader,
  type DatabaseFileDownloader,
  type IndexedDbImportVfs,
} from './database-file-downloader.js';
import { initializeWritingsDatabase } from './initialize-writings-database.js';
import {
  decodeProcedureWorkerConnect,
  type ProcedureWorkerConnect,
} from './procedure-worker-protocol.js';
import { layerProcedureServer, type ProcedureServerInput } from './procedure-server.js';
import { makeSqliteDatabase } from './sqlite-database.js';
import { makeIndexedDbGenerationMarkerStore } from './generation-marker.js';
import type { BrowserSqliteVfs } from './user-state-generation.js';
import { migrateWebUserState } from './web-state-migration.js';

const log = import.meta.env['DEV'] ? (line: string) => console.log(line) : () => {};
const OPFS_VFS_NAME = 'opfs-adaptive';
const IDB_VFS_NAME = 'idb-batch-atomic';

const normalizeCategory = (value: string): string => {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized.length > 0 ? normalized : 'unknown';
};

const failureCategory = (cause: unknown): string => {
  if (typeof cause !== 'object' || cause === null) return 'unknown';
  if ('_tag' in cause && typeof cause._tag === 'string') return normalizeCategory(cause._tag);
  if ('code' in cause && typeof cause.code === 'string') return normalizeCategory(cause.code);
  if ('name' in cause && typeof cause.name === 'string') return normalizeCategory(cause.name);
  return 'unknown';
};

let procedureServer: Omit<ProcedureServerInput, 'port'> | undefined;
let initialization: Promise<void> | undefined;

const isProcedureConnect = (input: unknown): input is ProcedureWorkerConnect =>
  typeof input === 'object' &&
  input !== null &&
  'type' in input &&
  input.type === 'procedure-connect';

const launchProcedureServer = (port: MessagePort): void => {
  if (procedureServer === undefined) throw new Error('Procedure runtime is not initialized');
  Effect.runFork(Layer.launch(layerProcedureServer({ ...procedureServer, port })));
};

const initializeSqlite = async (): Promise<{
  readonly sqlite3: ReturnType<typeof SQLite.Factory>;
  readonly vfsName: string;
  readonly vfs: BrowserSqliteVfs;
  readonly downloader: DatabaseFileDownloader;
}> => {
  const module = await SQLiteESMFactory();
  const sqlite3 = SQLite.Factory(module);
  let opfs: OPFSAdaptiveVFS | undefined;
  try {
    const syncAccessHandle = (
      globalThis as typeof globalThis & {
        readonly FileSystemSyncAccessHandle?: { readonly prototype: object };
      }
    ).FileSystemSyncAccessHandle;
    const supportsUnsafeAccessHandles =
      syncAccessHandle !== undefined &&
      Object.prototype.hasOwnProperty.call(syncAccessHandle.prototype, 'mode');
    if (!supportsUnsafeAccessHandles) {
      throw new Error('readwrite-unsafe OPFS access handles are unavailable');
    }
    opfs = await OPFSAdaptiveVFS.create(OPFS_VFS_NAME, module);
    sqlite3.vfs_register(opfs as unknown as SQLiteVFS, false);
    const probe = makeSqliteDatabase(sqlite3, 'capability-probe.db', OPFS_VFS_NAME);
    await probe.open(SQLite.SQLITE_OPEN_READWRITE | SQLite.SQLITE_OPEN_CREATE);
    await probe.exec('PRAGMA user_version');
    await probe.close();
    log('[web.runtime] sqlite-vfs-ready kind=opfs');
    return {
      sqlite3,
      vfsName: OPFS_VFS_NAME,
      vfs: opfs,
      downloader: makeDatabaseFileDownloader(),
    };
  } catch (cause) {
    await opfs?.close();
    log(
      `[web.runtime] sqlite-vfs-fallback from=opfs to=indexeddb category=${failureCategory(cause)}`,
    );
    const idb = await IDBBatchAtomicVFS.create(IDB_VFS_NAME, module);
    sqlite3.vfs_register(idb as unknown as SQLiteVFS, false);
    log('[web.runtime] sqlite-vfs-ready kind=indexeddb');
    return {
      sqlite3,
      vfsName: IDB_VFS_NAME,
      vfs: idb,
      downloader: makeIndexedDbDatabaseFileDownloader(idb as unknown as IndexedDbImportVfs),
    };
  }
};

const initializeDatabases = async (): Promise<void> => {
  log('[web.runtime] sqlite-loading state=started');
  const { sqlite3, vfsName, vfs, downloader } = await initializeSqlite();
  const writingsSqlite = makeSqliteDatabase(sqlite3, 'egw-paragraphs.db', vfsName);
  const bibleSqlite = makeSqliteDatabase(sqlite3, 'bible.db', vfsName);
  const bible = makeWorkerBibleDatabase({ database: bibleSqlite, downloader });

  await bible.initialize((progress) => {
    log(`[web.bible] download-progress progress=${String(progress)}`);
  });
  try {
    await initializeWritingsDatabase(writingsSqlite);
  } catch (cause) {
    console.warn(`[web.writings] unavailable category=${failureCategory(cause)}`);
  }

  const userState = await migrateWebUserState({
    sqlite3,
    vfsName,
    vfs,
    marker: makeIndexedDbGenerationMarkerStore(),
    writingsDatabase: writingsSqlite,
    migrationSql: userStateMigrationSql,
    log,
  });
  const localClientId = Schema.decodeSync(ClientId)('web-local');
  procedureServer = {
    bibleDatabase: bibleSqlite,
    writingsDatabase: writingsSqlite,
    writingsFetch: globalThis.fetch,
    runtime: {
      clientId: localClientId,
      store: userState.store,
      transport: makeSimulatedTransport(),
      generation: Schema.decodeSync(RuntimeGeneration)(crypto.randomUUID()),
      capabilities: ['external-links'],
      nextMutationId: () => Schema.decodeSync(MutationId)(crypto.randomUUID()),
      nextHistoryId: () => Schema.decodeSync(LibraryEntityId)(crypto.randomUUID()),
      nextCommitId: () => Schema.decodeSync(CommitId)(crypto.randomUUID()),
      now: () => Schema.decodeSync(Timestamp)(new Date().toISOString()),
    },
  };
  log('[web.runtime] persistence-ready state=ready');
};

const ensureInitialized = (): Promise<void> => {
  initialization ??= initializeDatabases().catch((cause: unknown) => {
    console.error(`[web.runtime] startup-failed category=${failureCategory(cause)}`);
    throw cause;
  });
  return initialization;
};

self.onmessage = (event: MessageEvent<unknown>) => {
  if (!isProcedureConnect(event.data)) {
    console.warn('[web.runtime] message-rejected reason=non-procedure');
    return;
  }
  decodeProcedureWorkerConnect(event.data);
  const port = event.ports[0];
  if (port === undefined) {
    console.error('[web.runtime] port-missing kind=procedure');
    return;
  }
  const readinessPort = event.ports[1];
  if (readinessPort === undefined) {
    console.error('[web.runtime] port-missing kind=readiness');
    port.close();
    return;
  }
  readinessPort.start();
  void ensureInitialized().then(
    () => {
      launchProcedureServer(port);
      readinessPort.postMessage({ type: 'ready' });
      readinessPort.close();
    },
    (cause: unknown) => {
      readinessPort.postMessage({ type: 'failed', message: String(cause) });
      readinessPort.close();
      port.close();
    },
  );
};
