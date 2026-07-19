# Shared application feature-parity matrix

Every applicable row must use the same `@bible/app` route, component, domain cache, procedure definition, repository, and sync semantics in web and Electron. A host-specific difference is valid only when expressed as an optional capability adapter.

| Surface                                    | Web                     | Electron               | Shared acceptance evidence                                                                            |
| ------------------------------------------ | ----------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------- |
| Bible reading                              | Required                | Required               | chapter/verse routes, paragraph/verse layouts, selection, history, restoration, narrow/wide           |
| Writings library and reading               | Required                | Required               | publication/paragraph identity, downloads/status, canonical deep links, quarantine behavior           |
| Verse and paragraph study                  | Required                | Required               | Strong's, margin notes, commentary, cross-references, Scripture comparison, contextual pane           |
| Search                                     | Required                | Required               | shared query/scope/book URL state, result navigation, offline corpus behavior                         |
| Topics                                     | Required                | Required               | topic route identity, reading navigation, loading/error recovery                                      |
| Authored annotations                       | Required                | Required               | bookmarks, Bible/Writings notes and markers, personal cross-references, explicit overrides            |
| Collections                                | Required                | Required               | both membership types, stable IDs, targeted refresh, replay                                           |
| Reading plans                              | Required                | Required               | definitions, enrollment, dates, progress, restart and replay                                          |
| Memory practice                            | Required                | Required               | memory verses, practice history, stable identities, restart and replay                                |
| Reading preferences                        | Required                | Required               | portable absolute patches, light/sepia/dark, typography/range limits, sync convergence                |
| Device presentation                        | Browser adapter         | Electron adapter       | local-only UI scale/layout/filesystem state never enters the mutation journal                         |
| Navigation and disclosure                  | Required                | Required               | one route union/shell, browser/hash history, back/forward, command palette, quick find, pane priority |
| Import/export and recovery                 | Browser file capability | Native file capability | same logical procedures, versioned backup, non-destructive failed restore                             |
| External links/notifications/window powers | Capability-dependent    | Capability-dependent   | feature asks for a typed capability and never branches on platform name                               |
| Async/error experience                     | Required                | Required               | Solid 2 Loading/Errored, retained stale success, retry, refresh status, owner cleanup                 |

## Final QA matrix

- Production web and Electron builds.
- Narrow and wide widths.
- Light, sepia, and dark themes.
- Minimum, default, and maximum reader type sizes.
- Keyboard-only, pointer, and touch-tolerant interaction.
- Reduced motion.
- Offline startup, restart recovery, and interrupted work.
- Representative migrated web, desktop, and CLI snapshots.
