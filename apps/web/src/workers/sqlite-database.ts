import * as SQLite from 'wa-sqlite';

export type SqliteRow = Record<string, unknown>;
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

/** Mutable connection to one named SQLite file inside the worker VFS. */
export interface SqliteDatabase {
  readonly isOpen: boolean;
  readonly open: (flags: number) => Promise<void>;
  readonly close: () => Promise<void>;
  readonly query: (sql: string, params?: readonly unknown[]) => Promise<readonly SqliteRow[]>;
  readonly values: (sql: string, params?: readonly unknown[]) => Promise<readonly unknown[][]>;
  readonly write: (sql: string, params?: readonly unknown[]) => Promise<number>;
  readonly exec: (sql: string) => Promise<void>;
}

export const makeSqliteDatabase = (
  sqlite: WorkerSqliteApi,
  filename: string,
  vfsName: string,
): SqliteDatabase => {
  let handle: number | null = null;

  const requireHandle = (): number => {
    if (handle === null) throw new Error(`Database '${filename}' is not initialized`);
    return handle;
  };

  const open = async (flags: number): Promise<void> => {
    if (handle !== null) await sqlite.close(handle);
    handle = await sqlite.open_v2(filename, flags, vfsName);
  };

  const close = async (): Promise<void> => {
    if (handle === null) return;
    const current = handle;
    handle = null;
    await sqlite.close(current);
  };

  const query = async (sql: string, params?: readonly unknown[]): Promise<readonly SqliteRow[]> => {
    const rows: SqliteRow[] = [];
    for await (const statement of sqlite.statements(requireHandle(), sql)) {
      if (params?.length) {
        sqlite.bind_collection(statement, params as (SQLiteCompatibleType | null)[]);
      }
      const columns = sqlite.column_names(statement);
      // eslint-disable-next-line no-await-in-loop -- SQLite statements are sequential
      while ((await sqlite.step(statement)) === SQLite.SQLITE_ROW) {
        const row: SqliteRow = {};
        const values = sqlite.row(statement);
        for (let index = 0; index < columns.length; index++) {
          const column = columns[index];
          if (column !== undefined) row[column] = values[index];
        }
        rows.push(row);
      }
    }
    return rows;
  };

  const values = async (
    sql: string,
    params?: readonly unknown[],
  ): Promise<readonly unknown[][]> => {
    const rows: unknown[][] = [];
    for await (const statement of sqlite.statements(requireHandle(), sql)) {
      if (params?.length) {
        sqlite.bind_collection(statement, params as (SQLiteCompatibleType | null)[]);
      }
      // eslint-disable-next-line no-await-in-loop -- SQLite statements are sequential
      while ((await sqlite.step(statement)) === SQLite.SQLITE_ROW) {
        rows.push([...sqlite.row(statement)]);
      }
    }
    return rows;
  };

  const write = async (sql: string, params?: readonly unknown[]): Promise<number> => {
    const current = requireHandle();
    for await (const statement of sqlite.statements(current, sql)) {
      if (params?.length) {
        sqlite.bind_collection(statement, params as (SQLiteCompatibleType | null)[]);
      }
      // eslint-disable-next-line no-await-in-loop -- SQLite statements are sequential
      await sqlite.step(statement);
    }
    return sqlite.changes(current);
  };

  const exec = async (sql: string): Promise<void> => {
    await sqlite.exec(requireHandle(), sql);
  };

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
