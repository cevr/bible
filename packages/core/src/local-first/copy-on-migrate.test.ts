import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Effect, Schema } from 'effect';

import { makeBunSyncStore, makeBunUserDatabase } from './database-bun.js';
import {
  CopyOnMigrateError,
  copyOnMigrate,
  type CanonicalGenerationAdapter,
} from './copy-on-migrate.js';
import { MigrationSourceId } from './legacy-migration.js';
import { ClientId, MutationId, NoteId, Timestamp } from './model.js';

const migrationSql = await Bun.file(
  new URL('./migrations/0001_user_state.sql', import.meta.url),
).text();
const directory = mkdtempSync(join(tmpdir(), 'bible-copy-on-migrate-'));

afterAll(() => rmSync(directory, { recursive: true, force: true }));

const clientId = Schema.decodeSync(ClientId)('migration-test');
const sourceId = Schema.decodeSync(MigrationSourceId)('legacy-test');
const timestamp = Schema.decodeSync(Timestamp)('2026-07-19T00:00:00.000Z');

const makeAdapter = (fail: 'none' | 'import' | 'verify' | 'activate' = 'none') => {
  let active: string | undefined;
  const databases = new Map<string, ReturnType<typeof makeBunUserDatabase>>();
  const events: string[] = [];
  const open = (generation: string) =>
    Effect.gen(function* () {
      const database = makeBunUserDatabase(join(directory, `${generation}.sqlite`));
      if (!databases.has(generation)) yield* database.migrate(migrationSql);
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
              importLegacy: () => Effect.fail({ _tag: 'forced-import-failure' } as never),
            },
          };
        }),
      ),
    open,
    verify: (_generation, receipts) =>
      Effect.sync(() => {
        events.push(`verify:${String(receipts.length)}`);
        if (fail === 'verify') throw new Error('forced verification failure');
      }).pipe(
        Effect.mapError(
          (cause) =>
            ({ _tag: 'CopyOnMigrateError', operation: 'verify', message: String(cause) }) as never,
        ),
      ),
    activate: (generation) =>
      Effect.sync(() => {
        events.push(`activate:${generation}`);
        if (fail === 'activate') throw new Error('forced activation failure');
        active = generation;
      }).pipe(
        Effect.mapError(
          (cause) =>
            ({
              _tag: 'CopyOnMigrateError',
              operation: 'activate',
              message: String(cause),
            }) as never,
        ),
      ),
  };
  return { adapter, events, active: () => active };
};

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
  test('activates only after close, reopen, receipt verification, and semantic verification', async () => {
    const harness = makeAdapter();
    const result = await Effect.runPromise(run(harness.adapter, 'generation-complete'));

    expect(result.activated).toBe(true);
    expect(result.receipts).toHaveLength(1);
    expect(harness.events).toEqual(['discard:none', 'verify:1', 'activate:generation-complete']);
    expect(harness.active()).toBe('generation-complete');
  });

  test('returns an already-active generation without rebuilding it', async () => {
    const harness = makeAdapter();
    await Effect.runPromise(run(harness.adapter, 'generation-stable'));
    harness.events.splice(0);

    const second = await Effect.runPromise(run(harness.adapter, 'generation-stable'));

    expect(second).toEqual({ generation: 'generation-stable', activated: false, receipts: [] });
    expect(harness.events).toEqual([]);
  });

  test.each(['import', 'verify', 'activate'] as const)(
    'never activates after a %s failure',
    async (failure) => {
      const harness = makeAdapter(failure);
      const exit = await Effect.runPromiseExit(run(harness.adapter, `generation-${failure}`));

      expect(exit._tag).toBe('Failure');
      expect(harness.active()).toBeUndefined();
    },
  );
});
