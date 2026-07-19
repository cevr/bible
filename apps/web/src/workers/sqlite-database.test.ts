import { describe, expect, it } from 'bun:test';
import * as SQLite from 'wa-sqlite';

import { makeSqliteDatabase, type WorkerSqliteApi } from './sqlite-database.js';

const makeApi = (events: string[]): WorkerSqliteApi => {
  let stepped = false;
  return {
    open_v2: async (filename, flags, vfs) => {
      events.push(`open:${filename}:${String(flags)}:${vfs ?? ''}`);
      return 7;
    },
    close: async (handle) => {
      events.push(`close:${String(handle)}`);
      return SQLite.SQLITE_OK;
    },
    statements: async function* (_handle, sql) {
      events.push(`statements:${sql}`);
      stepped = false;
      yield 11;
    },
    bind_collection: (_statement, values) => {
      events.push(`bind:${String(values.length)}`);
      return SQLite.SQLITE_OK;
    },
    column_names: () => ['value'],
    step: async () => {
      if (stepped) return SQLite.SQLITE_DONE;
      stepped = true;
      return SQLite.SQLITE_ROW;
    },
    row: () => [42],
    changes: () => 3,
    exec: async (_handle, sql) => {
      events.push(`exec:${sql}`);
      return SQLite.SQLITE_OK;
    },
  };
};

describe('worker SQLite database adapter', () => {
  it('owns a replaceable connection and maps rows by column name', async () => {
    const events: string[] = [];
    const database = makeSqliteDatabase(makeApi(events), 'state.db', 'opfs');

    expect(database.isOpen).toBe(false);
    await database.open(SQLite.SQLITE_OPEN_READWRITE);
    expect(database.isOpen).toBe(true);
    expect(await database.query('SELECT value', [1])).toEqual([{ value: 42 }]);
    expect(await database.values('SELECT value', [1])).toEqual([[42]]);
    await database.close();
    expect(database.isOpen).toBe(false);
    expect(events).toEqual([
      `open:state.db:${String(SQLite.SQLITE_OPEN_READWRITE)}:opfs`,
      'statements:SELECT value',
      'bind:1',
      'statements:SELECT value',
      'bind:1',
      'close:7',
    ]);
  });

  it('reports write changes and executes schema SQL on the active handle', async () => {
    const database = makeSqliteDatabase(makeApi([]), 'state.db', 'opfs');
    await database.open(SQLite.SQLITE_OPEN_READWRITE);

    expect(await database.write('UPDATE value SET n = ?', [2])).toBe(3);
    expect(await database.exec('CREATE TABLE value (n INTEGER)')).toBeUndefined();
  });
});
