import * as BunServices from '@effect/platform-bun/BunServices';
import { eq } from 'drizzle-orm';
import { Effect, FileSystem, Path } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import { makeBunUserDatabase } from './database-bun.js';
import { bookmarks } from './schema.js';

const migrationSql = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  return yield* fs.readFileString(path.join(import.meta.dir, 'migrations/0001_user_state.sql'));
});

const makeDatabase = Effect.gen(function* () {
  const database = yield* Effect.acquireRelease(
    Effect.sync(() => makeBunUserDatabase()),
    (opened) => opened.close,
  );
  yield* database.migrate(yield* migrationSql);
  return database;
});

describe('local-first SQLite foundation', () => {
  const test = it.scopedLive.layer(BunServices.layer);
  test('migrates every user-state and sync table into an isolated database', () =>
    Effect.gen(function* () {
      const database = yield* makeDatabase;

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
          'migration_diagnostics',
          'migration_receipts',
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
    }));

  test('adapts typed Drizzle run, all, get, and transaction operations into Effect', () =>
    Effect.gen(function* () {
      const database = yield* makeDatabase;
      const now = '2026-07-19T00:00:00.000Z';

      yield* database.bridge.run({
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
      });

      const bookmark = yield* database.bridge.get({
        execute: () =>
          database.drizzle.select().from(bookmarks).where(eq(bookmarks.id, 'bookmark-1')).get(),
      });
      const all = yield* database.bridge.all({
        execute: () => database.drizzle.select().from(bookmarks).all(),
      });

      expect(bookmark?.label).toBe('Promise');
      expect(all).toHaveLength(1);

      const failure = yield* Effect.exit(
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
          return database.drizzle
            .insert(bookmarks)
            .values({
              id: 'bookmark-1',
              source: 'bible',
              resourceId: 'KJV',
              location: 'John.3.16',
              createdAt: now,
              updatedAt: now,
            })
            .run();
        }),
      );

      expect(failure._tag).toBe('Failure');
      expect(
        database.drizzle.select().from(bookmarks).where(eq(bookmarks.id, 'bookmark-2')).get(),
      ).toBeUndefined();
    }));
});
