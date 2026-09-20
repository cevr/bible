/** The publications the EGW content API will not serve us, ever.
 *
 *  Every weekly sync attempts these, and every weekly sync fails on them. They
 *  are not a defect in the sync and they are not a transient outage: the
 *  library publishes their *metadata* (so they appear in the remote book list
 *  and the sync dutifully queues them) while refusing their *content*.
 *
 *  Measured 2026-09-19 against `https://a.egwwritings.org` with valid
 *  `client_credentials`, all 18 books, both content paths:
 *
 *    GET /content/books/<id>/download  ->  404  "Object not found"
 *    GET /content/books/<id>/toc       ->  403  Forbidden
 *
 *  Both paths are what `writings-egw-source.ts` tries — `download` when the
 *  book record carries a download URL, the TOC walk otherwise — so a book in
 *  this list has no remaining route to its paragraphs. The book record itself
 *  fetches fine (`getBook` returns 200 for all 18), which is exactly why the
 *  sync cannot discover this on its own and needs the list.
 *
 *  Two groups, for two different reasons:
 *
 *    - The SDA reference set (`1SDABC`-`7SDABC`, `SDAEnc`, `EGWEnc`, `HSDAT`,
 *      `SDASB`, `ABC-OT`, `ABC-NT`) is subscription-gated. The 403 on the TOC
 *      is the honest status; the 404 on the download is the same refusal
 *      spelled as absence.
 *    - The modern Bible translations (`NKJV`, `NIV`, `NET`, `ICB`, `NCV`) are
 *      third-party copyrighted texts the library licenses for reading in its
 *      own apps but not for bulk export. Note these five *do* carry a
 *      `download` URL in their book record, which is why they look especially
 *      like a bug: the field promises an artifact the endpoint then denies.
 *
 *  Keyed by `book_id`, never by `book_code`. The codes drift — `ChS` is served
 *  as `1ChS` — and a list matched on a drifting key silently stops matching.
 *  The ids are the library's stable primary key.
 *
 *  This list is a *reporting* concern, not a filter. The sync still attempts
 *  these books (an attempt costs one request and is how we would notice the
 *  library opening them up); what the list changes is that the failure is
 *  classified as expected rather than counted against the run. A weekly report
 *  that cried "18 failures" every week would train its only reader to ignore
 *  it, which is the actual risk being managed here.
 */

import { Option } from 'effect';

/** Why a publication cannot be fetched, as far as we can tell from outside. */
export type UnavailableReason = 'subscription' | 'third-party-licence';

export interface UnavailablePublication {
  readonly bookId: number;
  /** The code at the time of measurement, for reading the list. Not the key. */
  readonly code: string;
  readonly reason: UnavailableReason;
}

export const KNOWN_UNAVAILABLE: readonly UnavailablePublication[] = [
  // SDA Bible Commentary, volumes 1-7.
  { bookId: 12515, code: '1SDABC', reason: 'subscription' },
  { bookId: 12511, code: '2SDABC', reason: 'subscription' },
  { bookId: 12516, code: '3SDABC', reason: 'subscription' },
  { bookId: 12513, code: '4SDABC', reason: 'subscription' },
  { bookId: 12514, code: '5SDABC', reason: 'subscription' },
  { bookId: 12518, code: '6SDABC', reason: 'subscription' },
  { bookId: 12517, code: '7SDABC', reason: 'subscription' },
  // Companion reference works, same gate.
  { bookId: 12362, code: 'EGWEnc', reason: 'subscription' },
  { bookId: 12668, code: 'SDAEnc', reason: 'subscription' },
  { bookId: 12666, code: 'HSDAT', reason: 'subscription' },
  { bookId: 12669, code: 'SDASB', reason: 'subscription' },
  { bookId: 14720, code: 'ABC-OT', reason: 'subscription' },
  { bookId: 14721, code: 'ABC-NT', reason: 'subscription' },
  // Copyrighted modern translations. These advertise a download URL that 404s.
  { bookId: 14334, code: 'NKJV', reason: 'third-party-licence' },
  { bookId: 14340, code: 'NIV', reason: 'third-party-licence' },
  { bookId: 14341, code: 'NET', reason: 'third-party-licence' },
  { bookId: 14419, code: 'ICB', reason: 'third-party-licence' },
  { bookId: 14420, code: 'NCV', reason: 'third-party-licence' },
];

const BY_ID: ReadonlyMap<number, UnavailablePublication> = new Map(
  KNOWN_UNAVAILABLE.map((entry) => [entry.bookId, entry]),
);

/** True when this book's content is known to be withheld by the library.
 *
 *  Takes the numeric `book_id` because that is the key the library keeps
 *  stable; see the note on code drift above. */
export const isKnownUnavailable = (bookId: number): boolean => BY_ID.has(bookId);

export const unavailableReason = (bookId: number): Option.Option<UnavailableReason> =>
  Option.fromNullishOr(BY_ID.get(bookId)).pipe(Option.map((entry) => entry.reason));
