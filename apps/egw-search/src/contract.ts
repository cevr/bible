/**
 * The search query, as an effect-frame contract.
 *
 * Client-safe: schemas only. The browser bundle and the server both import
 * this file, so the wire has exactly one definition. The `HttpApi` in
 * `../server/api.ts` still serves `/api/search` for the CLI-style JSON
 * consumer and for the parity diff; this contract is what the page reads
 * through the actor transport at `/actors`.
 *
 * No actor commits change the corpus, so nothing marks a result stale but an
 * explicit refresh; the contract declares no dependency.
 */

import { query } from 'effect-frame/actor/client';
import { Schema as S } from 'effect';

import { BookSubtype, BookType, CorpusScope, CorpusSection, Signed } from '@bible/core/writings';

import { SearchResponseSchema } from '../server/api.js';

/** Everything the server needs to answer one pane, already split by sign. */
export const SearchRequest = S.Struct({
  q: S.String,
  scope: CorpusScope,
  section: Signed(CorpusSection),
  type: Signed(BookType),
  subtype: Signed(BookSubtype),
  excludeApparatus: S.Boolean,
  limit: S.Finite,
  /** Paragraphs fetched on each side of a hit. A rendering choice the caller
   *  supplies, not search state; see `CONTEXT` in `./app.tsx`. */
  context: S.Finite,
});
export type SearchRequest = S.Schema.Type<typeof SearchRequest>;

/** Public, version 1, and dependent on no actor: the contract's defaults. */
export const Search = query('search', {
  args: SearchRequest,
  result: SearchResponseSchema,
});

/** The actor transport's mount point, shared by the server and the client. */
export const actorPrefix = '/actors';
