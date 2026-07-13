import { describe, expect, it } from 'bun:test';

import { BibleDatabase, type CrossReference } from '@bible/core/bible-db';
import { Effect } from 'effect';

import type { CrossRefClassification, UserCrossRef } from '../../src/data/bible/state.js';
import { createCrossRefService } from '../../src/data/study/cross-refs.js';
import { createMockBibleState } from '../lib/mock-bible-state.js';

const source = { book: 43, chapter: 3, verse: 16 } as const;
const catalogReference: CrossReference = {
  ...source,
  verseEnd: null,
  source: 'openbible',
  previewText: 'For God so loved the world',
};
const classification: CrossRefClassification = {
  refBook: source.book,
  refChapter: source.chapter,
  refVerse: source.verse,
  refVerseEnd: null,
  type: 'quotation',
  confidence: 0.94,
  classifiedAt: 1,
};
const userReference: UserCrossRef = {
  id: 'user-existing',
  refBook: 45,
  refChapter: 5,
  refVerse: 8,
  refVerseEnd: null,
  type: 'thematic',
  note: 'Love demonstrated',
  createdAt: 2,
};

describe('cross-reference service', () => {
  it('owns catalog enrichment and the persisted user-reference union', () => {
    const state = createMockBibleState({
      classifications: [classification],
      userReferences: [userReference],
    });
    const database = Effect.runSync(
      BibleDatabase.pipe(Effect.provide(BibleDatabase.Test({ crossRefs: [catalogReference] }))),
    );
    const service = createCrossRefService(state.service, database);

    expect(service.getCrossRefs(source.book, source.chapter, source.verse)).toEqual([
      {
        ...catalogReference,
        classification: 'quotation',
        confidence: 0.94,
      },
      {
        book: userReference.refBook,
        chapter: userReference.refChapter,
        verse: userReference.refVerse,
        verseEnd: userReference.refVerseEnd,
        source: 'user',
        previewText: null,
        classification: 'thematic',
        confidence: null,
        userNote: 'Love demonstrated',
        userRefId: 'user-existing',
      },
    ]);
  });

  it('delegates classification and user-reference mutations to state', () => {
    const state = createMockBibleState();
    const database = Effect.runSync(BibleDatabase.pipe(Effect.provide(BibleDatabase.Test())));
    const service = createCrossRefService(state.service, database);

    service.saveClassification(source.book, source.chapter, source.verse, classification);
    const added = service.addUserRef(
      source,
      { book: 19, chapter: 23, verse: 1 },
      { note: 'Psalm' },
    );
    service.removeUserRef(added.id);

    expect(state.savedClassifications).toEqual([[classification]]);
    expect(added).toMatchObject({ refBook: 19, refChapter: 23, refVerse: 1, note: 'Psalm' });
    expect(state.removedUserReferences).toEqual([added.id]);
  });
});
