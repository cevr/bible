# effect-atom as the client reactivity layer for the Solid 2 app

Date: 2026-08-14
Question: Is effect-atom the right client reactivity layer for this Solid 2 app, and does it change whether a sync engine is needed?
Verdict: **Skip for now, bridge later. It does not change the sync-engine question — the local-first package already is the sync engine.**

## 1. Where Atom lives now, and what it is

The old `@effect-atom/atom` package was folded into the effect v4 monorepo. It is
now part of the **core `effect` package** under the `unstable` namespace:

- Source (monorepo, currently `4.0.0-rc.109`):
  `~/.cache/repo/effect-ts/effect/packages/effect/src/unstable/reactivity/`
  - `Atom.ts` — readable/writable atoms, `Atom.make`, `Atom.family`, `Atom.map`,
    `Atom.fn` / `Atom.fnSync` (effect functions as atoms), `Atom.pull` (paginated
    pull streams), `Atom.runtime` / `Atom.context` (Layer-provided runtimes),
    `Atom.optimistic` / `optimisticFn`, `Atom.debounce`, `Atom.kvs`
    (storage-persisted atoms), `Atom.searchParam`, `Atom.windowFocusSignal`,
    `toStream` / `toStreamResult`.
  - `AsyncResult.ts` — Initial/Success/Failure result type with `waiting` flag
    (their loading/refreshing state model).
  - `AtomRegistry.ts` — registry with `subscribe` / `mount` / `set` / `refresh`.
  - `Reactivity.ts` — key-based invalidation service: register handlers for
    keys, wrap mutations so success invalidates keys, rerun queries on
    invalidation.
  - `AtomRpc.ts` — `AtomRpc.Tag`: builds a typed client from an `RpcGroup`
    with a **query atom family** (TTL, serialization keys, hydration) and a
    **mutation family** that invalidates `reactivityKeys` on success
    (`AtomRpc.ts:191-242`).
  - `AtomHttpApi.ts`, `AtomRef.ts`, `Hydration.ts`.
- Availability in this repo: the app pins `effect 4.0.0-beta.98`
  (root `package.json` catalog), and the module is present there:
  `node_modules/effect/dist/unstable/reactivity/Atom.js` (+ AsyncResult, AtomRpc,
  AtomRegistry, Reactivity).
- Maturity: it ships inside `effect/unstable/*`, and the monorepo is at
  `4.0.0-rc.109` while the app is on `beta.98`. The API is converging but the
  gap between the pinned beta and the current rc is real churn surface.

## 2. Solid bindings exist — but for Solid 1 only

The monorepo ships three framework bindings under `packages/atom/`:
`react`, `solid`, `vue`.

- `@effect/atom-solid 4.0.0-rc.109`
  (`~/.cache/repo/effect-ts/effect/packages/atom/solid/`), hooks in
  `src/Hooks.ts`: `useAtom`, `useAtomValue`, `useAtomSet`, `useAtomMount`,
  `useAtomRefresh`, `useAtomSubscribe`, `useAtomResource` (AsyncResult →
  `createResource`), `useAtomRef`, `useAtomRefProp(Value)`,
  `useAtomInitialValues`, plus `RegistryContext.ts`.
- **Peer dependency: `solid-js >=1.9.14 <2.0.0`** (`packages/atom/solid/package.json`).
- The hooks import `createComputed` and `createResource` from `solid-js`
  (`Hooks.ts:17`). Neither export exists in the app's Solid build: the app uses
  `solid-js 2.0.0-beta.20` (root `package.json`), and its export list
  (`node_modules/.bun/solid-js@2.0.0-beta.20/node_modules/solid-js/dist/solid.js`)
  has `createSignal/createMemo/createEffect/createRenderEffect/createProjection/createOptimistic/from`
  but **no `createComputed`, no `createResource`, no `createAsync`**.

So the official Solid bindings do not run on this app today. The bridge itself
is small — the core accessor is ~7 lines
(`createSignal` + `registry.subscribe(atom, setValue, {immediate:true})` +
`onCleanup`, `Hooks.ts:69-77`), and a Solid 2 port of the whole 360-line
`Hooks.ts` (swap `createComputed` → `createRenderEffect`/`from`, replace the
`createResource` adapter with Solid 2's promise-throwing convention) is maybe a
day of work. The cost is not writing it; the cost is **owning a fork that tracks
two moving betas** (Solid 2 beta churn + effect `unstable/reactivity` churn,
beta.98 → rc.109 already diverging).

## 3. What the app already has

### Client caches (Solid-2-native, hand-rolled)

- `packages/app/src/cache/synced-cache.ts` (288 lines): per-input entries with
  `createSignal` value/status, an async memo accessor that returns the pending
  promise per Solid 2's async convention, trailing-refresh dedup via `Deferred`,
  and mutation-driven invalidation: `mutate(command)` → `affects(command)`
  scopes → `matches(input, scope)` → refresh matching entries
  (`synced-cache.ts:247-269`). It is deliberately Solid-2-aware (see the comment
  on Solid 2's no-writes-in-owned-scopes rule, `synced-cache.ts:117-121`).
- `packages/app/src/cache/async-cache.ts` (37 lines): read-only degenerate case.
- `packages/app/src/runtime/reading-data.tsx` (315 lines): wires the 24 RPCs of
  `packages/core/src/procedure/group.ts` (`BibleProcedureGroup`,
  `group.ts:211-236`) into 8 async caches + 7 synced caches + data portability.
  Scope plumbing already shares vocabulary with the sync layer via
  `scopeForLibraryCommand` / `scopeForMutation` (`reading-data.tsx:88-102`).

The `affects/matches` design is the same idea as Atom's `Reactivity` keys — but
richer: predicate matching over structured scopes instead of key equality.

### Local-first (the actual sync engine)

`packages/core/src/local-first/` already contains a full client-side sync
engine, not just storage:

- `sync-engine.ts:41-85` — `mutate` journals a decoded `DomainMutationCommand`
  into the store and publishes a `ChangeSet`; `synchronize` pushes pending
  `MutationEnvelope`s, pulls a `RevisionPatch` by `ServerRevision`, applies it,
  and publishes resulting changes.
- `model.ts` — `MutationEnvelope` (clientId, sequence, mutationId,
  schemaVersion), `ChangeSet` with typed `ChangeScope`s, `RevisionPatch`,
  branded `ServerRevision`/`MutationSequence`.
- `sync-store-drizzle.ts` + `schema.ts:270-301` — mutation journal and a
  `tombstones` table with upsert/clear handling.
- `transport.ts` — `push`/`pull` interface; `simulated-transport.ts` and
  `sync-engine.test.ts` exercise the loop.

What is missing is not an engine: it is a production transport implementation
and the wiring of published `ChangeSet`s into the UI caches (the
`v1.runtime.events` stream exists in the procedure group and handlers,
`group.ts:84-88`, `packages/core/src/procedure/handlers.ts`, but no app code
consumes it outside tests yet).

## 4. Assessment

**(a) What Atom would add here.** Registry-scoped state outside the Solid
ownership tree, `AsyncResult` with `waiting` semantics, TTL/hydration/
serialization on query atoms, `Atom.optimistic`, and — the real prize —
`AtomRpc.Tag` generating the entire query/mutation cache layer directly from
`BibleProcedureGroup`, which would replace ~325 lines of `synced-cache.ts` +
most of `reading-data.tsx`. But Solid 2 natively provides fine-grained signals,
promise-throwing async, `createOptimistic`, and `createProjection`; the
hand-rolled cache already uses them correctly and is small, tested
(`synced-cache.test.ts`, 294 lines), and richer in invalidation semantics
(predicate scopes vs. equality keys).

**(b) Bridge shape and cost.** Atom → Solid is
`registry.subscribe → createSignal` under `createRenderEffect`+`onCleanup` (or
`from()`), a trivial mechanism. The real cost is maintaining a Solid 2 fork of
`@effect/atom-solid` against two beta treadmills, plus upgrading `effect` from
beta.98 toward the rc line to stay near the bindings' API.

**(c) Does it change the sync-engine question? No.** Atom is client
reactivity + query caching + invalidation. It has no mutation journal, no
revisions, no tombstones, no conflict/rebase story. The user's suspicion is
correct: `packages/core/src/local-first/` already **is** the sync engine; no
third-party sync engine (and no Atom adoption) is needed for that role. The
remaining sync work is a real transport + subscribing caches to published
`ChangeSet`s / `v1.runtime.events` — work that is identical whether the client
layer is `synced-cache` or Atom.

**(d) Recommendation: skip now, bridge later.**

1. Keep `synced-cache`/`async-cache` as the reactivity layer. It is
   Solid-2-correct today and its scope model is a superset of Atom Reactivity
   keys.
2. Do the sync wiring on the existing engine: implement `SyncTransport` against
   the API, and route `publish`ed `ChangeSet` scopes into cache refresh (the
   scope types already line up).
3. Set a revisit trigger: when `@effect/atom-solid` bumps its peer dep to
   Solid 2 (or Solid 2 goes stable and the bindings follow) **and** the app has
   moved to effect 4.0 rc/stable, reevaluate replacing `reading-data.tsx` with
   `AtomRpc.Tag(BibleProcedureGroup)` — at that point it deletes code instead
   of adding a fork.

## Receipts

- `~/.cache/repo/effect-ts/effect/packages/effect/src/unstable/reactivity/Atom.ts`
- `~/.cache/repo/effect-ts/effect/packages/effect/src/unstable/reactivity/AtomRpc.ts`
- `~/.cache/repo/effect-ts/effect/packages/effect/src/unstable/reactivity/Reactivity.ts`
- `~/.cache/repo/effect-ts/effect/packages/atom/solid/src/Hooks.ts`
- `~/.cache/repo/effect-ts/effect/packages/atom/solid/package.json` (peer dep `solid-js >=1.9.14 <2.0.0`)
- `~/.cache/repo/effect-ts/effect/packages/effect/package.json` (`4.0.0-rc.109`)
- `/Users/cvr/Developer/personal/bible-tools/package.json` (`effect 4.0.0-beta.98`, `solid-js 2.0.0-beta.20`)
- `/Users/cvr/Developer/personal/bible-tools/node_modules/effect/dist/unstable/reactivity/` (Atom present in installed beta.98)
- `/Users/cvr/Developer/personal/bible-tools/node_modules/.bun/solid-js@2.0.0-beta.20/node_modules/solid-js/dist/solid.js` (export list; no `createComputed`/`createResource`)
- `/Users/cvr/Developer/personal/bible-tools/packages/app/src/cache/synced-cache.ts`
- `/Users/cvr/Developer/personal/bible-tools/packages/app/src/cache/async-cache.ts`
- `/Users/cvr/Developer/personal/bible-tools/packages/app/src/runtime/reading-data.tsx`
- `/Users/cvr/Developer/personal/bible-tools/packages/core/src/procedure/group.ts`
- `/Users/cvr/Developer/personal/bible-tools/packages/core/src/local-first/sync-engine.ts`
- `/Users/cvr/Developer/personal/bible-tools/packages/core/src/local-first/model.ts`
- `/Users/cvr/Developer/personal/bible-tools/packages/core/src/local-first/schema.ts` (tombstones)
- `/Users/cvr/Developer/personal/bible-tools/packages/core/src/local-first/sync-store-drizzle.ts`
- `/Users/cvr/Developer/personal/bible-tools/packages/core/src/local-first/transport.ts`
