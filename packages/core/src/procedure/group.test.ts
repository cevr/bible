import { Effect, Schema } from 'effect';
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
      ]);
    }),
  );

  it.effect('requires one structural payload even when a procedure has no fields', () =>
    Effect.gen(function* () {
      const procedure = BibleProcedureGroup.requests.get('v1.preferences.reading.get');
      if (procedure === undefined)
        return yield* Effect.fail('reading preferences procedure is absent');
      const decode = Schema.decodeUnknownSync(procedure.payloadSchema);

      expect(decode({})).toEqual({});
      expect(
        (yield* Effect.exit(Schema.decodeUnknownEffect(procedure.payloadSchema)(undefined)))._tag,
      ).toBe('Failure');

      const continuity = BibleProcedureGroup.requests.get('v1.reading.continuity.get');
      if (continuity === undefined)
        return yield* Effect.fail('reading continuity procedure is absent');
      const decodeContinuity = Schema.decodeUnknownSync(continuity.payloadSchema);
      expect(decodeContinuity({})).toEqual({});
      expect(
        (yield* Effect.exit(Schema.decodeUnknownEffect(continuity.payloadSchema)(undefined)))._tag,
      ).toBe('Failure');
    }),
  );

  it.effect('encodes durable mutations as post-commit values with structural changes', () =>
    Effect.sync(() => {
      const decode = Schema.decodeUnknownSync(MutationCommit(Schema.String));
      const commit = decode({
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
