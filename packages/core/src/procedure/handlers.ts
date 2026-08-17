import { Reference as BibleReference } from '../bible/index.js';
import { BibleService } from '../bible/service.js';
import { Reference as WritingsReference } from '../writings/index.js';
import { WritingsService } from '../writings/service.js';
import { StudyCorpusDataError, StudyService } from '../study/service.js';
import { TopicService } from '../topics/service.js';
import { LookupInput } from '../wiki/lookup-model.js';
import { LookupService } from '../wiki/lookup-service.js';
import { WikiService } from '../wiki/service.js';
import { Effect, Option, Predicate, Schema } from 'effect';

import { BibleProcedureGroup } from './group.js';
import { ProcedureError } from './model.js';
import {
  DataPortabilityRuntime,
  LibraryStateRuntime,
  ProcedureRuntime,
  ReadingContinuityRuntime,
  ReadingPreferencesRuntime,
  WritingsLibraryRuntime,
} from './services.js';

const errorCode = (cause: unknown): string => {
  if (Predicate.isObject(cause)) {
    const tag = cause['_tag'];
    if (Predicate.isString(tag) && tag.length > 0) return tag;
  }
  return 'UnexpectedProcedureFailure';
};

const errorMessage = (cause: unknown): string => {
  if (Predicate.isObject(cause)) {
    const message = cause['message'];
    if (Predicate.isString(message) && message.length > 0) return message;
  }
  const code = errorCode(cause);
  if (code === 'UnexpectedProcedureFailure') return String(cause);
  return code;
};

const normalizeFailure =
  (procedure: string) =>
  (cause: unknown): ProcedureError => {
    if (Schema.is(ProcedureError)(cause)) return cause;
    return ProcedureError.make({
      procedure,
      code: errorCode(cause),
      message: errorMessage(cause),
    });
  };

const isCorpusDataError = Schema.is(StudyCorpusDataError);

/** The study seam's failure mapping: `StudyCorpusDataError` crosses as itself,
 *  everything else normalizes.
 *
 *  The two `v1.study.*` procedures declare `StudyProcedureError`, so the tagged
 *  error is a value the wire can carry. Passing it through `normalizeFailure`
 *  would still typecheck and would still produce a failure a client could
 *  render — with `source`, `operation` and `row` gone. `row` is the whole point
 *  of the error: it names the corpus row an operator has to open, and no
 *  message reconstructs it. */
const normalizeStudyFailure =
  (procedure: string) =>
  (cause: unknown): ProcedureError | StudyCorpusDataError => {
    if (isCorpusDataError(cause)) return cause;
    return normalizeFailure(procedure)(cause);
  };

export const BibleProcedureHandlers = BibleProcedureGroup.toLayer(
  Effect.gen(function* () {
    const bible = yield* BibleService;
    const writings = yield* WritingsService;
    const writingsLibrary = yield* WritingsLibraryRuntime;
    const runtime = yield* ProcedureRuntime;
    const continuity = yield* ReadingContinuityRuntime;
    const preferences = yield* ReadingPreferencesRuntime;
    const library = yield* LibraryStateRuntime;
    const topics = yield* TopicService;
    const wiki = yield* WikiService;
    const lookup = yield* LookupService;
    const study = yield* StudyService;
    const data = yield* DataPortabilityRuntime;

    return {
      'v1.runtime.connect': (input) => runtime.connect(input),
      'v1.runtime.events': (input) => runtime.events(input),
      'v1.reading.bibleChapter.get': (input) =>
        bible
          .chapter(BibleReference.chapter(input.book, input.chapter))
          .pipe(Effect.mapError(normalizeFailure('v1.reading.bibleChapter.get'))),
      'v1.reading.bibleChapterMarginAnchors.get': (input) =>
        bible
          .chapterMarginAnchors(BibleReference.chapter(input.book, input.chapter))
          .pipe(Effect.mapError(normalizeFailure('v1.reading.bibleChapterMarginAnchors.get'))),
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
      'v1.reading.writingsLibrary.get': () => writingsLibrary.get,
      'v1.reading.writingsPublication.download': (input) =>
        writingsLibrary.download(input.publicationId),
      'v1.reading.writingsLibrary.downloadAll': () => writingsLibrary.downloadAll,
      'v1.reading.continuity.get': () => continuity.get.pipe(Effect.map(Option.getOrNull)),
      'v1.reading.continuity.record': (input) => continuity.record(input),
      'v1.preferences.reading.get': () => preferences.get,
      'v1.preferences.reading.patch': (input) => preferences.patch(input.patch),
      'v1.library.annotations.get': (input) => library.annotations(input),
      'v1.library.collections.get': () => library.collections,
      'v1.library.plans.get': () => library.readingPlans,
      'v1.library.practice.get': () => library.memoryPractice,
      'v1.library.mutate': (input) => library.mutate(input.command),
      'v1.data.export': () => data.export,
      'v1.data.import': (input) => data.import(input.document),
      'v1.topics.list': (input) =>
        topics.list(input).pipe(Effect.mapError(normalizeFailure('v1.topics.list'))),
      'v1.topics.get': (input) =>
        topics.topic(input.id).pipe(Effect.mapError(normalizeFailure('v1.topics.get'))),
      // The composed page comes back whole, from the same `WikiService` the CLI
      // calls directly — so "the RPC page" and "the CLI page" are not two
      // renderings that could drift, they are one value crossing two seams.
      'v1.wiki.topic.get': (input) =>
        wiki.topic(input.slug).pipe(Effect.mapError(normalizeFailure('v1.wiki.topic.get'))),
      'v1.wiki.topics.list': (input) =>
        wiki.list(input).pipe(Effect.mapError(normalizeFailure('v1.wiki.topics.list'))),
      'v1.wiki.dictionary.get': () =>
        wiki.dictionary.pipe(Effect.mapError(normalizeFailure('v1.wiki.dictionary.get'))),
      // The five groups come back whole, from the same `LookupService` the CLI
      // calls directly — so "the RPC panel" and "the CLI's `--json`" are one
      // value crossing two seams (§7). `resolve` does not fail: every source
      // degrades to an empty group, so there is no failure to normalize.
      'v1.wiki.lookup.resolve': (input) =>
        lookup.resolve(
          LookupInput.make({
            text: input.text,
            context: Option.fromNullishOr(input.context),
          }),
        ),
      // The whole bundle, composed inside the host by the same `StudyService`
      // the CLI resolves directly — so "the RPC bundle" and "the CLI bundle"
      // are one value crossing two seams, and the five sections cost the
      // client exactly one MessagePort round trip (§8.2).
      'v1.study.verse.get': (input) =>
        study
          .verse(BibleReference.verse(input.book, input.chapter, input.verse))
          .pipe(Effect.mapError(normalizeStudyFailure('v1.study.verse.get'))),
      'v1.study.strongs.get': (input) =>
        study
          .strongs(input.number, { limit: input.limit })
          .pipe(Effect.mapError(normalizeStudyFailure('v1.study.strongs.get'))),
    };
  }),
);
