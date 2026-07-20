import { describe, expect, it } from 'effect-bun-test';
import { Effect, Stream } from 'effect';
import * as SQLite from 'wa-sqlite';

import {
  makeSqliteDatabase,
  makeSqliteDatabaseFamily,
  type WorkerSqliteApi,
} from './sqlite-database.js';

const makeApi = (events: string[]): WorkerSqliteApi => {
  let stepped = false;
  return {
    open_v2: (filename, flags, vfs) =>
      Effect.runPromise(
        Effect.sync(() => {
          events.push(`open:${filename}:${String(flags)}:${vfs ?? ''}`);
          return 7;
        }),
      ),
    close: (handle) =>
      Effect.runPromise(
        Effect.sync(() => {
          events.push(`close:${String(handle)}`);
          return SQLite.SQLITE_OK;
        }),
      ),
    statements: (_handle, sql) => {
      events.push(`statements:${sql}`);
      stepped = false;
      return Stream.toAsyncIterable(Stream.make(11));
    },
    bind_collection: (_statement, values) => {
      events.push(`bind:${String(values.length)}`);
      return SQLite.SQLITE_OK;
    },
    column_names: () => ['value'],
    step: () =>
      Effect.runPromise(
        Effect.sync(() => {
          if (stepped) return SQLite.SQLITE_DONE;
          stepped = true;
          return SQLite.SQLITE_ROW;
        }),
      ),
    row: () => [42],
    changes: () => 3,
    exec: (_handle, sql) =>
      Effect.runPromise(
        Effect.sync(() => {
          events.push(`exec:${sql}`);
          return SQLite.SQLITE_OK;
        }),
      ),
  };
};

describe('worker SQLite database adapter', () => {
  it.effect('owns a replaceable connection and maps rows by column name', () =>
    Effect.gen(function* () {
      const events: string[] = [];
      const database = makeSqliteDatabase(makeApi(events), 'state.db', 'opfs');

      expect(database.isOpen).toBe(false);
      yield* database.open(SQLite.SQLITE_OPEN_READWRITE);
      expect(database.isOpen).toBe(true);
      expect(yield* database.query('SELECT value', [1])).toEqual([{ value: 42 }]);
      expect(yield* database.values('SELECT value', [1])).toEqual([[42]]);
      yield* database.close();
      expect(database.isOpen).toBe(false);
      expect(events).toEqual([
        `open:state.db:${String(SQLite.SQLITE_OPEN_READWRITE)}:opfs`,
        'statements:SELECT value',
        'bind:1',
        'statements:SELECT value',
        'bind:1',
        'close:7',
      ]);
    }),
  );

  it.effect('reports write changes and executes schema SQL on the active handle', () =>
    Effect.gen(function* () {
      const database = makeSqliteDatabase(makeApi([]), 'state.db', 'opfs');
      yield* database.open(SQLite.SQLITE_OPEN_READWRITE);

      expect(yield* database.write('UPDATE value SET n = ?', [2])).toBe(3);
      expect(yield* database.exec('CREATE TABLE value (n INTEGER)')).toBeUndefined();
    }),
  );

  it.effect('opens a candidate before replacing the active generation', () =>
    Effect.gen(function* () {
      const events: string[] = [];
      const family = makeSqliteDatabaseFamily(makeApi(events), 'opfs');
      yield* family.activate('bible-v1.db', SQLite.SQLITE_OPEN_READWRITE);
      yield* family.activate('bible-v2.db', SQLite.SQLITE_OPEN_READWRITE);

      expect(family.activeFilename).toBe('bible-v2.db');
      expect(family.active.isOpen).toBe(true);
      expect(events.filter((event) => event.startsWith('open:'))).toEqual([
        `open:bible-v1.db:${String(SQLite.SQLITE_OPEN_READWRITE)}:opfs`,
        `open:bible-v2.db:${String(SQLite.SQLITE_OPEN_READWRITE)}:opfs`,
      ]);
      expect(events).toContain('close:7');

      yield* family.deactivate();
      expect(family.activeFilename).toBeUndefined();
    }),
  );
});
