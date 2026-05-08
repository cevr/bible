/**
 * EGW Context
 *
 * Provides access to the EGW Reader service from core.
 * Uses a promise cache for efficient data loading with
 * synchronous reads when data is already cached.
 */

import { createCache, type PromiseWithStatus } from '@bible/core/cache';
import { EGWParagraphDatabase } from '@bible/core/egw-db';
import {
  EGWReaderService,
  type EGWBookInfo,
  type EGWParagraph,
  type EGWReaderPosition,
} from '@bible/core/egw-reader';
import { BunServices } from '@effect/platform-bun';
import { Effect, Layer, ManagedRuntime } from 'effect';
import { createContext, useContext, type ParentProps } from 'solid-js';

// Re-export types for convenience
export type { EGWBookInfo, EGWParagraph, EGWReaderPosition };

// Create combined layer with all dependencies
const EGWServicesLayer = EGWReaderService.Default.pipe(
  Layer.provideMerge(EGWParagraphDatabase.Default),
  Layer.provideMerge(BunServices.layer),
);

// Create ManagedRuntime
const runtime = ManagedRuntime.make(EGWServicesLayer);

// Create caches for each operation
export const booksCache = createCache(async () =>
  runtime.runPromise(
    Effect.gen(function* () {
      const service = yield* EGWReaderService;
      return yield* service.getBooks();
    }),
  ),
);

export const bookCache = createCache(async (bookCode: string) =>
  runtime.runPromise(
    Effect.gen(function* () {
      const service = yield* EGWReaderService;
      const optBook = yield* service.getBookByCode(bookCode);
      return optBook._tag === 'Some' ? optBook.value : undefined;
    }),
  ),
);

export const paragraphsCache = createCache(async (bookCode: string) =>
  runtime.runPromise(
    Effect.gen(function* () {
      const service = yield* EGWReaderService;
      return yield* service.getParagraphsByBookCode(bookCode);
    }),
  ),
);

export const searchCache = createCache(async (query: string, limit: number = 50) =>
  runtime.runPromise(
    Effect.gen(function* () {
      const service = yield* EGWReaderService;
      return yield* service.searchParagraphs(query, limit);
    }),
  ),
);

interface EGWContextValue {
  /** Get all books */
  getBooks: () => PromiseWithStatus<readonly EGWBookInfo[]>;
  /** Get book by code */
  getBookByCode: (bookCode: string) => PromiseWithStatus<EGWBookInfo | undefined>;
  /** Get paragraphs for a book */
  getParagraphsByBookCode: (bookCode: string) => PromiseWithStatus<readonly EGWParagraph[]>;
  /** Search paragraphs */
  searchParagraphs: (query: string, limit?: number) => PromiseWithStatus<readonly EGWParagraph[]>;
  /** Peek at cached books (sync, returns undefined if not cached) */
  peekBooks: () => readonly EGWBookInfo[] | undefined;
  /** Peek at cached book (sync) */
  peekBook: (bookCode: string) => EGWBookInfo | undefined;
  /** Peek at cached paragraphs (sync) */
  peekParagraphs: (bookCode: string) => readonly EGWParagraph[] | undefined;
}

const EGWContext = createContext<EGWContextValue>();

const egwService: EGWContextValue = {
  getBooks: () => booksCache.get(),
  getBookByCode: (bookCode) => bookCache.get(bookCode),
  getParagraphsByBookCode: (bookCode) => paragraphsCache.get(bookCode),
  searchParagraphs: (query, limit = 50) => searchCache.get(query, limit),
  peekBooks: () => booksCache.peek(),
  peekBook: (bookCode) => bookCache.peek(bookCode),
  peekParagraphs: (bookCode) => paragraphsCache.peek(bookCode),
};

export function EGWProvider(props: ParentProps) {
  return <EGWContext.Provider value={egwService}>{props.children}</EGWContext.Provider>;
}

export function useEGW(): EGWContextValue {
  const context = useContext(EGWContext);
  if (!context) {
    throw new Error('useEGW must be used within an EGWProvider');
  }
  return context;
}
