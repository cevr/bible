// Fixture for film/pages-in-case-scope: each line marked RED fires the rule,
// and nothing else does.

import { Effect, Exit, Scope as Scopes } from 'effect';
import * as ScopeModule from 'effect/Scope';

declare const open: () => Effect.Effect<void, never, Scopes.Scope>;

export const byHand = Effect.gen(function* () {
  const scope = yield* Scopes.make(); // RED film/pages-in-case-scope
  yield* Scopes.provide(scope)(open());
  yield* Scopes.close(scope, Exit.void);
  const other = yield* ScopeModule.make('parallel'); // RED film/pages-in-case-scope
  yield* ScopeModule.close(other, Exit.void);
});

export const inTheCase = Effect.gen(function* () {
  const child = yield* Scopes.fork(yield* Effect.scope);
  yield* Scopes.provide(child)(open());
  yield* Scopes.close(child, Exit.void);
});

declare const Elsewhere: { readonly make: () => void };
export const notEffects = () => Elsewhere.make();
