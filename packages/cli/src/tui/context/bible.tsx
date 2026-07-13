import {
  Reference,
  type Book,
  type BookReference,
  type ChapterReference,
  type SearchHit,
  type Verse,
  type VerseReference,
} from '@bible/core/bible';
import { BibleService } from '@bible/core/bible/service';
import { Effect, Option } from 'effect';
import { createContext, useContext, type ParentProps } from 'solid-js';

import { BibleState, type BibleStateService } from '../../data/bible/state.js';
import { useAppRuntime } from '../lib/index.js';

/** Synchronous presentation adapter over the canonical core Bible service. */
export interface BibleReader {
  readonly books: () => readonly Book[];
  readonly book: (reference: BookReference) => Book | undefined;
  readonly chapter: (reference: ChapterReference) => readonly Verse[];
  readonly verse: (reference: VerseReference) => Verse | undefined;
  readonly search: (query: string, limit?: number) => readonly SearchHit[];
}

interface BibleContextValue {
  reader: BibleReader;
  state: BibleStateService;
}

const BibleContext = createContext<BibleContextValue>();

export function BibleProvider(props: ParentProps) {
  const runtime = useAppRuntime();
  const runSync = runtime.runSync;

  // AppWithRuntime receives an initialized ManagedRuntime, so service lookup is
  // synchronous and the provider never exposes a partially-ready context.
  const services = runSync(
    Effect.gen(function* () {
      return {
        reader: yield* BibleService,
        state: yield* BibleState,
      };
    }),
  );

  // BibleDatabase uses Bun's synchronous SQLite driver, so canonical service
  // effects can be adapted synchronously at this TUI boundary.
  const createReader = (): BibleReader => ({
    books: () => runSync(services.reader.books),
    book: (reference) =>
      runSync(
        services.reader.book(reference).pipe(Effect.option, Effect.map(Option.getOrUndefined)),
      ),
    chapter: (reference) => runSync(services.reader.chapter(reference)).verses,
    verse: (reference) =>
      runSync(
        services.reader.chapter(Reference.chapter(reference.book, reference.chapter)),
      ).verses.find((verse) => verse.reference.verse === reference.verse),
    search: (query, limit) => runSync(services.reader.search(query, limit)),
  });

  const value: BibleContextValue = {
    reader: createReader(),
    state: services.state,
  };

  return <BibleContext.Provider value={value}>{props.children}</BibleContext.Provider>;
}

export function useBible(): BibleContextValue {
  const context = useContext(BibleContext);
  if (!context) {
    throw new Error('useBible must be used within a BibleProvider');
  }
  return context;
}

// Convenience hooks
export function useBibleReader(): BibleReader {
  return useBible().reader;
}

export function useBibleState(): BibleStateService {
  return useBible().state;
}
