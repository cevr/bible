/* oxlint-disable effect/noGlobals -- a Worker's entry: `self` and `postMessage` are the thread boundary, and the SQLite client is opened here, on this thread. */
/**
 * The corpus warm-up, on its own thread. See `WarmCorpusLive` in `./main.ts`
 * for why it warms these pages and why it may not run on the server's thread.
 *
 * It opens its own read-only connection. That warms the server's reads too:
 * the server maps the whole file (`mmap_size` is larger than the database),
 * so its reads come from the OS page cache, and the pages this connection
 * pulls off the network volume land in that same cache.
 */
import * as SqliteBun from '@effect/sql-sqlite-bun/SqliteClient';
import { Cause, Clock, Effect } from 'effect';
import { SqlClient } from 'effect/unstable/sql';

export interface WarmRequest {
  readonly filename: string;
  readonly mmapBytes: number;
}

export type WarmResult =
  | { readonly _tag: 'Warmed'; readonly postingsMs: number; readonly queryMs: number }
  | { readonly _tag: 'Failed'; readonly message: string };

/** The terms whose posting lists the warm-up scores.
 *
 *  Frequent in this corpus and *ungated* — a term the selectivity gate refuses
 *  is never scored by a query, so warming its pages would buy nothing. Their
 *  match counts, measured: `god` 570,900, `lord` 299,913, `christ` 283,120,
 *  `jesus` 141,862, `love` 96,205, `heaven` 91,727, `sabbath` 68,411.
 *
 *  Several terms, not one, and *common* ones. A first version warmed
 *  `sanctuary` alone and did not help: `god` still took 7,124 ms on the first
 *  query against 961 ms on the second. Scoring cost is linear in a term's
 *  posting list, and `god` (570,900 rows) touches 34x what `sanctuary`
 *  (16,765) does — so warming a selective term faults in almost none of the
 *  pages a common one needs.
 *
 *  Literals, and only ever literals: they are interpolated into SQL below. */
const WARM_TERMS: readonly string[] = [
  'god',
  'lord',
  'jesus',
  'christ',
  'love',
  'heaven',
  'sabbath',
];

/** Scores the terms, and times the two passes. */
const warmThrough = (mmapBytes: number) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql.unsafe(`PRAGMA mmap_size = ${String(mmapBytes)}`);
    const startedAt = yield* Clock.currentTimeMillis;
    // The posting lists, whole. `count(*)` over the shadow table reads every
    // page of it without materializing rows.
    yield* sql.unsafe(`SELECT count(*) FROM paragraphs_fts_data`);
    const postingsAt = yield* Clock.currentTimeMillis;
    // Real ranked queries: scoring, the bodies join and the books join.
    //
    // **The `ORDER BY` must match `searchScoredParagraphs`'s.** It orders by
    // `bm25(paragraphs_fts)` rather than the bare `rank`, and the two are the
    // same ranking by *different code paths*: `rank` plans as FTS5's internal
    // `VIRTUAL TABLE INDEX 32:M3` rank-merge, `bm25()` as `INDEX 0:M3` plus a
    // bounded top-N heap. They touch different index structures, so a warm-up
    // ordered the other way faults in pages no query will read and leaves the
    // ones it will read cold — it warms the wrong thing while reporting
    // success. This clause tracks the live statement; if that one changes,
    // change this one with it.
    //
    // Interpolated rather than bound because `sql.unsafe` takes no
    // parameters. Safe only because these are literals in this file: nothing
    // here is ever derived from a request, and a term must never become so.
    for (const term of WARM_TERMS) {
      yield* sql.unsafe(`
        SELECT p.ref_code, p.nodes_json
        FROM paragraphs_fts fts
        JOIN paragraphs p ON p.rowid = fts.rowid
        JOIN books b ON p.book_id = b.book_id
        WHERE paragraphs_fts MATCH '${term}'
        ORDER BY bm25(paragraphs_fts)
        LIMIT 60
      `);
    }
    const doneAt = yield* Clock.currentTimeMillis;
    const warmed: WarmResult = {
      _tag: 'Warmed',
      postingsMs: postingsAt - startedAt,
      queryMs: doneAt - postingsAt,
    };
    return warmed;
  });

/** Open read-only, warm, close. Any failure, a defect included, is an answer. */
const warm = (request: WarmRequest): Effect.Effect<WarmResult> =>
  warmThrough(request.mmapBytes).pipe(
    Effect.provide(SqliteBun.layer({ filename: request.filename, readonly: true })),
    Effect.catchCause((cause) =>
      Effect.succeed<WarmResult>({ _tag: 'Failed', message: Cause.pretty(cause) }),
    ),
  );

declare const self: Worker;

self.onmessage = (event: MessageEvent<WarmRequest>) => {
  void Effect.runPromise(warm(event.data)).then((result) => postMessage(result));
};
