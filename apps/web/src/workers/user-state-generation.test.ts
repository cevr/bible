import { describe, expect, test } from 'bun:test';
import {
  CopyOnMigrateError,
  copyOnMigrate,
  MigrationSourceId,
  MutationId,
  Timestamp,
  type CanonicalGeneration,
  type SyncStore,
} from '@bible/core/local-first';
import { Effect, Schema } from 'effect';
import * as SQLite from 'wa-sqlite';

import { makeGenerationMarkerStore } from './generation-marker.js';
import {
  deleteKnownGeneratedFile,
  generationDatabaseName,
  makeCanonicalGenerationAdapter,
  vfsFileExists,
} from './user-state-generation.js';

const generation = 'user-state-v1-0123456789ab';
const timestamp = Schema.decodeSync(Timestamp)('migration-time');

describe('web canonical generation lifecycle', () => {
  test('deletes only the known closed inactive generation and its SQLite sidecars', async () => {
    const deleted: string[] = [];
    const files = new Set([
      'user-state-v1-0123456789ab.db',
      'user-state-v1-0123456789ab.db-journal',
      'user-state-v1-0123456789ab.db-wal',
      'user-state-v1-0123456789ab.db-shm',
      'state.db',
      'user-state-v1-fedcba987654.db-wal',
    ]);
    const vfs = {
      jAccess: async (name: string, _flags: number, output: DataView) => {
        output.setInt32(0, files.has(name) ? 1 : 0, true);
        return SQLite.SQLITE_OK;
      },
      jDelete: async (name: string) => {
        deleted.push(name);
        files.delete(name);
        return SQLite.SQLITE_OK;
      },
    };

    await deleteKnownGeneratedFile(vfs, generation);

    expect(deleted).toEqual([
      'user-state-v1-0123456789ab.db',
      'user-state-v1-0123456789ab.db-journal',
      'user-state-v1-0123456789ab.db-wal',
      'user-state-v1-0123456789ab.db-shm',
    ]);
    expect(files).toEqual(new Set(['state.db', 'user-state-v1-fedcba987654.db-wal']));
    expect(() => generationDatabaseName('state')).toThrow();
  });

  test('detects a missing legacy source without creating it', async () => {
    let deleted = false;
    const exists = await vfsFileExists(
      {
        jAccess: async (_name, _flags, output) => {
          output.setInt32(0, 0, true);
          return SQLite.SQLITE_OK;
        },
        jDelete: async () => {
          deleted = true;
          return SQLite.SQLITE_OK;
        },
      },
      'state.db',
    );

    expect(exists).toBe(false);
    expect(deleted).toBe(false);
  });

  test('returns an already-active generation without cleanup or open', async () => {
    const events: string[] = [];
    const marker = makeGenerationMarkerStore({
      read: async () => generation,
      write: async () => {
        events.push('activate');
      },
    });
    const adapter = makeCanonicalGenerationAdapter({
      marker,
      targetGeneration: generation,
      discardTarget: async () => {
        events.push('discard');
      },
      create: () => Effect.die('create must not run'),
      open: () => Effect.die('open must not run'),
      verify: () => Effect.die('verify must not run'),
      log: (line) => events.push(line),
    });

    const result = await Effect.runPromise(
      copyOnMigrate({
        generation,
        sources: [],
        adapter,
        mutationId: (_source, index) => Schema.decodeSync(MutationId)(`mutation:${index}`),
        mutationTimestamp: () => timestamp,
        completedAt: timestamp,
      }),
    );

    expect(result.activated).toBe(false);
    expect(events).toEqual([]);
  });

  test('creates and activates an empty canonical generation for a missing source', async () => {
    let active: string | undefined;
    const events: string[] = [];
    const emptyStore = {
      migrationReceipt: () => Effect.succeed(undefined),
    } as unknown as SyncStore;
    const target: CanonicalGeneration = { store: emptyStore, close: Effect.void };
    const marker = makeGenerationMarkerStore({
      read: async () => active,
      write: async (_key, value) => {
        active = value;
      },
    });
    const adapter = makeCanonicalGenerationAdapter({
      marker,
      targetGeneration: generation,
      discardTarget: async () => {
        events.push('discard');
      },
      create: () => Effect.succeed(target),
      open: () => Effect.succeed(target),
      verify: () => Effect.void,
      log: (line) => events.push(line),
    });

    const result = await Effect.runPromise(
      copyOnMigrate({
        generation,
        sources: [],
        adapter,
        mutationId: (_source, index) => Schema.decodeSync(MutationId)(`mutation:${index}`),
        mutationTimestamp: () => timestamp,
        completedAt: timestamp,
      }),
    );

    expect(result.activated).toBe(true);
    expect(active).toBe(generation);
    expect(events).toContain(`[migration] activated generation=${generation}`);
  });

  test('does not activate when semantic verification fails', async () => {
    let active: string | undefined;
    let receipt:
      | {
          readonly sourceId: typeof MigrationSourceId.Type;
          readonly fingerprint: string;
          readonly generation: string;
          readonly mutationCount: number;
          readonly diagnosticCount: number;
          readonly semanticCounts: readonly { readonly entity: string; readonly count: number }[];
          readonly completedAt: typeof Timestamp.Type;
        }
      | undefined;
    const store = {
      importLegacy: (batch: {
        readonly sourceId: typeof MigrationSourceId.Type;
        readonly fingerprint: string;
        readonly generation: string;
        readonly items: readonly unknown[];
        readonly diagnostics: readonly unknown[];
        readonly semanticCounts: readonly { readonly entity: string; readonly count: number }[];
        readonly completedAt: typeof Timestamp.Type;
      }) => {
        receipt = {
          sourceId: batch.sourceId,
          fingerprint: batch.fingerprint,
          generation: batch.generation,
          mutationCount: batch.items.length,
          diagnosticCount: batch.diagnostics.length,
          semanticCounts: batch.semanticCounts,
          completedAt: batch.completedAt,
        };
        return Effect.succeed({ imported: true, receipt });
      },
      migrationReceipt: () => Effect.succeed(receipt),
    } as unknown as SyncStore;
    const target: CanonicalGeneration = { store, close: Effect.void };
    const adapter = makeCanonicalGenerationAdapter({
      marker: makeGenerationMarkerStore({
        read: async () => active,
        write: async (_key, value) => {
          active = value;
        },
      }),
      targetGeneration: generation,
      discardTarget: async () => {},
      create: () => Effect.succeed(target),
      open: () => Effect.succeed(target),
      verify: () =>
        Effect.fail(
          new CopyOnMigrateError({
            operation: 'verify-semantic-counts',
            message: 'forced mismatch',
          }),
        ),
      log: () => {},
    });

    const exit = await Effect.runPromiseExit(
      copyOnMigrate({
        generation,
        sources: [
          {
            sourceId: Schema.decodeSync(MigrationSourceId)('web-state.db'),
            fingerprint: 'sha256:fixture',
            commands: [],
            diagnostics: [],
            semanticCounts: [{ entity: 'notes', count: 1 }],
          },
        ],
        adapter,
        mutationId: (_source, index) => Schema.decodeSync(MutationId)(`mutation:${index}`),
        mutationTimestamp: () => timestamp,
        completedAt: timestamp,
      }),
    );

    expect(exit._tag).toBe('Failure');
    expect(active).toBeUndefined();
  });
});
