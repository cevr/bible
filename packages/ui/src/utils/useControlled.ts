// Upstream: packages/utils/src/useControlled.ts
//
// A value a part owns unless its owner passes it: `controlled` reads the
// owner's prop (undefined when uncontrolled), `default` seeds the part's own
// value once. Setting writes the part's own value only; a controlled part
// reports the change through its `on…Change` callback and waits for the owner.
import { type Accessor, createSignal, untrack } from 'solid-js';

export interface UseControlledParameters<T> {
  /** The owner's value; `undefined` leaves the part in charge. */
  controlled: () => T | undefined;
  /** The part's first value when uncontrolled. */
  default: () => T;
}

export function useControlled<T>(
  params: UseControlledParameters<T>,
): [Accessor<T>, (next: T) => void] {
  // Seeded by a function so a function-typed value is not mistaken for one;
  // the default is read untracked, so the seed never re-runs.
  const [own, setOwn] = createSignal<T>(() => untrack(params.default), { ownedWrite: true });
  const value = () => {
    const controlled = params.controlled();
    return controlled === undefined ? own() : controlled;
  };
  const set = (next: T) => {
    if (untrack(params.controlled) === undefined) {
      setOwn(() => next);
    }
  };
  return [value, set];
}
