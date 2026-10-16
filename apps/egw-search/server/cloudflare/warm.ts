/**
 * The search's warm-up: one of the page's example searches, run by the
 * search Worker every minute.
 *
 * A search after the corpus has sat idle pays for it. Measured on
 * 2026-10-16, "walk through the fire" spent 8,150 ms of 11,208 ms in its
 * lexical leg against 655 ms warm, and the try before it ran past the 30 s
 * the browser waited, on 89 ms of CPU: the time goes to D1 and Vectorize,
 * not to the Worker. Every stage and every data center reads the same D1
 * database and Vectorize index (`./resources.ts`), so a search run from any
 * of them warms both for every reader.
 *
 * The examples run in turn, one a fire: a minute is the shortest a Cron
 * Trigger fires, so nothing sits idle longer than that, and each example
 * comes round every few minutes. Each is the request the page sends when it
 * is clicked, through the batch endpoint's pipeline, so it runs the
 * statements that click runs.
 */
import { Array as Arr, Duration, Effect, Option } from 'effect';

import {
  DEFAULT_LIMIT,
  EXAMPLE_QUERIES,
  NO_SELECTION,
  PAGE_CONTEXT,
  type SearchRequest,
} from '../api.js';
import { runSearchBatch } from '../search.js';

/** Every minute. */
export const WARM_SCHEDULE = '* * * * *';

/** The example a fire runs, by the minute it was scheduled for. */
export const warmRequest = (scheduledTime: number): SearchRequest => {
  const minute = Math.floor(scheduledTime / Duration.toMillis(Duration.minutes(1)));
  const q = Option.getOrElse(Arr.get(EXAMPLE_QUERIES, minute % EXAMPLE_QUERIES.length), () =>
    Arr.headNonEmpty(EXAMPLE_QUERIES),
  );
  return {
    q,
    scope: 'all',
    section: NO_SELECTION,
    type: NO_SELECTION,
    subtype: NO_SELECTION,
    excludeApparatus: false,
    limit: DEFAULT_LIMIT,
    context: PAGE_CONTEXT,
  };
};

/** Run one fire's example. The search logs its own legs' timings; this line
 *  says which example ran, in how long, and whether it failed. */
export const warmSearch = Effect.fn('Search.warm')(function* (scheduledTime: number) {
  const request = warmRequest(scheduledTime);
  const [elapsed, slots] = yield* Effect.timed(runSearchBatch([request]));
  const failure = Option.fromNullishOr(slots.find((slot) => slot._tag === 'Failed')).pipe(
    Option.map((slot) => slot.message),
  );
  yield* Effect.logInfo('search.warm').pipe(
    Effect.annotateLogs({
      q: request.q,
      ms: Math.round(Duration.toMillis(elapsed)),
      failed: Option.getOrElse(failure, () => 'no'),
    }),
  );
});
