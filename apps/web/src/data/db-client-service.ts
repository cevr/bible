import { Effect, Layer, Context, Schema } from 'effect';
import { getDbClient, type EgwSyncStatus } from '@/workers/db-client';

export class DatabaseQueryError extends Schema.TaggedErrorClass<DatabaseQueryError>()(
  'DatabaseQueryError',
  {
    cause: Schema.Unknown,
    operation: Schema.String,
  },
) {}

export class WorkerError extends Schema.TaggedErrorClass<WorkerError>()('WorkerError', {
  cause: Schema.Unknown,
  message: Schema.String,
  operation: Schema.String,
}) {}

interface DbClientServiceShape {
  readonly query: <T>(
    row: Schema.Decoder<T>,
    db: 'bible' | 'state' | 'egw' | 'topics',
    sql: string,
    params?: readonly unknown[],
  ) => Effect.Effect<T[], DatabaseQueryError>;

  readonly exec: (sql: string, params?: unknown[]) => Effect.Effect<number, DatabaseQueryError>;

  readonly exportState: () => Effect.Effect<ArrayBuffer, WorkerError>;

  readonly isDirty: () => Effect.Effect<boolean, WorkerError>;

  readonly onExec: (cb: () => void) => void;

  readonly initializeTopics: () => Effect.Effect<void, WorkerError>;

  readonly syncWritingsPublication: (bookCode: string) => Effect.Effect<number, WorkerError>;

  readonly getWritingsSyncStatus: () => Effect.Effect<readonly EgwSyncStatus[], WorkerError>;

  readonly syncAllWritings: () => Effect.Effect<void, WorkerError>;

  readonly onWritingsSyncComplete: (
    cb: (bookCode: string, paragraphCount: number) => void,
  ) => () => void;
}

export class DbClientService extends Context.Service<DbClientService, DbClientServiceShape>()(
  '@bible-web/DbClient',
) {
  static Live = Layer.sync(DbClientService, () => {
    const client = getDbClient();

    /**
     * Semaphore for exportState/isDirty — the raw client uses single-variable
     * exportResolve/dirtyResolve that get overwritten on concurrent calls,
     * leaving the first caller's promise hanging forever.
     */
    let exporting = false;
    const exportQueue: Array<{
      resolve: (buf: ArrayBuffer) => void;
      reject: (err: unknown) => void;
    }> = [];

    let dirtyChecking = false;
    const dirtyQueue: Array<{
      resolve: (dirty: boolean) => void;
      reject: (err: unknown) => void;
    }> = [];

    function serializedExport(): Promise<ArrayBuffer> {
      return new Promise((resolve, reject) => {
        exportQueue.push({ resolve, reject });
        if (!exporting) drainExportQueue();
      });
    }

    async function drainExportQueue() {
      exporting = true;
      let item = exportQueue.shift();
      while (item) {
        try {
          item.resolve(await client.exportState()); // eslint-disable-line no-await-in-loop
        } catch (err) {
          item.reject(err);
        }
        item = exportQueue.shift();
      }
      exporting = false;
    }

    function serializedIsDirty(): Promise<boolean> {
      return new Promise((resolve, reject) => {
        dirtyQueue.push({ resolve, reject });
        if (!dirtyChecking) drainDirtyQueue();
      });
    }

    async function drainDirtyQueue() {
      dirtyChecking = true;
      let item = dirtyQueue.shift();
      while (item) {
        try {
          item.resolve(await client.isDirty()); // eslint-disable-line no-await-in-loop
        } catch (err) {
          item.reject(err);
        }
        item = dirtyQueue.shift();
      }
      dirtyChecking = false;
    }

    return DbClientService.of({
      query: <T>(
        row: Schema.Decoder<T>,
        db: 'bible' | 'state' | 'egw' | 'topics',
        sql: string,
        params?: readonly unknown[],
      ) =>
        Effect.tryPromise({
          try: () => client.query(row, db, sql, params),
          catch: (cause) =>
            new DatabaseQueryError({
              cause,
              operation: `query(${db}, ${sql.slice(0, 80)})`,
            }),
        }),

      exec: (sql: string, params?: unknown[]) =>
        Effect.tryPromise({
          try: () => client.exec(sql, params),
          catch: (cause) =>
            new DatabaseQueryError({
              cause,
              operation: `exec(${sql.slice(0, 80)})`,
            }),
        }),

      exportState: () =>
        Effect.tryPromise({
          try: () => serializedExport(),
          catch: (cause) =>
            new WorkerError({
              cause,
              message: 'Failed to export state database',
              operation: 'exportState',
            }),
        }),

      isDirty: () =>
        Effect.tryPromise({
          try: () => serializedIsDirty(),
          catch: (cause) =>
            new WorkerError({
              cause,
              message: 'Failed to check dirty state',
              operation: 'isDirty',
            }),
        }),

      onExec: (cb) => client.onExec(cb),

      initializeTopics: () =>
        Effect.tryPromise({
          try: () => client.initTopics(),
          catch: (cause) =>
            new WorkerError({ cause, message: 'Failed to initialize topics', operation: 'topics' }),
        }),

      syncWritingsPublication: (bookCode) =>
        Effect.tryPromise({
          try: () => client.syncBook(bookCode),
          catch: (cause) =>
            new WorkerError({
              cause,
              message: `Failed to sync ${bookCode}`,
              operation: 'syncWritingsPublication',
            }),
        }),

      getWritingsSyncStatus: () =>
        Effect.tryPromise({
          try: () => client.getEgwSyncStatus(),
          catch: (cause) =>
            new WorkerError({
              cause,
              message: 'Failed to read Writings sync status',
              operation: 'getWritingsSyncStatus',
            }),
        }),

      syncAllWritings: () =>
        Effect.tryPromise({
          try: () => client.syncFullEgw(),
          catch: (cause) =>
            new WorkerError({
              cause,
              message: 'Failed to sync all Writings',
              operation: 'syncAllWritings',
            }),
        }),

      onWritingsSyncComplete: (callback) => client.onSyncComplete(callback),
    });
  });
}
