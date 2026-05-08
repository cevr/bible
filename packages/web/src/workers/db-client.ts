/**
 * Main-thread client for the SQLite Web Worker.
 *
 * Provides a Promise-based API for querying bible.db and state.db.
 * Singleton — call getDbClient() to get the shared instance.
 */
import type { WorkerRequest, WorkerResponse } from './db-protocol.js';

const log = import.meta.env['DEV'] ? (...args: unknown[]) => console.log(...args) : () => {};

export interface EgwSyncStatus {
  bookCode: string;
  status: string;
  paragraphCount: number;
}

export interface DbClient {
  /** Initialize the worker and databases. Resolves when ready. */
  init(): Promise<void>;
  /** Register a progress callback for init. */
  onProgress(cb: (stage: string, progress: number) => void): void;
  /** Query a database. Returns rows as record arrays. */
  query<T = Record<string, unknown>>(
    db: 'bible' | 'state' | 'egw' | 'topics',
    sql: string,
    params?: unknown[],
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
  getEgwSyncStatus(): Promise<EgwSyncStatus[]>;
  /** Full monolithic EGW database download. */
  syncFullEgw(): Promise<void>;
  /** Register callback for EGW sync progress. Returns unsubscribe. */
  onSyncProgress(cb: (bookCode: string, stage: string, progress: number) => void): () => void;
  /** Register callback for background sync book completions. Returns unsubscribe. */
  onSyncComplete(cb: (bookCode: string, paragraphCount: number) => void): () => void;
  /** Initialize topics database (download on first access). */
  initTopics(): Promise<void>;
}

function createDbClient(): DbClient {
  const worker = new Worker(new URL('./db-worker.ts', import.meta.url), { type: 'module' });

  let nextId = 1;
  const pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (err: Error) => void }
  >();
  let initResolve: (() => void) | null = null;
  let initReject: ((err: Error) => void) | null = null;
  let progressCallbacks: ((stage: string, progress: number) => void)[] = [];
  let execCallbacks: (() => void)[] = [];
  let exportResolve: ((buf: ArrayBuffer) => void) | null = null;
  let exportReject: ((err: Error) => void) | null = null;
  let dirtyResolve: ((dirty: boolean) => void) | null = null;
  let syncStatusResolve: ((status: EgwSyncStatus[]) => void) | null = null;
  let fullSyncResolve: (() => void) | null = null;
  let fullSyncReject: ((err: Error) => void) | null = null;
  let syncProgressCallbacks: ((bookCode: string, stage: string, progress: number) => void)[] = [];
  let syncCompleteCallbacks: ((bookCode: string, paragraphCount: number) => void)[] = [];
  let topicsInitResolve: (() => void) | null = null;
  let topicsInitReject: ((err: Error) => void) | null = null;

  worker.onerror = (event) => {
    console.error('[db-client] worker error:', event.message, event);
  };

  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const msg = event.data;

    switch (msg.type) {
      case 'init-progress': {
        log(`[db-client] progress: ${msg.stage} (${msg.progress}%)`);
        for (const cb of progressCallbacks) {
          cb(msg.stage, msg.progress);
        }
        break;
      }
      case 'init-complete': {
        log('[db-client] init complete');
        initResolve?.();
        break;
      }
      case 'init-error': {
        console.error('[db-client] init error:', msg.error);
        initReject?.(new Error(msg.error));
        break;
      }
      case 'query-result': {
        pending.get(msg.id)?.resolve(msg.rows);
        pending.delete(msg.id);
        break;
      }
      case 'query-error': {
        pending.get(msg.id)?.reject(new Error(msg.error));
        pending.delete(msg.id);
        break;
      }
      case 'exec-result': {
        pending.get(msg.id)?.resolve(msg.changes);
        pending.delete(msg.id);
        for (const cb of execCallbacks) cb();
        break;
      }
      case 'exec-error': {
        pending.get(msg.id)?.reject(new Error(msg.error));
        pending.delete(msg.id);
        break;
      }
      case 'export-state-result': {
        exportResolve?.(msg.data);
        exportResolve = null;
        exportReject = null;
        break;
      }
      case 'export-state-error': {
        exportReject?.(new Error(msg.error));
        exportResolve = null;
        exportReject = null;
        break;
      }
      case 'is-dirty-result': {
        dirtyResolve?.(msg.dirty);
        dirtyResolve = null;
        break;
      }
      case 'sync-book-progress': {
        for (const cb of syncProgressCallbacks) {
          cb(msg.bookCode, msg.stage, msg.progress);
        }
        break;
      }
      case 'sync-book-result': {
        // Resolve pending request if it exists
        if (msg.id > 0) {
          pending.get(msg.id)?.resolve(msg.paragraphCount);
          pending.delete(msg.id);
        }
        // Notify listeners (covers auto-sync completions where id=0)
        for (const cb of syncCompleteCallbacks) {
          cb(msg.bookCode, msg.paragraphCount);
        }
        break;
      }
      case 'sync-book-error': {
        pending.get(msg.id)?.reject(new Error(msg.error));
        pending.delete(msg.id);
        break;
      }
      case 'egw-sync-status': {
        syncStatusResolve?.(msg.books);
        syncStatusResolve = null;
        break;
      }
      case 'sync-full-egw-result': {
        fullSyncResolve?.();
        fullSyncResolve = null;
        fullSyncReject = null;
        break;
      }
      case 'sync-full-egw-error': {
        fullSyncReject?.(new Error(msg.error));
        fullSyncResolve = null;
        fullSyncReject = null;
        break;
      }
      case 'init-topics-progress': {
        log(`[db-client] topics: ${msg.stage} (${msg.progress}%)`);
        break;
      }
      case 'init-topics-complete': {
        log('[db-client] topics init complete');
        topicsInitResolve?.();
        topicsInitResolve = null;
        topicsInitReject = null;
        break;
      }
      case 'init-topics-error': {
        topicsInitReject?.(new Error(msg.error));
        topicsInitResolve = null;
        topicsInitReject = null;
        break;
      }
    }
  };

  function send(msg: WorkerRequest) {
    worker.postMessage(msg);
  }

  return {
    init() {
      return new Promise<void>((resolve, reject) => {
        initResolve = resolve;
        initReject = reject;
        send({ type: 'init' });
      });
    },

    onProgress(cb) {
      progressCallbacks.push(cb);
    },

    query<T = Record<string, unknown>>(
      db: 'bible' | 'state' | 'egw' | 'topics',
      sql: string,
      params?: unknown[],
    ): Promise<T[]> {
      const id = nextId++;
      return new Promise<T[]>((resolve, reject) => {
        pending.set(id, {
          resolve: resolve as (value: unknown) => void,
          reject,
        });
        send({ type: 'query', id, db, sql, params });
      });
    },

    exec(sql: string, params?: unknown[]): Promise<number> {
      const id = nextId++;
      return new Promise<number>((resolve, reject) => {
        pending.set(id, {
          resolve: resolve as (value: unknown) => void,
          reject,
        });
        send({ type: 'exec', id, db: 'state', sql, params });
      });
    },

    exportState(): Promise<ArrayBuffer> {
      return new Promise<ArrayBuffer>((resolve, reject) => {
        exportResolve = resolve;
        exportReject = reject;
        send({ type: 'export-state' });
      });
    },

    isDirty(): Promise<boolean> {
      return new Promise<boolean>((resolve) => {
        dirtyResolve = resolve;
        send({ type: 'is-dirty' });
      });
    },

    onExec(cb: () => void) {
      execCallbacks.push(cb);
      return () => {
        const i = execCallbacks.indexOf(cb);
        if (i >= 0) execCallbacks.splice(i, 1);
      };
    },

    syncBook(bookCode: string): Promise<number> {
      const id = nextId++;
      return new Promise<number>((resolve, reject) => {
        pending.set(id, {
          resolve: resolve as (value: unknown) => void,
          reject,
        });
        send({ type: 'sync-book', id, bookCode });
      });
    },

    getEgwSyncStatus(): Promise<EgwSyncStatus[]> {
      return new Promise<EgwSyncStatus[]>((resolve) => {
        syncStatusResolve = resolve;
        send({ type: 'get-egw-sync-status' });
      });
    },

    syncFullEgw(): Promise<void> {
      return new Promise<void>((resolve, reject) => {
        fullSyncResolve = resolve;
        fullSyncReject = reject;
        send({ type: 'sync-full-egw' });
      });
    },

    onSyncProgress(cb: (bookCode: string, stage: string, progress: number) => void) {
      syncProgressCallbacks.push(cb);
      return () => {
        const i = syncProgressCallbacks.indexOf(cb);
        if (i >= 0) syncProgressCallbacks.splice(i, 1);
      };
    },

    onSyncComplete(cb: (bookCode: string, paragraphCount: number) => void) {
      syncCompleteCallbacks.push(cb);
      return () => {
        const i = syncCompleteCallbacks.indexOf(cb);
        if (i >= 0) syncCompleteCallbacks.splice(i, 1);
      };
    },

    initTopics(): Promise<void> {
      return new Promise<void>((resolve, reject) => {
        topicsInitResolve = resolve;
        topicsInitReject = reject;
        send({ type: 'init-topics' });
      });
    },
  };
}

// Singleton
let instance: DbClient | null = null;

export function getDbClient(): DbClient {
  if (!instance) {
    instance = createDbClient();
  }
  return instance;
}
