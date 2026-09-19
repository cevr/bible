import { Context, Effect, Layer, Option, Predicate, Stream } from 'effect';

import {
  EGWParagraphDatabase,
  ftsTermQuery,
  type BookRow,
  type ParagraphDatabaseError,
} from '../egw-db/book-database.js';
import type * as EGWSchemas from '../egw/schemas.js';
import { nodesToText } from '../egw/ast.js';
import type { CorpusScope } from './corpus-scope.js';
import {
  WritingsAmbiguousPublicationCodeError,
  WritingsDataIntegrityError,
  type WritingsError,
  WritingsInvalidSearchError,
  WritingsParagraphNotFoundError,
  WritingsPageNotFoundError,
  WritingsPublicationNotFoundError,
  WritingsUnavailableError,
} from './errors.js';
import {
  Heading,
  Page,
  type PageReference,
  Paragraph,
  type ParagraphReference,
  Publication,
  type PublicationReference,
  Reference,
  SearchHit,
  publicationCode,
  publicationId,
  publicationOrder,
  pageNumber,
} from './model.js';

type Operation = WritingsUnavailableError['operation'];

const unavailable =
  (operation: Operation) =>
  (cause: ParagraphDatabaseError): WritingsUnavailableError =>
    WritingsUnavailableError.make({ operation, cause });

const integrity = (operation: Operation, cause: unknown): WritingsDataIntegrityError =>
  WritingsDataIntegrityError.make({ operation, cause });

const optionalText = (value: Option.Option<string>): Option.Option<string> =>
  value.pipe(Option.filter((text) => text.length > 0));

const refcodeNumbers = (refcode: Option.Option<string>) => {
  const match = refcode.pipe(
    Option.flatMap((value) => Option.fromNullishOr(value.match(/\s(\d+)(?:\.(\d+))?$/))),
  );
  const digits = (index: number) =>
    match.pipe(
      Option.flatMap((groups) => Option.fromNullishOr(groups[index])),
      Option.filter((value) => value.length > 0),
      Option.map((value) => Number.parseInt(value, 10)),
    );
  return {
    page: digits(1),
    paragraph: digits(2),
  };
};

const makePublication = (
  row: BookRow,
  operation: Operation,
): Effect.Effect<Publication, WritingsDataIntegrityError> =>
  Effect.try({
    try: () =>
      Publication.make({
        id: publicationId(row.book_id),
        code: publicationCode(row.book_code),
        title: row.book_title,
        author: row.book_author,
        paragraphCount: Option.some(row.paragraph_count),
      }),
    catch: (cause) => integrity(operation, cause),
  });

const makeParagraph = (
  publication: Publication,
  row: EGWSchemas.Paragraph,
  operation: Operation,
): Effect.Effect<Paragraph, WritingsDataIntegrityError> =>
  Effect.gen(function* () {
    if (Option.isNone(row.para_id)) {
      return yield* integrity(
        operation,
        `paragraph ${String(row.puborder)} has no stable paragraph identifier`,
      );
    }
    const stableParagraphId = row.para_id.value;
    return yield* Effect.try({
      try: () => {
        const refcode = row.refcode_short.pipe(
          Option.orElse(() => Option.fromNullishOr(row.refcode_long)),
        );
        const numbers = refcodeNumbers(refcode);
        return Paragraph.make({
          reference: Reference.paragraph(publication.id, stableParagraphId),
          publicationCode: publication.code,
          order: publicationOrder(row.puborder),
          page: numbers.page.pipe(Option.map(pageNumber)),
          number: numbers.paragraph,
          refcode,
          nodes: row.nodes,
          elementType: optionalText(Option.fromNullishOr(row.element_type)),
          elementSubtype: optionalText(Option.fromNullishOr(row.element_subtype)),
        });
      },
      catch: (cause) => integrity(operation, cause),
    });
  });

export interface WritingsServiceApi {
  readonly catalog: (
    author?: string,
  ) => Effect.Effect<readonly Publication[], WritingsUnavailableError | WritingsDataIntegrityError>;
  readonly publication: (
    reference: PublicationReference,
  ) => Effect.Effect<Publication, WritingsError>;
  readonly publicationByCode: (code: string) => Effect.Effect<Publication, WritingsError>;
  readonly paragraphs: (
    reference: PublicationReference,
  ) => Effect.Effect<readonly Paragraph[], WritingsError>;
  readonly paragraphByRefcode: (
    reference: PublicationReference,
    refcode: string,
  ) => Effect.Effect<Option.Option<Paragraph>, WritingsError>;
  readonly paragraph: (reference: ParagraphReference) => Effect.Effect<Paragraph, WritingsError>;
  readonly page: (reference: PageReference) => Effect.Effect<Page, WritingsError>;
  readonly openingPage: (reference: PublicationReference) => Effect.Effect<Page, WritingsError>;
  readonly headings: (
    reference: PublicationReference,
  ) => Effect.Effect<readonly Heading[], WritingsError>;
  /** Full-text search in FTS relevance order, optionally narrowed to one
   *  publication or to one half of the corpus by author (§6.4). */
  readonly search: (
    query: string,
    options?: {
      readonly limit?: number;
      readonly publication?: PublicationReference;
      readonly scope?: CorpusScope;
    },
  ) => Effect.Effect<readonly SearchHit[], WritingsError>;
  /** How many paragraphs `search` matches under the same query and scope,
   *  ignoring any `limit`.
   *
   *  Its own call rather than a field on the hits because a caller wants either
   *  the page of results or the size of the tail, rarely both at the same cost:
   *  the row query decodes every hit it returns, and this one decodes nothing.
   *  The §6.1 sections need both, and they ask for them concurrently. */
  readonly searchCount: (
    query: string,
    options?: {
      readonly publication?: PublicationReference;
      readonly scope?: CorpusScope;
    },
  ) => Effect.Effect<number, WritingsError>;
  readonly locate: (
    paragraphs: readonly Paragraph[],
    reference: ParagraphReference | PageReference,
  ) => Option.Option<Paragraph>;
}

export class WritingsService extends Context.Service<WritingsService, WritingsServiceApi>()(
  '@bible/core/writings/WritingsService',
) {
  static Live: Layer.Layer<WritingsService, never, EGWParagraphDatabase> = Layer.effect(
    WritingsService,
    Effect.gen(function* () {
      const database = yield* EGWParagraphDatabase;

      const catalog = (author?: string) => {
        let rows = database.getAllBooks;
        if (Predicate.isNotUndefined(author)) rows = database.getBooksByAuthor(author);
        return Stream.runCollect(rows).pipe(
          Effect.mapError(unavailable('read-catalog')),
          Effect.flatMap((chunk) =>
            Effect.forEach([...chunk], (row) => makePublication(row, 'read-catalog')),
          ),
        );
      };

      const publication = (
        reference: PublicationReference,
      ): Effect.Effect<Publication, WritingsError> =>
        Effect.gen(function* () {
          const row = yield* database
            .getBookById(reference.publicationId)
            .pipe(Effect.mapError(unavailable('read-publication')));
          if (Option.isNone(row)) {
            return yield* WritingsPublicationNotFoundError.make({
              publication: reference.publicationId,
            });
          }
          return yield* makePublication(row.value, 'read-publication');
        });

      const publicationByCode = (code: string): Effect.Effect<Publication, WritingsError> =>
        Effect.gen(function* () {
          const canonicalCode = publicationCode(code);
          const rows = yield* database
            .getBooksByCode(canonicalCode)
            .pipe(Effect.mapError(unavailable('read-publication')));
          const [row, ...duplicates] = rows;
          if (!row) {
            return yield* WritingsPublicationNotFoundError.make({
              publication: canonicalCode,
            });
          }
          if (duplicates.length > 0) {
            return yield* WritingsAmbiguousPublicationCodeError.make({
              publication: canonicalCode,
              candidates: [
                publicationId(row.book_id),
                ...duplicates.map((candidate) => publicationId(candidate.book_id)),
              ],
            });
          }
          return yield* makePublication(row, 'read-publication');
        });

      const paragraphs = (
        reference: PublicationReference,
      ): Effect.Effect<readonly Paragraph[], WritingsError> =>
        Effect.gen(function* () {
          const foundPublication = yield* publication(reference);
          const rows = yield* database
            .getParagraphsByBook(foundPublication.id)
            .pipe(Stream.runCollect, Effect.mapError(unavailable('read-paragraphs')));
          return yield* Effect.forEach([...rows], (row) =>
            makeParagraph(foundPublication, row, 'read-paragraphs'),
          );
        });

      const paragraphByRefcode = (
        reference: PublicationReference,
        refcode: string,
      ): Effect.Effect<Option.Option<Paragraph>, WritingsError> =>
        Effect.gen(function* () {
          const foundPublication = yield* publication(reference);
          const row = yield* database
            .getParagraph(foundPublication.id, refcode)
            .pipe(Effect.mapError(unavailable('read-paragraphs')));
          return yield* Option.match(row, {
            onNone: () => Effect.succeed(Option.none<Paragraph>()),
            onSome: (value) =>
              makeParagraph(foundPublication, value, 'read-paragraphs').pipe(
                Effect.map(Option.some),
              ),
          });
        });

      const paragraph = (reference: ParagraphReference): Effect.Effect<Paragraph, WritingsError> =>
        Effect.gen(function* () {
          const foundPublication = yield* publication(
            Reference.publication(reference.publicationId),
          );
          const rows = yield* database
            .getParagraphsByBook(foundPublication.id)
            .pipe(Stream.runCollect, Effect.mapError(unavailable('read-paragraphs')));
          const row = [...rows].find((candidate) =>
            Option.contains(candidate.para_id, reference.paragraphId),
          );
          if (!row) return yield* WritingsParagraphNotFoundError.make({ reference });
          return yield* makeParagraph(foundPublication, row, 'read-paragraphs');
        });

      const page = (reference: PageReference): Effect.Effect<Page, WritingsError> =>
        Effect.gen(function* () {
          const publicationReference = Reference.publication(reference.publicationId);
          const foundPublication = yield* publication(publicationReference);
          const rows = yield* database
            .getParagraphsByPage(foundPublication.id, reference.page)
            .pipe(Effect.mapError(unavailable('read-page')));
          const [firstRow, ...remainingRows] = rows;
          if (!firstRow) return yield* WritingsPageNotFoundError.make({ reference });
          const first = yield* makeParagraph(foundPublication, firstRow, 'read-page');
          const rest = yield* Effect.forEach(remainingRows, (row) =>
            makeParagraph(foundPublication, row, 'read-page'),
          );
          const pageNumbers = yield* database
            .getPageNumbers(foundPublication.id)
            .pipe(Effect.mapError(unavailable('read-page')));
          const pageIndex = pageNumbers.indexOf(reference.page);
          const headingParagraph = [first, ...rest].find((paragraph) =>
            Option.exists(
              paragraph.elementType,
              (type) =>
                ['chapter', 'title'].includes(type.toLowerCase()) ||
                type.toLowerCase().startsWith('h'),
            ),
          );

          let previous = Option.none<PageReference>();
          if (pageIndex > 0) {
            previous = Option.fromNullishOr(pageNumbers[pageIndex - 1]).pipe(
              Option.map((number) => Reference.page(reference.publicationId, number)),
            );
          }
          let next = Option.none<PageReference>();
          if (pageIndex >= 0) {
            next = Option.fromNullishOr(pageNumbers[pageIndex + 1]).pipe(
              Option.map((number) => Reference.page(reference.publicationId, number)),
            );
          }

          return Page.make({
            publication: foundPublication,
            reference,
            paragraphs: [first, ...rest],
            heading: Option.fromNullishOr(headingParagraph).pipe(
              Option.map((paragraph) => nodesToText(paragraph.nodes)),
              Option.filter((title) => title.length > 0),
            ),
            previous,
            next,
          });
        });

      const openingPage = (reference: PublicationReference): Effect.Effect<Page, WritingsError> =>
        Effect.gen(function* () {
          yield* publication(reference);
          const pageNumbers = yield* database
            .getPageNumbers(reference.publicationId)
            .pipe(Effect.mapError(unavailable('read-page')));
          const firstPage = pageNumbers[0];
          if (Predicate.isUndefined(firstPage)) {
            return yield* WritingsPageNotFoundError.make({
              reference: Reference.page(reference.publicationId, 1),
            });
          }
          return yield* page(Reference.page(reference.publicationId, firstPage));
        });

      const headings = (
        reference: PublicationReference,
      ): Effect.Effect<readonly Heading[], WritingsError> =>
        Effect.gen(function* () {
          const foundPublication = yield* publication(reference);
          const rows = yield* database
            .getChapterHeadings(foundPublication.id)
            .pipe(Effect.mapError(unavailable('read-headings')));
          return yield* Effect.forEach(rows, (row) =>
            makeParagraph(foundPublication, row, 'read-headings').pipe(
              Effect.flatMap((paragraph) =>
                Effect.try({
                  try: () => {
                    const headingType = Option.getOrUndefined(paragraph.elementType);
                    const levelText = headingType?.match(/^h(\d+)$/i)?.[1];
                    let level = 1;
                    if (levelText) level = Number.parseInt(levelText, 10);
                    return Heading.make({
                      reference: paragraph.reference,
                      publicationCode: paragraph.publicationCode,
                      order: paragraph.order,
                      page: paragraph.page,
                      number: paragraph.number,
                      refcode: paragraph.refcode,
                      title: nodesToText(paragraph.nodes),
                      level,
                    });
                  },
                  catch: (cause) => integrity('read-headings', cause),
                }),
              ),
            ),
          );
        });

      const search: WritingsServiceApi['search'] = (query, options) => {
        if (query.trim().length === 0) {
          return Effect.fail(WritingsInvalidSearchError.make({ reason: 'empty-query' }));
        }
        if (Predicate.isNotUndefined(options?.limit) && options.limit <= 0) {
          return Effect.fail(WritingsInvalidSearchError.make({ reason: 'invalid-limit' }));
        }
        // Reader text is not FTS5 syntax. Callers hand this method whatever was
        // typed — `PP 45.3`, a pasted quotation, a title with a colon — and the
        // engine reads `.`, `"` and `NEAR` as operators, so an unsanitized
        // query died as `fts5: syntax error` rather than returning results.
        // `ftsTermQuery` is the same tokenizer the hybrid leg has always
        // applied, shared rather than restated (see its doc comment).
        const matchQuery = ftsTermQuery(query);
        if (Option.isNone(matchQuery)) {
          // Punctuation only: after tokenizing, the query names no term at all.
          // That is the same unanswerable request as `""`, and it reuses that
          // reason rather than widening an error schema three hosts map over.
          return Effect.fail(WritingsInvalidSearchError.make({ reason: 'empty-query' }));
        }
        return Effect.gen(function* () {
          let publicationFilter = Option.none<Publication>();
          if (Predicate.isNotUndefined(options?.publication)) {
            publicationFilter = Option.some(yield* publication(options.publication));
          }
          return yield* database
            .searchParagraphs(matchQuery.value, {
              limit: options?.limit ?? 50,
              bookCode: Option.getOrUndefined(Option.map(publicationFilter, (entry) => entry.code)),
              scope: options?.scope,
            })
            .pipe(
              Effect.mapError(unavailable('search')),
              Effect.flatMap((rows) =>
                Effect.forEach(rows, (row) =>
                  Effect.gen(function* () {
                    const foundPublication = yield* publication(Reference.publication(row.bookId));
                    const paragraph = yield* makeParagraph(foundPublication, row, 'search');
                    return SearchHit.make({
                      publication: foundPublication,
                      paragraph,
                    });
                  }),
                ),
              ),
            );
        });
      };

      /** The same two guards `search` applies, minus the limit one it has no
       *  parameter for: an empty query is still not a search, and a count of a
       *  non-search is not zero — it is a rejected request. */
      const searchCount: WritingsServiceApi['searchCount'] = (query, options) => {
        if (query.trim().length === 0) {
          return Effect.fail(WritingsInvalidSearchError.make({ reason: 'empty-query' }));
        }
        return Effect.gen(function* () {
          let publicationFilter = Option.none<Publication>();
          if (Predicate.isNotUndefined(options?.publication)) {
            publicationFilter = Option.some(yield* publication(options.publication));
          }
          return yield* database
            .countSearchParagraphs(query, {
              bookCode: Option.getOrUndefined(Option.map(publicationFilter, (entry) => entry.code)),
              scope: options?.scope,
            })
            .pipe(Effect.mapError(unavailable('search')));
        });
      };

      const locate: WritingsServiceApi['locate'] = (items, reference) => {
        if (reference._tag === 'paragraph') {
          return Option.fromNullishOr(
            items.find((item) => item.reference.paragraphId === reference.paragraphId),
          );
        }
        return Option.fromNullishOr(
          items.find((item) => Option.contains(item.page, reference.page)),
        );
      };

      return WritingsService.of({
        catalog,
        publication,
        publicationByCode,
        paragraphs,
        paragraphByRefcode,
        paragraph,
        page,
        openingPage,
        headings,
        search,
        searchCount,
        locate,
      });
    }),
  );
}
