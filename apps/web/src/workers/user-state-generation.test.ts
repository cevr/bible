import {
  CopyOnMigrateError,
  copyOnMigrate,
  MigrationSourceId,
  MutationId,
  Timestamp,
  type CanonicalGeneration,
  type SyncStore,
} from '@bible/core/local-first';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, Option, Schema } from 'effect';
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
  it.effect('deletes only the known closed inactive generation and its SQLite sidecars', () =>
    Effect.gen(function* () {
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
        jAccess: (name: string, _flags: number, output: DataView) => {
          let exists = 0;
          if (files.has(name)) exists = 1;
          output.setInt32(0, exists, true);
          return SQLite.SQLITE_OK;
        },
        jDelete: (name: string) => {
          deleted.push(name);
          files.delete(name);
          return SQLite.SQLITE_OK;
        },
      };

      yield* deleteKnownGeneratedFile(vfs, generation);

      expect(deleted).toEqual([
        'user-state-v1-0123456789ab.db',
        'user-state-v1-0123456789ab.db-journal',
        'user-state-v1-0123456789ab.db-wal',
        'user-state-v1-0123456789ab.db-shm',
      ]);
      expect(files).toEqual(new Set(['state.db', 'user-state-v1-fedcba987654.db-wal']));
      expect(() => generationDatabaseName('state')).toThrow();
    }),
  );

  it.effect('detects a missing legacy source without creating it', () =>
    Effect.gen(function* () {
      let deleted = false;
      const exists = yield* vfsFileExists(
        {
          jAccess: (_name, _flags, output) => {
            output.setInt32(0, 0, true);
            return SQLite.SQLITE_OK;
          },
          jDelete: () => {
            deleted = true;
            return SQLite.SQLITE_OK;
          },
        },
        'state.db',
      );

      expect(exists).toBe(false);
      expect(deleted).toBe(false);
    }),
  );

  it.effect('returns an already-active generation without cleanup or open', () =>
    Effect.gen(function* () {
      const events: string[] = [];
      const marker = makeGenerationMarkerStore({
        read: () => Effect.succeed(Option.some(generation)),
        write: () => Effect.sync(() => events.push('activate')).pipe(Effect.asVoid),
      });
      const adapter = makeCanonicalGenerationAdapter({
        marker,
        targetGeneration: generation,
        discardTarget: Effect.sync(() => events.push('discard')).pipe(Effect.asVoid),
        create: () => Effect.die('create must not run'),
        open: () => Effect.die('open must not run'),
        verify: () => Effect.die('verify must not run'),
        log: (line) => events.push(line),
      });

      const result = yield* copyOnMigrate({
        generation,
        sources: [],
        adapter,
        mutationId: (_source, index) => Schema.decodeSync(MutationId)(`mutation:${index}`),
        mutationTimestamp: () => timestamp,
        completedAt: timestamp,
      });

      expect(result.activated).toBe(false);
      expect(events).toEqual([]);
    }),
  );

  it.effect('creates and activates an empty canonical generation for a missing source', () =>
    Effect.gen(function* () {
      let active: Option.Option<string> = Option.none();
      const events: string[] = [];
      const emptyStore = {
        migrationReceipt: () => Effect.void,
      } as unknown as SyncStore;
      const target: CanonicalGeneration = { store: emptyStore, close: Effect.void };
      const marker = makeGenerationMarkerStore({
        read: () => Effect.succeed(active),
        write: (_key, value) =>
          Effect.sync(() => (active = Option.some(value))).pipe(Effect.asVoid),
      });
      const adapter = makeCanonicalGenerationAdapter({
        marker,
        targetGeneration: generation,
        discardTarget: Effect.sync(() => events.push('discard')).pipe(Effect.asVoid),
        create: () => Effect.succeed(target),
        open: () => Effect.succeed(target),
        verify: () => Effect.void,
        log: (line) => events.push(line),
      });

      const result = yield* copyOnMigrate({
        generation,
        sources: [],
        adapter,
        mutationId: (_source, index) => Schema.decodeSync(MutationId)(`mutation:${index}`),
        mutationTimestamp: () => timestamp,
        completedAt: timestamp,
      });

      expect(result.activated).toBe(true);
      expect(Option.getOrUndefined(active)).toBe(generation);
      expect(events).toContain(`[migration] activated generation=${generation}`);
    }),
  );

  it.effect('does not activate when semantic verification fails', () =>
    Effect.gen(function* () {
      let active: Option.Option<string> = Option.none();
      let receipt: Option.Option<{
        readonly sourceId: MigrationSourceId;
        readonly fingerprint: string;
        readonly generation: string;
        readonly mutationCount: number;
        readonly diagnosticCount: number;
        readonly semanticCounts: readonly { readonly entity: string; readonly count: number }[];
        readonly completedAt: Timestamp;
      }> = Option.none();
      const store = {
        importLegacy: (batch: {
          readonly sourceId: MigrationSourceId;
          readonly fingerprint: string;
          readonly generation: string;
          readonly items: readonly unknown[];
          readonly diagnostics: readonly unknown[];
          readonly semanticCounts: readonly { readonly entity: string; readonly count: number }[];
          readonly completedAt: Timestamp;
        }) => {
          const stored = {
            sourceId: batch.sourceId,
            fingerprint: batch.fingerprint,
            generation: batch.generation,
            mutationCount: batch.items.length,
            diagnosticCount: batch.diagnostics.length,
            semanticCounts: batch.semanticCounts,
            completedAt: batch.completedAt,
          };
          receipt = Option.some(stored);
          return Effect.succeed({ imported: true, receipt: stored });
        },
        migrationReceipt: () => Effect.succeed(receipt),
      } as unknown as SyncStore;
      const target: CanonicalGeneration = { store, close: Effect.void };
      const adapter = makeCanonicalGenerationAdapter({
        marker: makeGenerationMarkerStore({
          read: () => Effect.succeed(active),
          write: (_key, value) =>
            Effect.sync(() => (active = Option.some(value))).pipe(Effect.asVoid),
        }),
        targetGeneration: generation,
        discardTarget: Effect.void,
        create: () => Effect.succeed(target),
        open: () => Effect.succeed(target),
        verify: () =>
          Effect.fail(
            CopyOnMigrateError.make({
              operation: 'verify-semantic-counts',
              message: 'forced mismatch',
            }),
          ),
        log: () => {},
      });

      const sourceId = yield* Schema.decodeEffect(MigrationSourceId)('web-state.db').pipe(
        Effect.orDie,
      );
      const exit = yield* Effect.exit(
        copyOnMigrate({
          generation,
          sources: [
            {
              sourceId,
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
      expect(Option.isNone(active)).toBe(true);
    }),
  );
});
