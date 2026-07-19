# foundation architecture checkpoint

Status: **PASS**

Reviewed commit: `b51d100c6a95c347376af4be7f3b7449c12bf9de`
Generated: 2026-07-19T05:53:08.470Z
Repository root: `/Users/cvr/Developer/personal/bible-tools`

## Commands

- `bun run --cwd packages/cli typecheck` — PASS
- `bun run --cwd packages/cli test` — PASS
- `bun run --cwd packages/core typecheck` — PASS
- `bun run --cwd packages/core test` — PASS
- `bun run gate` — PASS

## Static architecture checks

### PASS — core import direction

- no forbidden imports

### PASS — checkpoint dependency contract

- dependency contract satisfied for foundation

### PASS — initial removal inventory

- every known legacy authority has a finite initial target list

### PASS — legacy removal schedule

- 7 legacy categories are bounded and on schedule

### PASS — checkpoint command suite

- 5 required commands passed

## Legacy-removal inventory

- **CLI TUI and interactive reader** (foundation): 0 targets
- **React web application and React-only libraries** (pre-cutover): 78 targets
- **Legacy web caches, providers, and renderer database client** (pre-cutover): 15 targets
- **Legacy desktop IPC cache and domain procedure facade** (pre-cutover): 12 targets
- **Host-owned route trees and reader-mode routing** (pre-cutover): 17 targets
- **Host-owned domain data and workflow modules** (pre-cutover): 55 targets
- **Broad platform discriminators in the shared application** (shared-app): 0 targets

The immutable target list is recorded in `../inventories/removal-baseline.json`. A category may not grow after the initial checkpoint and must be empty at its removal checkpoint.

## Interface depth and deletion-test review

- The first-party SQLite bridge exposes exactly `run`, `all`, `get`, and `transaction`; callers retain Drizzle's typed operations, so the bridge owns Effect error adaptation and transaction scoping without becoming a second ORM: `/Users/cvr/Developer/personal/bible-tools/packages/core/src/local-first/database.ts:12` and `/Users/cvr/Developer/personal/bible-tools/packages/core/src/local-first/database.ts:26`.
- `SyncEngine` exposes only `mutate` and `synchronize` while hiding validation, durable mutation allocation, transport retry, cursor pull, rebase, and post-commit publication: `/Users/cvr/Developer/personal/bible-tools/packages/core/src/local-first/sync-engine.ts:19` and `/Users/cvr/Developer/personal/bible-tools/packages/core/src/local-first/sync-engine.ts:38`.
- The shared schema, protocol model, store contract, engine, and simulated authority contain no Bun, browser-worker, Electron, React, or Solid imports. Bun ownership is isolated to `/Users/cvr/Developer/personal/bible-tools/packages/core/src/local-first/database-bun.ts` and `/Users/cvr/Developer/personal/bible-tools/packages/core/src/local-first/sync-store-bun.ts`; deleting that adapter leaves the shared contracts and protocol intact.
- The CLI TUI deletion target is satisfied at zero remaining targets. The React hosts and their duplicate cache/procedure/route authorities remain deliberately scheduled for pre-cutover rather than leaking into the foundation.

## Persisted-state and feature evidence

- The Drizzle schema covers reading positions/history, preferences, bookmarks, Bible/EGW notes and markers, cross-references, collections, plans, memory practice, client cursors, mutation journal, revisions, and tombstones: `/Users/cvr/Developer/personal/bible-tools/packages/core/src/local-first/schema.ts:19` through `/Users/cvr/Developer/personal/bible-tools/packages/core/src/local-first/schema.ts:270`.
- The corresponding idempotent initial migration is `/Users/cvr/Developer/personal/bible-tools/packages/core/src/local-first/migrations/0001_user_state.sql:1`; isolated migration and rollback behavior are verified in `/Users/cvr/Developer/personal/bible-tools/packages/core/src/local-first/database.test.ts:10` through `/Users/cvr/Developer/personal/bible-tools/packages/core/src/local-first/database.test.ts:109`.
- Local materialization, device-sequence allocation, and immutable journal append share one SQLite transaction: `/Users/cvr/Developer/personal/bible-tools/packages/core/src/local-first/sync-store-bun.ts:112` through `/Users/cvr/Developer/personal/bible-tools/packages/core/src/local-first/sync-store-bun.ts:150`. Duplicate-envelope rollback proves the state/journal atomicity at `/Users/cvr/Developer/personal/bible-tools/packages/core/src/local-first/sync-engine.test.ts:228`.
- Pull base validation precedes one transaction containing server patch application, durable revision rows, pending-local replay, and cursor advancement: `/Users/cvr/Developer/personal/bible-tools/packages/core/src/local-first/sync-store-bun.ts:194` through `/Users/cvr/Developer/personal/bible-tools/packages/core/src/local-first/sync-store-bun.ts:247`.
- Protocol workflows prove offline retry and duplicate delivery (`/Users/cvr/Developer/personal/bible-tools/packages/core/src/local-first/sync-engine.test.ts:85`), sequence gaps and stale responses (`/Users/cvr/Developer/personal/bible-tools/packages/core/src/local-first/sync-engine.test.ts:110`), replay and two-client convergence (`/Users/cvr/Developer/personal/bible-tools/packages/core/src/local-first/sync-engine.test.ts:137`), tombstone deletion/restoration (`/Users/cvr/Developer/personal/bible-tools/packages/core/src/local-first/sync-engine.test.ts:158`), and file-backed restart recovery (`/Users/cvr/Developer/personal/bible-tools/packages/core/src/local-first/sync-engine.test.ts:193`).
- Persisted-store migration rules remain recorded in `/Users/cvr/Developer/personal/bible-tools/docs/architecture/inventories/persisted-stores.md`; cross-host acceptance remains recorded in `/Users/cvr/Developer/personal/bible-tools/docs/architecture/feature-parity.md` for later shared-app and pre-cutover checkpoints.

## Findings

- No blocking findings.
