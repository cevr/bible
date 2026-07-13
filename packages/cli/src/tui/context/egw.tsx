/**
 * EGW Context
 *
 * Provides access to the EGW Reader service from core.
 * Uses a promise cache for efficient data loading with
 * synchronous reads when data is already cached.
 */

import { createCache, type PromiseWithStatus } from '@bible/core/cache';
import * as EGWDbBun from '@bible/core/egw-db/bun';
import { Reference, type Paragraph, type Publication } from '@bible/core/writings';
import { WritingsService } from '@bible/core/writings/service';
import { BunServices } from '@effect/platform-bun';
import { Effect, Layer, ManagedRuntime, Option } from 'effect';
import { createContext, useContext, type ParentProps } from 'solid-js';

/** Reader position persisted by the TUI; this is presentation state, not writings-domain identity. */
export interface EGWReaderPosition {
  readonly bookCode: string;
  readonly page?: number;
  readonly paragraph?: number;
  readonly puborder?: number;
}

// Re-export canonical types for convenience to TUI consumers.
export type { Paragraph, Publication };

// Create combined layer with all dependencies
const EGWServicesLayer = WritingsService.Live.pipe(
  Layer.provideMerge(EGWDbBun.Default),
  Layer.provideMerge(BunServices.layer),
);

// Create ManagedRuntime
const runtime = ManagedRuntime.make(EGWServicesLayer);

// Create caches for each operation
export const booksCache = createCache(async () =>
  runtime.runPromise(
    Effect.gen(function* () {
      const service = yield* WritingsService;
      return yield* service.catalog('Ellen Gould White');
    }),
  ),
);

export const bookCache = createCache(async (bookCode: string) =>
  runtime.runPromise(
    Effect.gen(function* () {
      const service = yield* WritingsService;
      return yield* service
        .publication(Reference.publication(bookCode))
        .pipe(Effect.option, Effect.map(Option.getOrUndefined));
    }),
  ),
);

export const paragraphsCache = createCache(async (bookCode: string) =>
  runtime.runPromise(
    Effect.gen(function* () {
      const service = yield* WritingsService;
      return yield* service.paragraphs(Reference.publication(bookCode));
    }),
  ),
);

export const searchCache = createCache(async (query: string, limit: number = 50) =>
  runtime.runPromise(
    Effect.gen(function* () {
      const service = yield* WritingsService;
      return yield* service
        .search(query, { limit })
        .pipe(Effect.map((hits) => hits.map((hit) => hit.paragraph)));
    }),
  ),
);

interface EGWContextValue {
  /** Get all books */
  getBooks: () => PromiseWithStatus<readonly Publication[]>;
  /** Get book by code */
  getBookByCode: (bookCode: string) => PromiseWithStatus<Publication | undefined>;
  /** Get paragraphs for a book */
  getParagraphsByBookCode: (bookCode: string) => PromiseWithStatus<readonly Paragraph[]>;
  /** Search paragraphs */
  searchParagraphs: (query: string, limit?: number) => PromiseWithStatus<readonly Paragraph[]>;
  /** Peek at cached books (sync, returns undefined if not cached) */
  peekBooks: () => readonly Publication[] | undefined;
  /** Peek at cached book (sync) */
  peekBook: (bookCode: string) => Publication | undefined;
  /** Peek at cached paragraphs (sync) */
  peekParagraphs: (bookCode: string) => readonly Paragraph[] | undefined;
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
