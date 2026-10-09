// How long a wait holds a request open: the one limit the lab's wait routes
// (`core/api.ts`) decode a `timeout` query against, and the one the pages that
// wait read to stay inside it.

import { Effect, Schema, SchemaTransformation } from 'effect';

/** The longest a wait holds a request open, in seconds. */
export const LONGEST_WAIT = 60;

/**
 * A wait's `timeout` query, in seconds: absent, the longest; any other held
 * within 0..`LONGEST_WAIT` as it is decoded, so the server waits as long as
 * the query says and never longer.
 */
export const WaitTimeout = Schema.Finite.pipe(
  Schema.decodeTo(
    Schema.Finite,
    SchemaTransformation.transform({
      decode: (seconds) => Math.min(Math.max(seconds, 0), LONGEST_WAIT),
      encode: (seconds) => seconds,
    }),
  ),
  Schema.withDecodingDefaultKey(Effect.succeed(LONGEST_WAIT)),
);
