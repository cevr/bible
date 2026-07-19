# shared-app architecture checkpoint

Status: **PASS**

Reviewed commit: `51433d0fede96d43fa13cdcc1fbe847b95e9d48d`
Generated: 2026-07-19T17:13:15.255Z
Repository root: `/Users/cvr/Developer/personal/bible-tools`

## Commands

- `bun run --cwd packages/app typecheck` — PASS
- `bun run --cwd packages/app test` — PASS
- `bun run --cwd apps/web build` — PASS
- `bun run --cwd apps/web test:e2e` — PASS
- `bun run --cwd apps/desktop build` — PASS
- `bun run --cwd apps/desktop test:e2e` — PASS
- `bun run gate` — PASS

## Static architecture checks

### PASS — core import direction

- no forbidden imports

### PASS — shared app import direction

- no forbidden imports

### PASS — shared app dynamic import ban

- no forbidden source patterns

### PASS — checkpoint dependency contract

- dependency contract satisfied for shared-app

### PASS — initial removal inventory

- every known legacy authority has a finite initial target list

### PASS — legacy removal schedule

- 7 legacy categories are bounded and on schedule

### PASS — checkpoint command suite

- 7 required commands passed

## Legacy-removal inventory

- **CLI TUI and interactive reader** (foundation): 0 targets
- **React web application and React-only libraries** (pre-cutover): 0 targets
- **Legacy web caches, providers, and renderer database client** (pre-cutover): 0 targets
- **Legacy desktop IPC cache and domain procedure facade** (pre-cutover): 0 targets
- **Host-owned route trees and reader-mode routing** (pre-cutover): 0 targets
- **Host-owned domain data and workflow modules** (pre-cutover): 0 targets
- **Broad platform discriminators in the shared application** (shared-app): 0 targets

The immutable target list is recorded in `../inventories/removal-baseline.json`. A category may not grow after the initial checkpoint and must be empty at its removal checkpoint.

## Interface depth and deletion-test review

- Initial checkpoint: the procedure runtime, user-state persistence/sync, synced cache, shared reading application, and interaction primitives are the planned deep modules.
- Host deletion target: removing either host must leave shared routes, reading behavior, cache semantics, procedures, repositories, migrations, and sync behavior intact.
- Legacy deletion target: CLI TUI, React, duplicate caches/providers/routes, renderer database protocols, and host-owned domain workflows must disappear at their named checkpoints.

## Persisted-state and feature evidence

- Persisted stores and copy-on-migrate rules: `../inventories/persisted-stores.md`.
- Shared web/desktop acceptance surface: `../feature-parity.md`.

## Findings

- No blocking findings.
