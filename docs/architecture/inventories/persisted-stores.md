# Persisted-store inventory and cutover contract

This inventory separates reader-authored state, device-local state, credentials, and replaceable corpora before the Solid 2 local-first cutover. It is the C0 source of truth for migration fixtures and deletion evidence.

## Current sources

| Host            | Source                                                      | Current contents                                                                                                                                                                  | Canonical treatment                                                                                                                                     |
| --------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web             | OPFS `state.db`                                             | position/history, preferences, bookmarks, notes, markers, personal cross-references, provenance-free classifications, collections, plans/progress, memory practice, sync metadata | Snapshot, field-wise decode, normalize stable identities/provenance, migrate transactionally into the versioned user database                           |
| Web             | version-1 JSON backup                                       | exported subset of web user state                                                                                                                                                 | Never auto-discovered; explicit post-cutover restore uses the same field-wise decoder and absolute commands                                             |
| Desktop         | `userData/cache.sqlite`                                     | Bible/Writings last positions and host cache records                                                                                                                              | Snapshot; migrate reading continuity, discard replaceable cache rows                                                                                    |
| Desktop         | `userData/settings.json`                                    | portable reading preferences mixed with device presentation and stale keys                                                                                                        | Decode every field independently; journal portable absolute preference patch, store device presentation locally, drop ReaderMode/stale keys             |
| CLI             | `~/.bible/state.db`                                         | personal cross-references plus mixed AI/user catalog classifications                                                                                                              | Migrate personal relationships; migrate only explicit reader overrides; leave unattributed legacy overlays local-only until a reader edit promotes them |
| Desktop         | `userData/egw-tokens.json`                                  | EGW credentials                                                                                                                                                                   | Keep adapter-local and outside the user-state database and sync journal                                                                                 |
| Web/Desktop/CLI | Bible, Writings, topics, FTS, downloaded-response databases | versioned corpus and derived materializations                                                                                                                                     | Preserve or redownload as replaceable assets; never append them to the user mutation journal                                                            |

## Canonical durable state

- Syncable: Bible/Writings reading positions, bounded history, reading preferences, bookmarks, notes, markers, personal cross-references, explicit catalog overrides, collections/membership, custom plans/enrollment/progress, memory verses/practice.
- Durable local-only: device presentation, filesystem recents/progress, credentials, migration diagnostics, sync client/journal/cursors, incomplete-generation recovery metadata.
- Derived or ephemeral: corpora, indexes, downloads, command-palette memory, open overlays/panes, search input/results, materialization status.

## Copy-on-migrate activation

1. Snapshot and fingerprint each native legacy source without modifying it.
2. Create a sibling versioned canonical database generation.
3. Decode fields independently and migrate in one transaction; write diagnostics and the completion receipt last.
4. Reopen the new database and compare semantic counts plus representative public-module decodes.
5. Atomically point the activation marker at the proven generation.
6. Keep legacy snapshots read-only through final acceptance.

Before the first canonical mutation, a failed startup may restore the legacy activation marker. After the first canonical mutation commits, the canonical database and journal remain authoritative; recovery repairs forward with a schema-compatible build and never reopens legacy state for writes.

## Required fixtures

- Complete, partial, malformed, out-of-range, ambiguous, already-migrated, interrupted, and corrupt inputs for every source.
- Stable-ID conversion for plan items/progress and memory-practice records.
- Writings coordinate resolution and quarantine.
- Cross-reference provenance separation.
- Exact preference patch, device-state projection, diagnostics, and journal envelope.
- Restart/reopen, second-pass no-op, disk/write failure, incomplete-generation cleanup, and post-activation recovery.
