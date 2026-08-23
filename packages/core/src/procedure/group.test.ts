import { Effect, Option, Predicate, Schema } from 'effect';

// A missing payload for decode-failure assertions, without a literal nullish token.
const missingPayload = Option.getOrUndefined(Option.none<never>());
import { describe, expect, it } from 'effect-bun-test';

import { DEFAULT_READING_PREFERENCES } from '../reading-preferences/model.js';
import { BibleProcedureGroup } from './group.js';
import { MutationCommit } from './model.js';

describe('BibleProcedureGroup', () => {
  it.effect('owns stable namespaced procedure tags in one production group', () =>
    Effect.sync(() => {
      expect([...BibleProcedureGroup.requests.keys()]).toEqual([
        'v1.runtime.connect',
        'v1.runtime.events',
        'v1.reading.bibleChapter.get',
        'v1.reading.bibleChapterMarginAnchors.get',
        'v1.reading.bibleSearch.get',
        'v1.reading.writingsCatalog.get',
        'v1.reading.writingsPage.get',
        'v1.reading.writingsPublication.open',
        'v1.reading.writingsParagraph.get',
        'v1.reading.writingsLibrary.get',
        'v1.reading.writingsPublication.download',
        'v1.reading.writingsLibrary.downloadAll',
        'v1.reading.continuity.get',
        'v1.reading.continuity.record',
        'v1.preferences.reading.get',
        'v1.preferences.reading.patch',
        'v1.library.annotations.get',
        'v1.library.collections.get',
        'v1.library.plans.get',
        'v1.library.practice.get',
        'v1.library.mutate',
        'v1.data.export',
        'v1.data.import',
        'v1.topics.list',
        'v1.topics.get',
        'v1.wiki.topic.get',
        'v1.wiki.topics.list',
        'v1.wiki.dictionary.get',
        'v1.wiki.lookup.resolve',
        'v1.search.query',
        'v1.study.verse.get',
        'v1.study.strongs.get',
        'v1.content.status',
        'v1.content.update',
      ]);
    }),
  );

  it.effect('requires one structural payload even when a procedure has no fields', () =>
    Effect.gen(function* () {
      const procedure = BibleProcedureGroup.requests.get('v1.preferences.reading.get');
      if (Predicate.isUndefined(procedure))
        return yield* Effect.fail('reading preferences procedure is absent');
      const decode = Schema.decodeUnknownEffect(procedure.payloadSchema);

      expect(yield* decode({})).toEqual({});
      expect(
        (yield* Effect.exit(Schema.decodeUnknownEffect(procedure.payloadSchema)(missingPayload)))
          ._tag,
      ).toBe('Failure');

      const continuity = BibleProcedureGroup.requests.get('v1.reading.continuity.get');
      if (Predicate.isUndefined(continuity))
        return yield* Effect.fail('reading continuity procedure is absent');
      const decodeContinuity = Schema.decodeUnknownEffect(continuity.payloadSchema);
      expect(yield* decodeContinuity({})).toEqual({});
      expect(
        (yield* Effect.exit(Schema.decodeUnknownEffect(continuity.payloadSchema)(missingPayload)))
          ._tag,
      ).toBe('Failure');
    }),
  );

  it.effect('encodes durable mutations as post-commit values with structural changes', () =>
    Effect.gen(function* () {
      const commit = yield* Schema.decodeEffect(MutationCommit(Schema.String))({
        _tag: 'MutationCommit',
        value: 'saved',
        commitId: 'commit-1',
        changes: { scopes: [{ _tag: 'Note', noteId: 'note-1' }] },
      });

      expect(commit.value).toBe('saved');
      expect(commit.changes.scopes).toHaveLength(1);
      expect(DEFAULT_READING_PREFERENCES.colorMode).toBe('system');
    }),
  );
});
