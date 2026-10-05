import { Effect, Option, Schema } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import * as Codec from './codec.js';

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
