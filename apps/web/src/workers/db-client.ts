/**
 * Main-thread client for the SQLite Web Worker.
 *
 * Provides a Promise-based API for querying bible.db and state.db.
 * Singleton — call getDbClient() to get the shared instance.
 */
import { Schema } from 'effect';

import {
  makeWorkerRequest,
  SyncStatus,
  type WorkerRequest,
  type WorkerRequestPayload,
  decodeWorkerResponse,
} from './db-protocol.js';
import { getDatabaseWorker } from './database-worker.js';

const log = import.meta.env['DEV'] ? (...args: unknown[]) => console.log(...args) : () => {};

export type EgwSyncStatus = SyncStatus;

const Integer = Schema.Number.pipe(Schema.check(Schema.isInt()));
const decodeInteger = Schema.decodeUnknownSync(Integer);
const decodeBoolean = Schema.decodeUnknownSync(Schema.Boolean);
const decodeArrayBuffer = Schema.decodeUnknownSync(Schema.instanceOf(globalThis.ArrayBuffer));
const decodeSyncStatus = Schema.decodeUnknownSync(Schema.Array(SyncStatus));
const decodeVoid = (_input: unknown): void => undefined;

/** Decode caller-specific row contracts after the transport envelope is validated. */
export function decodeQueryRows<T>(row: Schema.Decoder<T>, input: unknown): T[] {
  return [...Schema.decodeUnknownSync(Schema.Array(row))(input)];
}

export interface DbClient {
  /** Initialize the worker and databases. Resolves when ready. */
  init(): Promise<void>;
  /** Register a progress callback for init. */
  onProgress(cb: (stage: string, progress: number) => void): void;
  /** Query a database. Returns rows as record arrays. */
  query<T>(
    row: Schema.Decoder<T>,
    db: 'bible' | 'state' | 'egw',
    sql: string,
    params?: readonly unknown[],
  ): Promise<T[]>;
  /** Execute a write statement on state.db. Returns affected row count. */
  exec(sql: string, params?: unknown[]): Promise<number>;
  /** Export state.db as a binary blob from OPFS. */
  exportState(): Promise<ArrayBuffer>;
  /** Check if state.db has been written to since last export. */
  isDirty(): Promise<boolean>;
  /** Register a callback that fires after every successful exec. Returns unsubscribe. */
  onExec(cb: () => void): () => void;
  /** Sync a single EGW book by code. Returns paragraph count. */
  syncBook(bookCode: string): Promise<number>;
  /** Get EGW sync status for all books. */
  getEgwSyncStatus(): Promise<readonly EgwSyncStatus[]>;
  /** Full monolithic EGW database download. */
  syncFullEgw(): Promise<void>;
  /** Register callback for EGW sync progress. Returns unsubscribe. */
  onSyncProgress(cb: (bookCode: string, stage: string, progress: number) => void): () => void;
  /** Register callback for background sync book completions. Returns unsubscribe. */
  onSyncComplete(cb: (bookCode: string, paragraphCount: number) => void): () => void;
}

/** Worker seam used by the browser adapter and the in-memory test adapter. */
export interface DbWorkerPort {
  onerror: ((event: ErrorEvent) => void) | null;
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage(message: WorkerRequest): void;
}

interface PendingRequest {
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
}

function errorFrom(cause: unknown, message: string): Error {
  return cause instanceof Error ? cause : new Error(message, { cause });
}

export function createDbClient(worker: DbWorkerPort): DbClient {
  let nextId = 1;
  let initialization: Promise<void> | undefined;
  const pending = new Map<number, PendingRequest>();
  const progressCallbacks: ((stage: string, progress: number) => void)[] = [];
  const execCallbacks: (() => void)[] = [];
  const syncProgressCallbacks: ((bookCode: string, stage: string, progress: number) => void)[] = [];
  const syncCompleteCallbacks: ((bookCode: string, paragraphCount: number) => void)[] = [];

  const rejectAll = (error: Error): void => {
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  };

  const resolve = (id: number, value: unknown): void => {
    const request = pending.get(id);
    if (!request) return;
    pending.delete(id);
    request.resolve(value);
  };

  const reject = (id: number, error: Error): void => {
    const request = pending.get(id);
    if (!request) return;
    pending.delete(id);
    request.reject(error);
  };

  const request = <T>(payload: WorkerRequestPayload, decode: (input: unknown) => T): Promise<T> => {
    const id = nextId++;
    return new Promise<T>((resolveRequest, rejectRequest) => {
      pending.set(id, {
        resolve: (value) => {
          try {
            resolveRequest(decode(value));
          } catch (cause) {
            rejectRequest(
              new Error(`Database worker ${payload.type} request ${id} returned invalid data`, {
                cause,
              }),
            );
          }
        },
        reject: rejectRequest,
      });

      try {
        worker.postMessage(makeWorkerRequest(id, payload));
      } catch (cause) {
        pending.delete(id);
        rejectRequest(errorFrom(cause, `Failed to send database worker ${payload.type} request`));
      }
    });
  };

  const initialize = (): Promise<void> => {
    initialization ??= request({ type: 'init' }, decodeVoid);
    return initialization;
  };

  worker.onerror = (event) => {
    const error = new Error(`Database worker failed: ${event.message}`);
    rejectAll(error);
    console.error('[db-client] worker error:', event.message, event);
  };

  worker.onmessage = (event) => {
    let msg;
    try {
      msg = decodeWorkerResponse(event.data);
    } catch (cause) {
      const error = new Error('Database worker returned an invalid protocol message', { cause });
      rejectAll(error);
      console.error('[db-client] rejected invalid response', cause);
      return;
    }

    switch (msg.type) {
      case 'init-progress': {
        log(`[db-client] progress: ${msg.stage} (${msg.progress}%)`);
        for (const cb of progressCallbacks) cb(msg.stage, msg.progress);
        break;
      }
      case 'init-complete': {
        log('[db-client] init complete');
        resolve(msg.id, undefined);
        break;
      }
      case 'init-error': {
        console.error('[db-client] init error:', msg.error);
        reject(msg.id, new Error(msg.error));
        break;
      }
      case 'query-result': {
        resolve(msg.id, msg.rows);
        break;
      }
      case 'query-error': {
        reject(msg.id, new Error(msg.error));
        break;
      }
      case 'exec-result': {
        resolve(msg.id, msg.changes);
        for (const cb of execCallbacks) cb();
        break;
      }
      case 'exec-error': {
        reject(msg.id, new Error(msg.error));
        break;
      }
      case 'export-state-result': {
        resolve(msg.id, msg.data);
        break;
      }
      case 'export-state-error': {
        reject(msg.id, new Error(msg.error));
        break;
      }
      case 'is-dirty-result': {
        resolve(msg.id, msg.dirty);
        break;
      }
      case 'sync-book-progress': {
        for (const cb of syncProgressCallbacks) cb(msg.bookCode, msg.stage, msg.progress);
        break;
      }
      case 'sync-book-result': {
        if (msg.id > 0) resolve(msg.id, msg.paragraphCount);
        for (const cb of syncCompleteCallbacks) cb(msg.bookCode, msg.paragraphCount);
        break;
      }
      case 'sync-book-error': {
        if (msg.id > 0) reject(msg.id, new Error(msg.error));
        break;
      }
      case 'egw-sync-status-result': {
        resolve(msg.id, msg.books);
        break;
      }
      case 'egw-sync-status-error': {
        reject(msg.id, new Error(msg.error));
        break;
      }
      case 'sync-full-egw-progress': {
        log(`[db-client] EGW sync: ${msg.stage} (${msg.progress}%)`);
        for (const cb of progressCallbacks) cb(msg.stage, msg.progress);
        break;
      }
      case 'sync-full-egw-result': {
        resolve(msg.id, undefined);
        break;
      }
      case 'sync-full-egw-error': {
        reject(msg.id, new Error(msg.error));
        break;
      }
    }
  };

  return {
    init: initialize,

    onProgress(cb) {
      progressCallbacks.push(cb);
    },

    query: <T>(
      row: Schema.Decoder<T>,
      db: 'bible' | 'state' | 'egw',
      sql: string,
      params?: readonly unknown[],
    ) => request({ type: 'query', db, sql, params }, (input) => decodeQueryRows(row, input)),

    exec: (sql, params) => request({ type: 'exec', db: 'state', sql, params }, decodeInteger),

    exportState: () => request({ type: 'export-state' }, decodeArrayBuffer),

    isDirty: () => request({ type: 'is-dirty' }, decodeBoolean),

    onExec(cb) {
      execCallbacks.push(cb);
      return () => {
        const index = execCallbacks.indexOf(cb);
        if (index >= 0) execCallbacks.splice(index, 1);
      };
    },

    syncBook: (bookCode) => request({ type: 'sync-book', bookCode }, decodeInteger),

    getEgwSyncStatus: () => request({ type: 'get-egw-sync-status' }, decodeSyncStatus),

    syncFullEgw: () => request({ type: 'sync-full-egw' }, decodeVoid),

    onSyncProgress(cb) {
      syncProgressCallbacks.push(cb);
      return () => {
        const index = syncProgressCallbacks.indexOf(cb);
        if (index >= 0) syncProgressCallbacks.splice(index, 1);
      };
    },

    onSyncComplete(cb) {
      syncCompleteCallbacks.push(cb);
      return () => {
        const index = syncCompleteCallbacks.indexOf(cb);
        if (index >= 0) syncCompleteCallbacks.splice(index, 1);
      };
    },
  };
}

let instance: DbClient | null = null;

export function getDbClient(): DbClient {
  if (!instance) {
    instance = createDbClient(getDatabaseWorker());
  }
  return instance;
}
