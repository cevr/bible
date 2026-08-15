import { Predicate } from 'effect';
import * as SQLite from 'wa-sqlite';

import type { SqliteRow } from './sqlite-database.js';

export type WorkerSqliteApi = Pick<
  SQLiteAPI,
  | 'bind_collection'
  | 'changes'
  | 'close'
  | 'column_names'
  | 'exec'
  | 'open_v2'
  | 'row'
  | 'statements'
  | 'step'
>;

const bindParams = (
  sqlite: WorkerSqliteApi,
  statement: number,
  params: readonly unknown[],
): void => {
  if (params.length > 0) sqlite.bind_collection(statement, params as SQLiteCompatibleType[]);
};

export const open = (
  sqlite: WorkerSqliteApi,
  filename: string,
  flags: number,
  vfsName: string,
): Promise<number> => sqlite.open_v2(filename, flags, vfsName);

export const close = (sqlite: WorkerSqliteApi, handle: number): Promise<void> =>
  sqlite.close(handle).then(() => {});

export const query = async (
  sqlite: WorkerSqliteApi,
  handle: number,
  sql: string,
  params: readonly unknown[] = [],
): Promise<readonly SqliteRow[]> => {
  const rows: SqliteRow[] = [];
  for await (const statement of sqlite.statements(handle, sql)) {
    bindParams(sqlite, statement, params);
    const columns = sqlite.column_names(statement);
    // oxlint-disable-next-line no-await-in-loop -- SQLite rows are cursor-ordered
    while ((await sqlite.step(statement)) === SQLite.SQLITE_ROW) {
      const row: SqliteRow = {};
      for (const [index, value] of sqlite.row(statement).entries()) {
        const column = columns[index];
        if (Predicate.isString(column)) row[column] = value;
      }
      rows.push(row);
    }
  }
  return rows;
};

export const values = async (
  sqlite: WorkerSqliteApi,
  handle: number,
  sql: string,
  params: readonly unknown[] = [],
): Promise<readonly unknown[][]> => {
  const rows: unknown[][] = [];
  for await (const statement of sqlite.statements(handle, sql)) {
    bindParams(sqlite, statement, params);
    // oxlint-disable-next-line no-await-in-loop -- SQLite rows are cursor-ordered
    while ((await sqlite.step(statement)) === SQLite.SQLITE_ROW) {
      rows.push([...sqlite.row(statement)]);
    }
  }
  return rows;
};

export const write = async (
  sqlite: WorkerSqliteApi,
  handle: number,
  sql: string,
  params: readonly unknown[] = [],
): Promise<number> => {
  for await (const statement of sqlite.statements(handle, sql)) {
    bindParams(sqlite, statement, params);
    await sqlite.step(statement);
  }
  return sqlite.changes(handle);
};

export const exec = (sqlite: WorkerSqliteApi, handle: number, sql: string): Promise<void> =>
  sqlite.exec(handle, sql).then(() => {});
