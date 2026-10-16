import { Crypto, Effect, Layer, Option, Predicate, Schema, Stream } from 'effect';
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
import { ArchiveChapter, ArchivedBibleReference, ArchivedParagraph } from '../writings/archive.js';
import { sectionsByFolder, type CorpusSection } from '../writings/corpus-class.js';
import {
  Paragraph,
  Publication,
  PublicationClassification,
  Reference,
  pageNumber,
  publicationCode,
  publicationId,
  publicationOrder,
  type PublicationId,
} from '../writings/model.js';
import { egwBookRevision } from './egw-revision.js';
import { CorpusContributionRejectedError, CorpusSourceUnavailableError } from './errors.js';
import { provenanceForBytes, unknownProvenance, type WritingsContribution } from './model.js';
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

/** A chapter's paragraphs less those an earlier chapter already gave: the
 *  library repeats a paragraph across chapter files, and `seen` holds the
 *  stable ids of every paragraph kept so far. */
const unseenParagraphs = (
  chapter: readonly EGWSchemas.Paragraph[],
  seen: Set<string>,
): readonly EGWSchemas.Paragraph[] =>
  chapter.filter((paragraph) => {
    const stableId = Option.getOrUndefined(paragraph.para_id);
    if (Predicate.isUndefined(stableId)) return true;
    if (seen.has(stableId)) return false;
    seen.add(stableId);
    return true;
  });

const DownloadedParagraphs = Schema.fromJsonString(Schema.Array(EGWSchemas.ParagraphFromHtml));

/** The chapter files of a downloaded archive, in reading order. Only the
 *  zip's directory is read: no file is expanded. */
const chapterFileNames = (
  zip: Uint8Array,
  requestedId: PublicationId,
): Effect.Effect<readonly string[], CorpusContributionRejectedError> =>
  Effect.gen(function* () {
    const prefix = `${String(requestedId)}.`;
    const order = (name: string) => Number.parseFloat(name.slice(prefix.length, -'.json'.length));
    const names: string[] = [];
    yield* Effect.try({
      try: () =>
        unzipSync(zip, {
          filter: (file) => {
            if (file.name.startsWith(prefix) && file.name.endsWith('.json')) names.push(file.name);
            return false;
          },
        }),
      catch: (cause) => CorpusContributionRejectedError.make({ publication: requestedId, cause }),
    });
    if (names.length === 0) {
      return yield* CorpusContributionRejectedError.make({
        publication: requestedId,
        cause: 'The publication download archive has no chapter files',
      });
    }
    return names.sort((left, right) => order(left) - order(right));
  });

/** One chapter file of a downloaded archive, expanded and decoded alone. */
const chapterFile = (
  zip: Uint8Array,
  name: string,
  requestedId: PublicationId,
): Effect.Effect<readonly EGWSchemas.Paragraph[], CorpusContributionRejectedError> =>
  Effect.gen(function* () {
    const rejected = (cause: unknown) =>
      CorpusContributionRejectedError.make({
        publication: requestedId,
        cause: { file: name, error: cause },
      });
    const files = yield* Effect.try({
      try: () => unzipSync(zip, { filter: (file) => file.name === name }),
      catch: rejected,
    });
    const content = files[name] ?? new Uint8Array();
    return yield* Schema.decodeEffect(DownloadedParagraphs)(new TextDecoder().decode(content)).pipe(
      Effect.mapError(rejected),
    );
  });

/** The book's classification, when its record carries a type.
 *
 *  The API spells an absent subtype as `''` or `' '`; both are absence here. */
const classificationOf = (
  book: EGWSchemas.Book,
  sections: ReadonlyMap<number, CorpusSection>,
): Option.Option<PublicationClassification> => {
  const type = book.type.trim();
  if (type.length === 0) return Option.none();
  return Option.some(
    PublicationClassification.make({
      section: Option.fromUndefinedOr(sections.get(book.folder_id)),
      type,
      subtype: Option.fromNullishOr(book.subtype).pipe(
        Option.map((value) => value.trim()),
        Option.filter((value) => value.length > 0),
      ),
      folderId: book.folder_id,
    }),
  );
};

const publicationFromBook = (
  book: EGWSchemas.Book,
  classification: Option.Option<PublicationClassification> = Option.none(),
) =>
  Effect.try({
    try: () => {
      let author = book.author.trim();
      if (author.length === 0) author = 'Unknown author';
      const fields = {
        id: publicationId(book.book_id),
        code: publicationCode(book.code),
        title: book.title,
        author,
        paragraphCount: Option.some(book.nelements),
      };
      return Option.match(classification, {
        onNone: () => Publication.make(fields),
        onSome: (value) => Publication.make({ ...fields, classification: value }),
      });
    },
    catch: sourceUnavailable('coerce-writings-catalog'),
  });

const publicationOf = (
  book: EGWSchemas.Book,
  sections: ReadonlyMap<number, CorpusSection>,
): Effect.Effect<Publication, CorpusContributionRejectedError> =>
  publicationFromBook(book, classificationOf(book, sections)).pipe(
    Effect.mapError((cause) =>
      CorpusContributionRejectedError.make({
        publication: publicationId(book.book_id),
        cause,
      }),
    ),
  );

/** One chapter's paragraphs as the archive keeps them, with the Scripture
 *  they cite. */
const archiveChapter = (
  publication: Publication,
  paragraphs: readonly EGWSchemas.Paragraph[],
  requestedId: EGWSchemas.Book['book_id'],
): Effect.Effect<ArchiveChapter, CorpusContributionRejectedError> =>
  Effect.gen(function* () {
    const canonicalRequestedId = publicationId(requestedId);
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
    const bibleReferences = extractScriptureRefs(paragraphs, requestedId, (paragraph, bookId) =>
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
    return ArchiveChapter.make({ paragraphs: archived, bibleReferences });
  });

export const layerEgwWritingsAssetSource: Layer.Layer<
  WritingsAssetRecipe,
  never,
  EGWApiClient | Crypto.Crypto
> = Layer.effect(
  WritingsAssetRecipe,
  Effect.gen(function* () {
    const api = yield* EGWApiClient;
    const crypto = yield* Crypto.Crypto;
    // The folder tree, read once per source: every book's section comes from
    // it, and it changes far more rarely than a sync runs.
    const sections = yield* Effect.cached(
      api
        .getFoldersByLanguage('en')
        .pipe(
          Effect.map(sectionsByFolder),
          Effect.mapError(sourceUnavailable('read-writings-folders')),
        ),
    );
    const catalog = api.getBooks({ lang: 'en' }).pipe(
      Stream.mapEffect((book) => publicationFromBook(book)),
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
      const publication = yield* publicationOf(book, yield* sections);
      const download = Option.fromNullishOr(book.download).pipe(
        Option.filter((value) => value.length > 0),
      );
      let provenance = unknownProvenance('egw-api', egwBookRevision(book));
      let chapters: Stream.Stream<
        readonly EGWSchemas.Paragraph[],
        CorpusContributionRejectedError | CorpusSourceUnavailableError
      >;
      if (Option.isSome(download)) {
        const zip = new Uint8Array(
          yield* api
            .downloadBook(requestedId)
            .pipe(Effect.mapError(sourceUnavailable('download-writings-publication'))),
        );
        provenance = yield* provenanceForBytes(crypto, 'egw-api', egwBookRevision(book), zip);
        const names = yield* chapterFileNames(zip, requestedId);
        chapters = Stream.fromIterable(names).pipe(
          Stream.mapEffect((name) => chapterFile(zip, name, requestedId)),
        );
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
        chapters = Stream.fromIterable(chapterIds).pipe(
          Stream.mapEffect(
            (chapterId) =>
              api
                .getChapterContent(requestedId, chapterId)
                .pipe(Effect.mapError(sourceUnavailable(`read-writings-chapter:${chapterId}`))),
            { concurrency: 5 },
          ),
        );
      }
      // Built when the stream runs, so a second run starts from nothing.
      const archived = Stream.unwrap(
        Effect.sync(() => {
          const seen = new Set<string>();
          let kept = 0;
          const noParagraphs = Effect.suspend(() => {
            if (kept > 0) return Effect.void;
            return Effect.fail(
              CorpusContributionRejectedError.make({
                publication: requestedId,
                cause: 'Publication has no paragraphs',
              }),
            );
          });
          return chapters.pipe(
            Stream.map((chapter) => unseenParagraphs(chapter, seen)),
            Stream.filter((paragraphs) => paragraphs.length > 0),
            Stream.mapEffect((paragraphs) => {
              kept += paragraphs.length;
              return archiveChapter(publication, paragraphs, requestedId);
            }),
            Stream.concat(Stream.fromEffect(noParagraphs).pipe(Stream.drain)),
          );
        }),
      );
      const contribution: WritingsContribution = {
        provenance,
        publication: { publication, chapters: archived },
      };
      return contribution;
    });
    return makeWritingsAssetRecipe([{ kind: 'provider', catalog, acquire }]);
  }),
);
