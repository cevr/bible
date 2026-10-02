/**
 * A place: one route of an app, as a Schema from an href to a value.
 *
 * ```ts
 * const Lab = Place.make({
 *   path: '/films/:film/lab/:scene',
 *   params: { film: Codec.Segment, scene: Codec.Segment },
 *   query: Field.struct({ cue: Field.key(Codec.Text, { default: '', history: 'push' }) }),
 *   hash: Field.struct({ t: Field.key(Codec.MediaTime, { default: start, throttle: '250 millis' }) }),
 * });
 * ```
 *
 * The value mirrors the URL: `{ path, query, hash }`, which is what, how and
 * when. Three layers, each a Schema: an href is `UrlParts` (`./url-parts.ts`),
 * the parts are this value. An href whose path does not fit the pattern is
 * not this place (`decode` is `None`); within the place, each key degrades on
 * its own (`./field.ts`). `href` runs the same schema the other way, so a link,
 * a redirect and a history write all print the same text.
 *
 * `history(place, from, to)` says how moving between two hrefs enters
 * history: a changed path segment pushes; otherwise a changed key pushes if
 * its policy says so; otherwise the move replaces. A move that changes only
 * throttled keys is throttled by the longest of their windows.
 */

import {
  Array as Arr,
  Duration,
  Effect,
  Equivalence,
  Option,
  Order,
  Schema,
  SchemaIssue,
  SchemaTransformation,
} from 'effect';

import { keysOf, none, REPLACE, type Policy } from './field.js';
import { Raw, readHref, UrlParts, UrlPartsFromHref } from './url-parts.js';

/** The `:name` parameters of a path pattern. */
export type ParamNames<P extends string> = P extends `${string}:${infer Name}/${infer Rest}`
  ? Name | ParamNames<`/${Rest}`>
  : P extends `${string}:${infer Name}`
    ? Name
    : never;

/** A section schema: raw entries to a value, needing no services. */
export type Section = Schema.Codec<unknown, unknown>;

/** A path parameter's schema: one decoded segment to a value. */
export type Param = Schema.Codec<unknown, string>;

/** What a place holds: its path parameters, its query and its hash. */
export interface Value<Path, Query, Hash> {
  readonly path: Path;
  readonly query: Query;
  readonly hash: Hash;
}

export interface Place<A> {
  /** The pattern the place was made from. */
  readonly pattern: string;
  /** An href to the place's value, and (encoding) the value's href. */
  readonly schema: Schema.Codec<A, string>;
  /** The policy of each query key and each hash key. */
  readonly policies: {
    readonly query: ReadonlyMap<string, Policy>;
    readonly hash: ReadonlyMap<string, Policy>;
  };
}

/** The value of a place. */
export type Type<P> = P extends Place<infer A> ? A : never;

const toIssue = (error: Schema.SchemaError): SchemaIssue.Issue => error.issue;

const paramName = (part: string): Option.Option<string> =>
  Option.map(
    Option.liftPredicate(part, (text) => text.startsWith(':')),
    (text) => text.slice(1),
  );

const PathRecord = Schema.Record(Schema.String, Schema.String);

/**
 * The parts of an href as a place's value, built over erased types: the
 * sections are only known to be schemas, so each is run by its own decoder
 * and encoder, and `make` restores the value's type at its one boundary.
 */
const fromParts = (
  pattern: ReadonlyArray<string>,
  params: Section,
  query: Section,
  hash: Section,
) => {
  const decodePath = (segments: ReadonlyArray<string>) =>
    Effect.gen(function* () {
      const fits =
        segments.length === pattern.length &&
        pattern.every((part, index) => Option.isSome(paramName(part)) || part === segments[index]);
      if (!fits) {
        return yield* Effect.fail(
          new SchemaIssue.InvalidValue({ message: `a path /${pattern.join('/')}` }, segments),
        );
      }
      const named = Object.fromEntries(
        pattern.flatMap((part, index) =>
          Option.match(paramName(part), {
            onNone: () => [],
            onSome: (name) => [[name, segments[index] ?? '']],
          }),
        ),
      );
      return yield* Effect.mapError(Schema.decodeEffect(params)(named), toIssue);
    });
  const encodePath = (value: typeof params.Type) =>
    Effect.map(
      Effect.mapError(
        Effect.flatMap(
          Schema.encodeUnknownEffect(params)(value),
          Schema.decodeUnknownEffect(PathRecord),
        ),
        toIssue,
      ),
      (named) =>
        pattern.map((part) =>
          Option.match(paramName(part), {
            onNone: () => part,
            onSome: (name) => named[name] ?? '',
          }),
        ),
    );
  const read = (section: Section, raw: Raw) =>
    Effect.mapError(Schema.decodeEffect(section)(raw), toIssue);
  const write = <S extends Section>(section: S, value: S['Type']) =>
    Effect.mapError(
      Effect.flatMap(Schema.encodeUnknownEffect(section)(value), Schema.decodeUnknownEffect(Raw)),
      toIssue,
    );
  // The value side checks every part against its own schema, so a value
  // is validated on the way out and an Arbitrary can be derived from it.
  const Value = Schema.Struct({
    path: Schema.toType(params),
    query: Schema.toType(query),
    hash: Schema.toType(hash),
  });
  return UrlParts.pipe(
    Schema.decodeTo(
      Value,
      SchemaTransformation.transformEffect<typeof Value.Type, UrlParts>({
        decode: (parts) =>
          Effect.all({
            path: decodePath(parts.path),
            query: read(query, parts.query),
            hash: read(hash, parts.hash),
          }),
        encode: (value) =>
          Effect.all({
            path: encodePath(value.path),
            query: write(query, value.query),
            hash: write(hash, value.hash),
          }),
      }),
    ),
  );
};

/** A place from its path pattern, its parameters and its sections. */
export const make = <
  const P extends string,
  const Params extends { readonly [K in ParamNames<P>]: Param },
  Q extends Section = typeof none,
  H extends Section = typeof none,
>(options: {
  /** `/`-separated segments: `:name` is a parameter, anything else is literal. */
  readonly path: P;
  readonly params?: Params;
  readonly query?: Q;
  readonly hash?: H;
}): Place<Value<{ readonly [K in keyof Params]: Params[K]['Type'] }, Q['Type'], H['Type']>> => {
  const pattern = readHref(options.path).path;
  const params: Section = Schema.Struct(options.params ?? {});
  const query: Section = options.query ?? none;
  const hash: Section = options.hash ?? none;
  const erased = UrlPartsFromHref.pipe(Schema.decodeTo(fromParts(pattern, params, query, hash)));
  return {
    pattern: options.path,
    // The one place the value's type is restored: `fromParts` decodes each
    // part with the very schemas `Params`, `Q` and `H` name, so its output has
    // their types; TypeScript cannot follow a generic struct through it.
    // oxlint-disable-next-line effect/noAs, typescript/no-unsafe-type-assertion -- see above
    schema: erased as Schema.Codec<
      Value<{ readonly [K in keyof Params]: Params[K]['Type'] }, Q['Type'], H['Type']>,
      string
    >,
    policies: { query: new Map(keysOf(query)), hash: new Map(keysOf(hash)) },
  };
};

/** The place's value at `href`, if `href` is this place. */
export const decode = <A>(place: Place<A>, href: string): Option.Option<A> =>
  Schema.decodeOption(place.schema)(href);

/** The place's value at `href`, as an Effect: refused keys log at Debug here. */
export const decodeEffect = <A>(place: Place<A>, href: string): Effect.Effect<Option.Option<A>> =>
  Effect.option(Schema.decodeEffect(place.schema)(href));

/** The href of a value of the place: the one printer. */
export const href = <A>(place: Place<A>, value: A): string =>
  Schema.encodeSync(place.schema)(value);

/** How a move enters history. */
export interface Move {
  readonly history: 'push' | 'replace';
  readonly throttle: Option.Option<Duration.Duration>;
}

const sameValues = Arr.makeEquivalence(Equivalence.String);

const changedKeys = (from: Raw, to: Raw): ReadonlyArray<string> =>
  Arr.dedupe([...Object.keys(from), ...Object.keys(to)]).filter(
    (key) => !sameValues(from[key] ?? [], to[key] ?? []),
  );

/** How moving from one href to another (the second on `place`) enters history. */
export const history = <A>(place: Place<A>, from: string, to: string): Move => {
  const before = readHref(from);
  const after = readHref(to);
  if (!sameValues(before.path, after.path)) {
    return { history: 'push', throttle: Option.none() };
  }
  const policies = [
    ...changedKeys(before.query, after.query).map(
      (key) => place.policies.query.get(key) ?? REPLACE,
    ),
    ...changedKeys(before.hash, after.hash).map((key) => place.policies.hash.get(key) ?? REPLACE),
  ];
  const history = Option.match(
    Arr.findFirst(policies, (policy) => policy.history === 'push'),
    { onNone: () => 'replace' as const, onSome: () => 'push' as const },
  );
  // Throttled only when every changed key is: one unthrottled key flushes now.
  const windows = Arr.getSomes(policies.map((policy) => policy.throttle));
  const throttle = Option.map(
    Option.liftPredicate(windows, (all) => all.length > 0 && all.length === policies.length),
    (all) => Arr.reduce(all, Duration.zero, Order.max(Duration.Order)),
  );
  return { history, throttle };
};
