# Own the Solid 2 bindings for effect Atom, delete them when upstream catches up

The repo reads and writes `effect/reactivity` atoms from Solid 2 components: the film
lab and egw-search keep their URL places (`@bible/url-state/atom`), settings and served
data in atoms. The official bindings, `@effect/atom-solid`, are peer-locked to
`solid-js >=1.9.14 <2.0.0` and import `createComputed`/`createResource`, which Solid 2
removed, so they cannot run here. We therefore maintain our own bindings,
`packages/atom-solid`, ported from the upstream `packages/atom/solid` hooks and adapted
to Solid 2 idioms (`createRenderEffect`, promise-throwing async instead of the
`createResource` adapter).

The package is a deliberate stopgap with a delete trigger, not a permanent seam: when
`@effect/atom-solid` publishes a version whose peer range accepts Solid 2, we swap
imports to the upstream package and delete ours. So the package keeps upstream's hook
names and semantics wherever it can, and **every divergence from upstream is recorded
below with its reason**. Changing a divergence, or adding one, edits this record in the
same commit.

The decision began as the client cache of a reading app (`packages/app`, deleted in
`a639e74d1`); it stands for the two apps that use the bindings now. Evidence base for
the original choice: `docs/wayfinder/wiki-study-layer/research/effect-atom-solid.md`
(2026-08-14), including the upstream peer-dependency receipt and the export-list diff
showing the Solid 1 hooks cannot load under Solid 2.

## What the package exports

`RegistryProvider`, `useRegistry`, `useAtomValue`, `useAtomSet`, `useAtomMount`,
`useAtomRefresh`, `useAtomSuspense`, and `promiseExit` (the `useAtomSet` mode). Each
hook takes the atom as a thunk, so a thunk that selects another atom moves the
subscription or mount to it.

## Recorded divergences from upstream

- **`useAtomResource` is `useAtomSuspense`.** Upstream returns Solid 1's
  `ResourceReturn<A, void>` from `createResource`, an API Solid 2 removed along with
  `createComputed` and `createAsync`, so no signature-compatible port exists. The
  replacement follows Solid 2's async convention: an `Accessor<A>` that yields a
  pending promise while the `AsyncResult` is initial, so the nearest `<Loading>`
  boundary suspends, and throws the squashed cause on failure to the nearest
  `<Errored>`. The name differs on purpose: the return type is an accessor, not a
  resource tuple, so call sites must change when upstream's Solid 2 bindings land, and
  a name collision would hide that. It has no `suspendOnWaiting` option; a refresh of a
  settled result does not suspend.
- **`useAtom`, `useAtomSubscribe`, `useAtomRef` and `useAtomRefPropValue` are not
  ported.** No product caller needs them; a component that wants both halves calls
  `useAtomValue` and `useAtomSet`. Add one back, upstream-shaped, with its first
  caller.
- **`useAtomValue` takes the atom alone.** Upstream's mapped overload
  `useAtomValue(atom, f)` is dropped; a value derived from the atom is a function at
  the call site (`() => f(value())`). The registry compares a node's new value with
  `atom.equals` before it notifies, so the derived read loses no dedupe.
- **`useAtomSet`'s setter takes a value, not an updater function.** No caller passed
  one.
- **There is no registry without a provider.** Upstream's context holds a default
  registry. Here a hook outside a `RegistryProvider` throws, in the browser as on the
  server: a server module is loaded once and renders every request, so a registry of
  its own would carry one request's atoms (its URL, its reader's state) into the next,
  and a browser hook outside the provider would read a second registry beside the
  page's, whose URL layer would build a second `UrlState`. The browser half is pinned
  by `hooks.test.ts`, the server half by `test/ssr/server.test.ts`.
- **`RegistryProvider` takes `initialValues` and children only.** The scheduler and
  timeout options upstream forwards are dropped (nothing passed them), and the idle
  time of an unread atom is a fixed 400 ms, upstream's default.

## Additions upstream does not have

- **Served atoms** (`Atom.serializable`): the server reads the atom, waits for its
  first answer and sends it encoded with the page; the client's hydration adopts it
  into the registry and requests nothing (`createServedAccessor`). The adopted value
  is seeded through the registry's own node (`ensureNode(atom).setValue`), the escape
  hatch upstream's React and Solid bindings also use.
- **Server values** (`Atom.withServerValue`): the viewer's own value (a kept setting,
  the URL's hash). The server render and the client's hydration pass show the server
  value, so their markup matches, and the live value follows. The server never runs
  the atom.
- **`initialValues` seeds the root.** `AtomRegistry.make({ initialValues })` marks the
  seeded node to keep its value when it builds (`preserveInitialValueOnBuild`, effect
  4.0.0 `AtomRegistry.ts`), so the provider's `initialValues` is how each page root
  seeds `UrlAtom.layer` with its host's `Location`; `UrlAtom.layer` has no default.

## Solid 2 adaptation, and why it is shaped this way

Solid 2 removed `createComputed`, so every subscription runs as a compute/effect pair:
the compute phase tracks the atom thunk, and the effect phase attaches the subscription
and returns the unsubscribe as its cleanup. Value-carrying hooks use
`createRenderEffect` so the subscription is attached before the render pass reads the
accessor. Three details are load-bearing:

1. **A signal cannot itself carry the value.** Solid 2 queues a signal write until the
   next flush, so seeding a signal from the subscription leaves the accessor returning
   `undefined` to any read in the same synchronous pass, including the component's own
   first read. Each value-carrying hook therefore splits value from notification: a
   plain mutable cell holds the current value, written synchronously by the
   subscription callback (the registry's `immediate` seed calls back before
   `subscribe` returns), and an owned signal carries only a version, bumped on every
   later update. The accessor reads the signal, registering the dependency, and
   returns the cell.
2. **The notifier signals declare `ownedWrite: true`.** The `immediate` subscription
   calls back synchronously from inside the effect, an owned scope, which Solid 2's
   development build rejects (`REACTIVE_WRITE_IN_OWNED_SCOPE`) unless the write is
   declared intentional.
3. **The tests run Solid's development build.** The package test script uses
   `--conditions=browser --conditions=development`, which resolves `solid-js` to its
   development build, so that guard and Solid 2's other development checks run in the
   gate instead of being skipped by the production build.

A render that is hydrating reads an atom with a server value through a memo, which
shows a write after Solid's next flush; outside hydration a write through the registry
is readable at once.
