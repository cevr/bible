/** One worker owns browser SQLite, the Effect runtime, and the procedure server. */
import { ClientId, makeSimulatedTransport, MutationId, Timestamp } from '@bible/core/local-first';
import { CommitId, RuntimeGeneration } from '@bible/core/procedure';
import { Effect, Layer, Schema } from 'effect';
import * as SQLite from 'wa-sqlite';
import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite.mjs';
import { OPFSCoopSyncVFS } from 'wa-sqlite/src/examples/OPFSCoopSyncVFS.js';

import userStateMigrationSql from '../../../../packages/core/src/local-first/migrations/0001_user_state.sql?raw';

import { makeWorkerBibleDatabase } from './bible-database.js';
import { makeDatabaseFileDownloader } from './database-file-downloader.js';
import { makeWorkerEgwDatabase } from './egw-database.js';
import {
  decodeProcedureWorkerConnect,
  type ProcedureWorkerConnect,
} from './procedure-worker-protocol.js';
import { layerProcedureServer, type ProcedureServerInput } from './procedure-server.js';
import { makeSqliteDatabase } from './sqlite-database.js';
import { makeBrowserSyncStore, makeBrowserUserDatabase } from './user-state-database.js';

const log = import.meta.env['DEV'] ? (...args: unknown[]) => console.log(...args) : () => {};
const VFS_NAME = 'opfs-coop-sync';

let procedureServer: Omit<ProcedureServerInput, 'port'> | undefined;
let initialization: Promise<void> | undefined;
const pendingProcedurePorts: MessagePort[] = [];

const isProcedureConnect = (input: unknown): input is ProcedureWorkerConnect =>
  typeof input === 'object' &&
  input !== null &&
  'type' in input &&
  input.type === 'procedure-connect';

const launchProcedureServer = (port: MessagePort): void => {
  if (procedureServer === undefined) {
    pendingProcedurePorts.push(port);
    return;
  }
  Effect.runFork(Layer.launch(layerProcedureServer({ ...procedureServer, port })));
};

const initializeDatabases = async (): Promise<void> => {
  log('[web.runtime] sqlite-loading');
  const module = await SQLiteESMFactory();
  const sqlite3 = SQLite.Factory(module);
  const vfs = await OPFSCoopSyncVFS.create(VFS_NAME, module);
  sqlite3.vfs_register(vfs as unknown as SQLiteVFS, false);

  const downloader = makeDatabaseFileDownloader();
  const writingsSqlite = makeSqliteDatabase(sqlite3, 'egw-paragraphs.db', VFS_NAME);
  const writings = makeWorkerEgwDatabase({ database: writingsSqlite, downloader, log });
  const bibleSqlite = makeSqliteDatabase(sqlite3, 'bible.db', VFS_NAME);
  const bible = makeWorkerBibleDatabase({ database: bibleSqlite, downloader });

  await bible.initialize((progress) => {
    log(`[web.runtime] bible-download progress=${String(progress)}`);
  });
  try {
    await writings.initialize();
  } catch (cause) {
    console.warn(`[web.runtime] writings-unavailable cause=${String(cause)}`);
  }

  const userStateSqlite = makeSqliteDatabase(sqlite3, 'user-state.db', VFS_NAME);
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
  for (const port of pendingProcedurePorts.splice(0)) launchProcedureServer(port);
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
    for (const port of pendingProcedurePorts.splice(0)) port.close();
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
  launchProcedureServer(port);
  void ensureInitialized();
};
