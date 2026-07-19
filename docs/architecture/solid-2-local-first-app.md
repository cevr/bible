# Solid 2 local-first application architecture

Status: accepted implementation brief

Date: 2026-07-18
Scope: Solid 2 migration, shared web/desktop app, Effect async cache, SQLite persistence, local-first sync, React and CLI TUI removal, and reading-first UI refinement

## Purpose

This document is the durable reference for the migration. It records the decisions made before implementation, the contracts that must survive the migration, the intended package boundaries, and the external source repositories to consult when details are uncertain.

The target is one aesthetic, minimal reading application implemented once in Solid 2 and hosted by web and Electron adapters. Both platforms use the same domain workflows, routes, cache API, database schema, sync protocol, and UI. Platform packages contain only entry points and capability implementations.

## Goals

- Migrate every interactive application surface to Solid 2 beta.
- Replace the React web app rather than maintaining React compatibility.
- Remove the CLI TUI completely, including routes, services, tests, and dependencies used only by it.
- Build one shared `@bible/app` for web and desktop.
- Keep platform quirks behind capability and transport adapters.
- Use SQLite locally on both platforms with one Drizzle schema and migration history.
- Run the database and sync runtime in Effect beside SQLite, outside the renderer thread.
- Expose one owner-aware cache surface for queries and mutations.
- Implement a durable, testable local-first sync protocol with a simulated transport.
- Preserve all current application features through progressive disclosure around a reading-first surface.
- Finish with `$ui` and `$impeccable` audit, correction, accessibility, responsive, browser, and Electron QA passes.

## Non-goals for this wave

- Production authentication or account design.
- A hosted sync service or its deployment.
- Collaborative rich-text editing or CRDT text merging.
- Synchronizing Bible, EGW, commentary, Strong's, or topics corpora through the mutation protocol.
- Maintaining compatibility aliases for the old React cache, desktop IPC cache, Solid 1 resources, or TUI.
- Building a general-purpose component framework or ORM.

## Architectural principles

1. SQLite is the sole local source of truth. Solid state is a projection, never a second database.
2. The sync engine owns durable mutation and replication semantics. The async cache owns query identity and presentation readiness.
3. A mutation becomes visible only after its SQLite data change and journal append commit atomically.
4. Notifications describe committed changes. They never substitute for the transaction that produced them.
5. Shared application code depends on capabilities, never Electron, worker, Node, or browser implementations.
6. Platform behavior is capability-based. Avoid broad `platform === ...` branches in shared workflows.
7. Public inputs are single named structural values. Tagged commands express mutation variants.
8. There is one canonical API. Migration adapters do not become permanent parallel APIs.
9. Accessibility behavior is part of primitive correctness, not a polish phase.
10. The reading surface is primary; tools appear in context and on demand.

## Target module graph

```text
packages/core
  domain schemas and errors
  Drizzle schema and migrations
  Effect-native Drizzle SQLite bridge
  repositories and workflows
  SyncEngine and durable sync model
  shared typed procedure protocol

packages/app
  one Solid 2 application
  shared route tree
  createAsyncCache / createSyncedCache
  domain cache instances
  app state and providers
  local Solid 2 UI primitives
  reading-first design system
  platform capability interfaces

apps/web
  browser entry and history adapter
  Worker procedure transport
  Effect + Drizzle + SyncEngine worker runtime
  wa-sqlite + OPFS driver
  web-only server and headers

apps/desktop
  Electron renderer entry and history adapter
  Electron IPC procedure transport
  Effect + Drizzle + SyncEngine main-process runtime
  better-sqlite3 driver
  preload and native capabilities

packages/cli
  non-interactive CLI commands only

packages/web
  existing independent Sure Word static site
```

Allowed dependency direction:

```text
apps/web --------> packages/app --------> packages/core
apps/desktop ----> packages/app --------> packages/core
packages/cli ---------------------------> packages/core
```

`packages/app` must not import from either app. `packages/core` must not import Solid, Electron, or browser-worker modules.

## Platform and runtime boundary

The renderer hosts Solid. The platform runtime is colocated with SQLite:

- Web: Effect, Drizzle, and `SyncEngine` run in the database worker beside wa-sqlite/OPFS.
- Desktop: the same shared runtime modules run in Electron main beside better-sqlite3.
- A shared typed procedure protocol crosses Worker messaging or Electron IPC.
- Only results, failures, progress, sync status, and committed `ChangeSet` notifications cross into the renderer.
- The shared app supplies canonical routes. Web uses browser history; Electron uses hash history.
- External links, file import/export, native window controls, notifications, and other unequal powers are optional typed capabilities.

The shared app should ask whether a capability exists rather than infer it from a platform name. A platform discriminator is appropriate only for presentation that is intrinsically platform-specific.

## Database architecture

### Shared logical database

Both platforms use the same Drizzle schema and migrations for user-owned state:

- reading position and history
- preferences and reader settings
- bookmarks
- verse and EGW notes
- highlights and markers
- user cross-references
- collections and collection membership
- reading plans and progress
- memory verses and practice history
- sync metadata, clients, mutations, revisions, and tombstones

Bible and EGW corpora remain separately versioned, downloadable databases. They are not written into the user-state mutation journal.

### Drizzle and Effect

Use Drizzle `1.0.0-beta.x` for schema, migrations, relational queries, and typed SQL. The beta contains Effect schema generation and an Effect-native PostgreSQL adapter, but not an equivalent Effect-native SQLite query adapter.

Create a narrow first-party bridge in `@bible/core` that adapts Drizzle SQLite operations into Effect with typed errors and transaction scoping. It should provide only the operations the application needs, such as `run`, `all`, `get`, and `transaction`; it must not grow into a second ORM.

Platform implementations:

- Desktop: Drizzle SQLite over better-sqlite3.
- Web: Drizzle async SQLite proxy over the existing wa-sqlite worker connection.
- Tests: an isolated in-memory SQLite implementation using the same schema and repositories.

Do not use `@effect/sql-drizzle@0.51.0` in this migration. Its published peer range targets Effect 3 and Drizzle `<0.50`, which is incompatible with Effect 4 and Drizzle 1 beta. Its source remains useful as an adapter-design reference.

## Async cache

### Ownership split

Effect owns:

- structural key equality and hashing
- lookup deduplication
- retained successful results
- Effect failures and interruption
- explicit refresh of a lookup

Solid owns:

- stable owner-scoped accessors
- async reading and `<Loading>` / `<Errored>` integration
- status accessors
- one active plus one trailing refresh per key
- disposal of all work owned by the cache instance

The cache has owner lifetime. It has no TTL, automatic eviction, public delete, or serialized JSON keys.

### Canonical domain surface

Each domain exposes one cache-backed surface:

```ts
const verseNotes = createSyncedCache({
  lookup: ({ book, chapter, verse }) => /* Effect query */,
  mutate: (command) => /* Effect domain mutation */,
  affects: (command) => /* typed structural query scopes */,
})

verseNotes.get({ book, chapter, verse })
verseNotes.status({ book, chapter, verse })
verseNotes.refresh({ book, chapter, verse })
verseNotes.mutate({
  _tag: "Save",
  book,
  chapter,
  verse,
  content,
})
```

Rules:

- `.get(input)` returns a stable Solid accessor.
- `.status(input)` returns `loading`, `ready`, `refreshing`, or `failed` with its typed/normalized error.
- `.refresh(input)` returns a Promise that rejects when the refreshed lookup fails.
- Initial failure throws `IpcCacheError` through the accessor and reaches Solid `<Errored>`.
- Refresh failure preserves the last successful value while status becomes `failed`.
- Repeated refreshes allow one in-flight operation and at most one queued trailing refresh.
- Input changes do not interrupt the old key's lookup; that result may complete and warm the cache.
- Owner disposal interrupts all remaining in-flight work.
- `.mutate(command)` is the only public domain write path. It is not a direct cache-value setter.

## Mutation and sync model

### Local mutation transaction

`domain.mutate(command)` delegates internally to `SyncEngine`:

1. Decode and validate the tagged command.
2. Begin one SQLite transaction.
3. Allocate the next device-local mutation sequence.
4. Apply the domain mutation to materialized local tables.
5. Append the immutable mutation envelope to the durable journal.
6. Commit both changes atomically.
7. Publish the resulting typed `ChangeSet`.
8. Refresh affected cache entries from SQLite.

No optimistic cache-only value exists. The immediately visible local result is optimistic because SQLite is updated before server acknowledgement, not because the renderer invents separate state.

### Mutation envelope

The durable protocol should carry at least:

```ts
interface MutationEnvelope {
  readonly clientId: ClientId;
  readonly sequence: MutationSequence;
  readonly mutationId: MutationId;
  readonly schemaVersion: SchemaVersion;
  readonly command: DomainMutationCommand;
  readonly createdAt: Timestamp;
}
```

The exact encoded schema must use Effect Schema and branded domain values. Mutation identity is stable across retries. Ordering is by client sequence, never wall-clock time.

### Pull and replay

- The future authority assigns a monotonic global revision to accepted mutations.
- Clients pull patches after their last applied revision.
- A pull is applied only if its expected base revision still matches.
- Patch application and cursor advancement occur in one SQLite transaction.
- Pending local mutations are replayed over the new server snapshot in original client order.
- Cache notifications are emitted only after the rebased state commits.
- Retry scheduling belongs to the scoped Effect runtime and is interrupted during shutdown.

### Conflict semantics

- The server's accepted mutation order is authoritative.
- Set-like operations use stable IDs and idempotent add/remove semantics.
- Scalar state and whole-note edits use deterministic last accepted mutation wins.
- Deletes create tombstones and are not physically removed until every relevant client has advanced past their revision.
- No CRDT text merge is required without a collaborative editing requirement.

### This wave's transport

Implement a deterministic simulated transport and protocol-level tests. It must cover offline writes, retry, duplicate delivery, out-of-order responses, stale pulls, replay, deletion, restart recovery, and convergence between two clients.

A production server, account identity, authentication, authorization, retention policy, and deployment are later vertical slices. The local protocol must not assume their implementation details.

## ChangeSets and cache refresh

A committed mutation returns typed structural scopes rather than raw SQL tables or serialized cache keys. Example scopes might include a verse location, chapter markers, collection identity, reading plan identity, or global preferences.

The sync runtime publishes `ChangeSet` only after commit. `@bible/app` matches active cache entries by structural scope and calls their canonical `.refresh(input)` path. The sync engine does not import Solid and the cache does not inspect the mutation journal.

Initial implementation should prefer explicit domain scope mapping over SQL parsing or broad “refresh everything” invalidation.

## Shared routing and application composition

`@bible/app` owns one canonical route tree for:

- Bible reading and verse study
- EGW library and chapter reading
- search
- topics
- reading plans
- memory practice
- settings and import/export

Web uses browser history and preserves normal deep links. Desktop uses hash history and preserves back/forward navigation and restorable route state. Route parameters are canonical cache inputs on both platforms.

The stronger desktop reading experience and the broader web route/feature set are merged rather than choosing one application's current structure wholesale.

## Solid 2 migration rules

- Use the Solid `next` migration guide as source of truth.
- Replace `createResource` with async accessors/computations and Solid 2 `<Loading>` / `<Errored>` boundaries.
- Use `isPending` for input-driven pending state. Explicit refresh status remains available through the cache API because a bare Solid `refresh()` is intentionally quiet.
- Use `latest`/retained cache values for stale-while-refresh rendering.
- Import renderer APIs from `@solidjs/web` as required by Solid 2.
- Do not add Solid 1 compatibility packages.
- Use `@solidjs/router@next` with one shared route definition and platform history adapters.

## Local Solid UI primitives

Migrate only the behaviors currently consumed from Base UI and other React-only libraries:

- button and input
- dialog and focus management
- popover
- context menu and composite keyboard navigation
- tabs
- scroll area
- command palette
- resizable split panes
- framework-neutral Lucide icon data/rendering

These are Solid 2 rewrites, not React compatibility wrappers. Base UI is a behavior and accessibility reference. If source is copied rather than independently reimplemented, retain the required license and attribution.

Every primitive must define and test:

- controlled and uncontrolled state, where both are needed
- stable IDs and ARIA relationships
- keyboard navigation and typeahead where applicable
- focus entry, trapping, restoration, and nested overlay behavior
- escape and outside-press dismissal
- pointer and touch behavior
- portals and ownership cleanup
- reduced-motion behavior
- SSR/hydration-safe DOM access

## Product and visual direction

The app is a quiet, typography-led reading surface. “Minimal” means progressive disclosure, not feature deletion.

- Scripture or EGW text is the dominant visual element.
- Navigation and study tools remain close but visually recessive until invoked.
- Avoid persistent dashboard, card-grid, and heavy sidebar aesthetics.
- Preserve light, sepia, and dark reading modes.
- Establish a deliberate serif/sans type system, restrained warm palette, readable measure, and consistent vertical rhythm.
- Use motion to preserve spatial continuity and explain state change; do not add decorative motion.
- All interactions must remain keyboard accessible, touch tolerant, responsive, and usable at reader-selected type sizes.

After functional migration, run `$ui` and `$impeccable` audits, record exact findings with file/line receipts, fix them, and verify representative routes in browser and Electron at narrow and wide widths, all themes, keyboard-only interaction, and reduced motion.

## Removal scope

### CLI TUI

Delete the TUI implementation, reader routes/services, TUI-only tests, and OpenTUI/Solid dependencies from `@bible/cli`. Bare `bible` renders help. Non-interactive data, study, sync, and export commands remain.

### React

Delete React, React DOM, React Router, Base UI React, cmdk, lucide-react, react-resizable-panels, React cache/provider adapters, and React-specific tests/configuration after all callers use `@bible/app`. Do not retain direct-call cache aliases.

## Implementation sequence and gates

This is high-blast-radius work and should land as reviewable conventional subcommits. Each unit must typecheck and pass its focused tests before the next begins.

1. `refactor(cli): remove interactive tui`
   - Remove the TUI and make the root command show help.
   - Gate CLI typecheck and tests.
2. `feat(core): add local-first sqlite runtime`
   - Add Drizzle schema/migrations, Effect bridge, sync model, simulated transport, and protocol tests.
   - Gate core typecheck, lint, unit tests, migration tests, and convergence tests.
3. `feat(app): add solid async and synced cache`
   - Create `@bible/app`, prove the cache and procedure boundary with one or two domains, and add cache lifecycle/error/refresh tests.
   - Gate package typecheck and focused tests.
4. `refactor(app): unify web and desktop on solid 2`
   - Migrate shared routes/UI, platform entries, remaining cache callers, and runtime adapters; remove React and legacy desktop cache code.
   - Delegate repetitive caller migration only after the first examples establish exact rules and gates.
   - Gate web and desktop typecheck/tests/builds between batches.
5. `style(app): refine reading experience`
   - Complete Base UI behavior migrations, `$ui` and `$impeccable` fixes, responsive/accessibility work, visual QA, and dead-code cleanup.
   - Run the full repository gate and browser/Electron smoke paths.

Commit boundaries may move slightly to preserve a green tree, but must not introduce parallel public APIs or mix unrelated user files into the commits.

## Acceptance criteria

- No React or CLI TUI runtime remains.
- Web and desktop render the same `@bible/app` route tree on Solid 2.
- Both platforms use the same Drizzle schema, migrations, repositories, sync engine, procedure definitions, and cache API.
- Database/sync work is outside the renderer and platform transport is replaceable.
- Cache keys use structural equality and owner disposal interrupts owned work.
- Refresh errors preserve stale values and reject the refresh Promise.
- Mutations atomically update data and journal before cache refresh.
- Simulated clients converge after offline, duplicate, retry, stale-pull, replay, and delete scenarios.
- Existing features remain available through the reading-first interface.
- Dialogs, menus, tabs, command palette, and panes pass keyboard/focus expectations.
- Web and desktop builds, typecheck, lint, unit tests, and relevant end-to-end smoke tests pass.
- `$ui` and `$impeccable` findings are fixed or explicitly documented with evidence.

## `$repo` reference index

Refresh a GitHub source with `okra repo fetch --json owner/repo[@ref]`; use `okra repo path owner/repo[@ref]` for a network-free lookup. Commit hashes below record the research snapshot, not dependency pins unless explicitly stated.

### Solid 2

- Spec: `solidjs/solid@next`
- Research snapshot: `ec432b40f83507054e19eb9a925aef7b10a80c64`
- Cache: `/Users/cvr/.cache/repo/solidjs/solid`
- Use for: migration semantics, async computation behavior, `Loading`, `Errored`, `isPending`, `latest`, `resolve`, `refresh`, ownership, and disposal.
- Key receipts:
  - `/Users/cvr/.cache/repo/solidjs/solid/documentation/solid-2.0/MIGRATION.md:285`
  - `/Users/cvr/.cache/repo/solidjs/solid/documentation/solid-2.0/MIGRATION.md:301`
  - `/Users/cvr/.cache/repo/solidjs/solid/documentation/solid-2.0/MIGRATION.md:323`
  - `/Users/cvr/.cache/repo/solidjs/solid/documentation/solid-2.0/MIGRATION.md:350`
  - `/Users/cvr/.cache/repo/solidjs/solid/documentation/solid-2.0/06-actions-optimistic.md:81`
  - `/Users/cvr/.cache/repo/solidjs/solid/packages/solid-signals/src/core/async.ts:138`

### Solid Router

- Spec: `solidjs/solid-router@next`
- Research snapshot: `5e891b3305e592a3373ca347869c57619a91a89a`
- Cache: `/Users/cvr/.cache/repo/solidjs/solid-router`
- Use for: Solid 2-compatible route definitions and web/desktop history adapters.

### Effect

- Spec: `effect-ts/effect`
- Research snapshot: `ce95d88603e9facbcd6c462c5444e391792dde6b`
- Cache: `/Users/cvr/.cache/repo/effect-ts/effect`
- Use for: `Cache`, structural hashing/equality, `ManagedRuntime`, scopes, interruption, services, layers, schedules, schemas, SQL drivers, and tests.
- Key receipts:
  - `/Users/cvr/.cache/repo/effect-ts/effect/packages/effect/src/Cache.ts:103`
  - `/Users/cvr/.cache/repo/effect-ts/effect/packages/effect/src/Cache.ts:177`
  - `/Users/cvr/.cache/repo/effect-ts/effect/packages/effect/src/Cache.ts:398`
  - `/Users/cvr/.cache/repo/effect-ts/effect/packages/effect/src/Cache.ts:1071`
  - `/Users/cvr/.cache/repo/effect-ts/effect/packages/effect/src/ManagedRuntime.ts:273`

### Drizzle ORM beta

- Specs: `drizzle-team/drizzle-orm` and `npm:drizzle-orm@1.0.0-beta.22`
- Git research snapshot: `9d6453215d18705986c2081124437bb6a03fb943`
- Caches:
  - `/Users/cvr/.cache/repo/drizzle-team/drizzle-orm`
  - `/Users/cvr/.cache/repo/npm/drizzle-orm/1.0.0-beta.22`
- Use for: shared SQLite schema, migrations, async SQLite proxy contracts, Effect schema generation, and Effect adapter patterns.
- Key receipts:
  - `/Users/cvr/.cache/repo/npm/drizzle-orm/1.0.0-beta.22/drizzle-orm/src/effect-schema/README.md:1`
  - `/Users/cvr/.cache/repo/npm/drizzle-orm/1.0.0-beta.22/drizzle-orm/src/effect-schema/README.md:13`
  - `/Users/cvr/.cache/repo/npm/drizzle-orm/1.0.0-beta.22/drizzle-orm/src/effect-postgres/index.ts:1`
  - `/Users/cvr/.cache/repo/npm/drizzle-orm/1.0.0-beta.22/drizzle-orm/src/cache/core/cache-effect.ts:27`

### Effect SQL Drizzle adapter

- Spec: `npm:@effect/sql-drizzle@0.51.0`
- Cache: `/Users/cvr/.cache/repo/npm/@effect/sql-drizzle/0.51.0`
- Use for: SQLite adapter structure only; do not install in the target stack.
- Key receipts:
  - `/Users/cvr/.cache/repo/npm/@effect/sql-drizzle/0.51.0/README.md:1`
  - `/Users/cvr/.cache/repo/npm/@effect/sql-drizzle/0.51.0/package.json:20`
  - `/Users/cvr/.cache/repo/npm/@effect/sql-drizzle/0.51.0/src/Sqlite.ts:1`

### Rocicorp Mono / Replicache / Zero

- Spec: `rocicorp/mono`
- Research snapshot: `2a9bee3d874f26605dc89bd44910234114331f8d`
- Cache: `/Users/cvr/.cache/repo/rocicorp/mono`
- Use for: durable pending mutations, push/pull contracts, monotonic cookies, stale-response rejection, rebase/replay, mutation acknowledgement, commit-batched reactive views, and Solid query bindings.
- Key receipts:
  - `/Users/cvr/.cache/repo/rocicorp/mono/packages/replicache/src/pending-mutations.ts:6`
  - `/Users/cvr/.cache/repo/rocicorp/mono/packages/replicache/src/sync/push.ts:109`
  - `/Users/cvr/.cache/repo/rocicorp/mono/packages/replicache/src/sync/pull.ts:203`
  - `/Users/cvr/.cache/repo/rocicorp/mono/packages/replicache/src/sync/pull.ts:304`
  - `/Users/cvr/.cache/repo/rocicorp/mono/packages/zero-client/src/client/mutation-tracker.ts:48`
  - `/Users/cvr/.cache/repo/rocicorp/mono/packages/zero-solid/src/use-query.ts:124`
  - `/Users/cvr/.cache/repo/rocicorp/mono/packages/zero-solid/src/solid-view.ts:34`

### Base UI

- Spec: `mui/base-ui`
- Research snapshot: `bdcb685fadcca9d18b18f013c052795a53b6aa33`
- Cache: `/Users/cvr/.cache/repo/mui/base-ui`
- Use for: overlay state, modal semantics, focus trapping/restoration, dismissal reasons, composite navigation, tabs, context menus, popovers, and scroll areas.
- Key receipts:
  - `/Users/cvr/.cache/repo/mui/base-ui/packages/react/src/dialog/root/DialogRoot.tsx:21`
  - `/Users/cvr/.cache/repo/mui/base-ui/packages/react/src/dialog/popup/DialogPopup.tsx:70`
  - `/Users/cvr/.cache/repo/mui/base-ui/packages/react/src/dialog/popup/DialogPopup.tsx:96`
  - `/Users/cvr/.cache/repo/mui/base-ui/packages/react/src/internals/composite/composite.ts:13`
  - `/Users/cvr/.cache/repo/mui/base-ui/packages/react/src/tabs/root/TabsRoot.tsx:1`
  - `/Users/cvr/.cache/repo/mui/base-ui/packages/react/src/context-menu/root/ContextMenuRoot.tsx:1`

### OpenCode

- Spec: `anomalyco/opencode`
- Research snapshot: `b8142c7aa8f88222873fb79d636e312e28037c2d`
- Cache: `/Users/cvr/.cache/repo/anomalyco/opencode`
- Use for: one shared Solid app hosted by web and desktop entries, capability-based platform context, router/history adaptation, preload boundaries, and Effect runtime construction.
- Key receipts:
  - `/Users/cvr/.cache/repo/anomalyco/opencode/packages/app/src/context/platform.tsx:19`
  - `/Users/cvr/.cache/repo/anomalyco/opencode/packages/app/src/context/platform.tsx:30`
  - `/Users/cvr/.cache/repo/anomalyco/opencode/packages/app/src/context/platform.tsx:125`
  - `/Users/cvr/.cache/repo/anomalyco/opencode/packages/app/src/entry.tsx:122`
  - `/Users/cvr/.cache/repo/anomalyco/opencode/packages/desktop/src/renderer/index.tsx:3`
  - `/Users/cvr/.cache/repo/anomalyco/opencode/packages/desktop/src/renderer/index.tsx:105`
  - `/Users/cvr/.cache/repo/anomalyco/opencode/packages/opencode/src/effect/run-service.ts:33`

### github-prs cache

- Local repository: `/Users/cvr/Developer/personal/github-prs`
- Research snapshot: `f3e76a196494c3d0eb32efb590c31e30f50d6c66`
- Use for: the desired small `.get` / `.status` / `.refresh` Solid cache shape, owner capture, stale-value retention, and trailing refresh behavior.
- Key receipts:
  - `/Users/cvr/Developer/personal/github-prs/src/lib/cache.ts:12`
  - `/Users/cvr/Developer/personal/github-prs/src/lib/cache.ts:27`
  - `/Users/cvr/Developer/personal/github-prs/src/lib/cache.ts:47`
  - `/Users/cvr/Developer/personal/github-prs/src/lib/cache.ts:92`

### Bite React Suspense cache

- Local repository: `/Users/cvr/Developer/work/bite`
- Research snapshot: `4752fcadf7c43fc4163b124bf963e8ccb5819c23`
- Use for: behavioral comparison only—stale result retention, rejected refresh state, mutation concerns, and external snapshot correctness. Solid 2 removes the need for React component-scoped `use()` and external-store machinery.
- Key receipts:
  - `/Users/cvr/Developer/work/bite/packages/ui-kit/src/cache/cache.ts:4`
  - `/Users/cvr/Developer/work/bite/packages/ui-kit/src/cache/cache.ts:53`
  - `/Users/cvr/Developer/work/bite/packages/ui-kit/src/cache/cache.ts:74`
  - `/Users/cvr/Developer/work/bite/packages/ui-kit/src/cache/cache.ts:128`
  - `/Users/cvr/Developer/work/bite/packages/ui-kit/src/cache/cache.ts:175`

### cmdk

- Spec: `pacocoursey/cmdk`
- Research snapshot: `dd2250ed608443e8f32bafc5fa2d1d07a3746aa3`
- Cache: `/Users/cvr/.cache/repo/pacocoursey/cmdk`
- Use for: the current command palette's filtering, stable item values, keyboard selection, groups, and active-item scrolling.
- Key receipts:
  - `/Users/cvr/.cache/repo/pacocoursey/cmdk/cmdk/src/index.tsx:45`
  - `/Users/cvr/.cache/repo/pacocoursey/cmdk/cmdk/src/index.tsx:79`
  - `/Users/cvr/.cache/repo/pacocoursey/cmdk/cmdk/src/index.tsx:428`
  - `/Users/cvr/.cache/repo/pacocoursey/cmdk/cmdk/src/index.tsx:601`

### react-resizable-panels

- Spec: `bvaughn/react-resizable-panels`
- Research snapshot: `a1eeb7aefdb024bb5879a323218e0ac05f77f28e`
- Cache: `/Users/cvr/.cache/repo/bvaughn/react-resizable-panels`
- Use for: split-pane constraint, persistence, pointer, and keyboard-resize behavior. Reimplement only the subset used by the reader.

### Lucide

- Spec: `lucide-icons/lucide`
- Research snapshot: `658573b0171e693bc965c167592cc0b92d002a3e`
- Cache: `/Users/cvr/.cache/repo/lucide-icons/lucide`
- Use for: framework-neutral icon node data and accessible Solid rendering without `lucide-react` or a Solid 1 peer dependency.
- Key receipts:
  - `/Users/cvr/.cache/repo/lucide-icons/lucide/packages/icons/src/buildLucideIconNode.ts:1`
  - `/Users/cvr/.cache/repo/lucide-icons/lucide/packages/icons/src/types.ts:1`

### wa-sqlite fork

- Spec: `cevr/wa-sqlite`
- Research snapshot: `085a23a8ceeceb54cab3c4a6f89056e792607914`
- Cache: `/Users/cvr/.cache/repo/cevr/wa-sqlite`
- Use for: browser SQLite API, worker-only OPFS constraints, VFS behavior, locking, and test fixtures.
- Key receipts:
  - `/Users/cvr/.cache/repo/cevr/wa-sqlite/demo/hello/README.md:5`
  - `/Users/cvr/.cache/repo/cevr/wa-sqlite/demo/hello/README.md:16`
  - `/Users/cvr/.cache/repo/cevr/wa-sqlite/src/examples/OPFSAdaptiveVFS.js:55`
  - `/Users/cvr/.cache/repo/cevr/wa-sqlite/test/test-worker.js:19`

## Current repository receipts

These are the primary starting points in Bible Tools:

- CLI TUI entry and wiring:
  - `/Users/cvr/Developer/personal/bible-tools/packages/cli/src/commands/root.ts:23`
  - `/Users/cvr/Developer/personal/bible-tools/packages/cli/src/commands/egw/open.ts:9`
  - `/Users/cvr/Developer/personal/bible-tools/packages/cli/src/services/interactive-reader.ts:31`
  - `/Users/cvr/Developer/personal/bible-tools/packages/cli/src/main.ts:16`
  - `/Users/cvr/Developer/personal/bible-tools/packages/cli/package.json:20`
- Legacy desktop cache:
  - `/Users/cvr/Developer/personal/bible-tools/apps/desktop/src/ipc-cache/types.ts:1`
  - `/Users/cvr/Developer/personal/bible-tools/apps/desktop/src/ipc-cache/registry.ts:1`
  - `/Users/cvr/Developer/personal/bible-tools/apps/desktop/src/ipc-cache/proxy.ts:1`
  - `/Users/cvr/Developer/personal/bible-tools/apps/desktop/src/ipc-cache/key.ts:1`
- Current web cache and Effect-to-Promise bridge:
  - `/Users/cvr/Developer/personal/bible-tools/apps/web/src/lib/cache.ts:1`
  - `/Users/cvr/Developer/personal/bible-tools/apps/web/src/lib/cached-app.ts:1`
  - `/Users/cvr/Developer/personal/bible-tools/apps/web/src/data/service-client.ts:1`
- Current web SQLite worker:
  - `/Users/cvr/Developer/personal/bible-tools/apps/web/src/workers/sqlite-database.ts:1`
  - `/Users/cvr/Developer/personal/bible-tools/apps/web/src/workers/state-database.ts:5`
  - `/Users/cvr/Developer/personal/bible-tools/apps/web/src/workers/state-database.ts:205`
  - `/Users/cvr/Developer/personal/bible-tools/apps/web/src/workers/db-client.ts:34`
- Current desktop Effect/SQLite runtime:
  - `/Users/cvr/Developer/personal/bible-tools/apps/desktop/electron/runtime.ts:21`
  - `/Users/cvr/Developer/personal/bible-tools/apps/desktop/electron/runtime.ts:31`
  - `/Users/cvr/Developer/personal/bible-tools/apps/desktop/electron/main.ts:43`
- Current React-only dependencies and wrappers:
  - `/Users/cvr/Developer/personal/bible-tools/apps/web/package.json:19`
  - `/Users/cvr/Developer/personal/bible-tools/apps/web/src/components/ui/dialog.tsx:1`
  - `/Users/cvr/Developer/personal/bible-tools/apps/web/src/components/ui/context-menu.tsx:1`
  - `/Users/cvr/Developer/personal/bible-tools/apps/web/src/components/ui/command.tsx:1`
  - `/Users/cvr/Developer/personal/bible-tools/apps/web/src/components/ui/resizable.tsx:1`
- Existing visual baselines:
  - `/Users/cvr/Developer/personal/bible-tools/apps/web/src/styles/app.css:1`
  - `/Users/cvr/Developer/personal/bible-tools/apps/desktop/src/styles/tailwind.css:1`
  - `/Users/cvr/Developer/personal/bible-tools/apps/desktop/src/app.tsx:1`

When source behavior and this document disagree, re-open the pinned source, verify whether the dependency has changed, and amend this document deliberately rather than silently drifting the implementation.
