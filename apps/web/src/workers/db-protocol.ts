/** Message types shared between main thread and db worker */

export type WorkerRequest =
  | { type: 'init' }
  | {
      type: 'query';
      id: number;
      db: 'bible' | 'state' | 'egw' | 'topics';
      sql: string;
      params?: unknown[];
    }
  | { type: 'exec'; id: number; db: 'state'; sql: string; params?: unknown[] }
  | { type: 'export-state' }
  | { type: 'is-dirty' }
  | { type: 'sync-book'; id: number; bookCode: string }
  | { type: 'get-egw-sync-status' }
  | { type: 'sync-full-egw' }
  | { type: 'init-topics' };

export type WorkerResponse =
  | { type: 'init-progress'; stage: string; progress: number }
  | { type: 'init-complete' }
  | { type: 'init-error'; error: string }
  | { type: 'query-result'; id: number; rows: Record<string, unknown>[] }
  | { type: 'query-error'; id: number; error: string }
  | { type: 'exec-result'; id: number; changes: number }
  | { type: 'exec-error'; id: number; error: string }
  | { type: 'export-state-result'; data: ArrayBuffer }
  | { type: 'export-state-error'; error: string }
  | { type: 'is-dirty-result'; dirty: boolean }
  | { type: 'sync-book-progress'; bookCode: string; stage: string; progress: number }
  | { type: 'sync-book-result'; id: number; bookCode: string; paragraphCount: number }
  | { type: 'sync-book-error'; id: number; bookCode: string; error: string }
  | {
      type: 'egw-sync-status';
      books: { bookCode: string; status: string; paragraphCount: number }[];
    }
  | { type: 'sync-full-egw-result' }
  | { type: 'sync-full-egw-error'; error: string }
  | { type: 'init-topics-progress'; stage: string; progress: number }
  | { type: 'init-topics-complete' }
  | { type: 'init-topics-error'; error: string };
