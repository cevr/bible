import { Database } from 'bun:sqlite';
import { ClientId, MutationId, preferences, Timestamp } from '@bible/core/local-first';
import migrationSql from '@bible/core/local-first/migrations/0001_user_state.sql?raw';
import {
  applyReadingPreferencesPatch,
  DEFAULT_READING_PREFERENCES,
} from '@bible/core/reading-preferences';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, Schema } from 'effect';

import { SqliteDatabaseError, type SqliteDatabase } from './sqlite-database.js';
import { makeBrowserSyncStore, makeBrowserUserDatabase } from './user-state-database.js';

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
  return Effect.runSync(Effect.die(new TypeError('unsupported SQLite binding')));
};

const databaseFailure = (operation: string, cause: unknown): SqliteDatabaseError =>
  new SqliteDatabaseError({ operation, filename: ':memory:', cause });

const makeRealDatabase = (client: Database): SqliteDatabase => ({
  isOpen: true,
  open: () => Effect.void,
  close: () => Effect.void,
  exec: (sql) =>
    Effect.try({
      try: () => client.exec(sql),
      catch: (cause) => databaseFailure('exec', cause),
    }).pipe(Effect.asVoid),
  query: () => Effect.succeed([]),
  values: (sql, params = []) =>
    Effect.try({
      try: () => client.query(sql).values(...params.map(toBinding)),
      catch: (cause) => databaseFailure('values', cause),
    }),
  write: (sql, params = []) =>
    Effect.try({
      try: () => client.query(sql).run(...params.map(toBinding)).changes,
      catch: (cause) => databaseFailure('write', cause),
    }),
});

const makeDatabase = (events: string[]): SqliteDatabase => ({
  isOpen: true,
  open: () => Effect.void,
  close: () => Effect.void,
  exec: () => Effect.void,
  query: () => Effect.succeed([]),
  values: (sql) =>
    Effect.sync(() => {
      events.push(`values:${sql}`);
      return [['"dark"']];
    }),
  write: (sql) =>
    Effect.sync(() => {
      events.push(`write:${sql}`);
      return 1;
    }),
});

describe('browser user-state database', () => {
  it.effect('uses Drizzle async SQLite proxy over the worker connection', () =>
    Effect.gen(function* () {
      const events: string[] = [];
      const database = makeBrowserUserDatabase({ database: makeDatabase(events) });

      const row = yield* Effect.tryPromise(() =>
        database.drizzle
          .select({ value: preferences.value })
          .from(preferences)
          .where(eq(preferences.key, 'reading'))
          .get(),
      );

      expect(row).toEqual({ value: 'dark' });
      expect(events[0]).toStartWith('values:select');
    }),
  );

  it.effect('applies the shared migration atomically on the same connection', () =>
    Effect.gen(function* () {
      const events: string[] = [];
      const database = makeBrowserUserDatabase({ database: makeDatabase(events) });

      yield* database.migrate('CREATE TABLE first (id INTEGER); CREATE TABLE second (id INTEGER);');

      expect(events).toEqual([
        'write:begin',
        'write:CREATE TABLE first (id INTEGER)',
        'write:CREATE TABLE second (id INTEGER)',
        'write:commit',
      ]);
    }),
  );

  it.scoped('runs the shared sync store over the async Drizzle proxy', () =>
    Effect.gen(function* () {
      const client = yield* Effect.acquireRelease(
        Effect.sync(() => new Database(':memory:')),
        (database) => Effect.sync(() => database.close()),
      );
      const database = makeBrowserUserDatabase({ database: makeRealDatabase(client) });
      yield* database.migrate(migrationSql);
      const store = makeBrowserSyncStore(database, clientId('browser-client'));
      const preferencesValue = applyReadingPreferencesPatch(DEFAULT_READING_PREFERENCES, {
        colorMode: 'dark',
        fontSizePx: 22,
      });

      const committed = yield* store.mutate({
        clientId: clientId('browser-client'),
        mutationId: mutationId('browser-mutation-1'),
        command: { _tag: 'SetReadingPreferences', preferences: preferencesValue },
        createdAt: timestamp('2026-07-19T00:00:01.000Z'),
      });

      expect(Number(committed.envelope.sequence)).toBe(1);
      expect(yield* store.readingPreferences).toEqual(preferencesValue);
      expect(yield* store.pending).toEqual([committed.envelope]);
      expect(client.query('SELECT count(*) AS count FROM preferences').get()).toEqual({ count: 1 });
      expect(client.query('SELECT count(*) AS count FROM mutation_journal').get()).toEqual({
        count: 1,
      });
    }),
  );
});
