import { Effect, Layer, Option, Stream } from 'effect';

import {
  Reference as BibleReference,
  type ChapterReference,
  type VerseReference,
} from '../bible/model.js';
import { EGWApiClient } from '../egw/client.js';
import { extractScriptureRefs } from '../egw/extract.js';
import { chapterIdFromTocItem, isChapterHeading } from '../egw/parse.js';
import type * as EGWSchemas from '../egw/schemas.js';
import {
  ArchivedBibleReference,
  ArchivedParagraph,
  PublicationArchive,
} from '../writings/archive.js';
import {
  Paragraph,
  Publication,
  Reference,
  pageNumber,
  publicationCode,
  publicationId,
  publicationOrder,
} from '../writings/model.js';
import { CorpusContributionRejectedError, CorpusSourceUnavailableError } from './errors.js';
import { provenanceForArchive, WritingsContribution } from './model.js';
import { makeWritingsAssetRecipe, WritingsAssetRecipe } from './source.js';

const sourceUnavailable = (operation: string) => (cause: unknown) =>
  new CorpusSourceUnavailableError({ operation, cause });

const optionalText = (value: string | null | undefined): Option.Option<string> => {
  if (value === null || value === undefined || value.length === 0) return Option.none();
  return Option.some(value);
};

const refcodeNumbers = (refcode: string) => {
  const match = refcode.match(/\s(\d+)(?:\.(\d+))?$/);
  return {
    page: match?.[1],
    paragraph: match?.[2],
  };
};

const publicationFromBook = (book: EGWSchemas.Book) =>
  Effect.try({
    try: () =>
      new Publication({
        id: publicationId(book.book_id),
        code: publicationCode(book.code),
        title: book.title,
        author: book.author,
        paragraphCount: Option.some(book.nelements),
      }),
    catch: sourceUnavailable('coerce-writings-catalog'),
  });

const archiveFromBook = (
  book: EGWSchemas.Book,
  paragraphs: readonly EGWSchemas.Paragraph[],
  requestedId: EGWSchemas.Book['book_id'],
): Effect.Effect<PublicationArchive, CorpusContributionRejectedError> =>
  Effect.gen(function* () {
    const canonicalRequestedId = publicationId(requestedId);
    const publication = yield* publicationFromBook(book).pipe(
      Effect.mapError(
        (cause) =>
          new CorpusContributionRejectedError({
            publication: canonicalRequestedId,
            cause,
          }),
      ),
    );
    const archived = yield* Effect.forEach(paragraphs, (paragraph) => {
      const stableId = Option.getOrUndefined(paragraph.para_id);
      if (stableId === undefined) {
        return Effect.fail(
          new CorpusContributionRejectedError({
            publication: canonicalRequestedId,
            cause: `Paragraph ${String(paragraph.puborder)} has no stable identifier`,
          }),
        );
      }
      const refcode =
        Option.getOrUndefined(paragraph.refcode_short) ?? paragraph.refcode_long ?? stableId;
      const numbers = refcodeNumbers(refcode);
      return Effect.try({
        try: () =>
          new ArchivedParagraph({
            refcode,
            paragraph: new Paragraph({
              reference: Reference.paragraph(publication.id, stableId),
              publicationCode: publication.code,
              order: publicationOrder(paragraph.puborder),
              page: Option.fromNullishOr(numbers.page).pipe(
                Option.map((value) => pageNumber(Number.parseInt(value, 10))),
              ),
              number: Option.fromNullishOr(numbers.paragraph).pipe(
                Option.map((value) => Number.parseInt(value, 10)),
              ),
              refcode: Option.some(refcode),
              nodes: paragraph.nodes,
              elementType: optionalText(paragraph.element_type),
              elementSubtype: optionalText(paragraph.element_subtype),
            }),
            isHeading: isChapterHeading(paragraph.element_type ?? null),
          }),
        catch: (cause) =>
          new CorpusContributionRejectedError({
            publication: canonicalRequestedId,
            cause,
          }),
      });
    });
    const bibleReferences = extractScriptureRefs(paragraphs, book.book_id).map((reference) => {
      let scripture: ChapterReference | VerseReference = BibleReference.chapter(
        reference.bibleBook,
        reference.bibleChapter,
      );
      if (reference.bibleVerse !== null) {
        scripture = BibleReference.verse(
          reference.bibleBook,
          reference.bibleChapter,
          reference.bibleVerse,
        );
      }
      return new ArchivedBibleReference({
        paragraphRefcode: reference.refCode,
        scripture,
      });
    });
    return new PublicationArchive({
      publication,
      paragraphs: archived,
      bibleReferences,
    });
  });

export const layerEgwWritingsAssetSource: Layer.Layer<WritingsAssetRecipe, never, EGWApiClient> =
  Layer.effect(
    WritingsAssetRecipe,
    Effect.gen(function* () {
      const api = yield* EGWApiClient;
      const catalog = api.getBooks({ lang: 'en' }).pipe(
        Stream.mapEffect(publicationFromBook),
        Stream.runCollect,
        Effect.map((items) => [...items]),
        Effect.mapError(sourceUnavailable('read-writings-catalog')),
      );
      const acquire = Effect.fn('WritingsAssetSource.acquire')(function* (requestedId) {
        const book = yield* api
          .getBook(requestedId)
          .pipe(Effect.mapError(sourceUnavailable('read-writings-publication')));
        const toc = yield* api
          .getBookToc(requestedId)
          .pipe(Effect.mapError(sourceUnavailable('read-writings-toc')));
        const chapterIds = toc.flatMap((item) => {
          if (Option.isNone(item.para_id) && item.puborder === undefined) return [];
          return [chapterIdFromTocItem(item)];
        });
        if (chapterIds.length === 0) {
          return yield* new CorpusContributionRejectedError({
            publication: requestedId,
            cause: 'Publication has no chapters',
          });
        }
        const chapters = yield* Effect.forEach(
          chapterIds,
          (chapterId) =>
            api
              .getChapterContent(requestedId, chapterId)
              .pipe(Effect.mapError(sourceUnavailable(`read-writings-chapter:${chapterId}`))),
          { concurrency: 5 },
        );
        const paragraphs = chapters.flatMap((chapter) => chapter);
        if (paragraphs.length === 0) {
          return yield* new CorpusContributionRejectedError({
            publication: requestedId,
            cause: 'Publication has no paragraphs',
          });
        }
        if (book.book_id !== requestedId) {
          return yield* new CorpusContributionRejectedError({
            publication: requestedId,
            cause: `Received publication ${String(book.book_id)}`,
          });
        }
        const archive = yield* archiveFromBook(book, paragraphs, requestedId);
        let revision = book.pub_year;
        if (book.last_modified !== null && book.last_modified !== undefined) {
          revision = book.last_modified;
        }
        const provenance = yield* provenanceForArchive('egw-api', revision, archive);
        return new WritingsContribution({ provenance, archive });
      });
      return makeWritingsAssetRecipe([{ kind: 'provider', catalog, acquire }]);
    }),
  );
