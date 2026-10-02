/**
 * The address a page is on, as an Effect service.
 *
 * `Location` is the one seam between URL state and the host that owns the
 * address bar. Three adapters fill it:
 *
 * - `./location-browser.ts`: the tab's `window.history`, the only module
 *   allowed to touch `window.location`, `history` or `popstate`;
 * - `./location-memory.ts`: a history stack in memory, with Back and Forward,
 *   for tests and for anything without a tab;
 * - `./location-server.ts`: the request URL, read-only, for server rendering.
 *
 * An entry is a path-relative href (`/films/a/lab/b?cue=c#t=1`) with a key that
 * names the history entry: a push makes a new key, a replace keeps it, and Back
 * or Forward lands on the key that entry was given. Callers that remember
 * something per entry (a scroll position) remember it against the key.
 */

import { Context, Schema } from 'effect';
import type { Effect, Stream } from 'effect';

/** How the page arrived at an entry. */
export const Navigation = Schema.Literals(['load', 'push', 'replace', 'traverse']);
export type Navigation = typeof Navigation.Type;

/** One history entry: where the page is, which entry it is, and how it got there. */
export const Entry = Schema.Struct({
  href: Schema.String,
  key: Schema.String,
  navigation: Navigation,
});
export type Entry = typeof Entry.Type;

export interface LocationService {
  /** The entry on screen. */
  readonly current: Effect.Effect<Entry>;
  /** The entry on screen, then every entry after it: each push, replace and
   *  traversal, in order. */
  readonly changes: Stream.Stream<Entry>;
  /** A new entry after this one; entries ahead of this one are dropped. */
  readonly push: (href: string) => Effect.Effect<void>;
  /** This entry, at a new href, keeping its key. */
  readonly replace: (href: string) => Effect.Effect<void>;
}

export class Location extends Context.Service<Location, LocationService>()(
  '@bible/url-state/Location',
) {}

/** The path-relative form of a URL: what an entry holds. */
export const relativeHref = (url: URL): string => `${url.pathname}${url.search}${url.hash}`;

/** A parsed href, resolved against a placeholder origin: entries carry no origin. */
export const parseHref = (href: string): URL => new URL(href, 'http://url-state.invalid');
