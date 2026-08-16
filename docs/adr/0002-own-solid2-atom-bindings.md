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

That layer is now deleted. `synced-cache.ts` (289), its test (293), `async-cache.ts`
(37) and the wiring bulk of `reading-data.tsx` (319) gave way to a key-derivation
module, an `AtomRpc` service, a settled-mutation index, and a hook-per-family surface.
`packages/app/src/cache/index.ts` exports only `ProcedureClient` — the one type a host
needs to hand its finished client to `ApplicationBootstrap`. The rest is how the layer
is built, not how it is used, and neighbours import it directly.

Migration constraint: the existing mutation-scope invalidation semantics
(`affects`/`matches` predicate scopes shared with `local-first` sync) must be preserved
when mapping onto Atom `Reactivity` keys — the mapping derives reactivity keys from the
existing scope vocabulary rather than flattening to per-RPC keys. The local-first sync
engine is untouched by this decision: Atom is client reactivity, not sync.

## The key derivation (checkpoint 2)

`packages/app/src/cache/reactivity-keys.ts` turns the predicate into two key
functions. The vocabulary permits it because every change scope is either
_area-wide_ or _location-specific_, and a cached input names at most one location:

| area                                       | query key set                                           | mutation key set                                                                           |
| ------------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| annotations, input `ReaderLocation`        | `library:annotations`, `library:annotations:<location>` | `library:annotations:<location>` when the scope names one, otherwise `library:annotations` |
| collections / plans / practice, input `{}` | `library:<area>`                                        | `library:<area>`                                                                           |
| reading preferences                        | `reading-preferences`                                   | `reading-preferences`                                                                      |
| reading continuity                         | `reading-continuity`                                    | `reading-continuity`                                                                       |
| writings library                           | `writings-library`                                      | `writings-library`                                                                         |

The location key length-prefixes the three `ReaderLocation` fields, so the encoding
is injective and key equality means exactly what the predicate's field-by-field
comparison meant. Both sides use `Reactivity`'s array key form with keys this module
owns; the record form is not used, because it always emits the bare area key
alongside the composed one and so cannot express a location-scoped invalidation.

The scope type is **core's own `ChangeScope`**, imported rather than restated, plus
the one scope core has no name for (`WritingsLibrary` — downloaded books are
device-local and never sync). That is what makes the "a published `ChangeSet` routes
through the same keys" claim testable instead of merely plausible: core's `NoteScope`
carries a required `noteId` and three _independently optional strings_, not one
optional `ReaderLocation`, so a look-alike union would have been quietly
type-incompatible and could have handed a bare string to `annotationLocationKey`.
`keysForScope` converts a note scope to a `ReaderLocation` only when all three string
fields are present — exactly when core's `changeSetFor` copies them from a `SaveNote`
— and otherwise widens to the area key, which is what a `DeleteNote` needs anyway.

Equivalence is proved, not asserted. `reactivity-keys.test.ts` keeps the retired
`scopeForMutation` and the four `matches` bodies verbatim as an oracle and sweeps the
cross product of all 18 `LibraryMutationCommand` constructors (plus a writings-source
note) against every cached input shape: 114 (command, entry) verdicts, zero
disagreements. Fixture completeness is a type error rather than a remembered chore —
the fixtures are a record keyed by the union's own `_tag`. Three further cases pin the
core-scope route: every command's `changeSetFor(command).scopes` must yield the keys
`keysForLibraryMutation` yields; the two non-library `DomainMutationCommand`s
(`SetReadingPreferences`, `RecordReading`) must reach their own singleton keys; and
each of the four partially-filled `NoteScope` shapes must widen to the area key.

Behaviour changes, all narrowing or removing over-invalidation rather than adding it:

- **Cross-family mutations now reach the right family.** The old layer ran
  `affects`/`matches` inside one cache instance, so a `SaveCollection` issued through
  the annotations cache refreshed nothing. Under one keyspace it refreshes collections.
  No call site did this, so the observable blast radius is zero; it removes a latent
  under-invalidation.
- **The writings library refreshes by key.** `refreshWritingsCatalogAfter` chained a
  catalog refresh onto a successful download by hand. The combined library query
  (`v1.reading.writingsLibrary.get`) covers `writings-library`, and both download
  mutations invalidate it, so the coordination code is gone. This is the app's only
  writings read — the separate `v1.reading.writingsCatalog.get` procedure exists on the
  wire but no component mounts it, so no hook wraps it.
- **Library reads are held for the session, not 400ms.** See the TTL note below.

No scope predicate needed a superset approximation. The one deliberately coarse key
set is data import (`v1.data.import`), which rewrites every area at once and therefore
invalidates all six area keys — that is the operation's real blast radius, not an
approximation of a finer one.

## Two contracts the retired cache had that keys alone do not give

`Reactivity` restores _what_ gets refreshed. Two properties of `synced-cache` were not
about which entries refresh, and both had to be rebuilt on top.

### A mutation promise waits for the reads it staled

`synced-cache.mutate` resolved only after `Effect.all(refreshes)` — one refresh per
_active_ entry the command's scopes matched. Callers depend on it: a component that
awaits a mutation before clearing a busy flag or navigating is promised the reads it
can then see are post-mutation reads.

`Reactivity` offers no wait mechanism to reuse, and the platform's shape makes clear
why: `invalidate` runs each registered handler and returns, and `Atom`'s
`withReactivity` handler is `() => get.refresh(atom)`, which _starts_ a refresh. So a
mutation atom read in `promise` mode settles on the RPC's own result with every
dependent refresh still in flight. The wait is therefore composed at the atom level,
which the platform does support: `AtomRegistry.getResult(registry, atom,
{ suspendOnWaiting: true })` resolves at an atom's next settled, non-waiting result.

`packages/app/src/cache/settled-mutation.ts` joins the two halves. Queries already
declare their reactivity keys, so `keyedQuery` in `reading-data.ts` passes that one
list twice — to `AtomRpc`, which makes the atom _refresh_, and to `trackQuery`, which
makes it _findable_ — and the two cannot drift. "Active" is decided by the registry
itself: an atom holding a live node is exactly the old layer's live cache entry, so an
evicted atom is skipped rather than resurrected (waiting on it would fetch a query
nobody reads — worse than the retired layer). The affected set is read _after_ `mutate`
resolves, which is where the retired cache read its entry map too: it walked `entries`
inside the same `Effect.gen`, after the mutation effect returned. Reading it before
would fix the wait set at mutation-start and miss a query that mounts while the RPC is
in flight — `Reactivity` stales that late reader, but nothing would await it. Reading
it after loses nothing, because `Reactivity.mutation` runs its handlers synchronously
before the mutation's own result resolves and `Atom`'s handler starts the refresh
synchronously, so every affected atom the registry still holds is already `waiting` and
`suspendOnWaiting` blocks on the _next_ result rather than the stale one. A failed
refresh does not fail the mutation — it surfaces through that query's own `<Errored>`
boundary, as the retired layer's per-entry `failed` status did — and a failed mutation
skips the waits entirely, having staled nothing.

The index holds `WeakRef`s, not atoms. `Atom.family` caches its members weakly behind a
`FinalizationRegistry`, so a strong index would out-live the family and pin every atom
the app ever built — unbounded for a per-location key space such as annotations. One
`WeakRef` per atom is memoised in a `WeakMap` so re-registration still dedupes, and the
lookup walk prunes the cleared refs it passes.

`reading-data.test.ts` pins both halves with gated test handlers. One test gates the
collections _refresh_ from its second call on, asserts the mutation RPC has answered
and the refresh has been issued while the mutation promise is still pending, then that
opening the gate resolves it; removing the wait turns it red. A second test gates the
_mutation_ itself, mounts a collections reader while the RPC is in flight, and asserts
the mutation promise still waits for that late reader's refresh; collecting the
affected set before the mutation turns it red.

### Cached entries live for the session, not for 400ms

`synced-cache` entries lived on the Solid owner and were dropped only when the owner
was disposed. `RegistryProvider` defaults `defaultIdleTTL` to 400ms — upstream
`@effect/atom-solid`'s own default, which this package mirrors deliberately, so the
divergence belongs at the call site rather than in the bindings.

The six library-wide reads therefore pass `timeToLive: Infinity`, which is `AtomRpc`'s
spelling of `Atom.keepAlive`: the node is exempt from idle eviction entirely. The old
contract is the default and nothing was found wrong with it. The failure mode a short
TTL causes here is concrete — a route change unmounts a query's last reader, the node
is swept 400ms later, and navigating back re-fetches — and the reads are small,
singleton, and mutation-invalidated, so staleness is not a risk the TTL has to cover;
the reactivity keys already cover it. The intermediate `'10 minutes'` this migration
first wrote is retired: it was neither the old behaviour nor a decision with a reason.

A test pins the policy against the real failure mode: one session registry carrying
the provider's own 400ms default, a route root that reads the query and unmounts, a
real-clock idle wait past the TTL (`it.scopedLive` — the registry sweeps on real
`setTimeout`s, so a `TestClock.adjust` would move Effect's time while the sweep timer
stayed put), then a second route root that must read the entry without re-fetching.
Dropping the `keepAlive` turns that assertion from one fetch into two. That shape runs
once per hook, driven from a six-entry table rather than copied six times — a hook the
table forgets is a hook the policy silently stops covering, which is how continuity
first shipped without its TTL.

## Wiring, and what the bindings needed

`AtomRpc.Service` builds its own RPC client from a protocol layer, but each host
already starts a transport and negotiates the runtime handshake through
`ProcedureHost` before the Solid root mounts. Rather than change the host contract,
the service is given `makeEffect` reading a `ProcedureClientService`, and its
`protocol` is `(get) => Layer.succeed(ProcedureClientService, get(procedureClientAtom))`
— the host's finished client, seeded once per registry by the provider through
`useAtomInitialValues`. Its four type arguments are written out because TypeScript
infers the client-requirement parameter from the protocol layer, which here supplies
a client instead of a transport.

`ProcedureHost` now builds the client flattened (`RpcClient.make(group, { flatten: true })`),
which is the shape `AtomRpc` consumes. That retired `createProcedureClient` and its
`OptionalInputProcedure` table: the wrappers existed only so the old caches could call
argument-less procedures with no payload, and every `AtomRpc` query passes its payload
explicitly.

No addition to `packages/atom-solid` was needed. One binding behaviour is worth
recording because it is load-bearing and easy to get wrong from the outside:
`AtomRegistry.make({ initialValues })` does **not** substitute for the hook.
`setInitialValue` marks the node stale and still runs the atom's read function on the
next build, whereas the hook's `ensureNode(atom).setValue(...)` marks it valid without
reading. An atom that exists only to carry an externally-supplied value must therefore
be seeded through `useAtomInitialValues`.

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
