import { describe, expect, test } from 'bun:test';
import { Effect, Option, Schema, Stream } from 'effect';

import { makeBunSyncStore, makeBunUserDatabase } from '../local-first/database-bun.js';
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
import { ProcedureRuntime, ReadingPreferencesRuntime } from './services.js';

const migrationSql = await Bun.file(
  new URL('../local-first/migrations/0001_user_state.sql', import.meta.url),
).text();

const makeLayer = async () => {
  const database = makeBunUserDatabase();
  await Effect.runPromise(database.migrate(migrationSql));
  let mutation = 0;
  let commit = 0;
  const layer = layerLocalProcedureRuntime({
    clientId: Schema.decodeSync(ClientId)('procedure-client'),
    store: makeBunSyncStore(database, Schema.decodeSync(ClientId)('procedure-client')),
    transport: makeSimulatedTransport(),
    generation: Schema.decodeSync(RuntimeGeneration)('procedure-test'),
    capabilities: ['external-links'],
    nextMutationId: () => Schema.decodeSync(MutationId)(`mutation-${++mutation}`),
    nextCommitId: () => Schema.decodeSync(CommitId)(`commit-${++commit}`),
    now: () => Schema.decodeSync(Timestamp)(`2026-07-19T00:00:0${mutation}.000Z`),
  });
  return { database, layer };
};

describe('local procedure runtime', () => {
  test('negotiates the runtime and publishes the same commit returned by a mutation', async () => {
    const { database, layer } = await makeLayer();

    const result = await Effect.runPromise(
      Effect.gen(function* () {
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
      }).pipe(Effect.provide(layer)),
    );

    expect(result.connection.capabilities).toEqual(['external-links']);
    expect(result.committed.value.colorMode).toBe('dark');
    expect(result.committed.value.fontSizePx).toBe(DEFAULT_READING_PREFERENCES.fontSizePx);
    expect(Option.getOrThrow(result.event)).toMatchObject({
      _tag: 'RuntimeCommitted',
      commitId: result.committed.commitId,
      changes: { scopes: [{ _tag: 'ReadingPreferences' }] },
    });
    await Effect.runPromise(database.close);
  });

  test('rejects incompatible protocol negotiation', async () => {
    const { database, layer } = await makeLayer();
    const exit = await Effect.runPromiseExit(
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
    await Effect.runPromise(database.close);
  });
});
