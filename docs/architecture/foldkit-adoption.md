# Foldkit adoption boundary

Status: adopted selectively for renderer-independent state modules; the Foldkit browser runtime is not adopted.

## Decision

Keep each existing renderer at the outermost client boundary:

- `@opentui/solid` reconciles the CLI TUI into OpenTUI renderables.
- React renders the browser app.
- Solid renders the Electron desktop app.
- Bun templates render the static study site.

Use Foldkit's pure modules inside those clients where they deepen a state interface:

- `foldkit/experimental` Machine for finite, inspectable interaction graphs.
- `foldkit/asyncData` for asynchronous values whose loading, failure, stale, and success states must be mutually exclusive.
- `foldkit/schema` and `foldkit/message` for Schema-backed state and message constructors.

Do not add Foldkit to `@bible/core`, `@bible/api`, or `@bible/site`. Those packages have no client renderer seam, and Effect already owns their domain, service, error, and build lifecycles.

## Why there is no Foldkit OpenTUI reconciler

Foldkit 0.128.0 does not expose a renderer interface. Its runtime imports `BrowserRuntime`, accepts an `HTMLElement`, patches Snabbdom `VNode`s directly, reads `window` and `document`, and schedules DOM work with `requestAnimationFrame`.

OpenTUI has a different host interface: its Solid reconciler creates and mutates `BaseRenderable` instances, while its React integration uses a React host config. A Foldkit-to-OpenTUI adapter therefore cannot be implemented from Foldkit's public API. It would first require an upstream Foldkit seam that abstracts host-node creation, insertion, removal, property updates, scheduling, and patch state.

The structurally correct TUI composition is consequently:

```text
Foldkit Machine / AsyncData (domain state)
                    |
                    v
Solid signals and components (view state adapter)
                    |
                    v
@opentui/solid reconciler (host renderer)
                    |
                    v
OpenTUI BaseRenderable tree
```

## Surface map

| Surface           | Foldkit runtime                                                         | Pure modules        | Adopted seam                                                    |
| ----------------- | ----------------------------------------------------------------------- | ------------------- | --------------------------------------------------------------- |
| CLI / OpenTUI     | No: wrong host renderer                                                 | Yes                 | Bible palette Machine, topic-search AsyncData, Vim goto Machine |
| Browser / React   | No: Foldkit explicitly has no incremental React interop                 | Yes                 | Vim goto Machine, topics initialization AsyncData               |
| Desktop / Solid   | No: replacing Solid would be a whole-renderer rewrite                   | Yes                 | Reader drawer Machine                                           |
| Core              | Not applicable                                                          | No current leverage | Keep Effect services, Schema, Ref, and SubscriptionRef          |
| API               | Not applicable                                                          | No current leverage | Keep Effect HTTP API contracts                                  |
| Static study site | No interactive runtime, and the production server must stay import-free | No current leverage | Keep Effect build service and pure Bun rendering                |

## Migrated modules

- `packages/cli/src/tui/components/bible/command-palette/navigation-model.ts`
- `packages/cli/src/tui/components/bible/command-palette/topic-search-controller.ts`
- `packages/cli/src/tui/types/goto-mode.ts`
- `apps/web/src/lib/goto-mode.ts`
- `apps/web/src/routes/topics/index.tsx`
- `apps/desktop/src/services/drawer-machine.ts`

Each Machine test asserts that `unreachableStates()` and `deadTransitions()` are empty. This turns the graph analysis into a maintained invariant instead of treating the library as constructor syntax.

## Version boundary

The workspace uses Foldkit 0.128.0 with Effect 4.0.0-beta.98. Foldkit declares exact Effect and `@effect/platform-browser` peers at 4.0.0-beta.88 and marks itself pre-1.0; Machine is also exported under `experimental`.

The selected subpaths compile, test, and build against beta.98 in all three clients, but that is verified compatibility rather than a promise from Foldkit's package metadata. Keep Foldkit centralized in the root catalog, upgrade it deliberately, and rerun the full monorepo gate on every Foldkit or Effect beta update.

## Adoption rule

Adopt a Foldkit module when it creates a deeper interface than the local implementation it replaces:

- Prefer Machine for a named finite graph with meaningful invalid or guarded transitions.
- Prefer AsyncData for the lifecycle of one asynchronous value, especially when stale data matters.
- Keep Effect state primitives for concurrent services, progress streams, resource scopes, retries, and typed failure channels.
- Keep local component state for ephemeral UI values that have no domain graph.
- Do not wrap Foldkit merely to standardize tags; the new module must improve leverage, locality, or static analysis.
