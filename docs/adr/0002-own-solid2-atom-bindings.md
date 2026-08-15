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
