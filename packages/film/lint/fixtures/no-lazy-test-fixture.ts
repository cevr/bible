// Fixture for film/no-lazy-test-fixture: each line marked RED fires the rule,
// and nothing else does.

import { Effect as Fx } from 'effect';
import * as EffectModule from 'effect/Effect';
import { cachedWithTTL } from 'effect/Effect';
import { flow, pipe } from 'effect/Function';
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

export const piped = read.pipe(Fx.cached, Fx.runSync); // RED film/no-lazy-test-fixture
export const pipedTtl = read.pipe(EffectModule.cachedWithTTL('1 minute')); // RED film/no-lazy-test-fixture

export const curried = Fx.cachedWithTTL('1 minute')(read); // RED film/no-lazy-test-fixture
export const pipedFn = pipe(read, Fx.cached); // RED film/no-lazy-test-fixture

const withinMinute = Fx.cachedWithTTL('1 minute');
it.effect('applies a helper in its own case', () => Fx.flatten(withinMinute(read)));
export const named = withinMinute(read); // RED film/no-lazy-test-fixture

const composed = flow(Fx.cached, Fx.flatten);
it.effect('applies a flow in its own case', () => Fx.flatten(composed(read)));
export const composedTtl = flow(EffectModule.cachedWithTTL('1 minute'), Fx.flatten);
export const flowed = composed(read); // RED film/no-lazy-test-fixture

declare const Elsewhere: { readonly cached: (x: unknown) => unknown };
export const notEffects = Elsewhere.cached(read);
