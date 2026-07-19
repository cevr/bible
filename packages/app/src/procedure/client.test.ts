import { describe, expect, test } from 'bun:test';
import {
  BibleProcedureGroup,
  CURRENT_PROTOCOL_VERSION,
  CURRENT_RUNTIME_SCHEMA_VERSION,
  RuntimeConnection,
  RuntimeGeneration,
} from '@bible/core/procedure';
import { Effect, Schema, Stream } from 'effect';
import { RpcTest } from 'effect/unstable/rpc';

import { createProcedureClient } from './client.js';

const connection = new RuntimeConnection({
  protocolVersion: CURRENT_PROTOCOL_VERSION,
  schemaVersion: CURRENT_RUNTIME_SCHEMA_VERSION,
  generation: Schema.decodeSync(RuntimeGeneration)('procedure-client-test'),
  capabilities: [],
});

const HandlerLayer = BibleProcedureGroup.toLayer(
  Effect.succeed({
    'v1.runtime.connect': () => Effect.succeed(connection),
    'v1.runtime.events': () => Stream.empty,
    'v1.reading.bibleChapter.get': () => Effect.die('unused'),
    'v1.reading.bibleSearch.get': () => Effect.die('unused'),
    'v1.reading.writingsCatalog.get': () => Effect.succeed([]),
    'v1.reading.writingsPage.get': () => Effect.die('unused'),
    'v1.reading.writingsPublication.open': () => Effect.die('unused'),
    'v1.reading.writingsParagraph.get': () => Effect.die('unused'),
    'v1.library.annotations.get': () => Effect.die('unused'),
    'v1.library.collections.get': () => Effect.succeed([]),
    'v1.library.plans.get': () => Effect.succeed([]),
    'v1.library.practice.get': () => Effect.die('unused'),
    'v1.library.mutate': () => Effect.die('unused'),
    'v1.preferences.reading.get': () => Effect.die('unused'),
    'v1.preferences.reading.patch': () => Effect.die('unused'),
  }),
);

describe('ProcedureClient', () => {
  test('normalizes omitted empty structural inputs without changing the wire contract', async () => {
    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const raw = yield* RpcTest.makeClient(BibleProcedureGroup);
          const client = createProcedureClient(raw);
          const negotiated = yield* client['v1.runtime.connect']({
            protocolVersion: CURRENT_PROTOCOL_VERSION,
            schemaVersion: CURRENT_RUNTIME_SCHEMA_VERSION,
          });
          const omitted = yield* client['v1.reading.writingsCatalog.get']();
          const explicit = yield* client['v1.reading.writingsCatalog.get']({});
          return { negotiated, omitted, explicit };
        }).pipe(Effect.provide(HandlerLayer)),
      ),
    );

    expect(result.negotiated).toEqual(connection);
    expect(result.omitted).toEqual([]);
    expect(result.explicit).toEqual([]);
  });
});
