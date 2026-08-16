/**
 * Ported from @effect/atom-solid (MIT), adapted to Solid 2. Delete this package
 * when upstream supports Solid 2.
 *
 * Solid hooks for using Effect Atoms from components and computations. The
 * hooks read and write atoms through the current `RegistryContext`, mount atoms
 * for cleanup, subscribe callbacks, seed initial values, expose `AsyncResult`
 * atoms as suspending accessors, and read values from `AtomRef` references.
 *
 * Solid 2 removed `createComputed`, so every subscription runs as a
 * compute/effect pair: the compute phase tracks the atom thunk, and the effect
 * phase attaches the subscription and returns the unsubscribe as its cleanup.
 * Value-carrying hooks use `createRenderEffect` so the subscription is attached
 * before the render pass reads the accessor; `useAtomSubscribe` uses the
 * user-phase `createEffect`, as upstream does, so a caller's `immediate`
 * callback never runs during render.
 *
 * A value-carrying hook cannot hold its value in a signal alone. Solid 2 queues
 * a signal write until the next flush, so a component that reads its accessor
 * during the same synchronous pass that created it would observe the
 * uninitialised `undefined` rather than the atom's current value — a value the
 * public accessor types exclude. Every such hook therefore keeps two parts: a
 * plain mutable cell holding the current value, written synchronously by the
 * subscription callback (the registry's `immediate` seed calls back before
 * `subscribe` returns), and an owned signal used only as a reactive notifier,
 * bumped on each update. The accessor reads the signal to register the
 * dependency and returns the cell, so the value is always current and reactive
 * readers still re-run.
 *
 * The notifier signals are created with `ownedWrite: true`. The registry's
 * `immediate` subscription calls back synchronously from inside the effect — an
 * owned scope — which Solid 2 development mode rejects
 * (`REACTIVE_WRITE_IN_OWNED_SCOPE`) unless the write is declared intentional.
 */

// This module is a framework binding, not Effect domain code: its vocabulary is
// fixed by the two APIs it joins, so several Effect-domain lint rules do not
// apply here.
//
/* oxlint-disable effect/noAs -- the `mode` option selects the setter's return type at the type level; the implementation sees `mode` only as a runtime value and cannot prove which branch it is in. */
/* oxlint-disable effect/noChainedTypeAssertions -- reaching the registry-private `ensureNode`, exactly as upstream @effect/atom-solid and @effect/atom-react do. */
/* oxlint-disable effect/noThrowStatement -- Solid 2 signals async failure by throwing from a memo, and a rejected promise is produced by throwing; both are the framework's contract. */
/* oxlint-disable effect/noNewPromise -- `useAtomSuspense` must hand Solid a real pending promise, and the `promise` setter modes are promise-returning by their upstream signature. */
/* oxlint-disable effect/noNullish -- `undefined` is Solid's own uninitialised-signal value and the registry's own optional-option encoding. */
/* oxlint-disable effect/noRuntimeTypeof -- upstream's setter accepts `W | ((value: R) => W)`; only a runtime check separates an updater from a value. */
/* oxlint-disable effect/noKnownValueWidening -- the overload pair on `useAtomValue` is the upstream signature. */

import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as AsyncResult from 'effect/unstable/reactivity/AsyncResult';
import * as Atom from 'effect/unstable/reactivity/Atom';
import * as AtomRegistry from 'effect/unstable/reactivity/AtomRegistry';
import type * as AtomRef from 'effect/unstable/reactivity/AtomRef';
import type { Accessor } from 'solid-js';
import { createEffect, createMemo, createRenderEffect, createSignal, useContext } from 'solid-js';

import { RegistryContext } from './registry-context.js';

/**
 * The `initialValues` element type accepted by `AtomRegistry.make`, reused so
 * this hook and the registry stay in step.
 */
export type AtomRegistryInitialValues = NonNullable<
  NonNullable<Parameters<typeof AtomRegistry.make>[0]>['initialValues']
>;

type AtomInitialValue = AtomRegistryInitialValues extends Iterable<infer Pair> ? Pair : never;

const initialValuesSet = new WeakMap<AtomRegistry.AtomRegistry, WeakSet<AtomInitialValue[0]>>();

/**
 * Seeds initial atom values in the current Solid atom registry.
 *
 * For each atom in the current registry, this hook applies the first value
 * supplied through the hook. Later calls for the same atom in that registry are
 * ignored.
 *
 * The pair type matches `AtomRegistry.make`'s own `initialValues` option: the
 * list is heterogeneous and `Atom` is covariant in its value, so the element
 * type cannot name every atom's value at once.
 */
export const useAtomInitialValues = (initialValues: AtomRegistryInitialValues): void => {
  const registry = useContext(RegistryContext);
  let set = initialValuesSet.get(registry);
  if (set === undefined) {
    set = new WeakSet();
    initialValuesSet.set(registry, set);
  }
  for (const [atom, value] of initialValues) {
    if (!set.has(atom)) {
      set.add(atom);
      seedInitialValue(registry, atom, value);
    }
  }
};

/**
 * Seeding a value before the atom is ever read needs the registry's own node,
 * which `AtomRegistry` deliberately keeps off its public interface. Upstream
 * reaches through the same escape hatch in both the React and Solid bindings.
 */
interface RegistryInternals {
  readonly ensureNode: <A>(atom: Atom.Atom<A>) => { readonly setValue: (value: A) => void };
}

const seedInitialValue = (
  registry: AtomRegistry.AtomRegistry,
  atom: AtomInitialValue[0],
  value: AtomInitialValue[1],
): void => {
  (registry as unknown as RegistryInternals).ensureNode(atom).setValue(value);
};

/**
 * Subscribes to an atom in the current Solid registry and returns its value as
 * a Solid accessor.
 */
export const useAtomValue: {
  <A>(atom: () => Atom.Atom<A>): Accessor<A>;
  <A, B>(atom: () => Atom.Atom<A>, f: (_: A) => B): Accessor<B>;
} = <A, B>(atom: () => Atom.Atom<A>, f?: (_: A) => B): Accessor<A | B> => {
  const registry = useContext(RegistryContext);
  if (f === undefined) return createAtomAccessor<A | B>(registry, atom);
  return createAtomAccessor<A | B>(registry, () => Atom.map(atom(), f));
};

const constImmediate = { immediate: true };

/**
 * The registry's `immediate` subscription calls back synchronously while the
 * effect is still running, so the notifier write lands inside an owned scope.
 * Solid 2 development mode rejects such a write (`REACTIVE_WRITE_IN_OWNED_SCOPE`)
 * unless the signal declares it intentional.
 */
const constOwnedWrite = { ownedWrite: true };

/**
 * The two halves of a value-carrying hook: a `publish` callback the source
 * calls on every new value, and the `accessor` handed back to the caller.
 *
 * `publish` writes the plain cell synchronously, so a read taken in the same
 * synchronous pass that created the bridge already sees the current value.
 * The signal behind `accessor` carries no value at all — only a version that
 * `publish` bumps — so it exists purely to mark the accessor dirty for reactive
 * readers. Reading it inside `accessor` is what registers the dependency edge.
 */
interface Bridge<A> {
  readonly publish: (value: A) => void;
  readonly accessor: Accessor<A>;
}

const createBridge = <A>(): Bridge<A> => {
  // The cell starts empty because no source has published yet. Every consumer
  // attaches a synchronously-seeding source (the registry's `immediate`
  // subscription, or a direct `ref.value` read) before returning the accessor,
  // so the empty state is never observable through the public API.
  let current: A | undefined;
  const [version, setVersion] = createSignal(0, constOwnedWrite);
  return {
    publish: (value) => {
      current = value;
      setVersion((n) => n + 1);
    },
    accessor: () => {
      version();
      return current as A;
    },
  };
};

function createAtomAccessor<A>(
  registry: AtomRegistry.AtomRegistry,
  atom: () => Atom.Atom<A>,
): Accessor<A> {
  const bridge = createBridge<A>();
  createRenderEffect(atom, (current) =>
    registry.subscribe(current, bridge.publish, constImmediate),
  );
  // Both phases of a render effect run synchronously when the surrounding
  // computation is created, and `subscribe` with `immediate` calls back before
  // it returns, so the cell holds the atom's value by the time this returns.
  return bridge.accessor;
}

function mountAtom<A>(registry: AtomRegistry.AtomRegistry, atom: () => Atom.Atom<A>): void {
  createRenderEffect(atom, (current) => registry.mount(current));
}

/**
 * Mounts an atom in the current Solid registry for the lifetime of the current
 * Solid computation.
 *
 * The hook uses the current `RegistryContext`, mounts inside a Solid
 * computation, and releases the mount through Solid cleanup when the
 * computation changes or the owner is disposed.
 */
export const useAtomMount = <A>(atom: () => Atom.Atom<A>): void => {
  const registry = useContext(RegistryContext);
  mountAtom(registry, atom);
};

/**
 * The write callback returned by {@link useAtom} and {@link useAtomSet}. For
 * `AsyncResult` atoms, `promise` and `promiseExit` modes return promises for
 * the success value or the full `Exit`.
 */
export type AtomSetter<R, W, Mode extends SetterMode> = 'promise' extends Mode
  ? (value: W) => Promise<AsyncResult.AsyncResult.Success<R>>
  : 'promiseExit' extends Mode
    ? (
        value: W,
      ) => Promise<
        Exit.Exit<AsyncResult.AsyncResult.Success<R>, AsyncResult.AsyncResult.Failure<R>>
      >
    : (value: W | ((value: R) => W)) => void;

type SetterMode = 'value' | 'promise' | 'promiseExit';

interface SetterOptions<R, Mode extends SetterMode> {
  readonly mode?:
    | ([R] extends [AsyncResult.AsyncResult<unknown, unknown>] ? Mode : 'value')
    | undefined;
}

const flattenExit = <A, E>(exit: Exit.Exit<A, E>): A => {
  if (Exit.isSuccess(exit)) return exit.value;
  throw Cause.squash(exit.cause);
};

function setAtom<R, W, Mode extends SetterMode>(
  registry: AtomRegistry.AtomRegistry,
  atom: () => Atom.Writable<R, W>,
  options?: SetterOptions<R, Mode>,
): AtomSetter<R, W, Mode> {
  const memo = createMemo(atom);
  if (options?.mode === 'promise' || options?.mode === 'promiseExit') {
    const mode = options.mode;
    const write = (
      value: W,
    ): Promise<
      | AsyncResult.AsyncResult.Success<R>
      | Exit.Exit<AsyncResult.AsyncResult.Success<R>, AsyncResult.AsyncResult.Failure<R>>
    > => {
      registry.set(memo(), value);
      const promise = Effect.runPromiseExit(
        AtomRegistry.getResult(registry, asAsyncResultAtom(memo()), { suspendOnWaiting: true }),
      );
      if (mode === 'promise') return promise.then(flattenExit);
      return promise;
    };
    return write as AtomSetter<R, W, Mode>;
  }
  const write = (value: W | ((value: R) => W)): void => {
    if (isUpdater<R, W>(value)) {
      registry.set(memo(), value(registry.get(memo())));
      return;
    }
    registry.set(memo(), value);
  };
  return write as AtomSetter<R, W, Mode>;
}

const isUpdater = <R, W>(value: W | ((value: R) => W)): value is (value: R) => W =>
  typeof value === 'function';

/**
 * The promise setter modes are only offered for `AsyncResult` atoms, which the
 * public `mode` option enforces at the call site. The assertion narrows `R` to
 * the `AsyncResult` the caller already proved it is, keeping both result
 * channels — so `AtomRegistry.getResult` yields
 * `Effect<AsyncResult.Success<R>, AsyncResult.Failure<R>>` and the setter's
 * promise types are checked against {@link AtomSetter} rather than widened to
 * `unknown`.
 */
const asAsyncResultAtom = <R>(
  atom: Atom.Atom<R>,
): Atom.Atom<
  AsyncResult.AsyncResult<AsyncResult.AsyncResult.Success<R>, AsyncResult.AsyncResult.Failure<R>>
> =>
  atom as Atom.Atom<
    AsyncResult.AsyncResult<AsyncResult.AsyncResult.Success<R>, AsyncResult.AsyncResult.Failure<R>>
  >;

/**
 * Returns a setter for a writable atom without subscribing to its value.
 */
export const useAtomSet = <R, W, Mode extends SetterMode = never>(
  atom: () => Atom.Writable<R, W>,
  options?: SetterOptions<R, Mode>,
): AtomSetter<R, W, Mode> => {
  const registry = useContext(RegistryContext);
  mountAtom(registry, atom);
  return setAtom(registry, atom, options);
};

/**
 * Mounts an atom and returns a callback that refreshes the current atom.
 */
export const useAtomRefresh = <A>(atom: () => Atom.Atom<A>): (() => void) => {
  const registry = useContext(RegistryContext);
  mountAtom(registry, atom);
  const memo = createMemo(atom);
  return () => registry.refresh(memo());
};

/**
 * Returns a Solid accessor for a writable atom together with a setter for
 * updating it.
 *
 * The setter accepts either a write value or an updater function.
 */
export const useAtom = <R, W, const Mode extends SetterMode = never>(
  atom: () => Atom.Writable<R, W>,
  options?: SetterOptions<R, Mode>,
): readonly [value: Accessor<R>, write: AtomSetter<R, W, Mode>] => {
  const registry = useContext(RegistryContext);
  return [createAtomAccessor(registry, atom), setAtom(registry, atom, options)] as const;
};

/**
 * Subscribes a callback to an atom in the current Solid registry.
 *
 * The subscription runs in the user effect phase, as upstream's
 * `createEffect(() => onCleanup(registry.subscribe(...)))` does. The callback is
 * the caller's own side effect and, under `immediate`, fires as soon as it is
 * attached, so it must not run during the render pass.
 */
export const useAtomSubscribe = <A>(
  atom: () => Atom.Atom<A>,
  f: (_: A) => void,
  options?: { readonly immediate?: boolean },
): void => {
  const registry = useContext(RegistryContext);
  createEffect(atom, (current) => registry.subscribe(current, f, options));
};

const constUnresolvedPromise = new Promise<never>(() => {});

/**
 * Subscribes to an `AsyncResult` atom and returns an accessor that follows
 * Solid 2's async convention: it returns the success value once available,
 * returns a pending promise while the result is initial (or waiting, when
 * `suspendOnWaiting` is set) so the nearest `<Loading>` boundary suspends, and
 * throws the squashed cause on failure so the nearest `<Errored>` boundary
 * catches it.
 */
export const useAtomSuspense = <A, E>(
  atom: () => Atom.Atom<AsyncResult.AsyncResult<A, E>>,
  options?: { readonly suspendOnWaiting?: boolean | undefined },
): Accessor<A> => {
  const result = useAtomValue(atom);
  return createMemo(() => {
    const current = result();
    if (AsyncResult.isInitial(current) || (options?.suspendOnWaiting === true && current.waiting)) {
      return constUnresolvedPromise;
    }
    if (AsyncResult.isSuccess(current)) return current.value;
    throw Cause.squash(current.cause);
  });
};

/**
 * Subscribes to an atom ref and returns its value as a Solid accessor.
 *
 * The hook accepts a thunk for the ref, reads `ref().value`, subscribes with
 * `ref.subscribe`, and releases the subscription through Solid cleanup when
 * the selected ref changes or the owner is disposed.
 */
export const useAtomRef = <A>(ref: () => AtomRef.ReadonlyRef<A>): Accessor<A> => {
  const bridge = createBridge<A>();
  createRenderEffect(ref, (current) => {
    // `AtomRef.subscribe` has no `immediate` option, so the seed is the direct
    // read of `current.value`; it runs synchronously, as `createAtomAccessor`'s
    // `immediate` seed does.
    bridge.publish(current.value);
    return current.subscribe(bridge.publish);
  });
  return bridge.accessor;
};

/**
 * Returns a Solid accessor for a property ref derived from an atom ref.
 *
 * The `prop` argument is captured as a plain value. Recreate the hook call when
 * the property key should change.
 */
export const useAtomRefProp = <A, K extends keyof A>(
  ref: () => AtomRef.AtomRef<A>,
  prop: K,
): Accessor<AtomRef.AtomRef<A[K]>> => createMemo(() => ref().prop(prop));

/**
 * Returns a Solid accessor for the value of a property ref derived from an atom
 * ref.
 *
 * The `prop` argument is captured as a plain value. Recreate the hook call when
 * the property key should change.
 */
export const useAtomRefPropValue = <A, K extends keyof A>(
  ref: () => AtomRef.AtomRef<A>,
  prop: K,
): Accessor<A[K]> => useAtomRef(useAtomRefProp(ref, prop));
