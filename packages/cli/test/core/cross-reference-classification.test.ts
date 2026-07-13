import { describe, expect, it } from 'bun:test';

import { Reference } from '@bible/core/bible';
import { BibleDatabase, type CrossReference } from '@bible/core/bible-db';
import { Effect, Layer } from 'effect';

import {
  classifySingleCrossRef,
  classifyVerseCrossRefs,
} from '../../src/data/study/classification.js';
import type { CrossRefClassification, UserCrossRef } from '../../src/data/bible/state.js';
import type {
  ClassifiedCrossReference,
  CrossRefServiceInstance,
} from '../../src/data/study/cross-refs.js';
import { createMockAILayer } from '../lib/mock-ai.js';

const source = Reference.verse(43, 3, 16);
const databaseReference: CrossReference = {
  book: source.book,
  chapter: source.chapter,
  verse: source.verse,
  verseEnd: null,
  source: 'openbible',
  previewText: 'For God so loved the world',
};
const classifiedReference: ClassifiedCrossReference = {
  ...databaseReference,
  classification: null,
  confidence: null,
  isUserAdded: false,
  userNote: null,
  userRefId: null,
};

const databaseLayer = BibleDatabase.Test({
  verses: [
    {
      book: source.book,
      chapter: source.chapter,
      verse: source.verse,
      text: 'For God so loved the world',
      versionCode: 'KJV',
    },
  ],
  crossRefs: [databaseReference],
});

function makeCrossReferences() {
  const saved: CrossRefClassification[] = [];
  const service: CrossRefServiceInstance = {
    getCrossRefs: () => [classifiedReference],
    isClassified: () => false,
    saveClassifications: (_book, _chapter, _verse, classifications) => {
      saved.push(...classifications);
    },
    addUserRef: (_source, target, options): UserCrossRef => ({
      id: 'test-user-reference',
      refBook: target.book,
      refChapter: target.chapter,
      refVerse: target.verse ?? null,
      refVerseEnd: target.verseEnd ?? null,
      type: options?.type ?? null,
      note: options?.note ?? null,
      createdAt: 0,
    }),
    saveClassification: (_book, _chapter, _verse, classification) => {
      saved.push(classification);
    },
    removeUserRef: () => undefined,
  };
  return { saved, service };
}

describe('cross-reference classification module', () => {
  it('classifies a canonical verse through provided AI and database modules', async () => {
    const crossReferences = makeCrossReferences();
    const ai = createMockAILayer({
      responses: {
        high: [],
        low: [
          {
            classifications: [
              {
                refBook: source.book,
                refChapter: source.chapter,
                refVerse: source.verse,
                type: 'quotation',
                confidence: 0.95,
              },
            ],
          },
        ],
      },
    });

    const result = await Effect.runPromise(
      classifyVerseCrossRefs(source, crossReferences.service).pipe(
        Effect.provide(Layer.merge(ai.layer, databaseLayer)),
      ),
    );

    expect(result).toEqual([classifiedReference]);
    expect(crossReferences.saved).toMatchObject([
      {
        refBook: source.book,
        refChapter: source.chapter,
        refVerse: source.verse,
        type: 'quotation',
        confidence: 0.95,
      },
    ]);
    expect(ai.state.calls).toMatchObject([{ _tag: 'AI.generateObject', model: 'low' }]);
  });

  it('saves a single classification without constructing platform layers', async () => {
    const crossReferences = makeCrossReferences();
    const ai = createMockAILayer({
      responses: {
        high: [],
        low: [{ type: 'typological', confidence: 0.88 }],
      },
    });

    const result = await Effect.runPromise(
      classifySingleCrossRef(source, classifiedReference, crossReferences.service).pipe(
        Effect.provide(Layer.merge(ai.layer, databaseLayer)),
      ),
    );

    expect(result).toMatchObject({ type: 'typological', confidence: 0.88 });
    expect(crossReferences.saved).toMatchObject([
      {
        refBook: source.book,
        refChapter: source.chapter,
        refVerse: source.verse,
        type: 'typological',
        confidence: 0.88,
      },
    ]);
  });
});
