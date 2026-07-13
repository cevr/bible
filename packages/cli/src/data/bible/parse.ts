/**
 * Bible Reference Parser for CLI
 *
 * Thin wrapper around @bible/core parser with fuzzy matching via match-sorter.
 */

import { matchSorter } from 'match-sorter';

import {
  parseBibleQuery as coreParseBibleQuery,
  type Book,
  type ParseBibleQueryOptions,
} from '@bible/core/bible';

// Re-export types and constructors from core
export type { ParsedBibleQuery } from '@bible/core/bible';
export { ParsedBibleQuery as ParsedQuery } from '@bible/core/bible';

import type { BibleDataSyncService, Verse } from './types.js';

/**
 * Fuzzy matcher using match-sorter library
 */
function fuzzyMatcher(books: readonly Book[], query: string): Book | undefined {
  const matches = matchSorter([...books], query, {
    keys: ['name'],
    threshold: matchSorter.rankings.WORD_STARTS_WITH,
  });
  return matches[0];
}

/**
 * Default parsing options with fuzzy matching enabled
 */
const defaultOptions: ParseBibleQueryOptions = {
  fuzzyMatcher,
};

/**
 * Parse a verse query into a structured result
 *
 * Uses the core parser with fuzzy matching enabled via match-sorter.
 * The BibleDataSyncService parameter is kept for backwards compatibility
 * but is no longer used for parsing (only for getVersesForQuery).
 */
export function parseVerseQuery(
  query: string,
  _data?: BibleDataSyncService,
): ReturnType<typeof coreParseBibleQuery> {
  return coreParseBibleQuery(query, defaultOptions);
}

/**
 * Get verses for a parsed query
 *
 * This is CLI-specific as it uses the CLI's Verse type and BibleDataSyncService.
 */
export function getVersesForQuery(
  query: ReturnType<typeof coreParseBibleQuery>,
  data: BibleDataSyncService,
): Verse[] {
  switch (query._tag) {
    case 'single': {
      const verseNum = query.ref.verse ?? 1;
      const verse = data.getVerse(query.ref.book, query.ref.chapter, verseNum);
      return verse !== undefined ? [verse] : [];
    }

    case 'chapter': {
      return data.getChapter(query.ref.book, query.ref.chapter);
    }

    case 'verseRange': {
      const chapter = data.getChapter(query.ref.start.book, query.ref.start.chapter);
      return chapter.filter(
        (v) => v.verse >= query.ref.start.verse && v.verse <= query.ref.end.verse,
      );
    }

    case 'chapterRange': {
      const verses: Verse[] = [];
      for (let ch = query.start.chapter; ch <= query.end.chapter; ch++) {
        verses.push(...data.getChapter(query.start.book, ch));
      }
      return verses;
    }

    case 'fullBook': {
      const book = data.getBook(query.ref.book);
      if (book === undefined) return [];
      const verses: Verse[] = [];
      for (let ch = 1; ch <= book.chapters; ch++) {
        verses.push(...data.getChapter(query.ref.book, ch));
      }
      return verses;
    }

    case 'search':
      return [];
  }
}
