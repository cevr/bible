import { Effect, Layer, Option, Predicate, Schema, Stream } from 'effect';
import { unzipSync } from 'fflate';

import {
  Reference as BibleReference,
  type ChapterReference,
  type VerseReference,
} from '../bible/model.js';
import { EGWApiClient } from '../egw/client.js';
import { extractScriptureRefs, paragraphRefcode } from '../egw/extract.js';
import { chapterIdFromTocItem, isChapterHeading } from '../egw/parse.js';
import * as EGWSchemas from '../egw/schemas.js';
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
  type PublicationId,
} from '../writings/model.js';
import { CorpusContributionRejectedError, CorpusSourceUnavailableError } from './errors.js';
import { provenanceForArchive, WritingsContribution } from './model.js';
import { makeWritingsAssetRecipe, WritingsAssetRecipe } from './source.js';

const sourceUnavailable = (operation: string) => (cause: unknown) =>
  CorpusSourceUnavailableError.make({ operation, cause });

const optionalText = (value: Option.Option<string>): Option.Option<string> =>
  value.pipe(Option.filter((text) => text.length > 0));

const refcodeNumbers = (refcode: string) => {
  const match = refcode.match(/\s(\d+)(?:\.(\d+))?$/);
  return {
    page: match?.[1],
    paragraph: match?.[2],
  };
};

const uniqueProviderParagraphs = (
  chapters: readonly (readonly EGWSchemas.Paragraph[])[],
): readonly EGWSchemas.Paragraph[] => {
  const seen = new Set<string>();
  const paragraphs: EGWSchemas.Paragraph[] = [];
  for (const chapter of chapters) {
    for (const paragraph of chapter) {
      const stableId = Option.getOrUndefined(paragraph.para_id);
      if (Predicate.isNotUndefined(stableId) && seen.has(stableId)) continue;
      if (Predicate.isNotUndefined(stableId)) seen.add(stableId);
      paragraphs.push(paragraph);
    }
  }
  return paragraphs;
};

const DownloadedParagraphs = Schema.fromJsonString(Schema.Array(EGWSchemas.ParagraphFromHtml));

const downloadedParagraphFiles = (
  bytes: ArrayBuffer,
  requestedId: PublicationId,
): Effect.Effect<readonly (readonly EGWSchemas.Paragraph[])[], CorpusContributionRejectedError> =>
  Effect.gen(function* () {
    const files = yield* Effect.try({
      try: () => unzipSync(new Uint8Array(bytes)),
      catch: (cause) => CorpusContributionRejectedError.make({ publication: requestedId, cause }),
    });
    const prefix = `${String(requestedId)}.`;
    const chapters = Object.entries(files)
      .filter(([name]) => name.startsWith(prefix) && name.endsWith('.json'))
      .sort(([left], [right]) => {
        const leftOrder = Number.parseFloat(left.slice(prefix.length, -'.json'.length));
        const rightOrder = Number.parseFloat(right.slice(prefix.length, -'.json'.length));
        return leftOrder - rightOrder;
      });
    if (chapters.length === 0) {
      return yield* CorpusContributionRejectedError.make({
        publication: requestedId,
        cause: 'The publication download archive has no chapter files',
      });
    }
    return yield* Effect.forEach(chapters, ([name, content]) =>
      Schema.decodeEffect(DownloadedParagraphs)(new TextDecoder().decode(content)).pipe(
        Effect.mapError((cause) =>
          CorpusContributionRejectedError.make({
            publication: requestedId,
            cause: { file: name, error: cause },
          }),
        ),
      ),
    );
  });

const publicationFromBook = (book: EGWSchemas.Book) =>
  Effect.try({
    try: () => {
      let author = book.author.trim();
      if (author.length === 0) author = 'Unknown author';
      return Publication.make({
        id: publicationId(book.book_id),
        code: publicationCode(book.code),
        title: book.title,
        author,
        paragraphCount: Option.some(book.nelements),
      });
    },
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
      Effect.mapError((cause) =>
        CorpusContributionRejectedError.make({
          publication: canonicalRequestedId,
          cause,
        }),
      ),
    );
    const archived = yield* Effect.forEach(paragraphs, (paragraph) => {
      const stableId = Option.getOrUndefined(paragraph.para_id);
      if (Predicate.isUndefined(stableId)) {
        return Effect.fail(
          CorpusContributionRejectedError.make({
            publication: canonicalRequestedId,
            cause: `Paragraph ${String(paragraph.puborder)} has no stable identifier`,
          }),
        );
      }
      const displayRefcode = paragraphRefcode(paragraph, requestedId);
      const numbers = refcodeNumbers(displayRefcode);
      return Effect.try({
        try: () =>
          ArchivedParagraph.make({
            refcode: stableId,
            paragraph: Paragraph.make({
              reference: Reference.paragraph(publication.id, stableId),
              publicationCode: publication.code,
              order: publicationOrder(paragraph.puborder),
              page: Option.fromNullishOr(numbers.page).pipe(
                Option.map((value) => pageNumber(Number.parseInt(value, 10))),
              ),
              number: Option.fromNullishOr(numbers.paragraph).pipe(
                Option.map((value) => Number.parseInt(value, 10)),
              ),
              refcode: Option.some(displayRefcode),
              nodes: paragraph.nodes,
              elementType: optionalText(Option.fromNullishOr(paragraph.element_type)),
              elementSubtype: optionalText(Option.fromNullishOr(paragraph.element_subtype)),
            }),
            isHeading: isChapterHeading(Option.fromNullishOr(paragraph.element_type)),
          }),
        catch: (cause) =>
          CorpusContributionRejectedError.make({
            publication: canonicalRequestedId,
            cause,
          }),
      });
    });
    const bibleReferences = extractScriptureRefs(paragraphs, book.book_id, (paragraph, bookId) =>
      Option.getOrElse(
        paragraph.para_id,
        () => `book-${String(bookId)}-para-${String(paragraph.puborder)}`,
      ),
    ).map((reference) => {
      let scripture: ChapterReference | VerseReference = BibleReference.chapter(
        reference.bibleBook,
        reference.bibleChapter,
      );
      if (Option.isSome(reference.bibleVerse)) {
        scripture = BibleReference.verse(
          reference.bibleBook,
          reference.bibleChapter,
          reference.bibleVerse.value,
        );
      }
      return ArchivedBibleReference.make({
        paragraphRefcode: reference.refCode,
        scripture,
      });
    });
    return PublicationArchive.make({
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
      const acquire = Effect.fn('WritingsAssetSource.acquire')(function* (
        requestedId: PublicationId,
      ) {
        const book = yield* api
          .getBook(requestedId)
          .pipe(Effect.mapError(sourceUnavailable('read-writings-publication')));
        if (book.book_id !== requestedId) {
          return yield* CorpusContributionRejectedError.make({
            publication: requestedId,
            cause: `Received publication ${String(book.book_id)}`,
          });
        }
        const download = Option.fromNullishOr(book.download).pipe(
          Option.filter((value) => value.length > 0),
        );
        let chapters: readonly (readonly EGWSchemas.Paragraph[])[];
        if (Option.isSome(download)) {
          const bytes = yield* api
            .downloadBook(requestedId)
            .pipe(Effect.mapError(sourceUnavailable('download-writings-publication')));
          chapters = yield* downloadedParagraphFiles(bytes, requestedId);
        } else {
          const toc = yield* api
            .getBookToc(requestedId)
            .pipe(Effect.mapError(sourceUnavailable('read-writings-toc')));
          const chapterIds = toc.flatMap((item) => {
            if (Option.isNone(item.para_id) && Predicate.isUndefined(item.puborder)) return [];
            return [chapterIdFromTocItem(item)];
          });
          if (chapterIds.length === 0) {
            return yield* CorpusContributionRejectedError.make({
              publication: requestedId,
              cause: 'Publication has no chapters',
            });
          }
          chapters = yield* Effect.forEach(
            chapterIds,
            (chapterId) =>
              api
                .getChapterContent(requestedId, chapterId)
                .pipe(Effect.mapError(sourceUnavailable(`read-writings-chapter:${chapterId}`))),
            { concurrency: 5 },
          );
        }
        const paragraphs = uniqueProviderParagraphs(chapters);
        if (paragraphs.length === 0) {
          return yield* CorpusContributionRejectedError.make({
            publication: requestedId,
            cause: 'Publication has no paragraphs',
          });
        }
        const archive = yield* archiveFromBook(book, paragraphs, requestedId);
        let revision = book.pub_year;
        if (Predicate.isNotNullish(book.last_modified)) {
          revision = book.last_modified;
        }
        const provenance = yield* provenanceForArchive('egw-api', revision, archive);
        return WritingsContribution.make({ provenance, archive });
      });
      return makeWritingsAssetRecipe([{ kind: 'provider', catalog, acquire }]);
    }),
  );
