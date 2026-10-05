/**
 * Building blocks: one URL value as a domain value, each an Effect Schema
 * transformation whose encode is the same schema run the other way.
 *
 * A `Codec<A, string>` reads one value of one key (`?scope=egw`); a
 * `Codec<A, ReadonlyArray<string>>` reads every value of a repeated key
 * (`?type=book&type=-periodical`). `Field.key` and `Field.keys` (`./field.ts`)
 * turn either into a field with a default.
 *
 * A codec's type side says exactly which values a URL can hold, so
 * `decode(encode(x))` is `x` for every `x` the type admits (the package's
 * property tests check it through `effect/Arbitrary`).
 */

import { Schema, SchemaGetter, SchemaTransformation } from 'effect';

/** Text a URL can carry: a string without lone surrogates. */
const isWellFormed = Schema.makeFilter((text: string) => text.isWellFormed() || 'well-formed text');

/** Any text, as written. */
export const Text = Schema.String.check(isWellFormed);

/** One path segment: non-empty text, and not `.` or `..` (a URL resolves
 *  those away). `/` is fine: the printer writes it as `%2F`. */
export const Segment = Schema.NonEmptyString.check(
  isWellFormed,
  Schema.makeFilter((text: string) => (text !== '.' && text !== '..') || 'not . or ..'),
);

/** A finite number, as `Number(text)` reads it; written in JavaScript's
 *  shortest round-trip form (`4.5`, `0.1`, `1e+21`). */
export const Finite = Schema.FiniteFromString;

/** An integer. */
export const Int = Schema.FiniteFromString.check(Schema.isInt());

/** `'1'` is true; anything else is false. True writes `'1'`, false `'0'`. */
export const Flag = Schema.String.pipe(
  Schema.decodeTo(
    Schema.Boolean,
    SchemaTransformation.transform({
      decode: (text) => text === '1',
      encode: (on) => String(Number(on)),
    }),
  ),
);

/** One of a fixed set of words. */
export const literals = <const L extends ReadonlyArray<string>>(values: L) =>
  Schema.String.pipe(
    Schema.decodeTo(Schema.Literals(values), SchemaTransformation.passthroughSupertype()),
  );

/** A whole number, at any size. `Schema.isInt` is the safe-integer check,
 *  which would refuse `1e21`: a clamp after `truncate` must still see it. */
const isWhole = Schema.makeFilter((n: number) => Number.isInteger(n), {
  expected: 'a whole number',
  arbitraryConstraint: { number: 'integer' },
});

/** A number with its fraction dropped (`Math.trunc`), keeping the checks the
 *  number already had. Every finite number truncates; past the safe range a
 *  number is already whole. */
export const truncate = <E>(self: Schema.Codec<number, E>) =>
  self.pipe(
    Schema.decodeTo(Schema.toType(self).check(isWhole), {
      decode: SchemaGetter.transform(Math.trunc),
      encode: SchemaGetter.passthrough(),
    }),
  );

/** A number held inside `[min, max]`: decoding moves an outside number to the
 *  nearer bound; encoding writes the number as it is. */
export const clamp =
  (bounds: { readonly min?: number; readonly max?: number }) =>
  <E>(self: Schema.Codec<number, E>) => {
    // A finite number always lies within the largest finite bounds, so an
    // absent bound is one of those rather than an infinity.
    const min = bounds.min ?? -Number.MAX_VALUE;
    const max = bounds.max ?? Number.MAX_VALUE;
    return self.pipe(
      Schema.decodeTo(
        Schema.toType(self).check(
          Schema.isGreaterThanOrEqualTo(min),
          Schema.isLessThanOrEqualTo(max),
        ),
        {
          decode: SchemaGetter.transform((n: number) => Math.min(Math.max(n, min), max)),
          encode: SchemaGetter.passthrough(),
        },
      ),
    );
  };

// ---------------------------------------------------------------------------
// Tri-state selections: `?type=book&type=-periodical`
// ---------------------------------------------------------------------------

/** One axis of a tri-state filter: each value is included, excluded, or neither. */
export interface Selection<A> {
  readonly include: ReadonlyArray<A>;
  readonly exclude: ReadonlyArray<A>;
}

/** The selection with nothing included or excluded. */
export const NO_SELECTION: Selection<never> = { include: [], exclude: [] };

/**
 * A repeated key whose values are members of `values`, each either bare
 * (included) or behind `prefix` (excluded): `?type=book&type=-periodical`.
 * Includes write before excludes. A value that is not a member is dropped on
 * its own, so `?type=book&type=nonsense` reads as `book`. No member may begin
 * with `prefix`.
 */
export const selection = <const L extends ReadonlyArray<string>>(values: L, prefix = '-') => {
  const Member = Schema.Literals(values);
  const isMember = Schema.is(Member);
  return Schema.Array(Schema.String).pipe(
    Schema.decodeTo(
      Schema.Struct({ include: Schema.Array(Member), exclude: Schema.Array(Member) }),
      SchemaTransformation.transform<Selection<L[number]>, ReadonlyArray<string>>({
        decode: (raw) => ({
          include: raw.filter(isMember),
          exclude: raw
            .filter((text) => text.startsWith(prefix))
            .map((text) => text.slice(prefix.length))
            .filter(isMember),
        }),
        encode: (picked) => [
          ...picked.include,
          ...picked.exclude.map((value) => `${prefix}${value}`),
        ],
      }),
    ),
  );
};
