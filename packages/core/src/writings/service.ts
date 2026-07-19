import { Context, Effect, Layer, Option, Stream } from 'effect';

import {
  EGWParagraphDatabase,
  type BookRow,
  type ParagraphDatabaseError,
} from '../egw-db/book-database.js';
import type * as EGWSchemas from '../egw/schemas.js';
import { nodesToText } from '../egw/ast.js';
import {
  WritingsAmbiguousPublicationCodeError,
  WritingsDataIntegrityError,
  type WritingsError,
  WritingsInvalidSearchError,
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
    new WritingsUnavailableError({ operation, cause });

const integrity = (operation: Operation, cause: unknown): WritingsDataIntegrityError =>
  new WritingsDataIntegrityError({ operation, cause });

const optionalText = (value: string | null | undefined): Option.Option<string> =>
  value && value.length > 0 ? Option.some(value) : Option.none();

const refcodeNumbers = (refcode: string | null | undefined) => {
  const match = refcode?.match(/\s(\d+)(?:\.(\d+))?$/);
  return {
    page: match?.[1] ? Number.parseInt(match[1], 10) : undefined,
    paragraph: match?.[2] ? Number.parseInt(match[2], 10) : undefined,
  };
};

const makePublication = (
  row: BookRow,
  operation: Operation,
): Effect.Effect<Publication, WritingsDataIntegrityError> =>
  Effect.try({
    try: () =>
      new Publication({
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
  Effect.try({
    try: () => {
      const stableParagraphId = Option.getOrThrowWith(
        row.para_id,
        () => new Error(`paragraph ${String(row.puborder)} has no stable paragraph identifier`),
      );
      const refcode = Option.getOrUndefined(row.refcode_short) ?? row.refcode_long ?? undefined;
      const numbers = refcodeNumbers(refcode);
      return new Paragraph({
        reference: Reference.paragraph(publication.id, stableParagraphId),
        publicationCode: publication.code,
        order: publicationOrder(row.puborder),
        page: Option.fromNullishOr(numbers.page).pipe(Option.map(pageNumber)),
        number: Option.fromNullishOr(numbers.paragraph),
        refcode: Option.fromNullishOr(refcode),
        nodes: row.nodes,
        elementType: optionalText(row.element_type),
        elementSubtype: optionalText(row.element_subtype),
      });
    },
    catch: (cause) => integrity(operation, cause),
  });

export interface WritingsServiceShape {
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
  readonly page: (reference: PageReference) => Effect.Effect<Page, WritingsError>;
  readonly headings: (
    reference: PublicationReference,
  ) => Effect.Effect<readonly Heading[], WritingsError>;
  readonly search: (
    query: string,
    options?: {
      readonly limit?: number;
      readonly publication?: PublicationReference;
    },
  ) => Effect.Effect<readonly SearchHit[], WritingsError>;
  readonly locate: (
    paragraphs: readonly Paragraph[],
    reference: ParagraphReference | PageReference,
  ) => Option.Option<Paragraph>;
}

export class WritingsService extends Context.Service<WritingsService, WritingsServiceShape>()(
  '@bible/core/writings/WritingsService',
) {
  static Live: Layer.Layer<WritingsService, never, EGWParagraphDatabase> = Layer.effect(
    WritingsService,
    Effect.gen(function* () {
      const database = yield* EGWParagraphDatabase;

      const catalog = (author?: string) => {
        const rows = author ? database.getBooksByAuthor(author) : database.getAllBooks();
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
            return yield* new WritingsPublicationNotFoundError({
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
            return yield* new WritingsPublicationNotFoundError({
              publication: canonicalCode,
            });
          }
          if (duplicates.length > 0) {
            return yield* new WritingsAmbiguousPublicationCodeError({
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

      const page = (reference: PageReference): Effect.Effect<Page, WritingsError> =>
        Effect.gen(function* () {
          const publicationReference = Reference.publication(reference.publicationId);
          const foundPublication = yield* publication(publicationReference);
          const rows = yield* database
            .getParagraphsByPage(foundPublication.id, reference.page)
            .pipe(Effect.mapError(unavailable('read-page')));
          const [firstRow, ...remainingRows] = rows;
          if (!firstRow) return yield* new WritingsPageNotFoundError({ reference });
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

          return new Page({
            publication: foundPublication,
            reference,
            paragraphs: [first, ...rest],
            heading: Option.fromNullishOr(headingParagraph).pipe(
              Option.map((paragraph) => nodesToText(paragraph.nodes)),
              Option.filter((title) => title.length > 0),
            ),
            previous:
              pageIndex > 0
                ? Option.fromNullishOr(pageNumbers[pageIndex - 1]).pipe(
                    Option.map((number) => Reference.page(reference.publicationId, number)),
                  )
                : Option.none(),
            next:
              pageIndex >= 0
                ? Option.fromNullishOr(pageNumbers[pageIndex + 1]).pipe(
                    Option.map((number) => Reference.page(reference.publicationId, number)),
                  )
                : Option.none(),
          });
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
                    return new Heading({
                      reference: paragraph.reference,
                      publicationCode: paragraph.publicationCode,
                      order: paragraph.order,
                      page: paragraph.page,
                      number: paragraph.number,
                      refcode: paragraph.refcode,
                      title: nodesToText(paragraph.nodes),
                      level: levelText ? Number.parseInt(levelText, 10) : 1,
                    });
                  },
                  catch: (cause) => integrity('read-headings', cause),
                }),
              ),
            ),
          );
        });

      const search: WritingsServiceShape['search'] = (query, options) => {
        if (query.trim().length === 0) {
          return Effect.fail(new WritingsInvalidSearchError({ reason: 'empty-query' }));
        }
        if (options?.limit !== undefined && options.limit <= 0) {
          return Effect.fail(new WritingsInvalidSearchError({ reason: 'invalid-limit' }));
        }
        return Effect.gen(function* () {
          const publicationFilter = options?.publication
            ? yield* publication(options.publication)
            : undefined;
          return yield* database
            .searchParagraphs(query, options?.limit ?? 50, publicationFilter?.code)
            .pipe(
              Effect.mapError(unavailable('search')),
              Effect.flatMap((rows) =>
                Effect.forEach(rows, (row) =>
                  Effect.gen(function* () {
                    const foundPublication = yield* publication(Reference.publication(row.bookId));
                    const paragraph = yield* makeParagraph(foundPublication, row, 'search');
                    return new SearchHit({
                      publication: foundPublication,
                      paragraph,
                    });
                  }),
                ),
              ),
            );
        });
      };

      const locate: WritingsServiceShape['locate'] = (items, reference) => {
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
        page,
        headings,
        search,
        locate,
      });
    }),
  );
}
