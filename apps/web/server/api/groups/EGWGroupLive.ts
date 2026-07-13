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

const databaseError = (error: WritingsError): EGWDatabaseError =>
  new EGWDatabaseError({
    message: 'cause' in error && error.cause instanceof Error ? error.cause.message : error._tag,
  });

const bookError = (bookCode: string) => (error: WritingsError) =>
  error._tag === 'WritingsPublicationNotFoundError'
    ? new EGWBookNotFoundError({
        bookCode,
        message: `Publication '${bookCode}' was not found`,
      })
    : databaseError(error);

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

const searchError = (error: WritingsError) =>
  error._tag === 'WritingsInvalidSearchError'
    ? new EGWInvalidSearchError({
        reason: error.reason,
        message:
          error.reason === 'empty-query'
            ? 'Search query must not be empty'
            : 'Search limit must be greater than zero',
      })
    : databaseError(error);

export const EGWGroupLive = HttpApiBuilder.group(BibleToolsApi, 'EGW', (handlers) =>
  Effect.gen(function* () {
    const writings = yield* WritingsService;
    const archives = yield* WritingsArchive;

    return handlers
      .handle('books', () =>
        writings.catalog().pipe(Effect.map(EGWWire.books), Effect.mapError(databaseError)),
      )
      .handle('page', ({ params: { bookCode, page } }) =>
        writings
          .page(Reference.page(bookCode, page))
          .pipe(Effect.map(EGWWire.page), Effect.mapError(pageError(bookCode, page))),
      )
      .handle('chapters', ({ params: { bookCode } }) =>
        writings
          .headings(Reference.publication(bookCode))
          .pipe(Effect.map(EGWWire.chapters), Effect.mapError(bookError(bookCode))),
      )
      .handle('search', ({ query: { q, limit, bookCode } }) =>
        writings
          .search(q, {
            limit,
            publication: bookCode ? Reference.publication(bookCode) : undefined,
          })
          .pipe(Effect.map(EGWWire.searchResults), Effect.mapError(searchError)),
      )
      .handle('bookDump', ({ params: { bookCode } }) =>
        archives
          .exportPublication(Reference.publication(bookCode))
          .pipe(Effect.map(EGWWire.archive), Effect.mapError(bookError(bookCode))),
      );
  }),
);
