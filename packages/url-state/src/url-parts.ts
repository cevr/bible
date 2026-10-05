/**
 * An href as three raw parts, and the one printer.
 *
 * `UrlPartsFromHref` is the only code in the package that reads or writes
 * URL syntax. Decoding splits an href into its path segments (percent-decoded),
 * its query entries and its hash entries, each a record of a key to every
 * value it was given, in order. Encoding the same schema the other way is how
 * every href is printed:
 *
 * - each path segment by `encodeURIComponent`, keeping `:`, `@` and `,`
 *   readable, so a value holding `/` (a folder ref) stays one segment as `%2F`;
 * - the query by `URLSearchParams` (`+` for a space; byte-for-byte what a
 *   browser form and egw-search's links have always produced);
 * - the hash as `key=value&key=value`, keeping `,`, `:`, `/` and `@` readable,
 *   so a value such as `1.5,4` or `a/b` prints as written.
 *
 * Decoding is total: a segment or hash value whose percent-encoding is broken
 * is kept as written.
 *
 * Record order is insertion order, except that JavaScript lists integer-like
 * keys (`?2=a`) first; no place in this repo uses one.
 */

import { Option, Result, Schema, SchemaTransformation } from 'effect';

import { parseHref } from './location.js';

/** One section's entries: each key and every value it was given, in order. */
export const Raw = Schema.Record(Schema.String, Schema.Array(Schema.String));
export type Raw = typeof Raw.Type;

export const UrlParts = Schema.Struct({
  path: Schema.Array(Schema.String),
  query: Raw,
  hash: Raw,
});
export type UrlParts = typeof UrlParts.Type;

const decodeComponent = (text: string): string =>
  Result.getOrElse(
    Result.try(() => decodeURIComponent(text)),
    () => text,
  );

/** `encodeURIComponent`, then the given escapes put back as their characters. */
const encodeKeeping =
  (kept: RegExp) =>
  (text: string): string =>
    encodeURIComponent(text).replace(kept, decodeURIComponent);

const encodeSegment = encodeKeeping(/%3A|%40|%2C/gi);
const encodeHashPart = encodeKeeping(/%2C|%3A|%2F|%40/gi);

/** Entries into a record, keeping first-seen key order and every value. */
const collect = (entries: Iterable<readonly [string, string]>): Raw => {
  const record = new Map<string, string[]>();
  for (const [key, value] of entries) record.set(key, [...(record.get(key) ?? []), value]);
  return Object.fromEntries(record);
};

const splitHash = (hash: string): Array<readonly [string, string]> =>
  hash
    .replace(/^#/, '')
    .split('&')
    .filter((part) => part !== '')
    .map((part) => {
      const at = part.indexOf('=');
      if (at === -1) return [decodeComponent(part), ''] as const;
      return [decodeComponent(part.slice(0, at)), decodeComponent(part.slice(at + 1))] as const;
    });

const entriesOf = (record: Raw): Array<readonly [string, string]> =>
  Object.entries(record).flatMap(([key, values]) => values.map((value) => [key, value] as const));

/** The root is no segments; `/a/` is `a` and an empty last segment. */
const segmentsOf = (pathname: string): ReadonlyArray<string> => {
  if (pathname === '/') return [];
  return pathname.split('/').slice(1).map(decodeComponent);
};

const toParts = (href: string): UrlParts => {
  const url = parseHref(href);
  return {
    path: segmentsOf(url.pathname),
    query: collect(url.searchParams),
    hash: collect(splitHash(url.hash)),
  };
};

const toHref = (parts: UrlParts): string => {
  const path = `/${parts.path.map(encodeSegment).join('/')}`;
  const query = new URLSearchParams();
  for (const [key, value] of entriesOf(parts.query)) query.append(key, value);
  const search = query.toString();
  const hash = entriesOf(parts.hash)
    .map(([key, value]) => `${encodeHashPart(key)}=${encodeHashPart(value)}`)
    .join('&');
  return `${path}${prefixed('?', search)}${prefixed('#', hash)}`;
};

/** `text` behind its delimiter, or nothing when there is no text. */
const prefixed = (delimiter: string, text: string): string =>
  Option.match(
    Option.liftPredicate(text, (part) => part !== ''),
    {
      onNone: () => '',
      onSome: (part) => `${delimiter}${part}`,
    },
  );

/** An href (path-relative or absolute) as its parts; encoding prints the
 *  path-relative href. */
export const UrlPartsFromHref = Schema.String.pipe(
  Schema.decodeTo(UrlParts, SchemaTransformation.transform({ decode: toParts, encode: toHref })),
);

/** The href of some parts: the one printer. */
export const printHref: (parts: UrlParts) => string = Schema.encodeSync(UrlPartsFromHref);

/** The parts of an href. */
export const readHref: (href: string) => UrlParts = Schema.decodeSync(UrlPartsFromHref);
