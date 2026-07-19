import { describe, expect, test } from 'bun:test';
import { preferences } from '@bible/core/local-first';
import { eq } from 'drizzle-orm';
import { Effect } from 'effect';

import type { SqliteDatabase } from './sqlite-database.js';
import { makeBrowserUserDatabase } from './user-state-database.js';

const makeDatabase = (events: string[]): SqliteDatabase => ({
  isOpen: true,
  open: () => Promise.resolve(),
  close: () => Promise.resolve(),
  exec: () => Promise.resolve(),
  query: () => Promise.resolve([]),
  values: (sql) => {
    events.push(`values:${sql}`);
    return Promise.resolve([['"dark"']]);
  },
  write: (sql) => {
    events.push(`write:${sql}`);
    return Promise.resolve(1);
  },
});

describe('browser user-state database', () => {
  test('uses Drizzle async SQLite proxy over the worker connection', async () => {
    const events: string[] = [];
    const database = makeBrowserUserDatabase({ database: makeDatabase(events) });

    const row = await database.drizzle
      .select({ value: preferences.value })
      .from(preferences)
      .where(eq(preferences.key, 'reading'))
      .get();

    expect(row).toEqual({ value: 'dark' });
    expect(events[0]).toStartWith('values:select');
  });

  test('applies the shared migration atomically on the same connection', async () => {
    const events: string[] = [];
    const database = makeBrowserUserDatabase({ database: makeDatabase(events) });

    await Effect.runPromise(
      database.migrate('CREATE TABLE first (id INTEGER); CREATE TABLE second (id INTEGER);'),
    );

    expect(events).toEqual([
      'write:begin',
      'write:CREATE TABLE first (id INTEGER)',
      'write:CREATE TABLE second (id INTEGER)',
      'write:commit',
    ]);
  });
});
