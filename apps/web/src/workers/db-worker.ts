/**
 * SQLite Web Worker
 *
 * Runs wa-sqlite with OPFSCoopSyncVFS for persistent local-first storage.
 * Composes three database modules:
 *   - bible.db (read-only, downloaded from server on first visit)
 *   - state.db (read-write, user data — position, bookmarks, etc.)
 *   - egw-paragraphs.db (read-write, EGW commentary — incrementally synced per book)
 */
import * as SQLite from 'wa-sqlite';
import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite.mjs';
import { OPFSCoopSyncVFS } from 'wa-sqlite/src/examples/OPFSCoopSyncVFS.js';
import { ClientId, makeSimulatedTransport, MutationId, Timestamp } from '@bible/core/local-first';
import { CommitId, RuntimeGeneration } from '@bible/core/procedure';
import { Effect, Layer, Schema } from 'effect';

import userStateMigrationSql from '../../../../packages/core/src/local-first/migrations/0001_user_state.sql?raw';

import { makeWorkerBibleDatabase, type WorkerBibleDatabase } from './bible-database.js';
import { makeDatabaseFileDownloader } from './database-file-downloader.js';
import { decodeWorkerRequest, decodeWorkerResponse, type WorkerResponse } from './db-protocol.js';
import { makeWorkerEgwDatabase, type WorkerEgwDatabase } from './egw-database.js';
import {
  decodeProcedureWorkerConnect,
  type ProcedureWorkerConnect,
} from './procedure-worker-protocol.js';
import { layerProcedureServer, type ProcedureServerInput } from './procedure-server.js';
import { makeSqliteDatabase } from './sqlite-database.js';
import { makeStateDatabase, type StateDatabase } from './state-database.js';
import { makeBrowserSyncStore, makeBrowserUserDatabase } from './user-state-database.js';

const log = import.meta.env['DEV'] ? (...args: unknown[]) => console.log(...args) : () => {};
const VFS_NAME = 'opfs-coop-sync';

let bibleDatabase: WorkerBibleDatabase;
let stateDatabase: StateDatabase;
let egwDatabase: WorkerEgwDatabase;
let procedureServer: Omit<ProcedureServerInput, 'port'> | undefined;
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

function post(msg: WorkerResponse) {
  self.postMessage(decodeWorkerResponse(msg));
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

async function initializeDatabases(requestId: number): Promise<void> {
  try {
    log('[db-worker] init: loading wa-sqlite module');
    post({ type: 'init-progress', id: requestId, stage: 'Loading SQLite...', progress: 0 });

    const module = await SQLiteESMFactory();
    const sqlite3 = SQLite.Factory(module);
    log('[db-worker] init: wa-sqlite loaded');

    const vfs = await OPFSCoopSyncVFS.create(VFS_NAME, module);
    sqlite3.vfs_register(vfs as unknown as SQLiteVFS, false);
    log('[db-worker] init: OPFS VFS registered');

    const downloader = makeDatabaseFileDownloader();
    const writingsSqlite = makeSqliteDatabase(sqlite3, 'egw-paragraphs.db', VFS_NAME);
    egwDatabase = makeWorkerEgwDatabase({
      database: writingsSqlite,
      downloader,
      log,
    });
    const bibleSqlite = makeSqliteDatabase(sqlite3, 'bible.db', VFS_NAME);
    bibleDatabase = makeWorkerBibleDatabase({
      database: bibleSqlite,
      downloader,
    });
    await bibleDatabase.initialize((progress) => {
      post({
        type: 'init-progress',
        id: requestId,
        stage: 'Downloading Bible database...',
        progress,
      });
    });
    log('[db-worker] init: bible.db ready');

    post({ type: 'init-progress', id: requestId, stage: 'Initializing...', progress: 100 });
    log('[db-worker] init: state.db opening, running schema');
    stateDatabase = makeStateDatabase({
      database: makeSqliteDatabase(sqlite3, 'state.db', VFS_NAME),
    });
    await stateDatabase.initialize();
    log('[db-worker] init: state.db schema applied');
    log('[db-worker] init: state.db migrations applied');

    // EGW commentary database — schema-only init (no monolithic download)
    try {
      await egwDatabase.initialize();
    } catch (egwErr) {
      console.warn('[db-worker] init: EGW database unavailable, continuing without it', egwErr);
    }

    const userStateSqlite = makeSqliteDatabase(sqlite3, 'user-state.db', VFS_NAME);
    await userStateSqlite.open(SQLite.SQLITE_OPEN_READWRITE | SQLite.SQLITE_OPEN_CREATE);
    const userDatabase = makeBrowserUserDatabase({ database: userStateSqlite });
    await Effect.runPromise(userDatabase.migrate(userStateMigrationSql));
    const localClientId = Schema.decodeSync(ClientId)('web-local');
    const store = makeBrowserSyncStore(userDatabase, localClientId);
    const generation = Schema.decodeSync(RuntimeGeneration)(crypto.randomUUID());
    procedureServer = {
      bibleDatabase: bibleSqlite,
      writingsDatabase: writingsSqlite,
      runtime: {
        clientId: localClientId,
        store,
        transport: makeSimulatedTransport(),
        generation,
        capabilities: ['external-links'],
        nextMutationId: () => Schema.decodeSync(MutationId)(crypto.randomUUID()),
        nextCommitId: () => Schema.decodeSync(CommitId)(crypto.randomUUID()),
        now: () => Schema.decodeSync(Timestamp)(new Date().toISOString()),
      },
    };
    for (const port of pendingProcedurePorts.splice(0)) launchProcedureServer(port);
    log('[db-worker] init: procedure runtime ready');

    post({ type: 'init-complete', id: requestId });
    log('[db-worker] init: complete');

    // Auto-sync BC volumes in background (non-blocking)
    egwDatabase
      .autoSyncBibleCommentaries({
        onProgress: (event) => {
          post({ type: 'sync-book-progress', id: 0, ...event });
        },
        onComplete: (bookCode, count) => {
          post({ type: 'sync-book-result', id: 0, bookCode, paragraphCount: count });
        },
        onError: (bookCode, error) => {
          console.warn(`[db-worker] auto-sync: ${bookCode} failed`, error);
        },
      })
      .catch((err) => {
        console.warn('[db-worker] auto-sync: failed', err);
      });
  } catch (err) {
    console.error('[db-worker] init: FAILED', err);
    post({
      type: 'init-error',
      id: requestId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

self.onmessage = async (event: MessageEvent<unknown>) => {
  if (isProcedureConnect(event.data)) {
    decodeProcedureWorkerConnect(event.data);
    const port = event.ports[0];
    if (port === undefined) {
      console.error('[db-worker] procedure connection omitted its message port');
      return;
    }
    launchProcedureServer(port);
    return;
  }

  let msg;
  try {
    msg = decodeWorkerRequest(event.data);
  } catch (error) {
    console.error('[db-worker] rejected invalid request', error);
    return;
  }

  switch (msg.type) {
    case 'init':
      await initializeDatabases(msg.id);
      break;

    case 'query': {
      try {
        let rows;
        if (msg.db === 'bible') {
          rows = await bibleDatabase.query(msg.sql, msg.params);
        } else if (msg.db === 'state') {
          rows = await stateDatabase.query(msg.sql, msg.params);
        } else {
          rows = await egwDatabase.query(msg.sql, msg.params);
        }
        post({ type: 'query-result', id: msg.id, rows });
      } catch (err) {
        post({
          type: 'query-error',
          id: msg.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      break;
    }

    case 'exec': {
      try {
        const changes = await stateDatabase.execute(msg.sql, msg.params);
        post({ type: 'exec-result', id: msg.id, changes });
      } catch (err) {
        post({
          type: 'exec-error',
          id: msg.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      break;
    }

    case 'export-state': {
      try {
        const buffer = await stateDatabase.exportFile();
        const response: WorkerResponse = { type: 'export-state-result', id: msg.id, data: buffer };
        self.postMessage(decodeWorkerResponse(response), [buffer]);
      } catch (err) {
        post({
          type: 'export-state-error',
          id: msg.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      break;
    }

    case 'is-dirty': {
      post({ type: 'is-dirty-result', id: msg.id, dirty: stateDatabase.isDirty() });
      break;
    }

    case 'sync-book': {
      try {
        const count = await egwDatabase.syncBook(msg.bookCode, (event) => {
          post({ type: 'sync-book-progress', id: msg.id, ...event });
        });
        post({
          type: 'sync-book-result',
          id: msg.id,
          bookCode: msg.bookCode,
          paragraphCount: count,
        });
      } catch (err) {
        post({
          type: 'sync-book-error',
          id: msg.id,
          bookCode: msg.bookCode,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      break;
    }

    case 'get-egw-sync-status': {
      try {
        const books = await egwDatabase.getSyncStatus();
        post({ type: 'egw-sync-status-result', id: msg.id, books });
      } catch (err) {
        post({
          type: 'egw-sync-status-error',
          id: msg.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      break;
    }

    case 'sync-full-egw': {
      try {
        await egwDatabase.syncFull((progress) => {
          post({
            type: 'sync-full-egw-progress',
            id: msg.id,
            stage: 'Downloading EGW commentary...',
            progress,
          });
        });
        post({ type: 'sync-full-egw-result', id: msg.id });
      } catch (err) {
        post({
          type: 'sync-full-egw-error',
          id: msg.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      break;
    }
  }
};
