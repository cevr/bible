# Bible desktop host

The desktop package is the Electron host for the same Solid 2 reading
application rendered by `apps/web`. It does not own a second route tree,
renderer domain layer, cache, or feature model.

## Architecture

- `src/main.tsx` mounts `@bible/app` with hash history and the desktop
  capability adapter.
- `electron/main.ts` owns windows, native file dialogs, external links, the
  transferred procedure port, corpus provisioning, and runtime lifetime.
- `electron/runtime.ts` composes one managed Effect runtime beside
  better-sqlite3. The main process owns the canonical Bible corpus, Writings
  corpus, user-state database, Drizzle repositories, and sync engine.
- `electron/procedure-server.ts` serves the shared schema-validated
  `BibleProcedureGroup` over a transferred `MessagePort`. The renderer sends
  only encoded procedure messages; domain-specific IPC channels are forbidden.
- `electron/preload.ts` exposes narrow native capabilities only. File selection
  and save are platform powers, not alternate domain procedures.
- `packages/app` owns the shared routes, Solid async caches, reading surfaces,
  study tools, settings, plans, practice, and local UI primitives.
- `packages/core` owns domain schemas, Drizzle schema/migrations, repositories,
  local-first mutation/sync semantics, and the shared procedure group.

## Durable boundaries

The user-state database under Electron `userData` is the sole writable source
of truth for reader-authored state. Every syncable write goes through a tagged
domain mutation, updates its materialized tables, and appends its journal
envelope in one SQLite transaction before publishing a change notification.
Solid cache state is a projection and may always be rebuilt from procedures.

Bible and Writings databases are replaceable corpora. They remain outside the
mutation journal. Credentials, filesystem recents, window state, and other
device presentation are adapter-local and must not leak into shared commands.

## Canonical language

- **Publication**: one Ellen G. White work, identified by canonical numeric
  `PublicationId` and displayed with its code and title.
- **Page**: the stable Writings reading and navigation unit.
- **Paragraph**: the smallest deep-linkable Writings location, identified by
  canonical `ParagraphId`.
- **Writings corpus**: the replaceable SQLite materialization containing
  publications, paragraphs, search text, and Scripture links.
- **Library state**: reader-authored bookmarks, notes, markers, personal
  cross-references, collections, plans, practice, preferences, and continuity.
- **Procedure runtime**: the only domain boundary crossed by the renderer.
- **Capability**: an optional host power such as native file selection or save.

Avoid the deleted desktop vocabulary and architecture: renderer services,
IPC cache, local procedure facade, drawer-owned route state, `ReaderMode`,
host-owned domain channels, cache-derived user library, and automatic chapter
prefetch. Those described the superseded desktop application and are not
compatibility contracts.

## Deletion test

Deleting `apps/desktop` must leave route definitions, reading behavior, cache
semantics, procedures, repositories, migrations, and sync behavior intact.
Deleting `apps/web` must satisfy the same test. A host may be rebuilt by
supplying history, procedure transport, and optional capability adapters to
`@bible/app`.

The accepted migration contract and current evidence live in:

- `/Users/cvr/Developer/personal/bible-tools/docs/architecture/solid-2-local-first-app.md`
- `/Users/cvr/Developer/personal/bible-tools/docs/architecture/feature-parity.md`
- `/Users/cvr/Developer/personal/bible-tools/docs/architecture/checkpoints/shared-app.md`
- `/Users/cvr/Developer/personal/bible-tools/docs/architecture/checkpoints/pre-cutover.md`
