/**
 * Fields: a section of the URL (the query, or the hash) as a domain value.
 *
 * Every field is a Schema from the raw entries of `./url-parts.ts` to a
 * value, so reading and writing are one declaration:
 *
 * - `key(codec, { default })`: one key's first value, read by `codec`. An
 *   absent key reads as the default; a value equal to the default (compared
 *   as written) writes no key. A value `codec` refuses reads as the default
 *   and logs `url-state.key.invalid` at Debug: one broken key never costs the
 *   others.
 * - `keys(codec)`: every value of a repeated key. No values is the default.
 * - `struct({ ... }, { keys })`: several fields, each under its property's
 *   name or the URL key `keys` renames it to.
 * - `indexed(struct, { max, key, marker })`: suffixed copies of a struct
 *   (egw-search's panes: `q`, `q2`, `section2`).
 *
 * Each key also says how a change to it enters history: `push` (a place the
 * reader may come back to: a new query, a cue) or `replace` (a refinement of
 * the same place: a filter, the playhead), optionally throttled. The policy
 * travels with the schema as an annotation, so a `Place` (`./place.ts`) reads
 * it from the same declaration.
 */

import {
  Array as Arr,
  Duration,
  Effect,
  Option,
  Schema,
  SchemaGetter,
  SchemaTransformation,
} from 'effect';
import type { SchemaIssue } from 'effect';

import { Raw } from './url-parts.js';

/** How a change to a key enters history. */
export interface Policy {
  readonly history: 'push' | 'replace';
  /** Writes of this key alone wait this long after the last flush. */
  readonly throttle: Option.Option<Duration.Duration>;
}

export const REPLACE: Policy = { history: 'replace', throttle: Option.none() };

declare module 'effect/Schema' {
  namespace Annotations {
    interface Annotations {
      /** A key's history policy (`Field.key`, `Field.keys`). */
      readonly urlStatePolicy?: Policy;
      /** A section's URL keys, in write order, with their policies. */
      readonly urlStateKeys?: ReadonlyArray<readonly [key: string, policy: Policy]>;
    }
  }
}

export interface PolicyOptions {
  /** `'push'` for a change worth a history entry; `'replace'` when absent. */
  readonly history?: 'push' | 'replace';
  /** Hold writes of this key to one per window (a playhead while it plays). */
  readonly throttle?: Duration.Input;
}

const policyOf = (options: PolicyOptions): Policy => ({
  history: options.history ?? 'replace',
  throttle: Option.map(Option.fromUndefinedOr(options.throttle), Duration.fromInputUnsafe),
});

const toIssue = (error: Schema.SchemaError): SchemaIssue.Issue => error.issue;

/** `codec`, total: a value it refuses decodes as `fallback`, logged at Debug. */
const orDefault = <A, E>(codec: Schema.Codec<A, E>, fallback: A) =>
  codec.pipe(
    Schema.catchDecoding((issue) =>
      Effect.as(
        Effect.logDebug(`url-state.key.invalid issue=${String(issue)}`),
        Option.some(fallback),
      ),
    ),
  );

/** The raw side of every field: the values a key was given, if it was given any. */
const Values = Schema.optionalKey(Schema.Array(Schema.String));

/**
 * One key, read from its first value by `codec`, `options.default` when it is
 * absent or refused, and left out of the URL at the default.
 */
export const key = <A>(
  codec: Schema.Codec<A, string>,
  options: PolicyOptions & { readonly default: NoInfer<A> },
) => {
  const total = orDefault(codec, options.default);
  const written = Schema.encodeSync(codec)(options.default);
  return Values.pipe(
    Schema.decodeTo(Schema.toType(codec), {
      decode: SchemaGetter.transformOptionalEffect((values: Option.Option<ReadonlyArray<string>>) =>
        Option.match(Option.flatMap(values, Arr.head), {
          onNone: () => Effect.succeedSome(options.default),
          onSome: (text) =>
            Effect.asSome(Effect.mapError(Schema.decodeEffect(total)(text), toIssue)),
        }),
      ),
      encode: SchemaGetter.transformOptionalEffect((value: Option.Option<A>) =>
        Option.match(value, {
          onNone: () => Effect.succeedNone,
          onSome: (a) =>
            Effect.map(Effect.mapError(Schema.encodeEffect(codec)(a), toIssue), (text) =>
              Option.liftPredicate([text], () => text !== written),
            ),
        }),
      ),
    }),
  ).annotate({ urlStatePolicy: policyOf(options) });
};

/**
 * A repeated key, read from all its values by `codec`. No values at all is
 * the default (`codec` decoding `[]`), and a value that writes no values
 * leaves the key out.
 */
export const keys = <A>(
  codec: Schema.Codec<A, ReadonlyArray<string>>,
  options: PolicyOptions = {},
) => {
  const fallback = Schema.decodeSync(codec)([]);
  const total = orDefault(codec, fallback);
  return Values.pipe(
    Schema.decodeTo(Schema.toType(codec), {
      decode: SchemaGetter.transformOptionalEffect((values: Option.Option<ReadonlyArray<string>>) =>
        Effect.asSome(
          Effect.mapError(Schema.decodeEffect(total)(Option.getOrElse(values, () => [])), toIssue),
        ),
      ),
      encode: SchemaGetter.transformOptionalEffect((value: Option.Option<A>) =>
        Option.match(value, {
          onNone: () => Effect.succeedNone,
          onSome: (a) =>
            Effect.map(Effect.mapError(Schema.encodeEffect(codec)(a), toIssue), (written) =>
              Option.liftPredicate(written, Arr.isReadonlyArrayNonEmpty),
            ),
        }),
      ),
    }),
  ).annotate({ urlStatePolicy: policyOf(options) });
};

/** A key's values in `raw`, if it holds the key itself (not through its prototype). */
const ownValues = (raw: Raw, name: string): Option.Option<ReadonlyArray<string>> =>
  Option.flatMap(
    Option.liftPredicate(name, (key) => Object.hasOwn(raw, key)),
    (key) => Option.fromUndefinedOr(raw[key]),
  );

/** The URL keys a section writes, in order, with their policies. */
export const keysOf = (section: Schema.Top): ReadonlyArray<readonly [string, Policy]> =>
  Schema.resolveAnnotations(section)?.urlStateKeys ?? [];

/**
 * Several fields as one value. Each writes under its property's name, or
 * under the URL key `options.keys` gives it (`{ excludeApparatus: 'noref' }`),
 * in the order the fields are declared.
 */
export const struct = <
  const Fields extends Schema.Struct.Fields,
  const Keys extends { readonly [K in keyof Fields]?: string } = {},
>(
  fields: Fields,
  options: { readonly keys?: Keys } = {},
) => {
  const renames: { readonly [K in keyof Fields]?: string } = options.keys ?? {};
  const renamed: Readonly<Partial<Record<string, string>>> = renames;
  const written = Object.entries(fields).map(([property, field]): readonly [string, Policy] => [
    Option.getOrElse(Option.fromUndefinedOr(renamed[property]), () => property),
    Option.getOrElse(
      Option.fromUndefinedOr(Schema.resolveAnnotations(field)?.urlStatePolicy),
      () => REPLACE,
    ),
  ]);
  return Schema.Struct(fields).pipe(Schema.encodeKeys(renames)).annotate({ urlStateKeys: written });
};

/** The struct with no fields: a place's section that holds nothing. */
export const none = struct({});

export interface IndexedOptions {
  /** The most copies the URL may hold; a link asking for more opens this many. */
  readonly max: number;
  /** The URL key of `name` in copy `index` (0-based). */
  readonly key: (name: string, index: number) => string;
  /** The key every copy after the first writes, empty when its value is the
   *  default (`?q=a&q2=`), so a copy at its defaults still exists when the
   *  link is read back. */
  readonly marker: string;
}

/**
 * Copies of one struct, each under its own suffixed keys (`options.key`).
 *
 * A later copy exists when the URL holds any of its keys. Copy 0 always
 * exists, keys or not; the walk from copy 1 stops at the first copy with no
 * keys, and at `options.max`.
 */
export const indexed = <S extends Schema.Codec<unknown, unknown>>(
  section: S,
  options: IndexedOptions,
) => {
  const names = keysOf(section).map(([name]) => name);
  const present = (raw: Raw, index: number): boolean =>
    names.some((name) => Object.hasOwn(raw, options.key(name, index)));
  const copies = (raw: Raw): number => {
    let count = 1;
    while (count < options.max && present(raw, count)) count += 1;
    return count;
  };
  const readCopy = (raw: Raw, index: number) =>
    Effect.mapError(
      Schema.decodeEffect(section)(
        Object.fromEntries(
          names.flatMap((name) =>
            Option.match(ownValues(raw, options.key(name, index)), {
              onNone: () => [],
              onSome: (values) => [[name, values] as const],
            }),
          ),
        ),
      ),
      toIssue,
    );
  const writeCopy = (copy: S['Type'], index: number) =>
    Effect.gen(function* () {
      const written = yield* Effect.mapError(
        Effect.flatMap(Schema.encodeUnknownEffect(section)(copy), Schema.decodeUnknownEffect(Raw)),
        toIssue,
      );
      const marked = index > 0;
      return names.flatMap((name): Array<readonly [string, ReadonlyArray<string>]> =>
        Option.match(ownValues(written, name), {
          onSome: (values) => [[options.key(name, index), values]],
          onNone: () => {
            if (marked && name === options.marker) return [[options.key(name, index), ['']]];
            return [];
          },
        }),
      );
    });
  const Copies = Schema.NonEmptyArray(Schema.toType(section)).check(
    Schema.isMaxLength(options.max),
  );
  return Raw.pipe(
    Schema.decodeTo(
      Copies,
      SchemaTransformation.transformEffect<Arr.NonEmptyReadonlyArray<S['Type']>, Raw>({
        decode: (raw) =>
          Effect.forEach(
            Arr.makeBy(copies(raw), (index) => index),
            (index) => readCopy(raw, index),
          ),
        encode: (all) =>
          Effect.map(
            Effect.forEach(all, (copy, index) => writeCopy(copy, index)),
            (entries) => Object.fromEntries(entries.flat()),
          ),
      }),
    ),
  ).annotate({
    urlStateKeys: Arr.makeBy(options.max, (index) =>
      keysOf(section).map(([name, policy]) => [options.key(name, index), policy] as const),
    ).flat(),
  });
};
