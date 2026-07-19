import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { Effect } from 'effect';

import { makeBunUserDatabase } from './database-bun.js';
import { bookmarks } from './schema.js';

const migrationSql = await Bun.file(
  new URL('./migrations/0001_user_state.sql', import.meta.url),
).text();

describe('local-first SQLite foundation', () => {
  test('migrates every user-state and sync table into an isolated database', async () => {
    const database = makeBunUserDatabase();

    await Effect.runPromise(database.migrate(migrationSql));

    const rows = database.client
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      )
      .all();
    const tableNames = rows.map((row) => row.name);

    expect(tableNames).toEqual(
      expect.arrayContaining([
        'bookmarks',
        'collection_members',
        'collections',
        'markers',
        'memory_verses',
        'mutation_journal',
        'notes',
        'practice_history',
        'preferences',
        'reading_history',
        'reading_plan_progress',
        'reading_plans',
        'reading_positions',
        'server_revisions',
        'sync_clients',
        'sync_metadata',
        'tombstones',
        'user_cross_references',
      ]),
    );

    await Effect.runPromise(database.close);
  });

  test('adapts typed Drizzle run, all, get, and transaction operations into Effect', async () => {
    const database = makeBunUserDatabase();
    await Effect.runPromise(database.migrate(migrationSql));
    const now = '2026-07-19T00:00:00.000Z';

    await Effect.runPromise(
      database.bridge.run({
        execute: () =>
          database.drizzle.insert(bookmarks).values({
            id: 'bookmark-1',
            source: 'bible',
            resourceId: 'KJV',
            location: 'John.3.16',
            label: 'Promise',
            createdAt: now,
            updatedAt: now,
          }),
      }),
    );

    const bookmark = await Effect.runPromise(
      database.bridge.get({
        execute: () =>
          database.drizzle.select().from(bookmarks).where(eq(bookmarks.id, 'bookmark-1')).get(),
      }),
    );
    const all = await Effect.runPromise(
      database.bridge.all({
        execute: () => database.drizzle.select().from(bookmarks).all(),
      }),
    );

    expect(bookmark?.label).toBe('Promise');
    expect(all).toHaveLength(1);

    const failure = await Effect.runPromiseExit(
      database.bridge.transaction(() => {
        database.drizzle
          .insert(bookmarks)
          .values({
            id: 'bookmark-2',
            source: 'bible',
            resourceId: 'KJV',
            location: 'Psalm.23.1',
            createdAt: now,
            updatedAt: now,
          })
          .run();
        throw new Error('rollback');
      }),
    );

    expect(failure._tag).toBe('Failure');
    expect(
      database.drizzle.select().from(bookmarks).where(eq(bookmarks.id, 'bookmark-2')).get(),
    ).toBeUndefined();

    await Effect.runPromise(database.close);
  });
});
