/**
 * The request URL as a `Location`, for server rendering.
 *
 * Read-only: a server render answers one request, so its address cannot move.
 * A write is accepted and ignored (logged at Debug as
 * `location.server.write.ignored`), not failed: `Location`'s writes cannot fail
 * in any adapter, so code that writes during render runs unchanged on both
 * sides, and the client, whose address can move, applies the write after
 * hydration. A browser never sends the hash, so the entry has none.
 */

import { Effect, Layer, Stream } from 'effect';

import { Location, parseHref, relativeHref, type Entry } from './location.js';

/** The key of the one entry a server render is on. */
export const SERVER_ENTRY_KEY = 'server';

/** `Location` fixed at `href` (an absolute request URL or a path-relative one). */
export const layerServer = (href: string): Layer.Layer<Location> => {
  const url = parseHref(href);
  url.hash = '';
  const entry: Entry = { href: relativeHref(url), key: SERVER_ENTRY_KEY, navigation: 'load' };
  const ignored = (write: 'push' | 'replace') => (to: string) =>
    Effect.logDebug(`location.server.write.ignored write=${write} href=${to}`);
  return Layer.succeed(
    Location,
    Location.of({
      current: Effect.succeed(entry),
      changes: Stream.make(entry),
      push: ignored('push'),
      replace: ignored('replace'),
      back: Effect.logDebug('location.server.back.ignored'),
    }),
  );
};
