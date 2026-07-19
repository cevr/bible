import { describe, expect, it } from 'bun:test';

import type { SqliteDatabase } from './sqlite-database.js';
import { makeStateDatabase, type StateFileDirectory } from './state-database.js';

const makeDatabase = (events: string[], failWrites = false): SqliteDatabase => ({
  isOpen: false,
  open: async () => {
    events.push('open');
  },
  close: async () => {},
  query: async (sql) => {
    events.push(`query:${sql}`);
    return [{ value: 1 }];
  },
  values: async (sql) => {
    events.push(`values:${sql}`);
    return [[1]];
  },
  write: async (sql) => {
    events.push(`write:${sql}`);
    if (failWrites) throw new Error('write failed');
    return 1;
  },
  exec: async (sql) => {
    events.push(`exec:${sql}`);
    if (sql.startsWith('ALTER TABLE')) throw new Error('column already exists');
  },
});

describe('worker state database', () => {
  it('owns schema initialization and tolerates already-applied migrations', async () => {
    const events: string[] = [];
    const state = makeStateDatabase({ database: makeDatabase(events) });

    await state.initialize();

    expect(events[0]).toBe('open');
    expect(events[1]).toBe('exec:PRAGMA foreign_keys = ON');
    expect(events[2]).toContain('CREATE TABLE IF NOT EXISTS position');
    expect(events.filter((event) => event.startsWith('exec:ALTER TABLE'))).toHaveLength(4);
  });

  it('marks state dirty only after a successful write', async () => {
    const successful = makeStateDatabase({ database: makeDatabase([]) });
    const failing = makeStateDatabase({ database: makeDatabase([], true) });

    expect(successful.isDirty()).toBe(false);
    expect(await successful.execute('UPDATE position SET book = 2')).toBe(1);
    expect(successful.isDirty()).toBe(true);

    const error = await failing.execute('UPDATE position SET book = 2').then(
      () => undefined,
      (cause: unknown) => cause,
    );
    expect(error).toEqual(new Error('write failed'));
    expect(failing.isDirty()).toBe(false);
  });

  it('delegates reads through the database boundary', async () => {
    const state = makeStateDatabase({ database: makeDatabase([]) });

    expect(await state.query('SELECT value FROM preferences')).toEqual([{ value: 1 }]);
  });

  it('clears dirty state only after exporting the persisted file', async () => {
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    const directory: StateFileDirectory = {
      getFileHandle: async (filename) => {
        expect(filename).toBe('state.db');
        return { getFile: async () => ({ arrayBuffer: async () => bytes }) };
      },
    };
    const state = makeStateDatabase({
      database: makeDatabase([]),
      getStorageRoot: async () => directory,
    });
    await state.execute('UPDATE position SET book = 2');

    expect(state.isDirty()).toBe(true);
    expect(await state.exportFile()).toBe(bytes);
    expect(state.isDirty()).toBe(false);
  });
});
