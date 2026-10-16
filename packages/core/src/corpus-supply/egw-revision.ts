/**
 * A book's revision, as the library's catalog states it.
 *
 * The catalog stamps every book with `last_modified`, but that time moves for
 * the whole catalog at once (all 1,505 English books on 2026-09-25, within
 * minutes), so it says when the catalog was rebuilt, not when a book's text
 * changed. A book's `download` link carries the content hash of its archive
 * (`/content/books/130/download#hash=<md5>&size=<bytes>`), which moves only
 * when the archive does: that is the revision when there is one. A book
 * without a download falls back to its last-modified time, then to its
 * publication year.
 *
 * The weekly sync compares this with the revision recorded at install
 * (`sync_status.revision`): a book whose revision moved is downloaded again
 * and its paragraphs compared (`paragraph_changes`).
 */

import { Option, Predicate } from 'effect';

import type * as EGWSchemas from '../egw/schemas.js';

const CONTENT_PREFIX = 'zip:';

const DOWNLOAD_HASH = /[#&]hash=([0-9a-f]+)/i;

/** The archive's content hash, from a catalog `download` link. */
const downloadHash = (download: string): Option.Option<string> =>
  Option.flatMap(Option.fromNullishOr(DOWNLOAD_HASH.exec(download)), (match) =>
    Option.fromNullishOr(match[1]),
  );

/** The catalog fields a revision is read from. */
type RevisionFields = Pick<EGWSchemas.Book, 'download' | 'last_modified' | 'pub_year'>;

/** A book's revision: `zip:<hash>` when its download names one, else its
 *  last-modified time, else its publication year. */
export const egwBookRevision = (book: RevisionFields): string => {
  const hash = Option.flatMap(Option.fromNullishOr(book.download), downloadHash);
  if (Option.isSome(hash)) return `${CONTENT_PREFIX}${hash.value.toLowerCase()}`;
  if (Predicate.isNotNullish(book.last_modified)) return book.last_modified;
  return book.pub_year;
};

/** True when a revision is an archive's content hash, so a different one
 *  means the archive changed (rather than the catalog being restamped). */
export const isContentRevision = (revision: string): boolean => revision.startsWith(CONTENT_PREFIX);
