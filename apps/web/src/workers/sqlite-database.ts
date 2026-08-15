import { Effect, Option, Schema } from 'effect';

import * as SqliteHost from './sqlite-host.js';

export type SqliteRow = Record<string, SQLiteCompatibleType>;
export type WorkerSqliteApi = SqliteHost.WorkerSqliteApi;

export class SqliteDatabaseError extends Schema.TaggedError<SqliteDatabaseError>()(
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
  readonly close: Effect.Effect<void, SqliteDatabaseError>;
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
  readonly deactivate: Effect.Effect<void, SqliteDatabaseError>;
  readonly activeFilename: Option.Option<string>;
}

const hostOperation = <A>(filename: string, operation: string, evaluate: () => Promise<A>) =>
  Effect.tryPromise({
    try: evaluate,
    catch: (cause) => SqliteDatabaseError.make({ operation, filename, cause }),
  });

export const makeSqliteDatabase = (
  sqlite: WorkerSqliteApi,
  filename: string,
  vfsName: string,
): SqliteDatabase => {
  let handle = Option.none<number>();

  const requireHandle = (): Effect.Effect<number, SqliteDatabaseError> =>
    Option.match(handle, {
      onSome: (current) => Effect.succeed(current),
      onNone: () =>
        Effect.fail(
          SqliteDatabaseError.make({
            operation: 'require-open-database',
            filename,
            cause: 'database is not initialized',
          }),
        ),
    });

  const open = Effect.fn('SqliteDatabase.open')(function* (flags: number) {
    if (Option.isSome(handle)) {
      const current = handle.value;
      yield* hostOperation(filename, 'close-before-open', () => SqliteHost.close(sqlite, current));
    }
    handle = Option.some(
      yield* hostOperation(filename, 'open', () =>
        SqliteHost.open(sqlite, filename, flags, vfsName),
      ),
    );
  });

  const runClose = Effect.fn('SqliteDatabase.close')(function* () {
    if (Option.isNone(handle)) return;
    const current = handle.value;
    handle = Option.none();
    yield* hostOperation(filename, 'close', () => SqliteHost.close(sqlite, current));
  });
  const close = Effect.suspend(runClose);

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
      return Option.isSome(handle);
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
  let activeDatabase = Option.none<SqliteDatabase>();
  let filename = Option.none<string>();
  const requireActive = (): Effect.Effect<SqliteDatabase, SqliteDatabaseError> =>
    Option.match(activeDatabase, {
      onSome: (database) => Effect.succeed(database),
      onNone: () =>
        Effect.fail(
          SqliteDatabaseError.make({
            operation: 'require-active-generation',
            filename: '',
            cause: 'no SQLite generation is active',
          }),
        ),
    });
  const active: SqliteDatabase = {
    get isOpen() {
      return Option.exists(activeDatabase, (database) => database.isOpen);
    },
    open: (flags) => requireActive().pipe(Effect.flatMap((database) => database.open(flags))),
    close: Effect.suspend(() =>
      Option.match(activeDatabase, {
        onNone: () => Effect.void,
        onSome: (database) => database.close,
      }),
    ),
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
      if (
        Option.contains(filename, candidateFilename) &&
        Option.exists(activeDatabase, (database) => database.isOpen)
      ) {
        return;
      }
      const candidate = makeSqliteDatabase(sqlite, candidateFilename, vfsName);
      yield* candidate.open(flags);
      if (Option.isSome(activeDatabase)) yield* activeDatabase.value.close;
      activeDatabase = Option.some(candidate);
      filename = Option.some(candidateFilename);
    }),
    deactivate: Effect.suspend(
      Effect.fn('SqliteDatabaseFamily.deactivate')(function* () {
        if (Option.isSome(activeDatabase)) yield* activeDatabase.value.close;
        activeDatabase = Option.none();
        filename = Option.none();
      }),
    ),
    get activeFilename() {
      return filename;
    },
  };
};
