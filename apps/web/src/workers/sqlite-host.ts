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

export const open = (
  sqlite: WorkerSqliteApi,
  filename: string,
  flags: number,
  vfsName: string,
): Promise<number> => sqlite.open_v2(filename, flags, vfsName);

export const close = (sqlite: WorkerSqliteApi, handle: number): Promise<void> =>
  sqlite.close(handle).then(() => undefined);

export const query = async (
  sqlite: WorkerSqliteApi,
  handle: number,
  sql: string,
  params?: readonly unknown[],
): Promise<readonly SqliteRow[]> => {
  const rows: SqliteRow[] = [];
  for await (const statement of sqlite.statements(handle, sql)) {
    if (params !== undefined && params.length > 0) {
      sqlite.bind_collection(statement, params as (SQLiteCompatibleType | null)[]);
    }
    const columns = sqlite.column_names(statement);
    // oxlint-disable-next-line no-await-in-loop -- SQLite rows are cursor-ordered
    while ((await sqlite.step(statement)) === SQLite.SQLITE_ROW) {
      const row: SqliteRow = {};
      const values = sqlite.row(statement);
      for (let index = 0; index < columns.length; index += 1) {
        const column = columns[index];
        if (column !== undefined) row[column] = values[index];
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
  params?: readonly unknown[],
): Promise<readonly unknown[][]> => {
  const rows: unknown[][] = [];
  for await (const statement of sqlite.statements(handle, sql)) {
    if (params !== undefined && params.length > 0) {
      sqlite.bind_collection(statement, params as (SQLiteCompatibleType | null)[]);
    }
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
  params?: readonly unknown[],
): Promise<number> => {
  for await (const statement of sqlite.statements(handle, sql)) {
    if (params !== undefined && params.length > 0) {
      sqlite.bind_collection(statement, params as (SQLiteCompatibleType | null)[]);
    }
    await sqlite.step(statement);
  }
  return sqlite.changes(handle);
};

export const exec = (sqlite: WorkerSqliteApi, handle: number, sql: string): Promise<void> =>
  sqlite.exec(handle, sql).then(() => undefined);
