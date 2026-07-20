import {
  BibleProcedureGroup,
  CommitId,
  CURRENT_PROTOCOL_VERSION,
  CURRENT_RUNTIME_SCHEMA_VERSION,
  RuntimeConnection,
  RuntimeGeneration,
} from '@bible/core/procedure';
import { describe, expect, it } from 'effect-bun-test';
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
    'v1.reading.writingsLibrary.get': () => Effect.succeed([]),
    'v1.reading.writingsPublication.download': () => Effect.die('unused'),
    'v1.reading.writingsLibrary.downloadAll': () => Effect.succeed([]),
    'v1.reading.continuity.get': () =>
      Effect.succeed({ source: 'bible', resourceId: 'KJV', location: '/bible/43/3/16' }),
    'v1.reading.continuity.record': () =>
      Effect.succeed({
        _tag: 'MutationCommit',
        value: {},
        commitId: Schema.decodeSync(CommitId)('continuity-commit'),
        changes: { scopes: [{ _tag: 'ReadingContinuity' }] },
      }),
    'v1.library.annotations.get': () => Effect.die('unused'),
    'v1.library.collections.get': () => Effect.succeed([]),
    'v1.library.plans.get': () => Effect.succeed([]),
    'v1.library.practice.get': () => Effect.die('unused'),
    'v1.library.mutate': () => Effect.die('unused'),
    'v1.data.export': () => Effect.succeed('{}'),
    'v1.data.import': () => Effect.succeed({ imported: 1 }),
    'v1.topics.list': () => Effect.succeed([]),
    'v1.topics.get': () => Effect.die('unused'),
    'v1.preferences.reading.get': () => Effect.die('unused'),
    'v1.preferences.reading.patch': () => Effect.die('unused'),
  }),
);

describe('ProcedureClient', () => {
  const test = it.scoped;

  test('normalizes omitted empty structural inputs without changing the wire contract', () =>
    Effect.gen(function* () {
      const raw = yield* RpcTest.makeClient(BibleProcedureGroup);
      const client = createProcedureClient(raw);
      const negotiated = yield* client['v1.runtime.connect']({
        protocolVersion: CURRENT_PROTOCOL_VERSION,
        schemaVersion: CURRENT_RUNTIME_SCHEMA_VERSION,
      });
      const omitted = yield* client['v1.reading.writingsCatalog.get']();
      const explicit = yield* client['v1.reading.writingsCatalog.get']({});
      const omittedLibrary = yield* client['v1.reading.writingsLibrary.get']();
      const explicitLibrary = yield* client['v1.reading.writingsLibrary.get']({});
      const omittedContinuity = yield* client['v1.reading.continuity.get']();
      const explicitContinuity = yield* client['v1.reading.continuity.get']({});
      const recorded = yield* client['v1.reading.continuity.record']({
        location: { source: 'bible', resourceId: 'KJV', location: '/bible/43/3/16' },
        progress: 0,
      });

      expect(negotiated).toEqual(connection);
      expect(omitted).toEqual([]);
      expect(explicit).toEqual([]);
      expect(omittedLibrary).toEqual(explicitLibrary);
      expect(omittedContinuity).toEqual(explicitContinuity);
      expect(recorded.changes.scopes).toEqual([{ _tag: 'ReadingContinuity' }]);
    }).pipe(Effect.provide(HandlerLayer)));
});
