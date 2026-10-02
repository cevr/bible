import { Effect, Option, Schema } from 'effect';
import * as Arbitrary from 'effect/Arbitrary';
import { describe, expect, it } from 'effect-bun-test';

import * as Codec from './codec.js';

/** decode(encode(items)) is items, for every list of items that are not
 *  empty and do not hold the separator. */
const delimitedRoundTrips = (separator: ',' | ':' | '|') =>
  Effect.gen(function* () {
    const List = Codec.delimited(Codec.Text, separator);
    const items = Arbitrary.array(
      Arbitrary.schema(Codec.Text).pipe(
        Arbitrary.filter((item) => item !== '' && !item.includes(separator)),
      ),
    );
    const result = yield* Arbitrary.checkEffect(
      items,
      (list) =>
        Option.match(Schema.encodeOption(List)(list), {
          onNone: () => false,
          onSome: (text) =>
            Option.exists(Schema.decodeOption(List)(text), (back) =>
              Schema.toEquivalence(Schema.Array(Codec.Text))(back, list),
            ),
        }),
      { runs: 300 },
    );
    expect(Arbitrary.formatCheckFailure(result)).toBeUndefined();
  });

describe('Codec.delimited', () => {
  it.effect('round-trips every list of items without the separator', () =>
    Effect.gen(function* () {
      yield* delimitedRoundTrips(',');
      yield* delimitedRoundTrips(':');
      yield* delimitedRoundTrips('|');
    }),
  );

  it.effect('refuses to write an item holding the separator, or an empty one', () =>
    Effect.sync(() => {
      const List = Codec.delimited(Codec.Text, ':');
      expect(Schema.encodeOption(List)(['a:', 'b'])).toEqual(Option.none());
      expect(Schema.encodeOption(List)(['a', ''])).toEqual(Option.none());
      expect(Schema.encodeOption(List)(['a', 'b'])).toEqual(Option.some('a:b'));
    }),
  );

  it.effect('takes a one-character separator only', () =>
    Effect.sync(() => {
      // @ts-expect-error -- `::` cannot be told apart from an item ending in `:`.
      Codec.delimited(Codec.Text, '::');
      // @ts-expect-error -- the empty separator splits every character.
      Codec.delimited(Codec.Text, '');
      expect(Schema.decodeOption(Codec.delimited(Codec.Text, '|'))('a|b')).toEqual(
        Option.some(['a', 'b']),
      );
    }),
  );
});

describe('Codec.truncate', () => {
  const Limit = Codec.Finite.pipe(
    Codec.truncate,
    (n) => n.check(Schema.isGreaterThan(0)),
    Codec.clamp({ max: 100 }),
  );

  it.effect('keeps a finite number past the safe range, for the clamp to hold', () =>
    Effect.sync(() => {
      expect(Schema.decodeOption(Limit)('1e21')).toEqual(Option.some(100));
      expect(Schema.decodeOption(Limit)('9007199254740993')).toEqual(Option.some(100));
      expect(Schema.decodeOption(Codec.Finite.pipe(Codec.truncate))('-1e300')).toEqual(
        Option.some(-1e300),
      );
    }),
  );
});
