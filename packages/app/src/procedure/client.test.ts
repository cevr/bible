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

const connection = RuntimeConnection.make({
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
    'v1.reading.bibleChapterMarginAnchors.get': () => Effect.die('unused'),
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
    'v1.wiki.topic.get': () => Effect.die('unused'),
    'v1.wiki.topics.list': () => Effect.succeed([]),
    'v1.wiki.dictionary.get': () => Effect.die('unused'),
    'v1.wiki.lookup.resolve': () => Effect.die('unused'),
    'v1.study.verse.get': () => Effect.die('unused'),
    'v1.search.query': () => Effect.die('unused'),
    'v1.study.strongs.get': () => Effect.die('unused'),
    'v1.preferences.reading.get': () => Effect.die('unused'),
    'v1.preferences.reading.patch': () => Effect.die('unused'),
    'v1.content.status': () => Effect.die('unused'),
    'v1.content.update': () => Effect.die('unused'),
  }),
);

describe('ProcedureHost client', () => {
  const test = it.scoped;

  test('calls every procedure through one flattened entry point', () =>
    Effect.gen(function* () {
      const client = yield* RpcTest.makeClient(BibleProcedureGroup, { flatten: true });
      const negotiated = yield* client('v1.runtime.connect', {
        protocolVersion: CURRENT_PROTOCOL_VERSION,
        schemaVersion: CURRENT_RUNTIME_SCHEMA_VERSION,
      });
      const catalog = yield* client('v1.reading.writingsCatalog.get', {});
      const library = yield* client('v1.reading.writingsLibrary.get', {});
      const continuity = yield* client('v1.reading.continuity.get', {});
      const recorded = yield* client('v1.reading.continuity.record', {
        location: { source: 'bible', resourceId: 'KJV', location: '/bible/43/3/16' },
        progress: 0,
      });

      expect(negotiated).toEqual(connection);
      expect(catalog).toEqual([]);
      expect(library).toEqual([]);
      expect(continuity).toEqual({
        source: 'bible',
        resourceId: 'KJV',
        location: '/bible/43/3/16',
      });
      expect(recorded.changes.scopes).toEqual([{ _tag: 'ReadingContinuity' }]);
    }).pipe(Effect.provide(HandlerLayer)));
});
