// A machine's actor for one of the lab's providers: spawned on the page's
// runtime (`runtime.atom`, so it lives as long as the provider and stops
// with it), the page waiting for it (`Loading`) and then handing it to the
// provider's body once, keyed, so the body never sees it change. The
// editor, motion, notes, compare, a Set and the studio each mount theirs so.

import { useAtomSuspense } from '@bible/atom-solid';
import { type JSX, Loading, Show } from '@solidjs/web';
import type { Effect, Scope } from 'effect';
import { Machine } from 'effect-machine';
import type * as Atom from 'effect/reactivity/Atom';

interface ActorProps<A, R> {
  /** The runtime the actor runs on: the page's. */
  readonly runtime: Atom.AtomRuntime<R>;
  /** What spawns and starts it. */
  readonly spawn: Effect.Effect<A, never, R | Scope.Scope>;
  /** The provider's body, given the actor once it is spawned. */
  readonly children: (actor: A) => JSX.Element;
}

const Spawned = <A, R>(props: ActorProps<A, R>) => {
  const spawned = props.runtime.atom(Machine.scoped(props.spawn));
  const actor = useAtomSuspense(() => spawned);
  return (
    <Show when={actor()} keyed>
      {(a: A) => props.children(a)}
    </Show>
  );
};

/** The actor `spawn` makes on `runtime`, given to `children` once it is spawned. */
export const Actor = <A, R>(props: ActorProps<A, R>) => (
  <Loading>
    <Spawned {...props} />
  </Loading>
);
