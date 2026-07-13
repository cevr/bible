/**
 * EGW Context
 *
 * Provides access to the EGW Reader service from core.
 * Uses a promise cache for efficient data loading with
 * synchronous reads when data is already cached.
 */

import { createCache, type PromiseWithStatus } from '@bible/core/cache';
import { Reference, type Paragraph, type Publication } from '@bible/core/writings';
import { WritingsService } from '@bible/core/writings/service';
import { Effect, Option } from 'effect';
import { createContext, useContext, type ParentProps } from 'solid-js';

import { useAppRuntime, type AppServices } from '../lib/index.js';

/** Reader position persisted by the TUI; this is presentation state, not writings-domain identity. */
export interface EGWReaderPosition {
  readonly bookCode: string;
  readonly page?: number;
  readonly paragraph?: number;
  readonly puborder?: number;
}

// Re-export canonical types for convenience to TUI consumers.
export type { Paragraph, Publication };

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

export function EGWProvider(props: ParentProps) {
  const runtime = useAppRuntime<AppServices>();
  const run = <A, E>(effect: Effect.Effect<A, E, AppServices>) => runtime.runPromise(effect);

  const booksCache = createCache(async () =>
    run(WritingsService.use((service) => service.catalog('Ellen Gould White'))),
  );
  const bookCache = createCache(async (bookCode: string) =>
    run(
      WritingsService.use((service) =>
        service
          .publication(Reference.publication(bookCode))
          .pipe(Effect.option, Effect.map(Option.getOrUndefined)),
      ),
    ),
  );
  const paragraphsCache = createCache(async (bookCode: string) =>
    run(WritingsService.use((service) => service.paragraphs(Reference.publication(bookCode)))),
  );
  const searchCache = createCache(async (query: string, limit: number = 50) =>
    run(
      WritingsService.use((service) =>
        service
          .search(query, { limit })
          .pipe(Effect.map((hits) => hits.map((hit) => hit.paragraph))),
      ),
    ),
  );

  const value: EGWContextValue = {
    getBooks: () => booksCache.get(),
    getBookByCode: (bookCode) => bookCache.get(bookCode),
    getParagraphsByBookCode: (bookCode) => paragraphsCache.get(bookCode),
    searchParagraphs: (query, limit = 50) => searchCache.get(query, limit),
    peekBooks: () => booksCache.peek(),
    peekBook: (bookCode) => bookCache.peek(bookCode),
    peekParagraphs: (bookCode) => paragraphsCache.peek(bookCode),
  };

  return <EGWContext.Provider value={value}>{props.children}</EGWContext.Provider>;
}

export function useEGW(): EGWContextValue {
  const context = useContext(EGWContext);
  if (!context) {
    throw new Error('useEGW must be used within an EGWProvider');
  }
  return context;
}
