import { describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { ClientId, MutationId, preferences, Timestamp } from '@bible/core/local-first';
import {
  applyReadingPreferencesPatch,
  DEFAULT_READING_PREFERENCES,
} from '@bible/core/reading-preferences';
import { eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import type { SqliteDatabase } from './sqlite-database.js';
import { makeBrowserSyncStore, makeBrowserUserDatabase } from './user-state-database.js';

const migrationSql = await Bun.file(
  new URL(
    '../../../../packages/core/src/local-first/migrations/0001_user_state.sql',
    import.meta.url,
  ),
).text();

const clientId = Schema.decodeSync(ClientId);
const mutationId = Schema.decodeSync(MutationId);
const timestamp = Schema.decodeSync(Timestamp);

const toBinding = (value: unknown) => {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'bigint' ||
    typeof value === 'boolean' ||
    value instanceof Uint8Array
  ) {
    return value;
  }
  throw new TypeError('unsupported SQLite binding');
};

const makeRealDatabase = (client: Database): SqliteDatabase => ({
  isOpen: true,
  open: () => Promise.resolve(),
  close: () => Promise.resolve(),
  exec: (sql) => {
    client.exec(sql);
    return Promise.resolve();
  },
  query: () => Promise.resolve([]),
  values: (sql, params = []) => Promise.resolve(client.query(sql).values(...params.map(toBinding))),
  write: (sql, params = []) =>
    Promise.resolve(client.query(sql).run(...params.map(toBinding)).changes),
});

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

  test('runs the shared sync store over the async Drizzle proxy', async () => {
    const client = new Database(':memory:');
    const database = makeBrowserUserDatabase({ database: makeRealDatabase(client) });
    await Effect.runPromise(database.migrate(migrationSql));
    const store = makeBrowserSyncStore(database, clientId('browser-client'));
    const preferencesValue = applyReadingPreferencesPatch(DEFAULT_READING_PREFERENCES, {
      colorMode: 'dark',
      fontSizePx: 22,
    });

    const committed = await Effect.runPromise(
      store.mutate({
        clientId: clientId('browser-client'),
        mutationId: mutationId('browser-mutation-1'),
        command: { _tag: 'SetReadingPreferences', preferences: preferencesValue },
        createdAt: timestamp('2026-07-19T00:00:01.000Z'),
      }),
    );

    expect(Number(committed.envelope.sequence)).toBe(1);
    expect(await Effect.runPromise(store.readingPreferences)).toEqual(preferencesValue);
    expect(await Effect.runPromise(store.pending)).toEqual([committed.envelope]);
    expect(client.query('SELECT count(*) AS count FROM preferences').get()).toEqual({ count: 1 });
    expect(client.query('SELECT count(*) AS count FROM mutation_journal').get()).toEqual({
      count: 1,
    });
    client.close();
  });
});
