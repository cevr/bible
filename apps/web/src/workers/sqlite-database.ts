import { Effect, Schema } from 'effect';

import * as SqliteHost from './sqlite-host.js';

export type SqliteRow = Record<string, unknown>;
export type WorkerSqliteApi = SqliteHost.WorkerSqliteApi;

export class SqliteDatabaseError extends Schema.TaggedErrorClass<SqliteDatabaseError>()(
  'SqliteDatabaseError',
  {
    operation: Schema.String,
    filename: Schema.String,
    cause: Schema.Unknown,
  },
) {}

/** Mutable connection to one named SQLite file inside the worker VFS. */
export interface SqliteDatabase {
  readonly isOpen: boolean;
  readonly open: (flags: number) => Effect.Effect<void, SqliteDatabaseError>;
  readonly close: () => Effect.Effect<void, SqliteDatabaseError>;
  readonly query: (
    sql: string,
    params?: readonly unknown[],
  ) => Effect.Effect<readonly SqliteRow[], SqliteDatabaseError>;
  readonly values: (
    sql: string,
    params?: readonly unknown[],
  ) => Effect.Effect<readonly unknown[][], SqliteDatabaseError>;
  readonly write: (
    sql: string,
    params?: readonly unknown[],
  ) => Effect.Effect<number, SqliteDatabaseError>;
  readonly exec: (sql: string) => Effect.Effect<void, SqliteDatabaseError>;
}

export interface SqliteDatabaseFamily {
  readonly active: SqliteDatabase;
  readonly candidate: (filename: string) => SqliteDatabase;
  readonly activate: (filename: string, flags: number) => Effect.Effect<void, SqliteDatabaseError>;
  readonly deactivate: () => Effect.Effect<void, SqliteDatabaseError>;
  readonly activeFilename: string | undefined;
}

const hostOperation = <A>(filename: string, operation: string, evaluate: () => Promise<A>) =>
  Effect.tryPromise({
    try: evaluate,
    catch: (cause) => new SqliteDatabaseError({ operation, filename, cause }),
  });

export const makeSqliteDatabase = (
  sqlite: WorkerSqliteApi,
  filename: string,
  vfsName: string,
): SqliteDatabase => {
  let handle: number | null = null;

  const requireHandle = (): Effect.Effect<number, SqliteDatabaseError> => {
    if (handle !== null) return Effect.succeed(handle);
    return Effect.fail(
      new SqliteDatabaseError({
        operation: 'require-open-database',
        filename,
        cause: 'database is not initialized',
      }),
    );
  };

  const open = Effect.fn('SqliteDatabase.open')(function* (flags: number) {
    if (handle !== null) {
      const current = handle;
      yield* hostOperation(filename, 'close-before-open', () => SqliteHost.close(sqlite, current));
    }
    handle = yield* hostOperation(filename, 'open', () =>
      SqliteHost.open(sqlite, filename, flags, vfsName),
    );
  });

  const close = Effect.fn('SqliteDatabase.close')(function* () {
    if (handle === null) return;
    const current = handle;
    handle = null;
    yield* hostOperation(filename, 'close', () => SqliteHost.close(sqlite, current));
  });

  const query: SqliteDatabase['query'] = (sql, params) =>
    requireHandle().pipe(
      Effect.flatMap((current) =>
        hostOperation(filename, 'query', () => SqliteHost.query(sqlite, current, sql, params)),
      ),
    );

  const values: SqliteDatabase['values'] = (sql, params) =>
    requireHandle().pipe(
      Effect.flatMap((current) =>
        hostOperation(filename, 'values', () => SqliteHost.values(sqlite, current, sql, params)),
      ),
    );

  const write: SqliteDatabase['write'] = (sql, params) =>
    requireHandle().pipe(
      Effect.flatMap((current) =>
        hostOperation(filename, 'write', () => SqliteHost.write(sqlite, current, sql, params)),
      ),
    );

  const exec: SqliteDatabase['exec'] = (sql) =>
    requireHandle().pipe(
      Effect.flatMap((current) =>
        hostOperation(filename, 'exec', () => SqliteHost.exec(sqlite, current, sql)),
      ),
    );

  return {
    get isOpen() {
      return handle !== null;
    },
    open,
    close,
    query,
    values,
    write,
    exec,
  };
};

/** Keeps readers on one verified database while another named generation is prepared. */
export const makeSqliteDatabaseFamily = (
  sqlite: WorkerSqliteApi,
  vfsName: string,
): SqliteDatabaseFamily => {
  let activeDatabase: SqliteDatabase | undefined;
  let filename: string | undefined;
  const requireActive = (): Effect.Effect<SqliteDatabase, SqliteDatabaseError> => {
    if (activeDatabase !== undefined) return Effect.succeed(activeDatabase);
    return Effect.fail(
      new SqliteDatabaseError({
        operation: 'require-active-generation',
        filename: '',
        cause: 'no SQLite generation is active',
      }),
    );
  };
  const active: SqliteDatabase = {
    get isOpen() {
      if (activeDatabase === undefined) return false;
      return activeDatabase.isOpen;
    },
    open: (flags) => requireActive().pipe(Effect.flatMap((database) => database.open(flags))),
    close: () => {
      if (activeDatabase === undefined) return Effect.void;
      return activeDatabase.close();
    },
    query: (sql, params) =>
      requireActive().pipe(Effect.flatMap((database) => database.query(sql, params))),
    values: (sql, params) =>
      requireActive().pipe(Effect.flatMap((database) => database.values(sql, params))),
    write: (sql, params) =>
      requireActive().pipe(Effect.flatMap((database) => database.write(sql, params))),
    exec: (sql) => requireActive().pipe(Effect.flatMap((database) => database.exec(sql))),
  };
  return {
    active,
    candidate: (candidateFilename) => makeSqliteDatabase(sqlite, candidateFilename, vfsName),
    activate: Effect.fn('SqliteDatabaseFamily.activate')(function* (candidateFilename, flags) {
      if (filename === candidateFilename && activeDatabase?.isOpen === true) return;
      const candidate = makeSqliteDatabase(sqlite, candidateFilename, vfsName);
      yield* candidate.open(flags);
      if (activeDatabase !== undefined) yield* activeDatabase.close();
      activeDatabase = candidate;
      filename = candidateFilename;
    }),
    deactivate: Effect.fn('SqliteDatabaseFamily.deactivate')(function* () {
      if (activeDatabase !== undefined) yield* activeDatabase.close();
      activeDatabase = undefined;
      filename = undefined;
    }),
    get activeFilename() {
      return filename;
    },
  };
};
