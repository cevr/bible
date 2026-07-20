import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';

import { Effect, FileSystem, Path, Schema } from 'effect';

import { makeBunSyncStore, makeBunUserDatabase } from './database-bun.js';
import {
  CopyOnMigrateError,
  copyOnMigrate,
  type CanonicalGenerationAdapter,
} from './copy-on-migrate.js';
import { MigrationSourceId } from './legacy-migration.js';
import { ClientId, MutationId, NoteId, Timestamp } from './model.js';
import { SyncStoreError } from './sync-store.js';

const migrationSql = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  return yield* fs.readFileString(path.join(import.meta.dir, 'migrations/0001_user_state.sql'));
});

const makeDirectory = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs.makeTempDirectoryScoped({ prefix: 'bible-copy-on-migrate-' });
});

const clientId = Schema.decodeSync(ClientId)('migration-test');
const sourceId = Schema.decodeSync(MigrationSourceId)('legacy-test');
const timestamp = Schema.decodeSync(Timestamp)('2026-07-19T00:00:00.000Z');

const makeAdapterWithPlatform = (
  directory: string,
  path: Path.Path,
  migration: string,
  fail: 'none' | 'import' | 'verify' | 'activate' = 'none',
) => {
  let active: string | undefined;
  const databases = new Map<string, ReturnType<typeof makeBunUserDatabase>>();
  const events: string[] = [];
  const open = (generation: string) =>
    Effect.gen(function* () {
      const database = makeBunUserDatabase(path.join(directory, `${generation}.sqlite`));
      if (!databases.has(generation)) yield* database.migrate(migration);
      databases.set(generation, database);
      return {
        store: makeBunSyncStore(database, clientId),
        close: database.close,
      };
    }).pipe(
      Effect.mapError(
        (cause) =>
          new CopyOnMigrateError({
            operation: 'open',
            message: 'test generation could not open',
            cause,
          }),
      ),
    );
  const adapter: CanonicalGenerationAdapter = {
    activeGeneration: Effect.sync(() => active),
    discardInactive: (current) =>
      Effect.sync(() => {
        events.push(`discard:${current ?? 'none'}`);
      }),
    create: (generation) =>
      open(generation).pipe(
        Effect.map((target) => {
          if (fail !== 'import') return target;
          return {
            ...target,
            store: {
              ...target.store,
              importLegacy: () =>
                Effect.fail(
                  new SyncStoreError({
                    operation: 'importLegacy',
                    message: 'forced import failure',
                  }),
                ),
            },
          };
        }),
      ),
    open,
    verify: (_generation, receipts) =>
      Effect.gen(function* () {
        events.push(`verify:${String(receipts.length)}`);
        if (fail === 'verify') {
          return yield* new CopyOnMigrateError({
            operation: 'verify',
            message: 'forced verification failure',
          });
        }
      }),
    activate: (generation) =>
      Effect.gen(function* () {
        events.push(`activate:${generation}`);
        if (fail === 'activate') {
          return yield* new CopyOnMigrateError({
            operation: 'activate',
            message: 'forced activation failure',
          });
        }
        active = generation;
      }),
  };
  return { adapter, events, active: () => active };
};

const makeAdapter = (directory: string, fail: 'none' | 'import' | 'verify' | 'activate' = 'none') =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    return makeAdapterWithPlatform(directory, path, yield* migrationSql, fail);
  });

const run = (adapter: CanonicalGenerationAdapter, generation: string) =>
  copyOnMigrate({
    generation,
    adapter,
    sources: [
      {
        sourceId,
        fingerprint: 'sha256:fixture',
        commands: [
          {
            _tag: 'SaveNote',
            noteId: Schema.decodeSync(NoteId)('legacy-note'),
            source: 'bible',
            resourceId: 'KJV',
            location: '/bible/43/3/16',
            content: 'preserved',
          },
        ],
        diagnostics: [],
        semanticCounts: [{ entity: 'notes', count: 1 }],
      },
    ],
    mutationId: (_source, index) => Schema.decodeSync(MutationId)(`migration-${String(index)}`),
    mutationTimestamp: () => timestamp,
    completedAt: timestamp,
  });

describe('copy-on-migrate activation', () => {
  const test = it.scopedLive.layer(BunServices.layer);
  test('activates only after close, reopen, receipt verification, and semantic verification', () =>
    Effect.gen(function* () {
      const directory = yield* makeDirectory;
      const harness = yield* makeAdapter(directory);
      const result = yield* run(harness.adapter, 'generation-complete');

      expect(result.activated).toBe(true);
      expect(result.receipts).toHaveLength(1);
      expect(harness.events).toEqual(['discard:none', 'verify:1', 'activate:generation-complete']);
      expect(harness.active()).toBe('generation-complete');
    }));

  test('returns an already-active generation without rebuilding it', () =>
    Effect.gen(function* () {
      const directory = yield* makeDirectory;
      const harness = yield* makeAdapter(directory);
      yield* run(harness.adapter, 'generation-stable');
      harness.events.splice(0);

      const second = yield* run(harness.adapter, 'generation-stable');

      expect(second).toEqual({ generation: 'generation-stable', activated: false, receipts: [] });
      expect(harness.events).toEqual([]);
    }));

  test('keeps an active canonical generation authoritative when legacy fingerprints change', () =>
    Effect.gen(function* () {
      const directory = yield* makeDirectory;
      const harness = yield* makeAdapter(directory);
      yield* run(harness.adapter, 'generation-canonical');
      harness.events.splice(0);

      const second = yield* run(harness.adapter, 'generation-from-changed-legacy');

      expect(second).toEqual({
        generation: 'generation-canonical',
        activated: false,
        receipts: [],
      });
      expect(harness.events).toEqual([]);
      expect(harness.active()).toBe('generation-canonical');
    }));

  for (const failure of ['import', 'verify', 'activate'] as const) {
    test(`never activates after a ${failure} failure`, () =>
      Effect.gen(function* () {
        const directory = yield* makeDirectory;
        const harness = yield* makeAdapter(directory, failure);
        const exit = yield* Effect.exit(run(harness.adapter, `generation-${failure}`));

        expect(exit._tag).toBe('Failure');
        expect(harness.active()).toBeUndefined();
      }));
  }
});
