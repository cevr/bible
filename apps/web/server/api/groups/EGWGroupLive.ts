/** HTTP adapter for the canonical Writings domain. */
import { Effect } from 'effect';
import { HttpApiBuilder } from 'effect/unstable/httpapi';

import {
  BibleToolsApi,
  EGWBookNotFoundError,
  EGWDatabaseError,
  EGWInvalidSearchError,
  EGWPageNotFoundError,
} from '@bible/api';
import { type WritingsError, Reference } from '@bible/core/writings';
import { WritingsArchive } from '@bible/core/writings/archive-service';
import { WritingsService } from '@bible/core/writings/service';

import { EGWWire } from './EGWWire.js';

const databaseError = (error: WritingsError): EGWDatabaseError => {
  let message: string = error._tag;
  if ('cause' in error && error.cause instanceof Error) message = error.cause.message;
  return new EGWDatabaseError({ message });
};

const bookError = (bookCode: string) => (error: WritingsError) => {
  if (error._tag === 'WritingsPublicationNotFoundError') {
    return new EGWBookNotFoundError({
      bookCode,
      message: `Publication '${bookCode}' was not found`,
    });
  }
  return databaseError(error);
};

const pageError = (bookCode: string, page: number) => (error: WritingsError) => {
  switch (error._tag) {
    case 'WritingsPublicationNotFoundError':
      return new EGWBookNotFoundError({
        bookCode,
        message: `Publication '${bookCode}' was not found`,
      });
    case 'WritingsPageNotFoundError':
      return new EGWPageNotFoundError({
        bookCode,
        page,
        message: `Page ${page} was not found in '${bookCode}'`,
      });
    default:
      return databaseError(error);
  }
};

const searchError = (error: WritingsError) => {
  if (error._tag !== 'WritingsInvalidSearchError') return databaseError(error);
  let message = 'Search limit must be greater than zero';
  if (error.reason === 'empty-query') message = 'Search query must not be empty';
  return new EGWInvalidSearchError({ reason: error.reason, message });
};

export const EGWGroupLive = HttpApiBuilder.group(BibleToolsApi, 'EGW', (handlers) =>
  Effect.gen(function* () {
    const writings = yield* WritingsService;
    const archives = yield* WritingsArchive;

    return handlers
      .handle('books', () =>
        writings.catalog().pipe(Effect.map(EGWWire.books), Effect.mapError(databaseError)),
      )
      .handle('page', ({ params: { bookCode, page } }) =>
        Effect.gen(function* () {
          const publication = yield* writings.publicationByCode(bookCode);
          return yield* writings.page(Reference.page(publication.id, page));
        }).pipe(Effect.map(EGWWire.page), Effect.mapError(pageError(bookCode, page))),
      )
      .handle('chapters', ({ params: { bookCode } }) =>
        Effect.gen(function* () {
          const publication = yield* writings.publicationByCode(bookCode);
          return yield* writings.headings(Reference.publication(publication.id));
        }).pipe(Effect.map(EGWWire.chapters), Effect.mapError(bookError(bookCode))),
      )
      .handle('search', ({ query: { q, limit, bookCode } }) =>
        Effect.gen(function* () {
          let publication: ReturnType<typeof Reference.publication> | undefined;
          if (bookCode) {
            const selected = yield* writings.publicationByCode(bookCode);
            publication = Reference.publication(selected.id);
          }
          return yield* writings.search(q, {
            limit,
            publication,
          });
        }).pipe(Effect.map(EGWWire.searchResults), Effect.mapError(searchError)),
      )
      .handle('bookDump', ({ params: { bookCode } }) =>
        Effect.gen(function* () {
          const publication = yield* writings.publicationByCode(bookCode);
          return yield* archives.exportPublication(Reference.publication(publication.id));
        }).pipe(Effect.mapError(bookError(bookCode))),
      );
  }),
);
