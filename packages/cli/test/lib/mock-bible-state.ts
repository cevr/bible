import type { BibleRouteReference } from '@bible/core/app';
import { Reference } from '@bible/core/bible';

import type {
  BibleStateService,
  CrossRefClassification,
  UserCrossRef,
} from '../../src/data/bible/state.js';

interface MockBibleStateConfig {
  readonly cachedSearch?: ReadonlyMap<string, readonly BibleRouteReference[]>;
  readonly classifications?: readonly CrossRefClassification[];
  readonly userReferences?: readonly UserCrossRef[];
}

export function createMockBibleState(config: MockBibleStateConfig = {}) {
  const cachedSearch = new Map(config.cachedSearch);
  const classifications = [...(config.classifications ?? [])];
  const userReferences = [...(config.userReferences ?? [])];
  const savedClassifications: CrossRefClassification[][] = [];
  const removedUserReferences: string[] = [];

  const service: BibleStateService = {
    reader: {
      bible: {
        loadPosition: () => Reference.verse(1, 1, 1),
        savePosition: () => undefined,
      },
      writings: {
        loadPosition: () => undefined,
        savePosition: () => undefined,
      },
    },
    preferences: {
      get: () => ({ theme: 'system', displayMode: 'verse' }),
      update: () => undefined,
      getTerminalPalette: () => undefined,
      saveTerminalPalette: () => undefined,
    },
    aiSearch: {
      getCached: (query) => cachedSearch.get(query),
      saveCached: (query, results) => {
        cachedSearch.set(query, results);
      },
    },
    crossReferences: {
      classificationsFor: () => [...classifications],
      saveClassifications: (_book, _chapter, _verse, values) => {
        classifications.push(...values);
        savedClassifications.push([...values]);
      },
      hasClassifications: () => classifications.length > 0,
      userReferencesFor: () => [...userReferences],
      addUserReference: (_source, target, options) => {
        const reference: UserCrossRef = {
          id: `user-${userReferences.length + 1}`,
          refBook: target.book,
          refChapter: target.chapter,
          refVerse: target.verse ?? null,
          refVerseEnd: target.verseEnd ?? null,
          type: options?.type ?? null,
          note: options?.note ?? null,
          createdAt: 0,
        };
        userReferences.push(reference);
        return reference;
      },
      removeUserReference: (id) => {
        removedUserReferences.push(id);
      },
    },
  };

  return {
    service,
    cachedSearch,
    savedClassifications,
    removedUserReferences,
    userReferences,
  };
}
