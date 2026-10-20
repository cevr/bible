// Fixture for film/no-lazy-test-fixture: each line marked RED fires the rule,
// and nothing else does.

import { Effect as Fx } from 'effect';
import * as EffectModule from 'effect/Effect';
import { cachedWithTTL } from 'effect/Effect';
import { describe, it } from 'effect-bun-test';

declare const read: Fx.Effect<string>;

export const lazy = Fx.runSync(Fx.cached(read)); // RED film/no-lazy-test-fixture
export const lazyTtl = EffectModule.cachedInvalidateWithTTL(read, '1 minute'); // RED film/no-lazy-test-fixture
export const lazyNamed = cachedWithTTL(read, '1 minute'); // RED film/no-lazy-test-fixture

describe('a group', () => {
  const shared = Fx.runSync(Fx.cached(read)); // RED film/no-lazy-test-fixture
  it.effect('reads it', () => Fx.flatten(shared));
});

it.effect('makes its own', () => Fx.flatMap(Fx.cached(read), (own) => own));

export const helper = () => Fx.cached(read);

declare const Elsewhere: { readonly cached: (x: unknown) => unknown };
export const notEffects = Elsewhere.cached(read);
