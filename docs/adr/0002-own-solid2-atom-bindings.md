# Own the Solid 2 bindings for effect Atom, delete them when upstream catches up

The client reactivity layer adopts `effect/unstable/reactivity` (Atom, AsyncResult,
AtomRegistry, Reactivity, AtomRpc) as the query/mutation cache over
`BibleProcedureGroup`. The official bindings, `@effect/atom-solid`, are peer-locked to
`solid-js >=1.9.14 <2.0.0` and import `createComputed`/`createResource`, which Solid 2
removed — they cannot run in this app. We therefore maintain our own bindings package,
ported from the upstream `packages/atom/solid` hooks and adapted to Solid 2 idioms
(`createRenderEffect`/`from`, promise-throwing async instead of the `createResource`
adapter).

The bindings package is a deliberate stopgap with a delete trigger, not a permanent
seam: when `@effect/atom-solid` publishes a version whose peer range accepts Solid 2,
we swap imports to the upstream package and delete ours. The package must therefore
mirror upstream hook names and semantics (`useAtom`, `useAtomValue`, `useAtomSet`,
`useAtomMount`, `useAtomRefresh`, `useAtomSubscribe`, `useAtomRef`, registry context)
so the swap is an import-path change, not a refactor. Divergence from upstream API
shape needs a reason recorded here.

Alternatives rejected: keeping the hand-rolled `synced-cache`/`async-cache` layer
indefinitely (Solid-2-correct and its predicate-scope invalidation is richer than
Atom's key equality, but it re-implements what `AtomRpc.Tag` derives from the RPC group
for free, and the wiki build is about to multiply the number of cached RPC families);
waiting for upstream (unbounded timeline across two beta treadmills); Octane (a
React-model framework replacement, not an integration — rejected outright).

Migration constraint: the existing mutation-scope invalidation semantics
(`affects`/`matches` predicate scopes shared with `local-first` sync) must be preserved
when mapping onto Atom `Reactivity` keys — the mapping derives reactivity keys from the
existing scope vocabulary rather than flattening to per-RPC keys. The local-first sync
engine is untouched by this decision: Atom is client reactivity, not sync.

Evidence base: `docs/wayfinder/wiki-study-layer/research/effect-atom-solid.md`
(2026-08-14), including the upstream peer-dep receipt and the export-list diff proving
the Solid 1 hooks cannot load under Solid 2.

## Recorded divergences from upstream

`useAtomResource` is not ported; `packages/atom-solid` exports `useAtomSuspense`
instead. Upstream returns Solid 1's `ResourceReturn<A, void>` from `createResource`,
an API Solid 2 removed along with `createComputed` and `createAsync`, so no
signature-compatible port exists. The replacement follows Solid 2's async
convention: it returns an `Accessor<A>` that yields a pending promise while the
`AsyncResult` is initial (or waiting, under `suspendOnWaiting`) so the nearest
`<Loading>` boundary suspends, and throws the squashed cause on failure so the
nearest `<Errored>` boundary catches it. Renaming rather than keeping the upstream
name is deliberate: the return type is an accessor, not a resource tuple, so
call sites must change when upstream Solid 2 bindings land, and a name collision
would hide that. Every other hook keeps its upstream name and signature. The other
Solid 2 adaptation is internal and does not change any signature: upstream's
`createComputed(() => onCleanup(subscribe(...)))` becomes a compute/effect pair,
where the compute phase tracks the atom thunk and the effect phase performs the
signal write and returns the unsubscribe as its cleanup.

Three details of that pair are load-bearing. First, the phase differs per hook:
value-carrying hooks (`useAtomValue`, `useAtom`, `useAtomRef`) use
`createRenderEffect` so the subscription is attached before the render pass
reads the accessor, while `useAtomSubscribe` uses the user-phase `createEffect`
exactly as upstream does, so a caller's `immediate` callback never fires during
render.

Second, a signal cannot itself carry the value. Solid 2 **queues** a signal
write until the next flush, so seeding a bridge signal from the subscription
leaves the accessor returning `undefined` to any read taken in the same
synchronous pass — including the component's own first read — even though the
accessor types (`Accessor<A>`) exclude `undefined`. Attaching the subscription
early does not fix this: both phases of the render effect do run synchronously
at creation and the registry's `immediate` seed does call back before
`subscribe` returns, but the _write those callbacks perform_ is what gets
deferred. The final mechanism therefore splits value from notification: each
value-carrying hook keeps a plain mutable cell holding the current value,
written synchronously by the subscription callback, plus an owned signal used
**only** as a reactive notifier whose version is bumped on every update. The
accessor reads the signal — registering the dependency edge — and returns the
cell. `useAtomRef`/`useAtomRefPropValue` use the same bridge, seeding from a
direct `ref.value` read because `AtomRef.subscribe` has no `immediate` option.

Third, the effect phase does **not** by itself satisfy Solid 2's
no-writes-in-owned-scopes rule: the registry's `immediate` subscription calls
back synchronously from inside the effect, so the notifier write lands in an
owned scope and the development build rejects it with
`REACTIVE_WRITE_IN_OWNED_SCOPE`. The notifier signals therefore carry
`ownedWrite: true`. The package test script runs under `--conditions=browser
--conditions=development`, which resolves `solid-js` to `dist/dev.js`, so that
guard and the rest of Solid 2's development checks run in CI instead of being
skipped by the production build.
