/**
 * The hooks this repo uses from @effect/atom-solid (MIT), ported to Solid 2.
 * Delete this package when upstream supports Solid 2.
 *
 * Solid hooks for using Effect Atoms from components and computations. The
 * hooks read and write atoms through the current registry (`useRegistry`),
 * mount atoms for cleanup, refresh them, and expose `AsyncResult` atoms as
 * suspending accessors.
 *
 * Solid 2 removed `createComputed`, so every subscription runs as a
 * compute/effect pair: the compute phase tracks the atom thunk, and the effect
 * phase attaches the subscription and returns the unsubscribe as its cleanup.
 * Value-carrying hooks use `createRenderEffect` so the subscription is attached
 * before the render pass reads the accessor.
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
 *
 * Server rendering. An atom is read on the server in one of three ways, by
 * what it is:
 *
 * - A served atom (`Atom.serializable`): the server reads it, waits for its
 *   first answer, and sends it encoded with the page (`ssrSource: 'server'`);
 *   the client's hydration adopts that value into the registry and requests
 *   nothing (`createServedAccessor`).
 * - An atom with a server value (`Atom.withServerValue`): the viewer's own
 *   (a kept setting, the hash). The server and the client's hydration show the
 *   server value; the live one follows (`serverAware`, `ssrSource: 'client'`).
 * - Any other atom is read live on both sides, as it reads with no window.
 */

// This module is a framework binding, not Effect domain code: its vocabulary is
// fixed by the two APIs it joins, so several Effect-domain lint rules do not
// apply here.
//
/* oxlint-disable effect/noAs -- the `mode` option selects the setter's return type at the type level; the implementation sees `mode` only as a runtime value and cannot prove which branch it is in. */
/* oxlint-disable effect/noChainedTypeAssertions -- reaching the registry-private `ensureNode`, exactly as upstream @effect/atom-solid and @effect/atom-react do. */
/* oxlint-disable effect/noThrowStatement -- Solid 2 signals async failure by throwing from a memo, and a rejected promise is produced by throwing; both are the framework's contract. */
/* oxlint-disable effect/noNewPromise -- `useAtomSuspense` must hand Solid a real pending promise, and a served atom's server render waits on one. */
/* oxlint-disable effect/noNullish -- `undefined` is Solid's own uninitialised-signal value and the registry's own optional-option encoding. */
/* oxlint-disable effect/noRuntimeTypeof -- upstream's setter accepts `W | ((value: R) => W)`; only a runtime check separates an updater from a value. */
/* oxlint-disable effect/noKnownValueWidening -- the overload pair on `useAtomValue` is the upstream signature. */
/* oxlint-disable effect/noUnknownParameters -- a served atom's encoded value is its own schema's, opaque to this binding (`Atom.serializable` types it so), and any atom's value may be an `AsyncResult` still reading. */

import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import type * as Exit from 'effect/Exit';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import * as Atom from 'effect/reactivity/Atom';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';
import type * as Schema from 'effect/Schema';
import type { Accessor } from 'solid-js';
import { isServer } from '@solidjs/web';
import { createMemo, createRenderEffect, createSignal, sharedConfig, untrack } from 'solid-js';

import { useRegistry } from './registry-context.js';

/**
 * Seeding a value before the atom is ever read needs the registry's own node,
 * which `AtomRegistry` deliberately keeps off its public interface. Upstream
 * reaches through the same escape hatch in both the React and Solid bindings.
 */
interface RegistryInternals {
  readonly ensureNode: <A>(atom: Atom.Atom<A>) => { readonly setValue: (value: A) => void };
}

const seedInitialValue = <A>(
  registry: AtomRegistry.AtomRegistry,
  atom: Atom.Atom<A>,
  value: A,
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
  const registry = useRegistry();
  if (f === undefined) return createAtomAccessor<A | B>(registry, atom);
  // A served atom is adopted as it is, and projected through `f` here.
  const source = untrack(atom);
  if (Atom.isSerializable(source)) {
    const served = createServedAccessor(registry, atom, source);
    return () => f(served());
  }
  // `Atom.map` makes a new atom without the source's server value, so the
  // server value is projected through `f` here.
  return serverAware(
    registry,
    atom,
    source,
    () => createLiveAccessor<B>(registry, () => Atom.map(atom(), f)),
    f,
  );
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
  // subscription) before returning the accessor, so the empty state is never
  // observable through the public API.
  let current: A | undefined;
  // The first publish is the seed, made before the accessor is returned, so
  // no reader can be stale yet: it fills the cell without a signal write. A
  // server render writes no signal at all: it is one pass that re-renders
  // nothing (Solid's server render is pure, and warns `SERVER_WRITE` on a
  // write), so a later value there only fills the cell, for a later read.
  let seeded = false;
  const [version, setVersion] = createSignal(0, constOwnedWrite);
  return {
    publish: (value) => {
      current = value;
      if (seeded && !isServer) setVersion((n) => n + 1);
      seeded = true;
    },
    accessor: () => {
      version();
      return current as A;
    },
  };
};

function createLiveAccessor<A>(
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

/**
 * The accessor for an atom with a server value (`Atom.withServerValue`): the
 * server value while the server renders and while the client hydrates, so
 * both passes produce the same markup, then the live value.
 *
 * Solid's own hydration contract does the switching: a memo with
 * `ssrSource: 'client'` and a `loadingValue` renders that value on the server
 * and holds it on the client until hydration completes, then computes. The
 * server value is read from the atom the hook was created with.
 *
 * Only those two passes get the memo. A client render that is not hydrating
 * returns the live accessor itself: a memo's value waits for Solid's flush,
 * so behind one a read right after a write would see the old value.
 * `isServer` is Solid's build flag; `sharedConfig.hydrating` is Solid's own
 * flag for a hydration pass, set by `hydrate` and by each boundary that
 * hydrates later.
 *
 * The server never reads the live value (the memo shows the server value
 * there), so it never runs the atom: an atom whose value is the browser's
 * (a viewer's kept setting, the window) is not read where there is none. A
 * render effect stands in for the client's subscription, so both sides make
 * the same owners and Solid's hydration keys stay in step.
 */
const serverAware = <S, A>(
  registry: AtomRegistry.AtomRegistry,
  atom: () => Atom.Atom<unknown>,
  source: Atom.Atom<S>,
  live: () => Accessor<A>,
  project: (value: S) => A,
): Accessor<A> => {
  if (!(Atom.ServerValueTypeId in source)) return live();
  if (!isServer && !sharedConfig.hydrating) return live();
  const loadingValue = project(Atom.getServerValue(source, registry));
  if (isServer) {
    createRenderEffect(atom, noop);
    return createMemo(() => loadingValue, { ssrSource: 'client', loadingValue });
  }
  const read = live();
  return createMemo(() => read(), { ssrSource: 'client', loadingValue });
};

function createAtomAccessor<A>(
  registry: AtomRegistry.AtomRegistry,
  atom: () => Atom.Atom<A>,
): Accessor<A> {
  const source = untrack(atom);
  if (Atom.isSerializable(source)) return createServedAccessor(registry, atom, source);
  return serverAware(registry, atom, source, () => createLiveAccessor(registry, atom), identity);
}

/** What a served atom's carrier holds where no server value came with the page. */
const UNSERVED: unique symbol = Symbol('@bible/atom-solid/unserved');

/** A value the server is still reading: an `AsyncResult` not yet answered, or answered and reading again. */
const isReading = (value: unknown): boolean =>
  AsyncResult.isAsyncResult(value) && (AsyncResult.isInitial(value) || value.waiting);

/** `atom`'s value in `registry` once it is read: what the server renders and sends. */
const settledOn = <A>(registry: AtomRegistry.AtomRegistry, atom: Atom.Atom<A>): Promise<A> =>
  new Promise((done) => {
    let settled = false;
    let stop: (() => void) | undefined;
    const take = (value: A): void => {
      if (settled || isReading(value)) return;
      settled = true;
      stop?.();
      done(value);
    };
    stop = registry.subscribe(atom, take, constImmediate);
    if (settled) stop();
  });

/** `decode`, kept for the last encoded value it was given: one value however often it is read. */
const lastDecoded = <A>(decode: (encoded: unknown) => A): ((encoded: unknown) => A) => {
  let last: { readonly encoded: unknown; readonly value: A } | undefined;
  return (encoded) => {
    if (last === undefined || last.encoded !== encoded) last = { encoded, value: decode(encoded) };
    return last.value;
  };
};

const noop = (): void => {};

/**
 * The accessor for an atom the server reads and sends with the page
 * (`Atom.serializable`): its data is read once, by the server, and the
 * client adopts it.
 *
 * On the server, a memo (`ssrSource: 'server'`) holds the atom's value once
 * it is read (an `AsyncResult` past its first read), encoded by the atom's
 * own schema. Solid waits for it where it is read and serializes it into the
 * page's stream under the memo's hydration key. The accessor decodes it.
 *
 * In the client, the same memo is created at the same place. While the page
 * hydrates, Solid hands it the value the server sent, and its own compute,
 * which Solid traces once, reads nothing: no request goes out. That value
 * seeds the registry's node for the atom before the hook subscribes, so the
 * node starts valid and its effect never runs for it; the subscription then
 * carries every later value (a refresh, a write) as a plain atom's does. A
 * client render with no server value (no hydration, or a part the server
 * left to the client) holds no value in the memo, and the hook subscribes
 * at once and reads as a plain atom does.
 *
 * Both sides create the same memo and the same render effect, so Solid's
 * hydration keys of every later sibling stay in step.
 */
function createServedAccessor<A>(
  registry: AtomRegistry.AtomRegistry,
  atom: () => Atom.Atom<A>,
  source: Atom.Atom<A> & Atom.Serializable<Schema.ConstraintCodec<A, unknown>>,
): Accessor<A> {
  const codec = source[Atom.SerializableTypeId];
  const decoded = lastDecoded<A>(codec.decode);
  if (isServer) {
    const carrier = createMemo(
      () => settledOn(registry, atom()).then((value): unknown => codec.encode(value)),
      { ssrSource: 'server' },
    );
    createRenderEffect(atom, noop);
    // A value already read renders at once (it is sent all the same); one
    // still being read holds the render where it is read.
    return () => {
      const now = registry.get(untrack(atom));
      if (isReading(now)) return decoded(carrier());
      return now;
    };
  }
  const bridge = createBridge<A>();
  let adopting = true;
  let live = false;
  const carrier = createMemo((): unknown => UNSERVED, { ssrSource: 'server' });
  createRenderEffect(
    () => [atom(), carrier()] as const,
    ([current, served]) => {
      if (adopting && served !== UNSERVED) seedInitialValue(registry, current, decoded(served));
      adopting = false;
      const stop = registry.subscribe(current, bridge.publish, constImmediate);
      live = true;
      return stop;
    },
  );
  // Until the subscription is attached (the server's value is still on its
  // way), the reader waits on the memo, as the server's render did.
  return () => {
    if (live) return bridge.accessor();
    return decoded(carrier());
  };
}

const identity = <A>(value: A): A => value;

/**
 * Keep `atom` mounted for the calling computation's life. On the server an
 * atom with a server value (`Atom.withServerValue`, the viewer's own) is
 * not mounted, as it is never read there: mounting it would run it. The
 * render effect is made all the same, so both sides make the same owners.
 */
function mountAtom<A>(registry: AtomRegistry.AtomRegistry, atom: () => Atom.Atom<A>): void {
  createRenderEffect(atom, (current) => {
    if (isServer && Atom.ServerValueTypeId in current) return undefined;
    return registry.mount(current);
  });
}

/**
 * Mounts an atom in the current Solid registry for the lifetime of the current
 * Solid computation.
 *
 * The hook uses the current registry (`useRegistry`), mounts inside a Solid
 * computation, and releases the mount through Solid cleanup when the
 * computation changes or the owner is disposed.
 */
export const useAtomMount = <A>(atom: () => Atom.Atom<A>): void => {
  const registry = useRegistry();
  mountAtom(registry, atom);
};

/**
 * The write callback returned by {@link useAtomSet}. For an `AsyncResult`
 * atom, the `promiseExit` mode returns a promise of the write's full `Exit`.
 */
type AtomSetter<R, W, Mode extends SetterMode> = 'promiseExit' extends Mode
  ? (
      value: W,
    ) => Promise<Exit.Exit<AsyncResult.AsyncResult.Success<R>, AsyncResult.AsyncResult.Failure<R>>>
  : (value: W | ((value: R) => W)) => void;

type SetterMode = 'value' | 'promiseExit';

interface SetterOptions<R, Mode extends SetterMode> {
  readonly mode?:
    | ([R] extends [AsyncResult.AsyncResult<unknown, unknown>] ? Mode : 'value')
    | undefined;
}

/**
 * The current atom, read untracked: a setter or a refresh is a command, so a
 * call from an effect callback or a handler tracks nothing (Solid's
 * development build warns `STRICT_READ_UNTRACKED` on a tracked read there).
 */
const untrackedMemo = <A>(atom: () => A): (() => A) => {
  const memo = createMemo(atom);
  return () => untrack(memo);
};

function setAtom<R, W, Mode extends SetterMode>(
  registry: AtomRegistry.AtomRegistry,
  atom: () => Atom.Writable<R, W>,
  options?: SetterOptions<R, Mode>,
): AtomSetter<R, W, Mode> {
  const memo = untrackedMemo(atom);
  if (options?.mode === 'promiseExit') {
    const write = (
      value: W,
    ): Promise<
      Exit.Exit<AsyncResult.AsyncResult.Success<R>, AsyncResult.AsyncResult.Failure<R>>
    > => {
      registry.set(memo(), value);
      return Effect.runPromiseExit(
        AtomRegistry.getResult(registry, asAsyncResultAtom(memo()), { suspendOnWaiting: true }),
      );
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
 * The `promiseExit` mode is only offered for `AsyncResult` atoms, which the
 * public `mode` option enforces at the call site. The assertion narrows `R` to
 * the `AsyncResult` the caller already proved it is, keeping both result
 * channels — so `AtomRegistry.getResult` yields
 * `Effect<AsyncResult.Success<R>, AsyncResult.Failure<R>>` and the setter's
 * promise type is checked against {@link AtomSetter} rather than widened to
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
  const registry = useRegistry();
  mountAtom(registry, atom);
  return setAtom(registry, atom, options);
};

/**
 * Mounts an atom and returns a callback that refreshes the current atom.
 */
export const useAtomRefresh = <A>(atom: () => Atom.Atom<A>): (() => void) => {
  const registry = useRegistry();
  mountAtom(registry, atom);
  const memo = untrackedMemo(atom);
  return () => registry.refresh(memo());
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
