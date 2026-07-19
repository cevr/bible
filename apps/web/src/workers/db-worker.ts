/** One worker owns browser SQLite, the Effect runtime, and the procedure server. */
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
import { makeWorkerEgwDatabase } from './egw-database.js';
import {
  decodeProcedureWorkerConnect,
  type ProcedureWorkerConnect,
} from './procedure-worker-protocol.js';
import { layerProcedureServer, type ProcedureServerInput } from './procedure-server.js';
import { makeSqliteDatabase } from './sqlite-database.js';
import { makeBrowserSyncStore, makeBrowserUserDatabase } from './user-state-database.js';

const log = import.meta.env['DEV'] ? (...args: unknown[]) => console.log(...args) : () => {};
const OPFS_VFS_NAME = 'opfs-adaptive';
const IDB_VFS_NAME = 'idb-batch-atomic';

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
      downloader: makeDatabaseFileDownloader(),
    };
  } catch (cause) {
    await opfs?.close();
    console.warn(`[web.runtime] sqlite-vfs-fallback from=opfs to=indexeddb cause=${String(cause)}`);
    const idb = await IDBBatchAtomicVFS.create(IDB_VFS_NAME, module);
    sqlite3.vfs_register(idb as unknown as SQLiteVFS, false);
    log('[web.runtime] sqlite-vfs-ready kind=indexeddb');
    return {
      sqlite3,
      vfsName: IDB_VFS_NAME,
      downloader: makeIndexedDbDatabaseFileDownloader(idb as unknown as IndexedDbImportVfs),
    };
  }
};

const initializeDatabases = async (): Promise<void> => {
  log('[web.runtime] sqlite-loading');
  const { sqlite3, vfsName, downloader } = await initializeSqlite();
  const writingsSqlite = makeSqliteDatabase(sqlite3, 'egw-paragraphs.db', vfsName);
  const writings = makeWorkerEgwDatabase({ database: writingsSqlite, downloader, log });
  const bibleSqlite = makeSqliteDatabase(sqlite3, 'bible.db', vfsName);
  const bible = makeWorkerBibleDatabase({ database: bibleSqlite, downloader });

  await bible.initialize((progress) => {
    log(`[web.runtime] bible-download progress=${String(progress)}`);
  });
  try {
    await writings.initialize();
  } catch (cause) {
    console.warn(`[web.runtime] writings-unavailable cause=${String(cause)}`);
  }

  const userStateSqlite = makeSqliteDatabase(sqlite3, 'user-state.db', vfsName);
  await userStateSqlite.open(SQLite.SQLITE_OPEN_READWRITE | SQLite.SQLITE_OPEN_CREATE);
  const userDatabase = makeBrowserUserDatabase({ database: userStateSqlite });
  await Effect.runPromise(userDatabase.migrate(userStateMigrationSql));
  const localClientId = Schema.decodeSync(ClientId)('web-local');
  const store = makeBrowserSyncStore(userDatabase, localClientId);
  procedureServer = {
    bibleDatabase: bibleSqlite,
    writingsDatabase: writingsSqlite,
    runtime: {
      clientId: localClientId,
      store,
      transport: makeSimulatedTransport(),
      generation: Schema.decodeSync(RuntimeGeneration)(crypto.randomUUID()),
      capabilities: ['external-links'],
      nextMutationId: () => Schema.decodeSync(MutationId)(crypto.randomUUID()),
      nextCommitId: () => Schema.decodeSync(CommitId)(crypto.randomUUID()),
      now: () => Schema.decodeSync(Timestamp)(new Date().toISOString()),
    },
  };
  log('[web.runtime] persistence-ready');

  void writings
    .autoSyncBibleCommentaries({
      onProgress: ({ bookCode, progress }) =>
        log(`[web.runtime] writings-sync book=${bookCode} progress=${String(progress)}`),
      onComplete: (bookCode, count) =>
        log(`[web.runtime] writings-ready book=${bookCode} paragraphs=${String(count)}`),
      onError: (bookCode, error) =>
        console.warn(`[web.runtime] writings-failed book=${bookCode} cause=${String(error)}`),
    })
    .catch((cause: unknown) => {
      console.warn(`[web.runtime] writings-sync-failed cause=${String(cause)}`);
    });
};

const ensureInitialized = (): Promise<void> => {
  initialization ??= initializeDatabases().catch((cause: unknown) => {
    console.error(`[web.runtime] startup-failed cause=${String(cause)}`);
    throw cause;
  });
  return initialization;
};

self.onmessage = (event: MessageEvent<unknown>) => {
  if (!isProcedureConnect(event.data)) {
    console.warn('[web.runtime] rejected-non-procedure-message');
    return;
  }
  decodeProcedureWorkerConnect(event.data);
  const port = event.ports[0];
  if (port === undefined) {
    console.error('[web.runtime] procedure-port-missing');
    return;
  }
  const readinessPort = event.ports[1];
  if (readinessPort === undefined) {
    console.error('[web.runtime] readiness-port-missing');
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
