# initial architecture checkpoint

Status: **PASS**

Reviewed commit: `d895dabb504b7afea5f4f3c0994a105c6a9adba0`
Generated: 2026-07-19T05:28:12.407Z
Repository root: `/Users/cvr/Developer/personal/bible-tools`

## Commands

- `bun run gate` — PASS

## Static architecture checks

### PASS — core import direction

- no forbidden imports

### PASS — checkpoint dependency contract

- dependency contract satisfied for initial

### PASS — initial removal inventory

- every known legacy authority has a finite initial target list

### PASS — legacy removal schedule

- 7 legacy categories are bounded and on schedule

### PASS — checkpoint command suite

- 1 required command passed

## Legacy-removal inventory

- **CLI TUI and interactive reader** (foundation): 76 targets
- **React web application and React-only libraries** (pre-cutover): 78 targets
- **Legacy web caches, providers, and renderer database client** (pre-cutover): 15 targets
- **Legacy desktop IPC cache and domain procedure facade** (pre-cutover): 12 targets
- **Host-owned route trees and reader-mode routing** (pre-cutover): 17 targets
- **Host-owned domain data and workflow modules** (pre-cutover): 55 targets
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
