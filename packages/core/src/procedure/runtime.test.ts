import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, FileSystem, Option, Path, Schema, Stream } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import { makeBunSyncStore, makeBunUserDatabase } from '../local-first/database-bun.js';
import { LibraryEntityId } from '../library-state/index.js';
import { ClientId, MutationId, Timestamp, makeSimulatedTransport } from '../local-first/index.js';
import { DEFAULT_READING_PREFERENCES } from '../reading-preferences/model.js';
import {
  CommitId,
  CURRENT_PROTOCOL_VERSION,
  CURRENT_RUNTIME_SCHEMA_VERSION,
  RuntimeEventSequence,
  RuntimeGeneration,
} from './model.js';
import { layerLocalProcedureRuntime } from './runtime.js';
import {
  DataPortabilityRuntime,
  ProcedureRuntime,
  ReadingContinuityRuntime,
  ReadingPreferencesRuntime,
} from './services.js';

const migrationSql = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  return yield* fs.readFileString(
    path.join(import.meta.dir, '../local-first/migrations/0001_user_state.sql'),
  );
});

const makeLayer = Effect.gen(function* () {
  const database = yield* Effect.acquireRelease(
    Effect.sync(() => makeBunUserDatabase()),
    (opened) => opened.close,
  );
  yield* database.migrate(yield* migrationSql);
  let mutation = 0;
  let commit = 0;
  const store = makeBunSyncStore(database, Schema.decodeSync(ClientId)('procedure-client'));
  const layer = layerLocalProcedureRuntime({
    clientId: Schema.decodeSync(ClientId)('procedure-client'),
    store,
    transport: makeSimulatedTransport(),
    generation: Schema.decodeSync(RuntimeGeneration)('procedure-test'),
    capabilities: ['external-links'],
    nextMutationId: () => Schema.decodeSync(MutationId)(`mutation-${++mutation}`),
    nextHistoryId: () => Schema.decodeSync(LibraryEntityId)(`history-${mutation + 1}`),
    nextCommitId: () => Schema.decodeSync(CommitId)(`commit-${++commit}`),
    now: () => Schema.decodeSync(Timestamp)(`2026-07-19T00:00:0${mutation}.000Z`),
  });
  return { layer, store };
});

const BackupHeader = Schema.Struct({
  format: Schema.optional(Schema.Unknown),
  version: Schema.optional(Schema.Unknown),
});
const decodeBackupHeader = Schema.decodeUnknownEffect(Schema.fromJsonString(BackupHeader));

describe('local procedure runtime', () => {
  const test = it.scopedLive.layer(BunServices.layer);
  test('negotiates the runtime and publishes the same commit returned by a mutation', () =>
    Effect.gen(function* () {
      const { layer } = yield* makeLayer;

      const result = yield* Effect.gen(function* () {
        const runtime = yield* ProcedureRuntime;
        const preferences = yield* ReadingPreferencesRuntime;
        const connection = yield* runtime.connect({
          protocolVersion: CURRENT_PROTOCOL_VERSION,
          schemaVersion: CURRENT_RUNTIME_SCHEMA_VERSION,
        });
        const committed = yield* preferences.patch({ colorMode: 'dark' });
        const event = yield* runtime
          .events({
            afterSequence: Schema.decodeSync(RuntimeEventSequence)(0),
          })
          .pipe(Stream.runHead);
        return { connection, committed, event };
      }).pipe(Effect.provide(layer));

      expect(result.connection.capabilities).toEqual(['external-links']);
      expect(result.committed.value.colorMode).toBe('dark');
      expect(result.committed.value.fontSizePx).toBe(DEFAULT_READING_PREFERENCES.fontSizePx);
      expect(Option.getOrThrow(result.event)).toMatchObject({
        _tag: 'RuntimeCommitted',
        commitId: result.committed.commitId,
        changes: { scopes: [{ _tag: 'ReadingPreferences' }] },
      });
    }));

  test('rejects incompatible protocol negotiation', () =>
    Effect.gen(function* () {
      const { layer } = yield* makeLayer;
      const exit = yield* Effect.exit(
        ProcedureRuntime.pipe(
          Effect.flatMap((runtime) =>
            runtime.connect({
              protocolVersion: 2,
              schemaVersion: CURRENT_RUNTIME_SCHEMA_VERSION,
            }),
          ),
          Effect.provide(layer),
        ),
      );

      expect(exit._tag).toBe('Failure');
    }));

  test('records and resumes the latest canonical reading location', () =>
    Effect.gen(function* () {
      const { layer } = yield* makeLayer;
      const result = yield* Effect.gen(function* () {
        const continuity = yield* ReadingContinuityRuntime;
        const before = yield* continuity.get;
        const committed = yield* continuity.record({
          location: { source: 'bible', resourceId: 'KJV', location: '/bible/43/3/16' },
          progress: 0,
        });
        const after = yield* continuity.get;
        return { before, committed, after };
      }).pipe(Effect.provide(layer));

      expect(result.before).toBeUndefined();
      expect(result.after).toEqual({
        source: 'bible',
        resourceId: 'KJV',
        location: '/bible/43/3/16',
      });
      expect(String(result.committed.commitId)).toBe('mutation-1');
      expect(result.committed.changes.scopes).toEqual([{ _tag: 'ReadingContinuity' }]);
    }));

  test('exports a versioned document and fully validates imports before mutation', () =>
    Effect.gen(function* () {
      const { layer, store } = yield* makeLayer;
      const result = yield* Effect.gen(function* () {
        const preferences = yield* ReadingPreferencesRuntime;
        const data = yield* DataPortabilityRuntime;
        yield* preferences.patch({ colorMode: 'sepia' });
        const document = yield* data.export;
        const backup = yield* decodeBackupHeader(document);
        const imported = yield* data.import(document);
        const invalid = yield* Effect.exit(data.import('{"format":"not-a-backup"}'));
        return { backup, imported, invalid };
      }).pipe(Effect.provide(layer));

      expect(result.backup).toMatchObject({ format: 'bible-library-backup', version: 1 });
      expect(result.imported.imported).toBeGreaterThan(0);
      expect(result.invalid._tag).toBe('Failure');
      expect(yield* store.pending).toHaveLength(2);
    }));
});
