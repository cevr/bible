import { describe, expect, test } from 'bun:test';
import { Schema } from 'effect';

import { DEFAULT_READING_PREFERENCES } from '../reading-preferences/model.js';
import { BibleProcedureGroup } from './group.js';
import { MutationCommit } from './model.js';

describe('BibleProcedureGroup', () => {
  test('owns stable namespaced procedure tags in one production group', () => {
    expect([...BibleProcedureGroup.requests.keys()]).toEqual([
      'v1.runtime.connect',
      'v1.runtime.events',
      'v1.reading.bibleChapter.get',
      'v1.reading.writingsCatalog.get',
      'v1.reading.writingsPage.get',
      'v1.reading.writingsPublication.open',
      'v1.reading.writingsParagraph.get',
      'v1.preferences.reading.get',
      'v1.preferences.reading.patch',
    ]);
  });

  test('requires one structural payload even when a procedure has no fields', () => {
    const procedure = BibleProcedureGroup.requests.get('v1.preferences.reading.get');
    if (!procedure) throw new Error('reading preferences procedure is absent');
    const decode = Schema.decodeUnknownSync(procedure.payloadSchema);

    expect(decode({})).toEqual({});
    expect(() => decode(undefined)).toThrow();
  });

  test('encodes durable mutations as post-commit values with structural changes', () => {
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
  });
});
