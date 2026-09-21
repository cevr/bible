/* oxlint-disable effect/noTernary -- one branch mapping a nullable `para_id`
   column to its deep link; `Option.match` here builds a matcher per row of a
   page's context. */
/* oxlint-disable effect/noNullish -- SQLite returns NULL for a paragraph with no short refcode, and the HTTP wire re-encodes it as JSON `null`; both boundaries are fixed by the APIs this module joins. */

/**
 * Neighbouring paragraphs for a page of search hits.
 *
 * A hit is a paragraph, and a paragraph read alone is often unreadable — the
 * sentence that makes it land is usually the one before it. This module fetches
 * ±N paragraphs around every hit on the page.
 *
 * **One query for the whole page, not one per hit.** The naive shape is a
 * lookup per result, which at 40 hits is 80 index probes and 40 round trips
 * through the driver for what the index can answer in a single pass. The
 * anchors are resolved and their windows collected in one statement, keyed on
 * `para_id`, then grouped in memory.
 *
 * The window is bounded by `book_id` as well as `puborder`, so a hit at the
 * start of a book cannot pull in the tail of the previous one; the index
 * `idx_paragraphs_puborder (book_id, puborder)` serves exactly this shape.
 */

import { Effect } from 'effect';
import { SqlClient } from 'effect/unstable/sql';

import { readerUrl, type ContextParagraph } from './api.js';

/** What one hit's surroundings look like once grouped. */
export interface Surrounding {
  readonly before: readonly ContextParagraph[];
  readonly after: readonly ContextParagraph[];
}

interface WindowRow {
  readonly anchor_para_id: string;
  readonly para_id: string | null;
  readonly refcode_short: string | null;
  readonly content_text: string;
  readonly offset: number;
  readonly is_chapter_heading: number;
}

const EMPTY: Surrounding = { before: [], after: [] };

/** The accumulator's shape while rows are being grouped. `Surrounding` is
 *  readonly, which is what callers get; this is the same record before it is
 *  handed over. */
interface Mutable {
  readonly before: ContextParagraph[];
  readonly after: ContextParagraph[];
}

/** Get the accumulator for one anchor, creating it on first sight. Keeps the
 *  grouping loop free of the `undefined` check the Map API forces. */
const existingOrNew = (into: Map<string, Mutable>, key: string): Mutable => {
  const found = into.get(key);
  if (found !== undefined) return found;
  const fresh: Mutable = { before: [], after: [] };
  into.set(key, fresh);
  return fresh;
};

/**
 * Fetch ±`radius` paragraphs around each of `paraIds`.
 *
 * Returns a map keyed by the anchor's `para_id`. A hit whose anchor is missing
 * — or whose radius is zero — simply maps to empty arrays, so the caller never
 * has to branch on absence.
 *
 * The effect does not fail: context is an enrichment, and a search that
 * returned results should not turn into an error because the surrounding
 * paragraphs could not be read. A failure degrades to no context at all.
 */
export const surroundingParagraphs = (
  paraIds: readonly string[],
  radius: number,
): Effect.Effect<ReadonlyMap<string, Surrounding>, never, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    if (paraIds.length === 0 || radius <= 0) return new Map<string, Surrounding>();

    const sql = yield* SqlClient.SqlClient;

    // `anchors` resolves each hit to its (book_id, puborder); the join then
    // walks the ±radius window off `idx_paragraphs_puborder`. `offset` carries
    // which side of the anchor each row fell on, which is what lets one flat
    // result set be grouped without a second pass over the corpus.
    const rows = yield* sql<WindowRow>`
      with anchors as (
        select para_id as anchor_para_id, book_id, puborder
        from paragraphs
        where para_id in ${sql.in(paraIds)}
      )
      select
        a.anchor_para_id,
        p.para_id,
        p.refcode_short,
        p.content_text,
        p.is_chapter_heading,
        p.puborder - a.puborder as offset
      from anchors a
      join paragraphs p
        on p.book_id = a.book_id
       and p.puborder between a.puborder - ${radius} and a.puborder + ${radius}
      where p.puborder <> a.puborder
      order by a.anchor_para_id, p.puborder
    `;

    const grouped = new Map<string, Mutable>();
    for (const row of rows) {
      const entry = existingOrNew(grouped, row.anchor_para_id);
      const paragraph: ContextParagraph = {
        refcode: row.refcode_short,
        text: row.content_text,
        url: row.para_id === null ? null : readerUrl(row.para_id),
        isHeading: row.is_chapter_heading === 1,
      };
      if (row.offset < 0) entry.before.push(paragraph);
      else entry.after.push(paragraph);
    }

    const result: Map<string, Surrounding> = grouped;
    return result;
  }).pipe(
    // Enrichment, not a result: a context lookup that fails leaves the hits
    // intact and unadorned rather than failing the search around them.
    Effect.catchCause((cause) =>
      Effect.logWarning('search.context.failed').pipe(
        Effect.annotateLogs({ cause: String(cause) }),
        Effect.as(new Map<string, Surrounding>()),
      ),
    ),
  );

export const emptySurrounding = EMPTY;
