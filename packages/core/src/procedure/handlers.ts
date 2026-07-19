import { Reference as BibleReference } from '../bible/index.js';
import { BibleService } from '../bible/service.js';
import { Reference as WritingsReference } from '../writings/index.js';
import { WritingsService } from '../writings/service.js';
import { TopicService } from '../topics/service.js';
import { Effect } from 'effect';

import { BibleProcedureGroup } from './group.js';
import { ProcedureError } from './model.js';
import { LibraryStateRuntime, ProcedureRuntime, ReadingPreferencesRuntime } from './services.js';

const errorCode = (cause: unknown): string => {
  if (typeof cause === 'object' && cause !== null && '_tag' in cause) {
    const tag = cause['_tag'];
    if (typeof tag === 'string' && tag.length > 0) return tag;
  }
  return 'UnexpectedProcedureFailure';
};

const errorMessage = (cause: unknown): string => {
  if (typeof cause === 'object' && cause !== null && 'message' in cause) {
    const message = cause['message'];
    if (typeof message === 'string' && message.length > 0) return message;
  }
  const code = errorCode(cause);
  if (code === 'UnexpectedProcedureFailure') return String(cause);
  return code;
};

const normalizeFailure =
  (procedure: string) =>
  (cause: unknown): ProcedureError => {
    if (cause instanceof ProcedureError) return cause;
    return new ProcedureError({
      procedure,
      code: errorCode(cause),
      message: errorMessage(cause),
    });
  };

export const BibleProcedureHandlers = BibleProcedureGroup.toLayer(
  Effect.gen(function* () {
    const bible = yield* BibleService;
    const writings = yield* WritingsService;
    const runtime = yield* ProcedureRuntime;
    const preferences = yield* ReadingPreferencesRuntime;
    const library = yield* LibraryStateRuntime;
    const topics = yield* TopicService;

    return {
      'v1.runtime.connect': (input) => runtime.connect(input),
      'v1.runtime.events': (input) => runtime.events(input),
      'v1.reading.bibleChapter.get': (input) =>
        bible
          .chapter(BibleReference.chapter(input.book, input.chapter))
          .pipe(Effect.mapError(normalizeFailure('v1.reading.bibleChapter.get'))),
      'v1.reading.bibleSearch.get': (input) =>
        bible
          .searchWindow(input.query, {
            books: input.books,
            offset: input.offset,
            limit: input.limit,
          })
          .pipe(Effect.mapError(normalizeFailure('v1.reading.bibleSearch.get'))),
      'v1.reading.writingsCatalog.get': (input) =>
        writings
          .catalog(input.author)
          .pipe(Effect.mapError(normalizeFailure('v1.reading.writingsCatalog.get'))),
      'v1.reading.writingsPage.get': (input) =>
        writings
          .page(WritingsReference.page(input.publicationId, input.page))
          .pipe(Effect.mapError(normalizeFailure('v1.reading.writingsPage.get'))),
      'v1.reading.writingsPublication.open': (input) =>
        writings
          .openingPage(WritingsReference.publication(input.publicationId))
          .pipe(Effect.mapError(normalizeFailure('v1.reading.writingsPublication.open'))),
      'v1.reading.writingsParagraph.get': (input) =>
        writings
          .paragraph(WritingsReference.paragraph(input.publicationId, input.paragraphId))
          .pipe(Effect.mapError(normalizeFailure('v1.reading.writingsParagraph.get'))),
      'v1.preferences.reading.get': () => preferences.get,
      'v1.preferences.reading.patch': (input) => preferences.patch(input.patch),
      'v1.library.annotations.get': (input) => library.annotations(input),
      'v1.library.collections.get': () => library.collections,
      'v1.library.plans.get': () => library.readingPlans,
      'v1.library.practice.get': () => library.memoryPractice,
      'v1.library.mutate': (input) => library.mutate(input.command),
      'v1.topics.list': (input) =>
        topics.list(input).pipe(Effect.mapError(normalizeFailure('v1.topics.list'))),
      'v1.topics.get': (input) =>
        topics.topic(input.id).pipe(Effect.mapError(normalizeFailure('v1.topics.get'))),
    };
  }),
);
